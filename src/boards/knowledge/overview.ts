import type { LifeOSContext } from '@core/registry/context';
import { lastMonths, type ModuleOverview, type OverviewBlock } from '@core/dashboard/overview';
import { notes } from '@modules/knowledge';

/** The Second Brain at a glance: notes and facts, written per month, the latest and pinned notes. */
export function notesOverview(os: LifeOSContext, now = Date.now()): ModuleOverview {
  const all = notes(os, { limit: 5000 });
  const facts = os.facts.list({ limit: 100000 }).length;
  const months = lastMonths(6, now);
  const byMonth = months.map((m) => all.filter((n) => n.createdAt >= new Date(`${m.start}T00:00:00`).getTime() && n.createdAt <= new Date(`${m.end}T23:59:59`).getTime()).length);
  const blocks: OverviewBlock[] = [{ kind: 'stats', items: [{ label: 'Notes', value: String(all.length) }, { label: 'Facts', value: String(facts) }, { label: 'This month', value: String(byMonth.at(-1) ?? 0) }] }];
  if (byMonth.some((x) => x > 0)) blocks.push({ kind: 'bars', title: 'Written by month', labels: months.map((m) => m.label), values: byMonth, format: 'number' });
  blocks.push({ kind: 'list', title: 'Pinned and latest', items: all.slice(0, 6).map((n) => ({ title: n.title, sub: n.subtitle ?? null, entityId: n.id, type: 'note' })), empty: 'No notes yet.', more: { label: 'All notes', type: 'note' } });
  const latest = [...all].sort((a, b) => b.updatedAt - a.updatedAt)[0];
  return { card: { headline: `${all.length} notes · ${facts} facts`, sub: latest ? `latest: ${latest.title}` : null }, blocks };
}
