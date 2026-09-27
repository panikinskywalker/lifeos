import type { LifeOSContext } from '../registry/context';
import { cycleNudges } from '../cycles/nudges';
import { upkeep } from '../cycles/upkeep';
import { daily, formatMetric, isoDay, spendPace } from '../dashboard/metrics';
import { goals, myDay } from '../dashboard/day';

/**
 * What the phone should notify, and when (M5): reminders, upkeep nudges and
 * the morning brief — each switchable — with nothing landing inside quiet
 * hours (it waits until they end). Pure: the platform schedules the plan.
 */

export type NotifyKind = 'reminder' | 'upkeep' | 'brief';

export interface NotifyPrefs {
  brief: { on: boolean; time: string };
  reminders: boolean;
  upkeep: boolean;
  quiet: { on: boolean; from: string; to: string };
}

export const DEFAULT_PREFS: NotifyPrefs = { brief: { on: true, time: '08:00' }, reminders: true, upkeep: true, quiet: { on: true, from: '22:30', to: '07:30' } };

export function notifyPrefs(os: LifeOSContext): NotifyPrefs {
  const p = os.settings.get<Partial<NotifyPrefs>>('notify', {});
  return { ...DEFAULT_PREFS, ...p, brief: { ...DEFAULT_PREFS.brief, ...p.brief }, quiet: { ...DEFAULT_PREFS.quiet, ...p.quiet } };
}

export function setNotifyPrefs(os: LifeOSContext, patch: Partial<NotifyPrefs>) {
  const cur = notifyPrefs(os);
  os.settings.set('notify', { ...cur, ...patch, brief: { ...cur.brief, ...patch.brief }, quiet: { ...cur.quiet, ...patch.quiet } });
}

export interface PlannedNotification {
  kind: NotifyKind;
  at: number;
  title: string;
  body: string;
  data: Record<string, string | undefined>;
}

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};
const atTime = (day: number, hhmm: string) => {
  const d = new Date(day);
  d.setHours(0, 0, 0, 0);
  return d.getTime() + minutes(hhmm) * 60_000;
};

/** Inside quiet hours → when they end (the same night can cross midnight). */
export function outOfQuiet(at: number, q: NotifyPrefs['quiet']): number {
  if (!q.on) return at;
  const d = new Date(at);
  const m = d.getHours() * 60 + d.getMinutes();
  const from = minutes(q.from);
  const to = minutes(q.to);
  const inside = from < to ? m >= from && m < to : m >= from || m < to;
  if (!inside) return at;
  // The end of this quiet stretch: today's "to" if we're past midnight, else tomorrow's.
  const end = atTime(at, q.to);
  return end > at ? end : end + 86_400_000;
}

const fmtH = (h: number) => `${Math.floor(h)}h ${String(Math.round((h % 1) * 60)).padStart(2, '0')}m`;

/**
 * The morning brief for the day of `at`, from real data: last night's sleep
 * against your goal, today's step goal, what's on (first few, with times),
 * the month's spend against your usual pace. Lines only for what there is.
 */
export function morningBrief(os: LifeOSContext, at: number): { title: string; body: string; lines: string[] } {
  const day = isoDay(at);
  const g = Object.fromEntries(goals(os, at).map((x) => [x.id, x]));
  const lines: string[] = [];
  if (os.registry.entityTypes.has('measurement')) {
    const slept = daily(os, 'sleep', day, day).get(day);
    if (slept != null) lines.push(`Slept ${fmtH(slept)}${g.sleep ? ` (goal ${fmtH(g.sleep.target)})` : ''}`);
    if (g.steps) lines.push(`Steps goal: ${formatMetric('steps', g.steps.target, os.format.currency)}`);
  }
  const items = myDay(os, at, upkeep(os, 'All', at)).filter((i) => !i.done);
  if (items.length) {
    const first = items
      .slice(0, 3)
      .map((i) => `${i.allDay ? '' : `${new Date(i.at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })} `}${i.title}${i.late ? ' (late)' : ''}`)
      .join(', ');
    lines.push(`${items.length} thing${items.length === 1 ? '' : 's'} today: ${first}${items.length > 3 ? '…' : ''}`);
  }
  if (os.registry.entityTypes.has('transaction')) {
    const p = spendPace(os, at);
    if (p.spent > 0) {
      const diff = p.usualByToday != null ? p.spent - p.usualByToday : null;
      lines.push(`${os.format.currency(p.spent)} spent this month${diff != null && Math.abs(diff) >= 500 ? ` — ${os.format.currency(Math.abs(diff))} ${diff > 0 ? 'over' : 'under'} your usual pace` : ''}`);
    }
  }
  const title = items.length ? `Good morning — ${items.length} thing${items.length === 1 ? '' : 's'} today` : 'Good morning — a clear day';
  return { title, body: lines.join('\n') || 'Nothing on today.', lines };
}

/** Everything to schedule from `now`: reminders, upkeep nudges, the next briefs — switched per kind, moved out of quiet hours. */
export function notificationPlan(os: LifeOSContext, now = Date.now(), limit = 60): PlannedNotification[] {
  const prefs = notifyPrefs(os);
  const out: PlannedNotification[] = [];
  if (prefs.reminders) {
    for (const r of os.reminders.upcoming(64)) {
      const at = r.snoozedUntil ?? r.nextAt ?? r.dueAt;
      if (at <= now) continue;
      const entity = r.entityId ? os.entities.get(r.entityId) : undefined;
      out.push({ kind: 'reminder', at, title: r.title, body: r.body ?? entity?.title ?? '', data: { reminderId: r.id, entityId: r.entityId ?? undefined, entityType: entity?.type } });
    }
  }
  if (prefs.upkeep) {
    for (const n of cycleNudges(os, now)) {
      if (n.at <= now) continue;
      out.push({ kind: 'upkeep', at: n.at, title: n.title, body: n.body, data: { cycleId: n.cycleId, entityId: n.entityId, entityType: os.entities.get(n.entityId)?.type } });
    }
  }
  if (prefs.brief.on) {
    // Today's if it's still ahead, and tomorrow's (rescheduled with fresher data on every sync).
    for (const k of [0, 1]) {
      const at = atTime(now + k * 86_400_000, prefs.brief.time);
      if (at <= now) continue;
      const b = morningBrief(os, at);
      out.push({ kind: 'brief', at, title: b.title, body: b.body, data: { route: '/' } });
      break;
    }
  }
  return out
    .map((n) => ({ ...n, at: outOfQuiet(n.at, prefs.quiet) }))
    .sort((a, b) => a.at - b.at)
    .slice(0, limit);
}
