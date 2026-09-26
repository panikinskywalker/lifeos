import type { LifeOSContext } from '../registry/context';
import { metricDays, topApps, usageDays } from '../sources/deviceData';
import { upkeep, type Upkeep } from '../cycles/upkeep';

/**
 * Today's numbers (M4.3): every tile and full-screen chart reads a metric as
 * a series over a period, with the previous period beside it. Real data only
 * — a metric with no data says so (and which source to turn on), never a
 * made-up number.
 */

export type MetricId = 'steps' | 'sleep' | 'screen' | 'spend' | 'resting_hr' | 'heart_rate' | 'weight';
export type Period = 'day' | 'week' | 'month' | 'year';

export interface MetricDef {
  id: MetricId;
  label: string;
  unit: string;
  /** How a period's value is formed from its days: summed (steps, spend) or averaged per day (sleep, screen time). */
  agg: 'sum' | 'avg' | 'last';
  /** Where the data comes from (for the empty state). */
  source: 'health' | 'usage' | 'money';
  /** Higher is better (steps, sleep) or worse (screen time, spend) — colours the change. */
  better: 'up' | 'down' | 'none';
  decimals: number;
}

export const METRICS: Record<MetricId, MetricDef> = {
  steps: { id: 'steps', label: 'Steps', unit: 'steps', agg: 'sum', source: 'health', better: 'up', decimals: 0 },
  sleep: { id: 'sleep', label: 'Sleep', unit: 'h', agg: 'avg', source: 'health', better: 'up', decimals: 1 },
  screen: { id: 'screen', label: 'Screen time', unit: 'h', agg: 'avg', source: 'usage', better: 'down', decimals: 1 },
  spend: { id: 'spend', label: 'Spend', unit: '₹', agg: 'sum', source: 'money', better: 'down', decimals: 0 },
  resting_hr: { id: 'resting_hr', label: 'Resting heart rate', unit: 'bpm', agg: 'avg', source: 'health', better: 'down', decimals: 0 },
  heart_rate: { id: 'heart_rate', label: 'Heart rate', unit: 'bpm', agg: 'avg', source: 'health', better: 'none', decimals: 0 },
  weight: { id: 'weight', label: 'Weight', unit: 'kg', agg: 'last', source: 'health', better: 'none', decimals: 1 },
};

const DAY = 86_400_000;
export const isoDay = (t: number | Date) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const addDays = (iso: string, n: number) => {
  const [y, m, d] = iso.split('-').map(Number);
  return isoDay(new Date(y!, m! - 1, d! + n));
};
const WEEKDAY = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTH = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

/** One value per day in [from, to] (days without data are absent, never zero). */
export function daily(os: LifeOSContext, id: MetricId, from: string, to: string): Map<string, number> {
  const out = new Map<string, number>();
  if (id === 'screen') for (const d of usageDays(os, from, to)) out.set(d.day, d.totalMs / 3_600_000);
  else if (id === 'spend') {
    if (!os.registry.entityTypes.has('transaction')) return out;
    const rows = os.db.all<{ day: string; total: number }>(
      `SELECT json_extract(data,'$.date') AS day, SUM(json_extract(data,'$.amount')) AS total FROM entities
       WHERE type='transaction' AND deleted_at IS NULL AND json_extract(data,'$.kind')='expense' AND json_extract(data,'$.date') BETWEEN ? AND ? GROUP BY day`,
      [from, to],
    );
    for (const r of rows) out.set(r.day, r.total);
  } else {
    if (!os.registry.entityTypes.has('measurement')) return out;
    for (const r of metricDays(os, id, from, to)) out.set(r.day, r.value);
  }
  return out;
}

export interface Bucket {
  key: string;
  label: string;
  value: number | null;
}

export interface MetricSeries {
  def: MetricDef;
  period: Period;
  buckets: Bucket[];
  /** The period's value (sum, per-day average, or last) and the previous period's. */
  value: number | null;
  prev: number | null;
  /** Relative change vs the previous period (0.12 = +12%), null when either side is missing. */
  change: number | null;
  /** Days in the period that have data. */
  daysWithData: number;
  from: string;
  to: string;
}

function combine(def: MetricDef, values: number[]): number | null {
  if (!values.length) return null;
  if (def.agg === 'sum') return values.reduce((a, b) => a + b, 0);
  if (def.agg === 'avg') return values.reduce((a, b) => a + b, 0) / values.length;
  return values[values.length - 1]!;
}

