import type { LifeOSContext } from '../registry/context';
import type { ObjectRecord } from '../domain/types';
import type { Dump } from '../repo/dumpRepo';
import type { Row } from '../db/adapter';
import { daily, isoDay, type MetricId } from '../dashboard/metrics';

/**
 * The Almanac (M4.4, PRODUCT v4 §1.2): a reference book of your life.
 * Sections group record types by area of life; the Time view reads any day,
 * month or year as one summary; "On this day" looks back from today.
 * Pure — the screens only lay these out.
 */

/* ------------------------------------------------------------------ */
/* Sections                                                             */
/* ------------------------------------------------------------------ */

export type SectionId = 'people' | 'things' | 'money' | 'body' | 'mind' | 'places' | 'time';

export interface SectionDef {
  id: SectionId;
  label: string;
  icon: string;
  /** Design-system tint key. */
  tint: string;
  line: string;
  /** Record types listed in this section, in order (missing / hidden ones are skipped). */
  types: string[];
  /** Health metrics shown as rows (Body). */
  metrics?: MetricId[];
}

export const SECTIONS: SectionDef[] = [
  { id: 'people', label: 'People', icon: 'people', tint: 'people', line: 'Everyone, and the groups they’re in', types: ['person', 'group'] },
  { id: 'things', label: 'Things', icon: 'cube.box', tint: 'upkeep', line: 'What you own, and its upkeep', types: ['vehicle', 'asset', 'stock', 'document', 'delivery', 'routine'] },
  { id: 'money', label: 'Money', icon: 'wallet', tint: 'finance', line: 'Spending, accounts, subscriptions, who you pay', types: ['transaction', 'account', 'subscription', 'investment', 'debt', 'org'] },
  { id: 'body', label: 'Body', icon: 'activity', tint: 'health', line: 'Steps, sleep, heart, weight, workouts', types: ['workout'], metrics: ['steps', 'sleep', 'heart_rate', 'resting_hr', 'weight'] },
  { id: 'mind', label: 'Mind', icon: 'brain', tint: 'memory', line: 'Dumps, what you’ve told it, notes, plans', types: ['note', 'task', 'project', 'goal', 'habit'] },
  { id: 'places', label: 'Places', icon: 'location', tint: 'travel', line: 'Places, trips and what happened where', types: ['place', 'trip', 'event'] },
  { id: 'time', label: 'Time', icon: 'calendar', tint: 'tasks', line: 'Any day, month or year at a glance', types: [] },
];

export interface SectionRow {
  type: string;
  label: string;
  icon: string;
  count: number;
}

export interface SectionSummary extends SectionDef {
  rows: SectionRow[];
  /** Records across the section (Mind adds dumps and facts). */
  total: number;
}

/** Every section with the types installed and how many records each has. */
export function almanacSections(os: LifeOSContext): SectionSummary[] {
  const counts = os.records.countsByType();
  return SECTIONS.map((s) => {
    const rows = s.types
      .map((type) => os.registry.objects.get(type))
      .filter((d): d is NonNullable<typeof d> => !!d && !d.hidden)
      .map((d) => ({ type: d.id, label: d.labelPlural, icon: d.icon, count: counts[d.id] ?? 0 }));
    let total = rows.reduce((n, r) => n + r.count, 0);
    if (s.id === 'mind') total += dumpCount(os) + os.facts.list({ limit: 100000 }).length;
    if (s.id === 'body') total += counts.measurement ?? 0;
    return { ...s, rows, total };
  });
}

