import type { LifeOSContext } from '../registry/context';
import { DAY, startOfDay } from './schedule';
import { upkeep, type UpkeepItem } from './upkeep';

export interface Nudge {
  /** Stable per cycle and day, so a resync replaces rather than duplicates. */
  key: string;
  at: number;
  title: string;
  body: string;
  entityId: string;
  cycleId: string;
}

const NUDGE_HOUR = 9;
const at9 = (day: number) => startOfDay(day) + NUDGE_HOUR * 3600_000;
const km = (n: number) => `${Math.round(n).toLocaleString('en-IN')} km`;

/** PRODUCT §3 phrasing: "Jio runs out in 3 days", "Service due in 12 days or 800 km", "Haven't called Dad in 9 days". */
export function nudgeText(i: UpkeepItem, daysLeft: number | null): string {
  const { cycle, entity } = i;
  const meterLeft = i.status.meterLeft;
  const d = (n: number) => `${n} day${n === 1 ? '' : 's'}`;
  if (entity.object === 'person' && cycle.template === 'person.contact') {
    const since = cycle.lastDoneAt ? Math.max(1, Math.round((startOfDay(Date.now()) - startOfDay(cycle.lastDoneAt)) / DAY)) : null;
    return since ? `Haven’t been in touch with ${entity.title} in ${d(since)}` : `Time to catch up with ${entity.title}`;
  }
  if (entity.object === 'subscription') {
    if (daysLeft == null || daysLeft <= 0) return `${entity.title} renews today`;
    return `${entity.title} runs out in ${d(daysLeft)}`;
  }
  if (entity.object === 'routine') return daysLeft != null && daysLeft < 0 ? `${entity.title} is ${d(-daysLeft)} late` : `${entity.title}’s due`;
  const what = cycle.name === entity.title ? entity.title : `${entity.title}: ${cycle.name.toLowerCase()}`;
  if (meterLeft != null && meterLeft <= 0) return `${what} is ${km(-meterLeft)} overdue`;
  if (daysLeft != null && daysLeft < 0) return `${what} is ${d(-daysLeft)} late`;
  if (daysLeft === 0) return `${what} is due today`;
  const parts = [daysLeft != null ? `in ${d(daysLeft)}` : null, meterLeft != null ? km(meterLeft) : null].filter(Boolean);
  return `${what} due ${parts.join(' or ')}`;
}

/**
 * Local notifications for cycles over the next `horizonDays`: one at the
 * start of the lead window, one on the due day, and — if already late — one
 * the next morning. Meter cycles that are close (or past) get a morning
 * nudge. Snoozed cycles wait until the snooze ends. Sorted by time.
 */
export function cycleNudges(os: LifeOSContext, now = Date.now(), horizonDays = 30): Nudge[] {
  const out: Nudge[] = [];
  const horizon = now + horizonDays * DAY;
  const tomorrow9 = at9(now + DAY);
  const next9 = at9(now) > now ? at9(now) : tomorrow9;
  for (const i of upkeep(os, 'All', now).items) {
    const { cycle, entity, status } = i;
    if (status.state === 'unscheduled') continue;
    const push = (when: number, daysLeft: number | null) => {
      if (cycle.snoozedUntil && when < cycle.snoozedUntil) when = Math.max(cycle.snoozedUntil, when);
      if (when <= now || when > horizon) return;
      out.push({ key: `${cycle.id}:${startOfDay(when)}`, at: when, title: entity.title, body: nudgeText(i, daysLeft), entityId: entity.id, cycleId: cycle.id });
    };
    if (cycle.nextDueAt != null) {
      const due = at9(cycle.nextDueAt);
      if (status.state === 'overdue' && status.daysLeft != null && status.daysLeft < 0) {
        push(next9, status.daysLeft - (next9 > at9(now) ? 1 : 0));
      } else {
        const lead = Math.max(0, cycle.leadDays);
        if (lead > 0) push(at9(cycle.nextDueAt - lead * DAY), lead);
        push(due, 0);
      }
    } else if (status.state === 'overdue' || status.state === 'soon') {
      push(next9, null);
    }
  }
  const seen = new Set<string>();
  return out.filter((n) => (seen.has(n.key) ? false : (seen.add(n.key), true))).sort((a, b) => a.at - b.at);
}