/** The period ending on `now`'s day: day = that day; week = 7 days; month = 30 days; year = 12 months (monthly buckets). */
export function metricSeries(os: LifeOSContext, id: MetricId, period: Period, now = Date.now()): MetricSeries {
  const def = METRICS[id];
  const today = isoDay(now);
  const span = period === 'day' ? 1 : period === 'week' ? 7 : period === 'month' ? 30 : 365;
  const from = addDays(today, -(span - 1));
  const prevTo = addDays(from, -1);
  const prevFrom = addDays(prevTo, -(span - 1));
  const cur = daily(os, id, from, today);
  const prv = daily(os, id, prevFrom, prevTo);
  const valuesIn = (m: Map<string, number>) => [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v);
  const value = combine(def, valuesIn(cur));
  const prev = combine(def, valuesIn(prv));
  let buckets: Bucket[];
  if (period === 'year') {
    buckets = [];
    const d = new Date(now);
    for (let i = 11; i >= 0; i--) {
      const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
      const key = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`;
      const vals = [...cur.entries()].filter(([k]) => k.startsWith(key)).map(([, v]) => v);
      buckets.push({ key, label: MONTH[m.getMonth()]!, value: combine(def, vals) });
    }
  } else if (period === 'day') {
    // A day alone is one bar: show the week around it for context.
    const ctx = daily(os, id, addDays(today, -6), today);
    buckets = Array.from({ length: 7 }, (_, i) => {
      const key = addDays(today, i - 6);
      return { key, label: WEEKDAY[new Date(`${key}T12:00:00`).getDay()]!, value: ctx.get(key) ?? null };
    });
  } else {
    buckets = Array.from({ length: span }, (_, i) => {
      const key = addDays(from, i);
      const dt = new Date(`${key}T12:00:00`);
      return { key, label: period === 'week' ? WEEKDAY[dt.getDay()]! : String(dt.getDate()), value: cur.get(key) ?? null };
    });
  }
  const change = value != null && prev != null && prev !== 0 ? (value - prev) / Math.abs(prev) : null;
  return { def, period, buckets, value, prev, change, daysWithData: cur.size, from, to: today };
}

/** Screen time's top apps over the same range. */
export function screenTopApps(os: LifeOSContext, period: Period, now = Date.now(), limit = 5) {
  const today = isoDay(now);
  const span = period === 'day' ? 1 : period === 'week' ? 7 : period === 'month' ? 30 : 365;
  return topApps(os, addDays(today, -(span - 1)), today, limit);
}

/* ------------------------------------------------------------------ */
/* Spend pace                                                           */
/* ------------------------------------------------------------------ */

export interface SpendPace {
  /** Cumulative spend by day of this month (1…today). */
  thisMonth: number[];
  /** Your usual cumulative spend by day of month (average of the last 3 months), 1…31. */
  usual: number[];
  spent: number;
  /** What you'd usually have spent by today. */
  usualByToday: number | null;
  /** Usual whole-month total. */
  usualMonth: number | null;
}

export function spendPace(os: LifeOSContext, now = Date.now()): SpendPace {
  const d = new Date(now);
  const cum = (y: number, m: number, days: number) => {
    const from = isoDay(new Date(y, m, 1));
    const to = isoDay(new Date(y, m, days));
    const map = daily(os, 'spend', from, to);
    let run = 0;
    return Array.from({ length: days }, (_, i) => (run += map.get(isoDay(new Date(y, m, i + 1))) ?? 0));
  };
  const thisMonth = cum(d.getFullYear(), d.getMonth(), d.getDate());
  const prevs = [1, 2, 3].map((k) => {
    const m = new Date(d.getFullYear(), d.getMonth() - k, 1);
    return cum(m.getFullYear(), m.getMonth(), new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate());
  }).filter((c) => c[c.length - 1]! > 0);
  const usual = prevs.length ? Array.from({ length: 31 }, (_, i) => prevs.reduce((s, c) => s + (c[Math.min(i, c.length - 1)] ?? 0), 0) / prevs.length) : [];
  return {
    thisMonth,
    usual,
    spent: thisMonth[thisMonth.length - 1] ?? 0,
    usualByToday: usual.length ? usual[d.getDate() - 1]! : null,
    usualMonth: usual.length ? usual[30]! : null,
  };
}

/* ------------------------------------------------------------------ */
/* Upcoming, people to call                                             */
/* ------------------------------------------------------------------ */

export interface UpcomingItem {
  id: string;
  entityId: string;
  type: string;
  title: string;
  at: number;
  kind: 'due' | 'event' | 'delivery';
  overdue: boolean;
}

/** Next dues (cycles) and events, soonest first; overdue first of all. */
export function upcoming(os: LifeOSContext, limit = 5, now = Date.now(), days = 14, u: Upkeep = upkeep(os)): UpcomingItem[] {
  const out: UpcomingItem[] = [];
  for (const i of u.items) {
    const at = i.cycle.nextDueAt;
    if (at == null || at > now + days * DAY) continue;
    out.push({ id: i.cycle.id, entityId: i.entity.id, type: i.entity.type, title: i.entity.title === i.cycle.name ? i.entity.title : `${i.entity.title} · ${i.cycle.name}`, at, kind: 'due', overdue: at < now - DAY / 2 });
  }
  if (os.registry.entityTypes.has('event')) {
    for (const e of os.entities.query<{ startAt: number }>('event', { filter: { and: [{ field: 'data.startAt', op: 'gte', value: now - DAY / 4 }, { field: 'data.startAt', op: 'lte', value: now + days * DAY }] }, sort: [{ field: 'data.startAt', dir: 'asc' }] }, { limit: 20 })) {
      out.push({ id: e.id, entityId: e.id, type: 'event', title: e.title, at: e.data.startAt, kind: 'event', overdue: false });
    }
  }
  if (os.registry.entityTypes.has('delivery')) {
    for (const d of os.entities.query<{ status: string; expectedDate?: string }>('delivery', { filter: { and: [{ field: 'data.status', op: 'in', value: ['ordered', 'shipped', 'out_for_delivery'] }] } }, { limit: 50 })) {
      if (!d.data.expectedDate) continue;
      const at = Date.parse(`${d.data.expectedDate}T12:00:00`);
      if (at > now + days * DAY) continue;
      out.push({ id: d.id, entityId: d.id, type: 'delivery', title: `${d.title}${d.data.status === 'out_for_delivery' ? ' · out for delivery' : ''}`, at, kind: 'delivery', overdue: at < now - DAY });
    }
  }
  return out.sort((a, b) => Number(b.overdue) - Number(a.overdue) || a.at - b.at).slice(0, limit);
}

/** Keep-in-touch cycles due within a week (or late), and birthdays in the next two weeks. */
export function peopleToCall(os: LifeOSContext, limit = 4, now = Date.now(), u: Upkeep = upkeep(os)): Array<{ entityId: string; title: string; why: string; late: boolean }> {
  const out: Array<{ entityId: string; title: string; why: string; late: boolean; at: number }> = [];
  for (const i of u.items) {
    if (i.entity.type !== 'person' || i.cycle.nextDueAt == null) continue;
    const days = Math.round((i.cycle.nextDueAt - now) / DAY);
    if (i.cycle.template === 'person.birthday' && days <= 14) out.push({ entityId: i.entity.id, title: i.entity.title, why: days <= 0 ? 'Birthday today' : `Birthday in ${days} d`, late: false, at: i.cycle.nextDueAt });
    else if (i.cycle.template === 'person.contact' && days <= 7) out.push({ entityId: i.entity.id, title: i.entity.title, why: days < 0 ? `${-days} d overdue` : days === 0 ? 'Today' : `In ${days} d`, late: days < 0, at: i.cycle.nextDueAt });
  }
  return out.sort((a, b) => a.at - b.at).slice(0, limit).map(({ at: _at, ...r }) => r);
}

/** Every day of the last `days` days (for the heat map); days without data are null. */
export function dailyRange(os: LifeOSContext, id: MetricId, days = 365, now = Date.now()): Array<{ day: string; value: number | null }> {
  const today = isoDay(now);
  const from = addDays(today, -(days - 1));
  const m = daily(os, id, from, today);
  return Array.from({ length: days }, (_, i) => {
    const key = addDays(from, i);
    return { day: key, value: m.get(key) ?? null };
  });
}

const fmtHours = (h: number) => `${Math.floor(h)}h ${String(Math.round((h % 1) * 60)).padStart(2, '0')}m`;

/** "8,240" · "7h 12m" · "₹1,240" · "58 bpm". */
export function formatMetric(id: MetricId, v: number, currency: (n: number) => string): string {
  if (id === 'spend') return currency(v);
  if (id === 'sleep' || id === 'screen') return fmtHours(v);
  if (id === 'steps') return Math.round(v).toLocaleString('en-IN');
  return `${v.toFixed(METRICS[id].decimals)} ${METRICS[id].unit}`;
}
