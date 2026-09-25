/**
 * Pure cycle maths — no DB. A cycle is "this recurs" on any record:
 *   interval — every N units after it was last done (laundry every 4 days)
 *   fixed    — on the calendar: a set date, optionally repeating from that
 *              date regardless of when it was done (Jio every 84 days, passport)
 *   meter    — every M on a meter (service every 10,000 km)
 *   either   — interval or meter, whichever comes first (service 6 months / 10,000 km)
 */

export type CycleKind = 'interval' | 'fixed' | 'meter' | 'either';
export type CycleUnit = 'day' | 'week' | 'month' | 'year';

export interface CycleRule {
  kind: CycleKind;
  everyN?: number | null;
  everyUnit?: CycleUnit | null;
  meterEvery?: number | null;
}

export interface CycleDue {
  nextDueAt: number | null;
  nextDueMeter: number | null;
}

export const DAY = 86_400_000;

/** Add n units to a timestamp in local calendar terms (months clamp to month end: 31 Jan + 1 month = 28/29 Feb). */
export function addPeriod(at: number, n: number, unit: CycleUnit): number {
  const d = new Date(at);
  if (unit === 'day') d.setDate(d.getDate() + n);
  else if (unit === 'week') d.setDate(d.getDate() + 7 * n);
  else {
    const months = unit === 'year' ? 12 * n : n;
    const day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + months);
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, last));
  }
  return d.getTime();
}

export function startOfDay(at: number): number {
  const d = new Date(at);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

const hasPeriod = (r: CycleRule) => !!r.everyN && r.everyN > 0 && !!r.everyUnit;
const usesTime = (r: CycleRule) => r.kind === 'interval' || r.kind === 'fixed' || r.kind === 'either';
const usesMeter = (r: CycleRule) => r.kind === 'meter' || r.kind === 'either';

/**
 * Next due after "done" at `doneAt` (meter reading `meter`, if known).
 * `prevDueAt` anchors fixed cycles: they advance by whole periods from the
 * previous due date until past the done date, so a Jio plan paid 2 days late
 * still renews on its calendar. A fixed cycle with no period is one-off: done
 * means finished (next due null).
 */
export function nextAfterDone(rule: CycleRule, doneAt: number, meter: number | null, prevDueAt: number | null): CycleDue {
  let nextDueAt: number | null = null;
  if (usesTime(rule) && hasPeriod(rule)) {
    if (rule.kind === 'fixed' && prevDueAt != null) {
      let at = prevDueAt;
      let guard = 0;
      do at = addPeriod(at, rule.everyN!, rule.everyUnit!);
      while (at <= doneAt && ++guard < 10_000);
      nextDueAt = at;
    } else {
      nextDueAt = addPeriod(doneAt, rule.everyN!, rule.everyUnit!);
    }
  }
  const nextDueMeter = usesMeter(rule) && rule.meterEvery && meter != null ? meter + rule.meterEvery : null;
  return { nextDueAt, nextDueMeter };
}

/** Skip one occurrence without doing it: the due date (and meter target) move on by one period. */
export function nextAfterSkip(rule: CycleRule, due: CycleDue, now: number): CycleDue {
  const base = due.nextDueAt ?? now;
  return {
    nextDueAt: usesTime(rule) && hasPeriod(rule) ? addPeriod(base, rule.everyN!, rule.everyUnit!) : due.nextDueAt,
    nextDueMeter: usesMeter(rule) && rule.meterEvery && due.nextDueMeter != null ? due.nextDueMeter + rule.meterEvery : due.nextDueMeter,
  };
}

export type CycleState = 'overdue' | 'today' | 'soon' | 'ok' | 'snoozed' | 'unscheduled';
export type UpkeepBucket = 'overdue' | 'week' | 'month' | 'later';

export interface CycleStatus {
  state: CycleState;
  bucket: UpkeepBucket;
  /** Whole days until due (negative = late); null when there is no date. */
  daysLeft: number | null;
  /** Meter left until due (negative = past); null without a meter target or reading. */
  meterLeft: number | null;
  /** 0–1 of the current period used (for bars and rings); null when unknown. */
  progress: number | null;
}

/**
 * Where a cycle stands now. Meter-only cycles have no date, so they bucket by
 * how much of the meter period is left: ≤ 0 overdue, ≤ 10 % this week, ≤ 25 %
 * this month. `soon` = within the cycle's lead days (at least 3).
 */
export function cycleStatus(
  c: CycleRule & CycleDue & { lastDoneAt?: number | null; lastMeter?: number | null; leadDays?: number | null; snoozedUntil?: number | null },
  now: number,
  currentMeter: number | null,
): CycleStatus {
  const today = startOfDay(now);
  const daysLeft = c.nextDueAt != null ? Math.round((startOfDay(c.nextDueAt) - today) / DAY) : null;
  const meterLeft = c.nextDueMeter != null && currentMeter != null ? c.nextDueMeter - currentMeter : null;

  let progress: number | null = null;
  if (c.nextDueAt != null && c.lastDoneAt != null && c.nextDueAt > c.lastDoneAt) progress = (now - c.lastDoneAt) / (c.nextDueAt - c.lastDoneAt);
  if (meterLeft != null && c.meterEvery) progress = Math.max(progress ?? 0, 1 - meterLeft / c.meterEvery);
  if (progress != null) progress = Math.min(1, Math.max(0, progress));

  const late = (daysLeft != null && daysLeft < 0) || (meterLeft != null && meterLeft <= 0);
  const meterShare = meterLeft != null && c.meterEvery ? meterLeft / c.meterEvery : null;
  const bucket: UpkeepBucket = late
    ? 'overdue'
    : (daysLeft != null && daysLeft <= 7) || (meterShare != null && meterShare <= 0.1)
      ? 'week'
      : (daysLeft != null && daysLeft <= 31) || (meterShare != null && meterShare <= 0.25)
        ? 'month'
        : 'later';

  let state: CycleState;
  if (c.snoozedUntil != null && c.snoozedUntil > now) state = 'snoozed';
  else if (daysLeft == null && meterLeft == null) state = c.nextDueMeter != null ? 'ok' : 'unscheduled';
  else if (late) state = 'overdue';
  else if (daysLeft === 0) state = 'today';
  else if ((daysLeft != null && daysLeft <= Math.max(3, c.leadDays ?? 0)) || (meterShare != null && meterShare <= 0.1)) state = 'soon';
  else state = 'ok';

  return { state, bucket: state === 'snoozed' && bucket === 'overdue' ? 'week' : bucket, daysLeft, meterLeft, progress };
}

/** "every 4 days", "every 6 months or 10,000 km", "on a fixed date". */
export function describeCycle(r: CycleRule, meterUnit = 'km'): string {
  const period = hasPeriod(r) ? `every ${r.everyN === 1 ? '' : `${r.everyN} `}${r.everyUnit}${r.everyN === 1 ? '' : 's'}` : null;
  const meter = r.meterEvery ? `every ${r.meterEvery.toLocaleString('en-IN')} ${meterUnit}` : null;
  if (r.kind === 'meter') return meter ?? 'by meter';
  if (r.kind === 'either') return [period, meter?.replace('every ', '')].filter(Boolean).join(' or ') || 'by time or meter';
  if (r.kind === 'fixed') return period ? `${period} (fixed date)` : 'on a fixed date';
  return period ?? 'no schedule';
}

/** "2026-03-14" (a date field) → that day at 09:00 local; null for empty/invalid. */
export function dateField(v: unknown): number | null {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(v)) return null;
  const t = new Date(`${v.slice(0, 10)}T09:00:00`).getTime();
  return Number.isNaN(t) ? null : t;
}

