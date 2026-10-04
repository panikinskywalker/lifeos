import type { LifeOSContext } from '../registry/context';
import type { Row } from '../db/adapter';
import { daily, isoDay, type MetricId } from './metrics';
import { upkeep, type Upkeep } from '../cycles/upkeep';

/**
 * Today at a glance (v4 home): the day in time order, what you've done so
 * far, and progress against goals learned from your own last 30 days. Pure —
 * Today only lays these out.
 */

const DAY = 86_400_000;
const startOf = (t: number) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/* ------------------------------------------------------------------ */
/* My day                                                               */
/* ------------------------------------------------------------------ */

export interface DayItem {
  id: string;
  /** When (ms); all-day items sit at the top. */
  at: number;
  allDay: boolean;
  kind: 'event' | 'task' | 'due' | 'delivery' | 'reminder' | 'bill';
  title: string;
  sub?: string | null;
  entityId: string | null;
  type: string | null;
  done: boolean;
  late: boolean;
}

/** Everything on today, in time order: events, tasks due, upkeep due, deliveries arriving, reminders, bills. */
export function myDay(os: LifeOSContext, now = Date.now(), u: Upkeep = upkeep(os, 'All', now)): DayItem[] {
  const a = startOf(now);
  const b = a + DAY - 1;
  const today = isoDay(now);
  const has = (t: string) => os.registry.objects.has(t);
  const out: DayItem[] = [];
  if (has('event')) {
    for (const r of os.db.all<Row>(`SELECT id FROM entities WHERE type='event' AND deleted_at IS NULL AND ((occurred_at BETWEEN ? AND ?) OR (occurred_at < ? AND COALESCE(json_extract(data,'$.endAt'),0) >= ?)) ORDER BY occurred_at LIMIT 50`, [a, b, a, a])) {
      const e = os.records.get<{ startAt: number; endAt?: number; allDay?: boolean; location?: string; kind?: string }>(r.id as string);
      if (!e) continue;
      const allDay = !!e.data.allDay || e.data.startAt < a;
      out.push({ id: e.id, at: allDay ? a : e.data.startAt, allDay, kind: 'event', title: e.title, sub: e.data.location ?? null, entityId: e.id, type: 'event', done: !allDay && (e.data.endAt ?? e.data.startAt + 3_600_000) < now, late: false });
    }
  }
  if (has('task')) {
    for (const t of os.records.query<{ dueDate?: string; completedAt?: number }>('task', { filter: { and: [{ field: 'data.dueDate', op: 'lte', value: today }] } }, { limit: 200 })) {
      const done = t.status === 'done';
      if (done && !(t.data.completedAt && t.data.completedAt >= a)) continue; // done earlier: not today's
      if (t.status === 'done' || t.data.dueDate === today || (t.data.dueDate ?? '') < today)
        out.push({ id: t.id, at: a, allDay: true, kind: 'task', title: t.title, sub: (t.data.dueDate ?? today) < today && !done ? 'overdue' : null, entityId: t.id, type: 'task', done, late: (t.data.dueDate ?? today) < today && !done });
    }
  }
  for (const i of [...u.sections.overdue, ...u.sections.week]) {
    const d = i.status.daysLeft;
    if (d == null || d > 0) continue;
    out.push({ id: `cycle:${i.cycle.id}`, at: a, allDay: true, kind: 'due', title: i.cycle.name.trim().toLowerCase() === i.entity.title.trim().toLowerCase() ? i.entity.title : `${i.cycle.name} · ${i.entity.title}`, sub: d < 0 ? `${-d} d late` : 'due today', entityId: i.entity.id, type: i.entity.type, done: false, late: d < 0 });
  }
  if (has('delivery')) {
    for (const d of os.records.query<{ status: string; expectedDate?: string; otp?: string }>('delivery', { filter: { and: [{ field: 'data.status', op: 'in', value: ['shipped', 'out_for_delivery'] }] } }, { limit: 50 })) {
      if (d.data.status !== 'out_for_delivery' && d.data.expectedDate !== today) continue;
      out.push({ id: d.id, at: a, allDay: true, kind: 'delivery', title: d.title, sub: [d.data.status === 'out_for_delivery' ? 'out for delivery' : 'arriving today', d.data.otp ? `OTP ${d.data.otp}` : null].filter(Boolean).join(' · '), entityId: d.id, type: 'delivery', done: false, late: false });
    }
  }
  if (has('subscription')) {
    for (const s of os.records.query<{ nextBillingAt?: string; amount?: number }>('subscription', { filter: { and: [{ field: 'data.nextBillingAt', op: 'eq', value: today }] } }, { limit: 50 }))
      out.push({ id: s.id, at: a, allDay: true, kind: 'bill', title: `${s.title} renews`, sub: s.data.amount ? os.format.currency(s.data.amount) : null, entityId: s.id, type: 'subscription', done: false, late: false });
  }
  for (const r of os.reminders.upcoming(50, b)) {
    if (r.dueAt < a) continue;
    out.push({ id: `rem:${r.id}`, at: r.dueAt, allDay: false, kind: 'reminder', title: r.title, sub: null, entityId: r.entityId ?? null, type: r.entityId ? (os.records.get(r.entityId)?.type ?? null) : null, done: r.dueAt < now, late: false });
  }
  const rank = (x: DayItem) => (x.allDay ? 0 : 1);
  return out.sort((x, y) => rank(x) - rank(y) || x.at - y.at || Number(y.late) - Number(x.late));
}

