import type { LifeOSContext } from '@core/registry/context';
import type { ModuleOverview, OverviewBlock } from '@core/dashboard/overview';
import { notes } from '@modules/knowledge';
import { monthCounts } from './read';

/** Journal at a glance: notes and facts, written per month, the latest and pinned notes. */
export function notesOverview(os: LifeOSContext, now = Date.now()): ModuleOverview {
  const all = notes(os, { limit: 5000 });
  const facts = os.facts.list({ limit: 100000 }).length;
  const months = monthCounts(all, now);
  const blocks: OverviewBlock[] = [{ kind: 'stats', items: [{ label: 'Notes', value: String(all.length) }, { label: 'Facts', value: String(facts) }, { label: 'This month', value: String(months.at(-1)?.value ?? 0) }] }];
  if (months.some((m) => m.value > 0)) blocks.push({ kind: 'bars', title: 'Written by month', labels: months.map((m) => m.label), values: months.map((m) => m.value), format: 'number' });
  blocks.push({ kind: 'list', title: 'Pinned and latest', items: all.slice(0, 6).map((n) => ({ title: n.title, sub: n.subtitle ?? null, entityId: n.id, type: 'note' })), empty: 'No notes yet.', more: { label: 'All notes', type: 'note' } });
  const latest = [...all].sort((a, b) => b.updatedAt - a.updatedAt)[0];
  return { card: { headline: `${all.length} notes · ${facts} facts`, sub: latest ? `latest: ${latest.title}` : null }, blocks };
}