/** The next yearly occurrence of a date on or after today (birthdays). */
export function nextAnnual(v: unknown, now: number): number | null {
  const t = dateField(v);
  if (t == null) return null;
  const d = new Date(t);
  const n = new Date(now);
  d.setFullYear(n.getFullYear());
  if (startOfDay(d.getTime()) < startOfDay(now)) d.setFullYear(n.getFullYear() + 1);
  return d.getTime();
}

/** FREQ=MONTHLY;INTERVAL=3 → every 3 months. Unknown frequencies → null. */
export function periodFromRRule(rrule: unknown): { everyN: number; everyUnit: CycleUnit } | null {
  if (typeof rrule !== 'string') return null;
  const freq = /FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)/.exec(rrule)?.[1];
  if (!freq) return null;
  const n = Number(/INTERVAL=(\d+)/.exec(rrule)?.[1] ?? 1) || 1;
  return { everyN: n, everyUnit: ({ DAILY: 'day', WEEKLY: 'week', MONTHLY: 'month', YEARLY: 'year' } as const)[freq as 'DAILY'] };
}

/** Next occurrence (today included) of a weekday, 0 = Sunday … 6 = Saturday, at 09:00. */
export function nextWeekday(weekday: number, now: number): number {
  const d = new Date(startOfDay(now));
  d.setDate(d.getDate() + ((weekday - d.getDay() + 7) % 7));
  d.setHours(9);
  return d.getTime();
}
