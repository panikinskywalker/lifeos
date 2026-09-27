import type { LifeOSContext } from '../registry/context';
import type { Row } from '../db/adapter';
import { daily, isoDay } from '../dashboard/metrics';
import { goals } from '../dashboard/day';

/**
 * Activity trackers (the GitHub-style grid): a day counts when any of a
 * tracker's rules matches something that happened that day — a text or
 * payment mentioning Zomato, a workout, 8,000 steps, 30 min in work apps,
 * an event on your work calendar, a habit ticked. Pure: reads what's filed.
 */

export type MetricRuleId = 'steps' | 'sleep' | 'resting_hr' | 'weight';

export type TrackerRule =
  /** A text, notification or email that mentions any of these words (sender or text). */
  | { kind: 'message'; words: string[] }
  /** A payment: mentioning any word (merchant / note), and / or in a category; out, in or either. */
  | { kind: 'payment'; words?: string[]; category?: string | null; direction?: 'spent' | 'received' | 'any' }
  /** A record of this type on the day (a workout, a trip, a note…). */
  | { kind: 'record'; type: string }
  /** A health number at or past a line; `goal: true` uses your current goal (steps, sleep). */
  | { kind: 'metric'; metric: MetricRuleId; min?: number | null; goal?: boolean }
  /** Time in these apps (package or name contains a word) adding up to at least `minutes`. */
  | { kind: 'screen'; apps: string[]; minutes: number }
  /** A calendar event on one of these calendars and / or with one of these words in its title. */
  | { kind: 'calendar'; calendars?: string[]; words?: string[] }
  /** A habit ticked. */
  | { kind: 'habit'; habitId: string };

export interface Tracker {
  id: string;
  name: string;
  icon: string;
  /** Design tint key. */
  tint: string;
  rules: TrackerRule[];
  hidden?: boolean;
}

const KEY = 'activity.trackers';
const DAY = 86_400_000;

/** Sensible starting trackers (yours to edit or remove). */
export const DEFAULT_TRACKERS: Tracker[] = [
  { id: 'worked', name: 'Days worked', icon: 'briefcase', tint: 'tasks', rules: [{ kind: 'screen', apps: ['slack', 'teams', 'outlook', 'zoom', 'meet', 'jira', 'linear', 'notion'], minutes: 30 }, { kind: 'calendar', words: ['standup', 'sync', 'review'] }] },
  { id: 'workouts', name: 'Workouts', icon: 'activity', tint: 'health', rules: [{ kind: 'record', type: 'workout' }] },
  { id: 'steps', name: 'Steps goal met', icon: 'shoe', tint: 'health', rules: [{ kind: 'metric', metric: 'steps', goal: true }] },
  { id: 'food', name: 'Ordered food', icon: 'food', tint: 'finance', rules: [{ kind: 'message', words: ['zomato', 'swiggy'] }, { kind: 'payment', words: ['zomato', 'swiggy'] }] },
];

export function trackers(os: LifeOSContext): Tracker[] {
  return os.settings.get<Tracker[] | null>(KEY, null) ?? DEFAULT_TRACKERS;
}

export function saveTrackers(os: LifeOSContext, list: Tracker[]) {
  os.settings.set(KEY, list);
}

export function upsertTracker(os: LifeOSContext, t: Tracker) {
  const list = trackers(os);
  saveTrackers(os, list.some((x) => x.id === t.id) ? list.map((x) => (x.id === t.id ? t : x)) : [...list, t]);
}

export function removeTracker(os: LifeOSContext, id: string) {
  saveTrackers(os, trackers(os).filter((t) => t.id !== id));
}

const startMs = (iso: string) => new Date(`${iso}T00:00:00`).getTime();
const endMs = (iso: string) => startMs(iso) + DAY - 1;
const wordRe = (words: string[]) => {
  const w = words.map((x) => x.trim().toLowerCase()).filter(Boolean).map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return w.length ? new RegExp(`(^|[^a-z0-9])(${w.join('|')})($|[^a-z0-9])`, 'i') : null;
};

