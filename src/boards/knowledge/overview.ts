import type { LifeOSContext } from '@core/registry/context';
import { lastMonths, type ModuleOverview, type OverviewBlock } from '@core/dashboard/overview';

/** Notes at a glance: how many, written per month, the latest. */
export function notesOverview(os: LifeOSContext, now = Date.now()): ModuleOverview {
  const notes = os.records.query('note', { sort: [{ field: 'updatedAt', dir: 'desc' }] }, { limit: 5000 });
  const months = lastMonths(6, now);
  const byMonth = months.map((m) => notes.filter((n) => n.createdAt >= new Date(`${m.start}T00:00:00`).getTime() && n.createdAt <= new Date(`${m.end}T23:59:59`).getTime()).length);
  const blocks: OverviewBlock[] = [{ kind: 'stats', items: [{ label: 'Notes', value: String(notes.length) }, { label: 'This month', value: String(byMonth.at(-1) ?? 0) }] }];
  if (byMonth.some((x) => x > 0)) blocks.push({ kind: 'bars', title: 'Written by month', labels: months.map((m) => m.label), values: byMonth, format: 'number' });
  blocks.push({ kind: 'list', title: 'Latest', items: notes.slice(0, 6).map((n) => ({ title: n.title, sub: n.subtitle ?? null, entityId: n.id, type: 'note' })), empty: 'No notes yet.', more: { label: 'All notes', type: 'note' } });
  return { card: { headline: `${notes.length} notes`, sub: notes[0] ? `latest: ${notes[0].title}` : null }, blocks };
}
