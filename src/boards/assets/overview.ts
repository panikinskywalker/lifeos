import type { LifeOSContext } from '@core/registry/context';
import { upkeep } from '@core/cycles/upkeep';
import { daysUntil, inDays, isoOf, lastMonths, type ModuleOverview, type OverviewBlock } from '@core/dashboard/overview';

const THINGS = new Set(['asset', 'vehicle', 'routine', 'item']);

/** Things and upkeep at a glance: what's due, what's late, what upkeep cost by month, warranties and papers running out. */
export function assetsOverview(os: LifeOSContext, now = Date.now()): ModuleOverview {
  const money = os.format.currency;
  const u = upkeep(os, 'All', now);
  const mine = u.items.filter((i) => THINGS.has(i.entity.type));
  const late = mine.filter((i) => (i.status.daysLeft ?? 1) < 0);
  const week = mine.filter((i) => (i.status.daysLeft ?? 99) >= 0 && (i.status.daysLeft ?? 99) <= 7);
  const assets = os.registry.objects.has('asset') ? os.records.query<{ purchasePrice?: number; currentValue?: number; warrantyUntil?: string }>('asset', { filter: { and: [{ field: 'status', op: 'neq', value: 'sold' }] } }, { limit: 1000 }) : [];
  const vehicles = os.registry.objects.has('vehicle') ? os.records.query<{ insuranceUntil?: string; pucUntil?: string }>('vehicle', {}, { limit: 50 }) : [];
  const worth = assets.reduce((n, a) => n + (a.data.currentValue ?? a.data.purchasePrice ?? 0), 0);
  // Upkeep spend per month: costs logged when a job was done.
  const months = lastMonths(6, now);
  const costs = months.map((m) => os.db.get<{ t: number | null }>(`SELECT SUM(json_extract(meta,'$.cost')) AS t FROM timeline_events WHERE kind='cycle.done' AND occurred_at BETWEEN ? AND ?`, [new Date(`${m.start}T00:00:00`).getTime(), new Date(`${m.end}T23:59:59`).getTime()])?.t ?? 0);
  const expiring = [
    ...assets.filter((a) => a.data.warrantyUntil).map((a) => ({ title: a.title, what: 'Warranty', until: a.data.warrantyUntil!, id: a.id, type: 'asset' })),
    ...vehicles.flatMap((v) => [v.data.insuranceUntil ? { title: v.title, what: 'Insurance', until: v.data.insuranceUntil, id: v.id, type: 'vehicle' } : null, v.data.pucUntil ? { title: v.title, what: 'PUC', until: v.data.pucUntil, id: v.id, type: 'vehicle' } : null].filter((x): x is NonNullable<typeof x> => !!x)),
  ]
    .filter((x) => x.until >= isoOf(now) && daysUntil(x.until, now) <= 90)
    .sort((a, b) => (a.until < b.until ? -1 : 1));
  const blocks: OverviewBlock[] = [
    { kind: 'stats', items: [{ label: 'Late', value: String(late.length), tone: late.length ? 'alert' : undefined }, { label: 'Due this week', value: String(week.length) }, { label: 'Due this month', value: money(u.monthCost), sub: 'estimated' }, ...(worth ? [{ label: 'Things worth', value: money(worth) }] : [])] },
    { kind: 'list', title: 'Upkeep coming up', items: [...late, ...week].slice(0, 8).map((i) => ({ title: i.cycle.name.trim().toLowerCase() === i.entity.title.trim().toLowerCase() ? i.entity.title : `${i.cycle.name} · ${i.entity.title}`, sub: i.status.daysLeft != null ? inDays(i.status.daysLeft) : null, entityId: i.entity.id, type: i.entity.type, tone: (i.status.daysLeft ?? 0) < 0 ? 'alert' : undefined })), empty: 'Nothing due this week.' },
  ];
  if (costs.some((c) => c > 0)) blocks.push({ kind: 'bars', title: 'Upkeep spend by month', labels: months.map((m) => m.label), values: costs, format: 'money' });
  if (expiring.length) blocks.push({ kind: 'list', title: 'Running out (90 d)', items: expiring.slice(0, 6).map((x) => ({ title: `${x.what} · ${x.title}`, sub: inDays(daysUntil(x.until, now)), entityId: x.id, type: x.type })) });
  return { card: { headline: late.length ? `${late.length} late` : `${week.length} due this week`, sub: mine[0] ? `next: ${mine[0].cycle.name.toLowerCase() === mine[0].entity.title.toLowerCase() ? mine[0].entity.title : `${mine[0].cycle.name} · ${mine[0].entity.title}`}` : null, series: costs.slice(-6), seriesFormat: 'money', alert: late.length > 0 }, blocks };
}