/** The days in [from, to] (ISO) on which one rule matched. */
function ruleDays(os: LifeOSContext, r: TrackerRule, from: string, to: string): Set<string> {
  const out = new Set<string>();
  const has = (t: string) => os.registry.entityTypes.has(t);
  switch (r.kind) {
    case 'message': {
      const re = wordRe(r.words);
      if (!re) return out;
      for (const m of os.db.all<{ at: number; from: string | null; title: string | null; text: string }>(`SELECT received_at AS at, package AS "from", raw_title AS title, raw_text AS text FROM ingest_queue WHERE received_at BETWEEN ? AND ?`, [startMs(from), endMs(to)]))
        if (re.test(`${m.from ?? ''} ${m.title ?? ''} ${m.text}`)) out.add(isoDay(m.at));
      return out;
    }
    case 'payment': {
      if (!has('transaction')) return out;
      const re = r.words?.length ? wordRe(r.words) : null;
      const dir = r.direction ?? 'spent';
      for (const t of os.db.all<{ day: string; merchant: string | null; note: string | null; category: string | null; kind: string }>(
        `SELECT json_extract(data,'$.date') AS day, json_extract(data,'$.merchant') AS merchant, json_extract(data,'$.note') AS note, json_extract(data,'$.category') AS category, json_extract(data,'$.kind') AS kind
         FROM entities WHERE type='transaction' AND deleted_at IS NULL AND json_extract(data,'$.date') BETWEEN ? AND ?`,
        [from, to],
      )) {
        if (dir !== 'any' && t.kind !== (dir === 'received' ? 'income' : 'expense')) continue;
        if (r.category && t.category !== r.category) continue;
        if (re && !re.test(`${t.merchant ?? ''} ${t.note ?? ''}`)) continue;
        if (!re && !r.category) continue; // a rule must say something
        out.add(t.day);
      }
      return out;
    }
    case 'record': {
      if (!has(r.type)) return out;
      // The day it happened when the record has one, else the day it was added.
      for (const e of os.db.all<{ at: number }>(`SELECT COALESCE(occurred_at, created_at) AS at FROM entities WHERE type=? AND deleted_at IS NULL AND COALESCE(occurred_at, created_at) BETWEEN ? AND ?`, [r.type, startMs(from), endMs(to)])) out.add(isoDay(e.at));
      return out;
    }
    case 'metric': {
      if (!has('measurement')) return out;
      const line = r.goal ? goals(os).find((g) => g.id === r.metric)?.target : r.min;
      if (line == null) return out;
      for (const [d, v] of daily(os, r.metric, from, to)) if (v >= line) out.add(d);
      return out;
    }
    case 'screen': {
      const words = r.apps.map((a) => a.trim().toLowerCase()).filter(Boolean);
      if (!words.length) return out;
      const ms = new Map<string, number>();
      for (const u of os.db.all<{ day: string; package: string; label: string | null; ms: number }>(`SELECT day, package, label, ms FROM usage_app_daily WHERE day BETWEEN ? AND ?`, [from, to])) {
        const name = `${u.package} ${u.label ?? ''}`.toLowerCase();
        if (words.some((w) => name.includes(w))) ms.set(u.day, (ms.get(u.day) ?? 0) + u.ms);
      }
      for (const [d, v] of ms) if (v >= r.minutes * 60_000) out.add(d);
      return out;
    }
    case 'calendar': {
      if (!has('event')) return out;
      const re = r.words?.length ? wordRe(r.words) : null;
      const cals = new Set((r.calendars ?? []).map((c) => c.toLowerCase()));
      if (!re && !cals.size) return out;
      for (const e of os.db.all<Row>(`SELECT title, occurred_at, data FROM entities WHERE type='event' AND deleted_at IS NULL AND occurred_at BETWEEN ? AND ?`, [startMs(from), endMs(to)])) {
        const d = JSON.parse(e.data as string) as { calendars?: string[] };
        const onCal = cals.size > 0 && (d.calendars ?? []).some((c) => cals.has(c.toLowerCase()));
        const said = re?.test(String(e.title)) ?? false;
        if (onCal || said) out.add(isoDay(e.occurred_at as number));
      }
      return out;
    }
    case 'habit': {
      if (!has('habit_log')) return out;
      for (const l of os.db.all<{ day: string }>(`SELECT json_extract(data,'$.date') AS day FROM entities WHERE type='habit_log' AND deleted_at IS NULL AND json_extract(data,'$.habitId')=? AND json_extract(data,'$.date') BETWEEN ? AND ?`, [r.habitId, from, to])) out.add(l.day);
      return out;
    }
  }
}

