import type { LifeOSContext } from '@core/registry/context';
import { daysUntil, inDays, isoOf, type ModuleOverview, type OverviewBlock } from '@core/dashboard/overview';

/** Stock at a glance: running low, expiring, by location. */
export function inventoryOverview(os: LifeOSContext, now = Date.now()): ModuleOverview {
  const items = os.records.query<{ quantity?: number; minQuantity?: number; expiresOn?: string; location?: string }>('item', {}, { limit: 5000 });
  const low = items.filter((i) => i.data.minQuantity != null && (i.data.quantity ?? 0) <= i.data.minQuantity);
  const expiring = items.filter((i) => i.data.expiresOn && daysUntil(i.data.expiresOn, now) <= 30).sort((a, b) => (a.data.expiresOn! < b.data.expiresOn! ? -1 : 1));
  const byLoc = new Map<string, number>();
  for (const i of items) byLoc.set(i.data.location ?? 'Unsorted', (byLoc.get(i.data.location ?? 'Unsorted') ?? 0) + 1);
  const blocks: OverviewBlock[] = [
    { kind: 'stats', items: [{ label: 'Items', value: String(items.length) }, { label: 'Running low', value: String(low.length), tone: low.length ? 'alert' : undefined }, { label: 'Expiring (30 d)', value: String(expiring.length), tone: expiring.some((e) => e.data.expiresOn! < isoOf(now)) ? 'alert' : undefined }] },
    { kind: 'list', title: 'Buy again', items: low.map((i) => ({ title: i.title, sub: `${i.data.quantity ?? 0} left (min ${i.data.minQuantity})`, entityId: i.id, type: 'item', tone: 'alert' as const })), empty: 'Nothing running low.' },
  ];
  if (expiring.length) blocks.push({ kind: 'list', title: 'Expiring', items: expiring.slice(0, 8).map((i) => ({ title: i.title, sub: inDays(daysUntil(i.data.expiresOn!, now)), entityId: i.id, type: 'item', tone: i.data.expiresOn! < isoOf(now) ? ('alert' as const) : undefined })) });
  if (byLoc.size > 1) blocks.push({ kind: 'breakdown', title: 'Where things are', parts: [...byLoc.entries()].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value })), format: 'number' });
  return { card: { headline: low.length ? `${low.length} running low` : `${items.length} items`, sub: expiring[0] ? `${expiring[0].title} expires ${inDays(daysUntil(expiring[0].data.expiresOn!, now))}` : null, alert: low.length > 0 }, blocks };
}
