import type { LifeOSContext } from '@core/registry/context';
import { upkeep } from '@core/cycles/upkeep';
import { peopleToCall } from '@core/dashboard/metrics';
import { DAY_MS, type ModuleOverview, type OverviewBlock } from '@core/dashboard/overview';

/** People at a glance: who to call, birthdays coming, who you've been in touch with, how your people split. */
export function peopleOverview(os: LifeOSContext, now = Date.now()): ModuleOverview {
  const u = upkeep(os, 'All', now);
  const people = os.records.query<{ relationship?: string; lastContactAt?: string }>('person', {}, { limit: 5000 });
  const call = peopleToCall(os, 8, now, u);
  const birthdays = u.items
    .filter((i) => i.entity.object === 'person' && i.cycle.template === 'person.birthday' && i.cycle.nextDueAt != null && i.cycle.nextDueAt - now <= 30 * DAY_MS)
    .sort((a, b) => a.cycle.nextDueAt! - b.cycle.nextDueAt!);
  const touched30 = people.filter((p) => p.data.lastContactAt && now - Date.parse(p.data.lastContactAt) <= 30 * DAY_MS).length;
  // In touch per week (last 8 weeks): people whose last contact fell in it.
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const end = now - (7 - i) * 7 * DAY_MS;
    return people.filter((p) => p.data.lastContactAt && Date.parse(p.data.lastContactAt) > end - 7 * DAY_MS && Date.parse(p.data.lastContactAt) <= end).length;
  });
  const byRel = new Map<string, number>();
  for (const p of people) {
    const k = (p.data.relationship ?? 'other').replace(/^\w/, (c) => c.toUpperCase());
    byRel.set(k, (byRel.get(k) ?? 0) + 1);
  }
  const late = call.filter((c) => c.late).length;
  const blocks: OverviewBlock[] = [
    { kind: 'stats', items: [{ label: 'People', value: String(people.length) }, { label: 'To call', value: String(call.length), tone: late ? 'alert' : undefined, sub: late ? `${late} overdue` : null }, { label: 'Birthdays (30 d)', value: String(birthdays.length) }, { label: 'In touch (30 d)', value: String(touched30) }] },
    { kind: 'list', title: 'Call or message', items: call.map((c) => ({ title: c.title, sub: c.why, entityId: c.entityId, type: 'person', tone: c.late ? 'alert' : undefined })), empty: 'No one due. Set “keep in touch” on a person to see them here.' },
  ];
  if (birthdays.length) blocks.push({ kind: 'list', title: 'Birthdays coming up', items: birthdays.slice(0, 6).map((b) => ({ title: b.entity.title, sub: new Date(b.cycle.nextDueAt!).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }), value: `${Math.max(0, Math.round((b.cycle.nextDueAt! - now) / DAY_MS))} d`, entityId: b.entity.id, type: 'person' })) });
  if (weeks.some((w) => w > 0)) blocks.push({ kind: 'bars', title: 'People you were in touch with, by week', labels: weeks.map((_, i) => (i === 7 ? 'now' : `-${7 - i}w`)), values: weeks, format: 'number' });
  if (byRel.size > 1) blocks.push({ kind: 'breakdown', title: 'Your people', parts: [...byRel.entries()].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value })), format: 'number' });
  return { card: { headline: call.length ? `${call.length} to call` : `${people.length} people`, sub: birthdays[0] ? `${birthdays[0].entity.title}’s birthday ${Math.max(0, Math.round((birthdays[0].cycle.nextDueAt! - now) / DAY_MS)) === 0 ? 'today' : `in ${Math.round((birthdays[0].cycle.nextDueAt! - now) / DAY_MS)} d`}` : late ? `${late} overdue` : 'no one overdue', series: weeks.slice(1), seriesFormat: 'number', alert: late > 0 }, blocks };
}