/* ------------------------------------------------------------------ */
/* Done today                                                           */
/* ------------------------------------------------------------------ */

export interface DoneToday {
  spent: number;
  payments: number;
  received: number;
  steps: number | null;
  workouts: number;
  workoutMin: number;
  habitsDone: number;
  tasksDone: number;
  upkeepDone: number;
  dumps: number;
  added: number;
}

export function doneToday(os: LifeOSContext, now = Date.now()): DoneToday {
  const a = startOf(now);
  const today = isoDay(now);
  const has = (t: string) => os.registry.objects.has(t);
  const money = has('transaction')
    ? os.db.all<{ kind: string; total: number; n: number }>(`SELECT json_extract(data,'$.kind') AS kind, SUM(json_extract(data,'$.amount')) AS total, COUNT(*) AS n FROM entities WHERE type='transaction' AND deleted_at IS NULL AND json_extract(data,'$.date')=? GROUP BY kind`, [today])
    : [];
  const w = has('workout') ? os.db.get<{ n: number; m: number | null }>(`SELECT COUNT(*) AS n, SUM(json_extract(data,'$.durationMin')) AS m FROM entities WHERE type='workout' AND deleted_at IS NULL AND json_extract(data,'$.date')=?`, [today]) : null;
  const count = (sql: string, p: unknown[]) => os.db.get<{ n: number }>(sql, p as never[])?.n ?? 0;
  return {
    spent: money.find((m) => m.kind === 'expense')?.total ?? 0,
    payments: money.find((m) => m.kind === 'expense')?.n ?? 0,
    received: money.find((m) => m.kind === 'income')?.total ?? 0,
    steps: has('measurement') ? (daily(os, 'steps', today, today).get(today) ?? null) : null,
    workouts: w?.n ?? 0,
    workoutMin: w?.m ?? 0,
    habitsDone: has('habit_log') ? count(`SELECT COUNT(DISTINCT json_extract(data,'$.habitId')) AS n FROM entities WHERE type='habit_log' AND deleted_at IS NULL AND json_extract(data,'$.date')=?`, [today]) : 0,
    tasksDone: has('task') ? count(`SELECT COUNT(*) AS n FROM entities WHERE type='task' AND deleted_at IS NULL AND status='done' AND json_extract(data,'$.completedAt') >= ?`, [a]) : 0,
    upkeepDone: count(`SELECT COUNT(*) AS n FROM timeline_events WHERE kind='cycle.done' AND occurred_at >= ?`, [a]),
    dumps: count(`SELECT COUNT(*) AS n FROM dumps WHERE created_at >= ?`, [a]),
    added: count(`SELECT COUNT(*) AS n FROM entities WHERE deleted_at IS NULL AND created_at >= ? AND type NOT IN ('transaction','measurement','habit_log')`, [a]),
  };
}