/** Days in [from, to] when any of the tracker's rules matched. */
export function trackerDays(os: LifeOSContext, t: Tracker, from: string, to: string): Set<string> {
  const out = new Set<string>();
  for (const r of t.rules) for (const d of ruleDays(os, r, from, to)) out.add(d);
  return out;
}

export interface TrackerSummary {
  tracker: Tracker;
  /** Oldest first, `weeks` × 7 days ending this Sunday; future days are null. */
  days: Array<{ day: string; value: number | null }>;
  thisWeek: number;
  thisMonth: number;
  /** Days in a row up to today (today not yet counted doesn't break it). */
  streak: number;
  longest: number;
  total: number;
}

/** A tracker's grid and numbers over the last `weeks` weeks. */
export function trackerSummary(os: LifeOSContext, t: Tracker, now = Date.now(), weeks = 18): TrackerSummary {
  const today = isoDay(now);
  const dow = (new Date(now).getDay() + 6) % 7; // Monday = 0
  const monday = new Date(now);
  monday.setHours(12, 0, 0, 0);
  const start = monday.getTime() - (dow + (weeks - 1) * 7) * DAY;
  const all = Array.from({ length: weeks * 7 }, (_, i) => isoDay(start + i * DAY));
  const done = trackerDays(os, t, all[0]!, today);
  const days = all.map((d) => ({ day: d, value: d > today ? null : done.has(d) ? 1 : 0 }));
  const thisWeek = all.slice(-7).filter((d) => done.has(d)).length;
  const thisMonth = [...done].filter((d) => d.slice(0, 7) === today.slice(0, 7)).length;
  let streak = 0;
  let k = done.has(today) ? 0 : 1;
  while (done.has(isoDay(now - k * DAY))) (streak++, k++);
  let longest = 0;
  let run = 0;
  for (const d of all) {
    if (d > today) break;
    run = done.has(d) ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  return { tracker: t, days, thisWeek, thisMonth, streak, longest, total: done.size };
}

/** Calendars seen on synced events (for the "work calendar" picker). */
export function knownCalendars(os: LifeOSContext): string[] {
  if (!os.registry.entityTypes.has('event')) return [];
  return os.db.all<{ c: string }>(`SELECT DISTINCT j.value AS c FROM entities e, json_each(json_extract(e.data,'$.calendars')) j WHERE e.type='event' AND e.deleted_at IS NULL ORDER BY c`).map((r) => r.c);
}

/** Apps with screen time in the last 30 days, most used first (for the "work apps" picker). */
export function knownApps(os: LifeOSContext, now = Date.now()): Array<{ package: string; label: string; minutes: number }> {
  return os.db
    .all<{ package: string; label: string | null; ms: number }>(`SELECT package, MAX(label) AS label, SUM(ms) AS ms FROM usage_app_daily WHERE day >= ? GROUP BY package ORDER BY ms DESC LIMIT 60`, [isoDay(now - 30 * DAY)])
    .map((r) => ({ package: r.package, label: r.label ?? r.package, minutes: Math.round(r.ms / 60_000) }));
}

/** What a rule says, for the tracker page. */
export function ruleText(r: TrackerRule, os?: LifeOSContext): string {
  switch (r.kind) {
    case 'message':
      return `A text, notification or email mentions ${r.words.join(' / ')}`;
    case 'payment':
      return `${r.direction === 'received' ? 'Money in' : r.direction === 'any' ? 'A payment' : 'A payment out'}${r.words?.length ? ` mentioning ${r.words.join(' / ')}` : ''}${r.category ? ` in ${r.category}` : ''}`;
    case 'record':
      return `A ${os?.registry.entityTypes.get(r.type)?.label.toLowerCase() ?? r.type} that day`;
    case 'metric':
      return `${r.metric === 'steps' ? 'Steps' : r.metric === 'sleep' ? 'Sleep (h)' : r.metric === 'resting_hr' ? 'Resting heart rate' : 'Weight'} ${r.goal ? 'reach your goal' : `≥ ${r.min}`}`;
    case 'screen':
      return `${r.minutes}+ min in ${r.apps.join(', ')}`;
    case 'calendar':
      return `An event${r.calendars?.length ? ` on ${r.calendars.join(' / ')}` : ''}${r.calendars?.length && r.words?.length ? ' or' : ''}${r.words?.length ? ` titled ${r.words.join(' / ')}` : ''}`;
    case 'habit':
      return `Habit “${os?.entities.get(r.habitId)?.title ?? 'habit'}” ticked`;
  }
}