function dumpCount(os: LifeOSContext): number {
  return os.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM dumps`)?.n ?? 0;
}

/* ------------------------------------------------------------------ */
/* Time                                                                 */
/* ------------------------------------------------------------------ */

export type Span = 'day' | 'month' | 'year';

export interface Period {
  span: Span;
  /** ISO days, inclusive. */
  from: string;
  to: string;
  label: string;
  /** Anchors for the previous / next period (ISO day). */
  prev: string;
  next: string;
  /** The period contains today (or is in the future): no "next". */
  current: boolean;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const parse = (d: string) => {
  const [y, m, dd] = d.split('-').map(Number);
  return new Date(y!, m! - 1, dd!);
};

/** The day / month / year around an ISO day. */
export function periodOf(span: Span, anchor: string, today = isoDay(Date.now())): Period {
  const d = parse(anchor);
  const y = d.getFullYear();
  const m = d.getMonth();
  if (span === 'day') {
    const from = isoDay(d);
    const label = `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[m]} ${y}`;
    return { span, from, to: from, label, prev: isoDay(new Date(y, m, d.getDate() - 1)), next: isoDay(new Date(y, m, d.getDate() + 1)), current: from >= today };
  }
  if (span === 'month') {
    const from = isoDay(new Date(y, m, 1));
    const to = isoDay(new Date(y, m + 1, 0));
    return { span, from, to, label: `${MONTHS[m]} ${y}`, prev: isoDay(new Date(y, m - 1, 1)), next: isoDay(new Date(y, m + 1, 1)), current: to >= today };
  }
  const from = `${y}-01-01`;
  const to = `${y}-12-31`;
  return { span, from, to, label: String(y), prev: `${y - 1}-01-01`, next: `${y + 1}-01-01`, current: to >= today };
}

const startMs = (day: string) => parse(day).getTime();
const endMs = (day: string) => startMs(day) + 86_400_000 - 1;

export interface CategoryTotal {
  category: string;
  total: number;
  count: number;
}

export interface HealthAverages {
  /** Per day, over the days that have data (null when none). */
  steps: number | null;
  sleep: number | null;
  restingHr: number | null;
  heartRate: number | null;
  /** The last weight in the period. */
  weight: number | null;
  screen: number | null;
}

export interface DayMark {
  day: string;
  spend: number;
  dumps: number;
  events: number;
}

export interface PeriodSummary {
  period: Period;
  spend: { total: number; income: number; count: number; byCategory: CategoryTotal[] };
  health: HealthAverages;
  workouts: { count: number; minutes: number };
  /** Events and trips in the period, by date. */
  happened: ObjectRecord[];
  dumps: Dump[];
  /** Upkeep jobs done (cycle.done on the timeline). */
  done: Array<{ id: string; entityId: string; title: string; at: number; cost: number | null }>;
  /** Records made in the period, by type (most first) — and the new people, named. */
  created: Array<{ type: string; count: number }>;
  newPeople: ObjectRecord[];
  facts: number;
  /** One mark per day (month view calendar; year view per month). */
  days: DayMark[];
  /** Nothing at all happened / was recorded. */
  empty: boolean;
}

function avg(m: Map<string, number>): number | null {
  if (!m.size) return null;
  let s = 0;
  for (const v of m.values()) s += v;
  return s / m.size;
}

/** Everything about one day / month / year. */
export function periodSummary(os: LifeOSContext, period: Period): PeriodSummary {
  const { from, to } = period;
  const a = startMs(from);
  const b = endMs(to);
  const has = (t: string) => os.registry.objects.has(t);

  // Money
  const byCategory: CategoryTotal[] = [];
  let total = 0;
  let income = 0;
  let count = 0;
  if (has('transaction')) {
    const rows = os.db.all<{ kind: string; category: string | null; total: number; n: number }>(
      `SELECT json_extract(data,'$.kind') AS kind, json_extract(data,'$.category') AS category, SUM(json_extract(data,'$.amount')) AS total, COUNT(*) AS n
       FROM records WHERE object='transaction' AND deleted_at IS NULL AND json_extract(data,'$.date') BETWEEN ? AND ? GROUP BY kind, category`,
      [from, to],
    );
    for (const r of rows) {
      if (r.kind === 'expense') {
        total += r.total;
        count += r.n;
        byCategory.push({ category: r.category ?? 'other', total: r.total, count: r.n });
      } else if (r.kind === 'income') income += r.total;
    }
    byCategory.sort((x, y) => y.total - x.total);
  }

  // Body
  const health: HealthAverages = {
    steps: has('measurement') ? avg(daily(os, 'steps', from, to)) : null,
    sleep: has('measurement') ? avg(daily(os, 'sleep', from, to)) : null,
    restingHr: has('measurement') ? avg(daily(os, 'resting_hr', from, to)) : null,
    heartRate: has('measurement') ? avg(daily(os, 'heart_rate', from, to)) : null,
    weight: has('measurement') ? ([...daily(os, 'weight', from, to).entries()].sort(([x], [y]) => (x < y ? -1 : 1)).at(-1)?.[1] ?? null) : null,
    screen: avg(daily(os, 'screen', from, to)),
  };
  const workouts = { count: 0, minutes: 0 };
  if (has('workout')) {
    const w = os.db.get<{ n: number; m: number | null }>(
      `SELECT COUNT(*) AS n, SUM(json_extract(data,'$.durationMin')) AS m FROM records WHERE object='workout' AND deleted_at IS NULL AND json_extract(data,'$.date') BETWEEN ? AND ?`,
      [from, to],
    );
    workouts.count = w?.n ?? 0;
    workouts.minutes = w?.m ?? 0;
  }

  // What happened: events in the period, trips overlapping it.
  const happenedIds = os.db
    .all<{ id: string }>(
      `SELECT id FROM records WHERE deleted_at IS NULL AND (
         (object='event' AND occurred_at BETWEEN ? AND ?)
         OR (object='trip' AND json_extract(data,'$.startDate') <= ? AND COALESCE(json_extract(data,'$.endDate'), json_extract(data,'$.startDate')) >= ?)
       ) ORDER BY occurred_at LIMIT 500`,
      [a, b, to, from],
    )
    .map((r) => r.id);
  const happened = happenedIds.map((id) => os.records.get(id)).filter((e): e is ObjectRecord => !!e);

  const dumps = os.dumps.list({ from: a, to: b, limit: 500 });

  const done = os.db
    .all<Row>(`SELECT id, record_id, title, occurred_at, meta FROM events WHERE kind='cycle.done' AND occurred_at BETWEEN ? AND ? ORDER BY occurred_at`, [a, b])
    .map((r) => {
      const meta = r.meta ? (JSON.parse(r.meta as string) as { cost?: number | null }) : {};
      return { id: r.id as string, entityId: r.record_id as string, title: r.title as string, at: r.occurred_at as number, cost: meta.cost ?? null };
    });

  // Records made (not the automatic ones: measurements and transactions show as numbers above).
  const created = os.db
    .all<{ type: string; n: number }>(`SELECT object, COUNT(*) AS n FROM records WHERE deleted_at IS NULL AND created_at BETWEEN ? AND ? AND object NOT IN ('measurement','transaction','habit_log') GROUP BY object ORDER BY n DESC`, [a, b])
    .filter((r) => os.registry.objects.has(r.type))
    .map((r) => ({ type: r.type, count: r.n }));
  const newPeople = has('person')
    ? os.db
        .all<{ id: string }>(`SELECT id FROM records WHERE object='person' AND deleted_at IS NULL AND created_at BETWEEN ? AND ? ORDER BY created_at LIMIT 50`, [a, b])
        .map((r) => os.records.get(r.id))
        .filter((e): e is ObjectRecord => !!e)
    : [];
  const facts = os.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM facts WHERE deleted_at IS NULL AND active=1 AND stated_at BETWEEN ? AND ?`, [a, b])?.n ?? 0;

  // Day marks: spend, dumps and events per day (the month calendar).
  const marks = new Map<string, DayMark>();
  const mark = (day: string) => {
    if (!marks.has(day)) marks.set(day, { day, spend: 0, dumps: 0, events: 0 });
    return marks.get(day)!;
  };
  if (period.span !== 'day') {
    for (const [day, v] of daily(os, 'spend', from, to)) mark(day).spend = v;
    for (const d of dumps) mark(isoDay(d.createdAt)).dumps++;
    for (const e of happened) if (e.object === 'event' && e.occurredAt) mark(isoDay(e.occurredAt)).events++;
  }
  const days = [...marks.values()].sort((x, y) => (x.day < y.day ? -1 : 1));

  const empty =
    !count && !income && !dumps.length && !happened.length && !done.length && !created.length && !facts && !workouts.count && Object.values(health).every((v) => v == null);
  return { period, spend: { total, income, count, byCategory }, health, workouts, happened, dumps, done, created, newPeople, facts, days, empty };
}