/* ------------------------------------------------------------------ */
/* Goals and progress                                                   */
/* ------------------------------------------------------------------ */

export type GoalId = 'steps' | 'sleep' | 'screen' | 'spend';

export interface Goal {
  id: GoalId;
  label: string;
  /** Per day (steps, sleep, screen) or per month (spend). */
  target: number;
  /** Learned from your history, or set by you. */
  source: 'history' | 'you' | 'default';
  /** More is better (steps, sleep) or less (screen, spend). */
  better: 'up' | 'down';
}

const DEFAULTS: Record<GoalId, number> = { steps: 8000, sleep: 7, screen: 4, spend: 0 };

/**
 * Goals from your own last 30 days: a little better than your usual (5%
 * more steps, 15 min more sleep, 5% less screen time), rounded; spend is
 * your usual month. Your own number always wins.
 */
export function goals(os: LifeOSContext, now = Date.now()): Goal[] {
  const mine = os.settings.get<Partial<Record<GoalId, number>>>('goals', {});
  const to = isoDay(now - DAY);
  const from = isoDay(now - 30 * DAY);
  const avg = (id: MetricId) => {
    const m = daily(os, id, from, to);
    if (m.size < 7) return null; // too little history to learn from
    let s = 0;
    for (const v of m.values()) s += v;
    return s / m.size;
  };
  const steps = avg('steps');
  const sleep = avg('sleep');
  const screen = avg('screen');
  // Usual month: the average of the last three full months with spending.
  const d = new Date(now);
  const months = [1, 2, 3].map((k) => {
    const s = new Date(d.getFullYear(), d.getMonth() - k, 1);
    const e = new Date(d.getFullYear(), d.getMonth() - k + 1, 0);
    let t = 0;
    for (const v of daily(os, 'spend', isoDay(s), isoDay(e)).values()) t += v;
    return t;
  }).filter((t) => t > 0);
  const spend = months.length ? months.reduce((x, y) => x + y, 0) / months.length : null;
  const pick = (id: GoalId, learned: number | null, round: (n: number) => number): Pick<Goal, 'target' | 'source'> =>
    mine[id] != null ? { target: mine[id]!, source: 'you' } : learned != null ? { target: round(learned), source: 'history' } : { target: DEFAULTS[id], source: 'default' };
  return [
    { id: 'steps', label: 'Steps', better: 'up', ...pick('steps', steps != null ? steps * 1.05 : null, (n) => Math.max(1000, Math.round(n / 500) * 500)) },
    { id: 'sleep', label: 'Sleep', better: 'up', ...pick('sleep', sleep != null ? sleep + 0.25 : null, (n) => Math.round(n * 4) / 4) },
    { id: 'screen', label: 'Screen time', better: 'down', ...pick('screen', screen != null ? screen * 0.95 : null, (n) => Math.max(0.5, Math.round(n * 2) / 2)) },
    { id: 'spend', label: 'Spend this month', better: 'down', ...pick('spend', spend, (n) => Math.round(n / 1000) * 1000) },
  ];
}

export function setGoal(os: LifeOSContext, id: GoalId, target: number | null) {
  const mine = { ...os.settings.get<Partial<Record<GoalId, number>>>('goals', {}) };
  if (target == null) delete mine[id];
  else mine[id] = target;
  os.settings.set('goals', mine);
}

export interface Progress {
  id: string;
  label: string;
  value: number | null;
  target: number | null;
  /** 0..1 (can pass 1). Null when there's nothing to measure yet. */
  ratio: number | null;
  better: 'up' | 'down';
  /** The last 7 days of the same measure (oldest first), for a small trend. */
  week: Array<number | null>;
  unit: string;
  goalSource?: Goal['source'];
}

