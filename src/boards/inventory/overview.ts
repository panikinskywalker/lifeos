import type { LifeOSContext } from '@core/registry/context';
import type { ModuleOverview, OverviewBlock } from '@core/dashboard/overview';
import { goingOffCandidates, runningOutCandidates, spaces, type StockData } from '@modules/inventory';

/** Home at a glance (Browse › Home, Today's area card): things in, to use soon, running low, by space. */
export function inventoryOverview(os: LifeOSContext, now = Date.now()): ModuleOverview {
  const inHome = os.records.query<StockData>('stock', {}, { limit: 5000 }).filter((s) => s.data.quantity > 0);
  const soon = goingOffCandidates(os, now);
  const low = runningOutCandidates(os, now);
  const blocks: OverviewBlock[] = [
    { kind: 'stats', items: [{ label: 'At home', value: String(inHome.length) }, { label: 'Use soon', value: String(soon.length), tone: soon.some((n) => n.urgent) ? 'alert' : undefined }, { label: 'Running low', value: String(low.length), tone: low.length ? 'alert' : undefined }] },
    { kind: 'list', title: 'Use soon', items: soon.slice(0, 8).map((n) => ({ title: n.title, sub: n.why, entityId: n.stockId, type: 'stock', tone: n.urgent ? ('alert' as const) : undefined })), empty: 'Nothing going off.' },
    { kind: 'list', title: 'Running low', items: low.slice(0, 8).map((n) => ({ title: n.title, sub: n.why, entityId: n.stockId, type: 'stock', tone: 'alert' as const })), empty: 'Nothing running low.' },
  ];
  const by = spaces(os).map((s) => ({ label: s.title, value: inHome.filter((x) => x.data.spaceId === s.id).length })).filter((p) => p.value > 0);
  if (by.length > 1) blocks.push({ kind: 'breakdown', title: 'Spaces', parts: by, format: 'number' });
  const first = soon[0];
  return { card: { headline: soon.length ? `${soon.length} to use soon` : `${inHome.length} at home`, sub: first ? first.line : low[0]?.line ?? null, alert: soon.some((n) => n.urgent) || low.length > 0 }, blocks };
}
