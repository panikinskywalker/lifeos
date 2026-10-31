import type { LifeOSContext } from '@core/registry/context';
import { upkeep } from '@core/cycles/upkeep';
import { inDays, lastMonths, type ModuleOverview, type OverviewBlock } from '@core/dashboard/overview';
import { clothesByState, dueForService, underWarranty } from '@modules/assets';

const THINGS = new Set(['asset', 'routine']);

/** Things and upkeep at a glance: what's due, what's late, what upkeep cost by month, service due, warranties running out, clothes in the wash. */
export function assetsOverview(os: LifeOSContext, now = Date.now()): ModuleOverview {
  const money = os.format.currency;
  const u = upkeep(os, 'All', now);
  const mine = u.items.filter((i) => THINGS.has(i.entity.object));
  const late = mine.filter((i) => (i.status.daysLeft ?? 1) < 0);
  const week = mine.filter((i) => (i.status.daysLeft ?? 99) >= 0 && (i.status.daysLeft ?? 99) <= 7);
  const assets = os.registry.objects.has('asset') ? os.records.query<{ purchasePrice?: number; currentValue?: number }>('asset', { filter: { and: [{ field: 'status', op: 'neq', value: 'sold' }] } }, { limit: 5000 }) : [];
  const worth = assets.reduce((n, a) => n + (a.data.currentValue ?? a.data.purchasePrice ?? 0), 0);
  // Upkeep spend per month: costs logged when a job was done.
  const months = lastMonths(6, now);
  const costs = months.map((m) => os.db.get<{ t: number | null }>(`SELECT SUM(json_extract(meta,'$.cost')) AS t FROM events WHERE kind='cycle.done' AND occurred_at BETWEEN ? AND ?`, [new Date(`${m.start}T00:00:00`).getTime(), new Date(`${m.end}T23:59:59`).getTime()])?.t ?? 0);
  const service = dueForService(os, now);
  const warranty = underWarranty(os, now, 90);
  const wash = clothesByState(os).wash.length;
  const blocks: OverviewBlock[] = [
    { kind: 'stats', items: [{ label: 'Late', value: String(late.length), tone: late.length ? 'alert' : undefined }, { label: 'Due this week', value: String(week.length) }, { label: 'Due this month', value: money(u.monthCost), sub: 'estimated' }, ...(worth ? [{ label: 'Things worth', value: money(worth) }] : [])] },
    { kind: 'list', title: 'Upkeep coming up', items: [...late, ...week].slice(0, 8).map((i) => ({ title: i.cycle.name.trim().toLowerCase() === i.entity.title.trim().toLowerCase() ? i.entity.title : `${i.cycle.name} · ${i.entity.title}`, sub: i.status.daysLeft != null ? inDays(i.status.daysLeft) : null, entityId: i.entity.id, type: i.entity.object, tone: (i.status.daysLeft ?? 0) < 0 ? 'alert' : undefined })), empty: 'Nothing due this week.' },
  ];
  if (costs.some((c) => c > 0)) blocks.push({ kind: 'bars', title: 'Upkeep spend by month', labels: months.map((m) => m.label), values: costs, format: 'money' });
  if (service.length) blocks.push({ kind: 'list', title: 'Due for service', items: service.slice(0, 6).map((r) => ({ title: r.title, sub: [r.daysLeft != null ? inDays(r.daysLeft) : null, r.kmLeft != null ? `${Math.round(r.kmLeft).toLocaleString('en-IN')} km left` : null].filter(Boolean).join(' · ') || null, entityId: r.id, type: 'asset', tone: r.state === 'overdue' ? ('alert' as const) : undefined })) });
  if (warranty.length) blocks.push({ kind: 'list', title: 'Warranty ending (90 d)', items: warranty.slice(0, 6).map((r) => ({ title: r.title, sub: inDays(r.daysLeft), entityId: r.id, type: 'asset' })) });
  if (wash) blocks.push({ kind: 'stats', items: [{ label: 'In the wash', value: String(wash) }] });
  return { card: { headline: late.length ? `${late.length} late` : `${week.length} due this week`, sub: mine[0] ? `next: ${mine[0].cycle.name.toLowerCase() === mine[0].entity.title.toLowerCase() ? mine[0].entity.title : `${mine[0].cycle.name} · ${mine[0].entity.title}`}` : null, series: costs.slice(-6), seriesFormat: 'money', alert: late.length > 0 }, blocks };
}