/* ------------------------------------------------------------------ */
/* On this day                                                          */
/* ------------------------------------------------------------------ */

export interface OnThisDayItem {
  kind: 'dump' | 'event' | 'trip' | 'person' | 'done' | 'fact';
  id: string;
  /** Record type, for opening it (dumps open /dump/:id). */
  type?: string;
  title: string;
}

export interface OnThisDay {
  /** "1 year ago", "6 months ago", "1 month ago". */
  ago: string;
  day: string;
  items: OnThisDayItem[];
}

/** What happened on this date a month, six months, and every year ago — only the dates with something. */
export function onThisDay(os: LifeOSContext, today = isoDay(Date.now()), maxYears = 10): OnThisDay[] {
  const t = parse(today);
  const back: Array<[string, Date]> = [
    ['1 month ago', new Date(t.getFullYear(), t.getMonth() - 1, t.getDate())],
    ['6 months ago', new Date(t.getFullYear(), t.getMonth() - 6, t.getDate())],
  ];
  for (let y = 1; y <= maxYears; y++) back.push([y === 1 ? '1 year ago' : `${y} years ago`, new Date(t.getFullYear() - y, t.getMonth(), t.getDate())]);
  const out: OnThisDay[] = [];
  for (const [ago, d] of back) {
    // "31 March − 1 month" rolls into March 3rd: skip dates that don't exist.
    if (d.getDate() !== t.getDate()) continue;
    const day = isoDay(d);
    const a = startMs(day);
    const b = endMs(day);
    const items: OnThisDayItem[] = [];
    for (const x of os.dumps.list({ from: a, to: b, limit: 5 })) items.push({ kind: 'dump', id: x.id, title: firstLine(x.body) });
    for (const r of os.db.all<{ id: string; type: string; title: string }>(
      `SELECT id, object, title FROM records WHERE deleted_at IS NULL AND ((object='event' AND occurred_at BETWEEN ? AND ?) OR (object='trip' AND json_extract(data,'$.startDate') = ?)) LIMIT 5`,
      [a, b, day],
    ))
      items.push({ kind: r.type === 'trip' ? 'trip' : 'event', id: r.id, type: r.type, title: r.title });
    for (const r of os.db.all<{ id: string; title: string }>(`SELECT id, title FROM records WHERE object='person' AND deleted_at IS NULL AND created_at BETWEEN ? AND ? LIMIT 5`, [a, b]))
      items.push({ kind: 'person', id: r.id, type: 'person', title: `Met ${r.title}` });
    for (const r of os.db.all<{ id: string; record_id: string; title: string }>(`SELECT id, record_id, title FROM events WHERE kind='cycle.done' AND occurred_at BETWEEN ? AND ? LIMIT 5`, [a, b])) {
      const e = os.records.get(r.record_id);
      if (e) items.push({ kind: 'done', id: e.id, type: e.object, title: `${r.title} · ${e.title}` });
    }
    if (items.length) out.push({ ago, day, items });
  }
  return out;
}

const firstLine = (s: string) => {
  const l = s.trim().split('\n')[0]!;
  return l.length > 80 ? `${l.slice(0, 79)}…` : l;
};
