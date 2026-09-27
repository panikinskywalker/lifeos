import type { LifeOSContext } from '../registry/context';
import type { Entity } from '../domain/types';

/**
 * Habits (M5): check-ins, streaks that respect how often a habit is meant to
 * happen, and "did yoga" in a dump ticking the Yoga habit. Pure — works on
 * the habit / habit_log records by type name.
 */

export interface Habit {
  id: string;
  title: string;
  frequency: 'daily' | 'weekdays' | 'weekly';
  /** Times a week (weekly habits; others: every due day). */
  perWeek: number;
}

const DAY = 86_400_000;
export const isoOf = (t: number | Date) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const noon = (iso: string) => new Date(`${iso}T12:00:00`).getTime();

export function activeHabits(os: LifeOSContext): Habit[] {
  if (!os.registry.entityTypes.has('habit')) return [];
  return os.entities
    .query<{ frequency?: Habit['frequency']; targetPerWeek?: number }>('habit', { filter: { and: [{ field: 'status', op: 'neq', value: 'paused' }] } }, { limit: 200 })
    .map((h: Entity<{ frequency?: Habit['frequency']; targetPerWeek?: number }>) => {
      const frequency = h.data.frequency ?? 'daily';
      return { id: h.id, title: h.title, frequency, perWeek: h.data.targetPerWeek ?? (frequency === 'weekdays' ? 5 : frequency === 'weekly' ? 1 : 7) };
    });
}

/** Is the habit meant to happen on this day? (Weekly ones can be any day.) */
export function dueOn(h: Habit, iso: string): boolean {
  const dow = new Date(noon(iso)).getDay();
  return h.frequency !== 'weekdays' || (dow > 0 && dow < 6);
}

/** Days it was done since `fromIso`. */
export function doneDays(os: LifeOSContext, habitId: string, fromIso: string): Set<string> {
  return new Set(
    os.entities
      .query<{ habitId: string; date: string }>('habit_log', { filter: { and: [{ field: 'data.habitId', op: 'eq', value: habitId }, { field: 'data.date', op: 'gte', value: fromIso }] } }, { limit: 2000 })
      .map((l) => l.data.date),
  );
}

/**
 * The current streak: daily habits count days in a row, weekday habits skip
 * weekends, weekly habits count weeks that met their target. Today not done
 * yet doesn't break it.
 */
export function streakOf(h: Habit, done: Set<string>, now = Date.now()): { count: number; unit: 'day' | 'week' } {
  const today = isoOf(now);
  if (h.frequency === 'weekly') {
    const monday = (t: number) => {
      const d = new Date(t);
      d.setHours(12, 0, 0, 0);
      return d.getTime() - ((d.getDay() + 6) % 7) * DAY;
    };
    const weekCount = (start: number) => Array.from({ length: 7 }, (_, i) => isoOf(start + i * DAY)).filter((d) => done.has(d)).length;
    let start = monday(now);
    let n = 0;
    // This week counts once it's met; while it's still going it doesn't break the streak.
    if (weekCount(start) >= h.perWeek) n++;
    start -= 7 * DAY;
    while (weekCount(start) >= h.perWeek && n < 520) {
      n++;
      start -= 7 * DAY;
    }
    return { count: n, unit: 'week' };
  }
  let t = noon(today);
  if (!done.has(today)) t -= DAY;
  let n = 0;
  for (let guard = 0; guard < 3660; guard++) {
    const d = isoOf(t);
    if (!dueOn(h, d)) {
      t -= DAY;
      continue;
    }
    if (!done.has(d)) break;
    n++;
    t -= DAY;
  }
  return { count: n, unit: 'day' };
}

/** Tick a habit for a day (idempotent). Returns the check-in's id, or null if it was already done. */
export function checkIn(os: LifeOSContext, habitId: string, date: string): string | null {
  const existing = os.entities.query('habit_log', { filter: { and: [{ field: 'data.habitId', op: 'eq', value: habitId }, { field: 'data.date', op: 'eq', value: date }] } }, { limit: 1 })[0];
  if (existing) return null;
  return os.entities.create({ type: 'habit_log', data: { habitId, date } }, 'user').id;
}

/** Tap: done ↔ not done for a day. Returns whether it's done now. */
export function toggleCheckIn(os: LifeOSContext, habitId: string, date: string): boolean {
  const existing = os.entities.query('habit_log', { filter: { and: [{ field: 'data.habitId', op: 'eq', value: habitId }, { field: 'data.date', op: 'eq', value: date }] } }, { limit: 1 })[0];
  if (existing) {
    os.entities.delete(existing.id, 'user');
    return false;
  }
  os.entities.create({ type: 'habit_log', data: { habitId, date } }, 'user');
  return true;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const DONE_WORDS = /\b(did|done|finished|completed|went (?:for|to)|had|took|practi[cs]ed|meditated|ran|walked|read|wrote|stretched|worked out|hit the)\b/i;
const NOT = /\b(didn'?t|did not|skipped|missed|no|forgot|couldn'?t|won'?t|will|going to|gonna|should|need to|want to|plan to)\b/i;

/** The habit a habit's words point at: its name, or its name's main word ("Read 20 pages" ← "read"). */
export function findHabit(os: LifeOSContext, said: string): Habit | null {
  const s = norm(said);
  const habits = activeHabits(os);
  return (
    habits.find((h) => norm(h.title) === s) ??
    habits.find((h) => s.includes(norm(h.title)) || norm(h.title).includes(s)) ??
    habits.find((h) => {
      const main = norm(h.title).split(' ').find((w) => w.length >= 3 && !/^\d+$/.test(w));
      return !!main && new RegExp(`\\b${main}(?:ing|ed)?\\b`).test(s);
    }) ??
    null
  );
}

/**
 * A sentence that says a habit was done ("did yoga", "went for a run",
 * "meditated 10 min", "yoga ✓") → the habit and the day. Plans, misses and
 * negatives ("skipped yoga", "will read later") don't count.
 */
export function habitSaid(os: LifeOSContext, sentence: string, now = Date.now()): { habit: Habit; date: string } | null {
  if (NOT.test(sentence)) return null;
  const habits = activeHabits(os);
  if (!habits.length) return null;
  const s = norm(sentence);
  const hit =
    habits.find((h) => new RegExp(`\\b${norm(h.title)}\\b`).test(s)) ??
    habits.find((h) => {
      const main = norm(h.title).split(' ').find((w) => w.length >= 3 && !/^\d+$/.test(w));
      return !!main && new RegExp(`\\b${main}(?:ing|ed)?\\b`).test(s);
    });
  if (!hit) return null;
  const said = DONE_WORDS.test(sentence) || /✓|✔|\bdone\b/i.test(sentence) || new RegExp(`^\\s*${norm(hit.title)}\\s*$`).test(s);
  if (!said) return null;
  const date = /\byesterday\b/i.test(sentence) ? isoOf(now - DAY) : isoOf(now);
  return { habit: hit, date };
}