/** Rings for Today: steps, sleep, screen time vs your goals; habits and tasks done; the month's spend vs your usual. */
export function progress(os: LifeOSContext, now = Date.now()): Progress[] {
  const g = Object.fromEntries(goals(os, now).map((x) => [x.id, x])) as Record<GoalId, Goal>;
  const today = isoDay(now);
  const has = (t: string) => os.registry.objects.has(t);
  const week = (id: MetricId) => {
    const m = daily(os, id, isoDay(now - 6 * DAY), today);
    return Array.from({ length: 7 }, (_, i) => m.get(isoDay(now - (6 - i) * DAY)) ?? null);
  };
  const out: Progress[] = [];
  const metric = (id: 'steps' | 'sleep' | 'screen', unit: string, value: number | null) => {
    const goal = g[id];
    out.push({ id, label: goal.label, value, target: goal.target, ratio: value == null ? null : value / goal.target, better: goal.better, week: week(id), unit, goalSource: goal.source });
  };
  if (has('measurement')) {
    metric('steps', 'steps', daily(os, 'steps', today, today).get(today) ?? null);
    // Sleep: last night (recorded on today or yesterday).
    const s = daily(os, 'sleep', isoDay(now - DAY), today);
    metric('sleep', 'h', s.get(today) ?? s.get(isoDay(now - DAY)) ?? null);
  }
  const screenToday = daily(os, 'screen', today, today).get(today) ?? null;
  if (screenToday != null) metric('screen', 'h', screenToday);
  if (has('habit')) {
    const active = os.records.query<{ frequency?: string }>('habit', { filter: { and: [{ field: 'status', op: 'neq', value: 'paused' }] } }, { limit: 100 });
    const dow = new Date(now).getDay();
    const due = active.filter((h) => h.data.frequency !== 'weekdays' || (dow > 0 && dow < 6)).filter((h) => h.data.frequency !== 'weekly');
    if (due.length) {
      const done = new Set(os.db.all<{ h: string }>(`SELECT DISTINCT json_extract(data,'$.habitId') AS h FROM entities WHERE type='habit_log' AND deleted_at IS NULL AND json_extract(data,'$.date')=?`, [today]).map((r) => r.h));
      const n = due.filter((h) => done.has(h.id)).length;
      const perDay = Array.from({ length: 7 }, (_, i) => os.db.get<{ n: number }>(`SELECT COUNT(DISTINCT json_extract(data,'$.habitId')) AS n FROM entities WHERE type='habit_log' AND deleted_at IS NULL AND json_extract(data,'$.date')=?`, [isoDay(now - (6 - i) * DAY)])?.n ?? 0);
      out.push({ id: 'habits', label: 'Habits', value: n, target: due.length, ratio: n / due.length, better: 'up', week: perDay, unit: '', goalSource: undefined });
    }
  }
  if (has('task')) {
    // This week: done since Monday out of those done + still open and due by Sunday.
    const d = new Date(now);
    const monday = startOf(now) - ((d.getDay() + 6) % 7) * DAY;
    const sunday = isoDay(monday + 6 * DAY);
    const done = os.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM entities WHERE type='task' AND deleted_at IS NULL AND status='done' AND json_extract(data,'$.completedAt') >= ?`, [monday])?.n ?? 0;
    const open = os.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM entities WHERE type='task' AND deleted_at IS NULL AND COALESCE(status,'todo')<>'done' AND json_extract(data,'$.dueDate') <= ?`, [sunday])?.n ?? 0;
    if (done + open) {
      const perDay = Array.from({ length: 7 }, (_, i) => {
        const s = startOf(now) - (6 - i) * DAY;
        return os.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM entities WHERE type='task' AND deleted_at IS NULL AND status='done' AND json_extract(data,'$.completedAt') BETWEEN ? AND ?`, [s, s + DAY - 1])?.n ?? 0;
      });
      out.push({ id: 'tasks', label: 'Tasks this week', value: done, target: done + open, ratio: done / (done + open), better: 'up', week: perDay, unit: '' });
    }
  }
  if (has('transaction') && g.spend.target > 0) {
    const d = new Date(now);
    let spent = 0;
    for (const v of daily(os, 'spend', isoDay(new Date(d.getFullYear(), d.getMonth(), 1)), today).values()) spent += v;
    out.push({ id: 'spend', label: g.spend.label, value: spent, target: g.spend.target, ratio: spent / g.spend.target, better: 'down', week: week('spend'), unit: '₹', goalSource: g.spend.source });
  }
  return out;
}
