import type { LifeOSContext } from '@core/registry/context';
import type { ObjectRecord } from '@core/domain/types';
import { daily, isoDay, metricSeries, type MetricId } from '@core/dashboard/metrics';
import { usageDays } from '@core/sources/deviceData';
import type { MeasurementData, WorkoutData } from '@modules/health';

/** What the Health screens read beyond the module's lib: workouts with their place and origin, a metric over a calendar period. No React Native. */

const DAY = 86_400_000;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAY = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const YEAR_LETTERS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

export const atNoon = (day: string) => new Date(`${day}T12:00:00`);
const addDays = (day: string, n: number) => {
  const d = atNoon(day);
  d.setDate(d.getDate() + n);
  return isoDay(d);
};
const daysBetween = (from: string, to: string) => Math.round((atNoon(to).getTime() - atNoon(from).getTime()) / DAY) + 1;

/** "Mon 2 Nov" from an ISO day. */
export const dayWords = (day: string) => atNoon(day).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
/** "Saturday, 31 October 2026" from an ISO day. */
export const longDay = (day: string) => {
  const d = atNoon(day);
  return `${d.toLocaleDateString('en-GB', { weekday: 'long' })}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};
/** "4 Oct" from an ISO day. */
export const shortDay = (day: string) => atNoon(day).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
/** "11:40 pm" from ms. */
export const clock = (ms: number) => new Date(ms).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }).toLowerCase();
/** "4h 05m" · "45m" from minutes. */
export const hoursMinutes = (min: number) => {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
};
/** "72.4 kg" to its number and its unit, for a big number with a small unit beside it. */
export function splitValue(text: string): { num: string; unit: string | null } {
  const m = /^([\d.,]+) (\S+)$/.exec(text);
  return m ? { num: m[1]!, unit: m[2]! } : { num: text, unit: null };
}

/* ------------------------------------------------------------------ */
/* Where a record came from                                             */
/* ------------------------------------------------------------------ */

export type Origin = { kind: 'source' } | { kind: 'dump'; said: string } | { kind: 'you' };

/** Health Connect, a Dump (with its words) or you. */
export function originOf(os: LifeOSContext, id: string, source: string | undefined): Origin {
  if (source === 'health_connect') return { kind: 'source' };
  const dump = os.dumps.forEntity(id)[0];
  return dump ? { kind: 'dump', said: dump.body.trim().split('\n')[0]! } : { kind: 'you' };
}

/* ------------------------------------------------------------------ */
/* Workouts                                                             */
/* ------------------------------------------------------------------ */

export interface WorkoutRow {
  id: string;
  title: string;
  kind: string;
  date: string;
  minutes: number;
  km: number | null;
  intensity: string | null;
  notes: string | null;
  place: string | null;
  origin: Origin;
}

const placeOf = (os: LifeOSContext, id: string) => os.links.forEntity(id).find((l) => l.other.object === 'place')?.other.title ?? null;

function toRow(os: LifeOSContext, w: ObjectRecord<WorkoutData>): WorkoutRow {
  return { id: w.id, title: w.title, kind: w.data.kind, date: w.data.date, minutes: w.data.durationMin, km: w.data.distanceKm ?? null, intensity: w.data.intensity ?? null, notes: w.data.notes ?? null, place: placeOf(os, w.id), origin: originOf(os, w.id, w.data.source) };
}

/** Every Workout, newest first. */
export function workoutRows(os: LifeOSContext): WorkoutRow[] {
  if (!os.registry.objects.has('workout')) return [];
  return os.records.query<WorkoutData>('workout', { sort: [{ field: 'data.date', dir: 'desc' }, { field: 'createdAt', dir: 'desc' }] }, { limit: 500 }).map((w) => toRow(os, w));
}

/** The line under a workout: how far (or how hard), and where; its notes when it has neither. `placeFirst` is the home's order. */
export function workoutLine(w: WorkoutRow, placeFirst = false): string {
  const effort = w.km ? `${w.km} km` : w.intensity;
  const parts = placeFirst ? [dayWords(w.date), w.place, effort] : [dayWords(w.date), effort, w.place];
  const shown = parts.filter(Boolean);
  if (shown.length === 1 && w.notes) shown.push(w.notes.split('\n')[0]!);
  return shown.join(' · ');
}

/* ------------------------------------------------------------------ */
/* A metric over a calendar period (the Steps pattern)                  */
/* ------------------------------------------------------------------ */

export type BarPeriod = 'day' | 'week' | 'month' | 'year';

export interface BarBucket {
  key: string;
  label: string;
  value: number | null;
}

export interface BarView {
  title: string;
  /** The arrows' words. */
  earlier: string;
  later: string;
  /** "OCTOBER · A DAY", "SEPTEMBER · A DAY", "Against September", "vs Sep". */
  nowCaps: string;
  prevCaps: string;
  against: string;
  vs: string;
  from: string;
  to: string;
  buckets: BarBucket[];
  /** Days in the period, and those with a value. */
  span: number;
  days: Array<{ day: string; value: number }>;
  /** The period's total, its average per day with data (docs/MODEL.md), and the period before's. */
  total: number | null;
  perDay: number | null;
  prevPerDay: number | null;
  change: number | null;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** The day, the 7 days, the calendar month or the calendar year, `offset` periods back, against the one before. */
export function barView(os: LifeOSContext, id: MetricId, period: BarPeriod, offset: number, now = Date.now()): BarView {
  const today = isoDay(now);
  const n = new Date(now);
  let from: string, end: string, prevFrom: string, prevTo: string;
  let title: string, earlier: string, later: string, nowCaps: string, prevCaps: string, against: string, vs: string;
  if (period === 'day') {
    from = end = addDays(today, offset);
    prevFrom = prevTo = addDays(from, -1);
    title = offset === 0 ? 'Today' : dayWords(from);
    earlier = 'Day before';
    later = 'Day after';
    nowCaps = offset === 0 ? 'TODAY' : dayWords(from).toUpperCase();
    prevCaps = offset === 0 ? 'YESTERDAY' : 'DAY BEFORE';
    against = offset === 0 ? 'Against yesterday' : 'Against the day before';
    vs = offset === 0 ? 'vs yesterday' : 'vs the day before';
  } else if (period === 'week') {
    end = addDays(today, offset * 7);
    from = addDays(end, -6);
    prevTo = addDays(from, -1);
    prevFrom = addDays(prevTo, -6);
    title = offset === 0 ? 'Last 7 days' : `${shortDay(from)} to ${shortDay(end)}`;
    earlier = 'The 7 days before';
    later = 'The 7 days after';
    nowCaps = offset === 0 ? 'THIS WEEK · A DAY' : 'THESE 7 · A DAY';
    prevCaps = offset === 0 ? 'LAST WEEK · A DAY' : 'THE 7 BEFORE · A DAY';
    against = offset === 0 ? 'Against last week' : 'Against the 7 days before';
    vs = offset === 0 ? 'vs last week' : 'vs the 7 before';
  } else if (period === 'month') {
    const first = new Date(n.getFullYear(), n.getMonth() + offset, 1);
    const before = new Date(first.getFullYear(), first.getMonth() - 1, 1);
    const after = new Date(first.getFullYear(), first.getMonth() + 1, 1);
    from = isoDay(first);
    end = isoDay(new Date(first.getFullYear(), first.getMonth() + 1, 0));
    prevFrom = isoDay(before);
    prevTo = isoDay(new Date(first.getFullYear(), first.getMonth(), 0));
    const name = MONTHS[first.getMonth()]!;
    const prevName = MONTHS[before.getMonth()]!;
    title = `${name} ${first.getFullYear()}`;
    earlier = prevName;
    later = MONTHS[after.getMonth()]!;
    nowCaps = `${name.toUpperCase()} · A DAY`;
    prevCaps = `${prevName.toUpperCase()} · A DAY`;
    against = `Against ${prevName}`;
    vs = `vs ${prevName.slice(0, 3)}`;
  } else {
    const y = n.getFullYear() + offset;
    from = `${y}-01-01`;
    end = `${y}-12-31`;
    prevFrom = `${y - 1}-01-01`;
    prevTo = `${y - 1}-12-31`;
    title = String(y);
    earlier = String(y - 1);
    later = String(y + 1);
    nowCaps = `${y} · A DAY`;
    prevCaps = `${y - 1} · A DAY`;
    against = `Against ${y - 1}`;
    vs = `vs ${y - 1}`;
  }
  const to = end > today ? today : end;
  const cur = daily(os, id, from, to);
  const prev = daily(os, id, prevFrom, prevTo);
  const days = [...cur.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, value]) => ({ day, value }));

  let buckets: BarBucket[];
  if (period === 'year') {
    const year = Number(from.slice(0, 4));
    buckets = YEAR_LETTERS.map((label, m) => {
      const key = `${year}-${String(m + 1).padStart(2, '0')}`;
      return { key, label, value: mean(days.filter((d) => d.day.startsWith(key)).map((d) => d.value)) };
    });
  } else if (period === 'day') {
    const around = daily(os, id, addDays(from, -6), from);
    buckets = Array.from({ length: 7 }, (_, i) => {
      const key = addDays(from, i - 6);
      return { key, label: WEEKDAY[atNoon(key).getDay()]!, value: around.get(key) ?? null };
    });
  } else {
    const shown = daysBetween(from, end);
    buckets = Array.from({ length: shown }, (_, i) => {
      const key = addDays(from, i);
      const label = period === 'week' ? WEEKDAY[atNoon(key).getDay()]! : i % 7 === 0 ? String(atNoon(key).getDate()) : '';
      return { key, label, value: cur.get(key) ?? null };
    });
  }

  const perDay = mean(days.map((d) => d.value));
  const prevPerDay = mean([...prev.values()]);
  return {
    title, earlier, later, nowCaps, prevCaps, against, vs, from, to, buckets,
    span: daysBetween(from, to),
    days,
    total: days.length ? days.reduce((a, d) => a + d.value, 0) : null,
    perDay,
    prevPerDay,
    change: perDay != null && prevPerDay ? (perDay - prevPerDay) / Math.abs(prevPerDay) : null,
  };
}

/** A metric's readings in [from, to], newest first: Measurements, or screen time's days. */
export interface Reading {
  key: string;
  day: string;
  value: number;
  origin: Origin;
  notes: string | null;
  asleep: number | null;
  awake: number | null;
  /** The Measurement behind it; screen time's days have none. */
  id: string | null;
}

export function readingsIn(os: LifeOSContext, id: MetricId, from: string, to: string, limit = 400): Reading[] {
  if (id === 'screen') return usageDays(os, from, to).reverse().map((d) => ({ key: d.day, day: d.day, value: d.totalMs / 3_600_000, origin: { kind: 'source' }, notes: null, asleep: null, awake: null, id: null }));
  if (!os.registry.objects.has('measurement')) return [];
  return os.records
    .query<MeasurementData>('measurement', { filter: { and: [{ field: 'data.metric', op: 'eq', value: id }, { field: 'data.date', op: 'gte', value: from }, { field: 'data.date', op: 'lte', value: to }] }, sort: [{ field: 'data.date', dir: 'desc' }, { field: 'createdAt', dir: 'desc' }] }, { limit })
    .map((m) => ({ key: m.id, day: m.data.date, value: m.data.value, origin: originOf(os, m.id, m.data.source), notes: m.data.notes ?? null, asleep: m.data.startAt ?? null, awake: m.data.endAt ?? null, id: m.id }));
}

/** The last 26 weeks by week (Monday first): the current week's column runs only to today. */
export function yearGrid(os: LifeOSContext, id: MetricId, now = Date.now()) {
  const today = isoDay(now);
  const weekday = (atNoon(today).getDay() + 6) % 7;
  const from = addDays(today, -(25 * 7 + weekday));
  const m = daily(os, id, from, today);
  const count = daysBetween(from, today);
  const cells = Array.from({ length: count }, (_, i) => m.get(addDays(from, i)) ?? null);
  const shortMonth = (d: string) => MONTHS[atNoon(d).getMonth()]!.slice(0, 3);
  return { cells, range: `${shortMonth(from)} to ${shortMonth(today)}` };
}

/** A metric's line over a rolling period and the same span before it (the Sleep and Weight pattern). */
export function lineView(os: LifeOSContext, id: MetricId, period: 'week' | 'month' | 'year', now = Date.now()) {
  const span = period === 'week' ? 7 : period === 'month' ? 30 : 365;
  const s = metricSeries(os, id, period, now);
  const before = metricSeries(os, id, period, now - span * DAY);
  return { s, before };
}

