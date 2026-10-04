import type { LifeOSContext } from '@core/registry/context';
import { daysUntil, inDays, lastMonths, type ModuleOverview, type OverviewBlock } from '@core/dashboard/overview';
import type { DeliveryData } from '@modules/deliveries/types';

/** Parcels at a glance: what's on the way (with its OTP), delivered this month, by month and by shop. */
export function deliveriesOverview(os: LifeOSContext, now = Date.now()): ModuleOverview {
  const all = os.entities.query<DeliveryData>('delivery', {}, { limit: 2000 });
  const onWay = all.filter((d) => d.data.status === 'ordered' || d.data.status === 'shipped' || d.data.status === 'out_for_delivery');
  const months = lastMonths(6, now);
  const byMonth = months.map((m) => all.filter((d) => d.data.status === 'delivered' && (d.data.deliveredOn ?? '') >= m.start && (d.data.deliveredOn ?? '') <= m.end).length);
  const byShop = new Map<string, number>();
  for (const d of all) if (d.data.shop) byShop.set(d.data.shop, (byShop.get(d.data.shop) ?? 0) + 1);
  const out = onWay.filter((d) => d.data.status === 'out_for_delivery');
  const blocks: OverviewBlock[] = [
    { kind: 'stats', items: [{ label: 'On the way', value: String(onWay.length) }, { label: 'Out for delivery', value: String(out.length), tone: out.length ? 'ok' : undefined }, { label: 'Delivered this month', value: String(byMonth.at(-1) ?? 0) }] },
    {
      kind: 'list',
      title: 'On the way',
      items: onWay.map((d) => ({ title: d.title, sub: [d.data.status === 'out_for_delivery' ? 'out for delivery' : d.data.expectedDate ? `arrives ${inDays(daysUntil(d.data.expectedDate, now))}` : d.data.status, d.data.shop].filter(Boolean).join(' · '), value: d.data.otp ? `OTP ${d.data.otp}` : null, entityId: d.id, type: 'delivery' })),
      empty: 'Nothing on the way.',
    },
  ];
  if (byMonth.some((x) => x > 0)) blocks.push({ kind: 'bars', title: 'Delivered by month', labels: months.map((m) => m.label), values: byMonth, format: 'number' });
  if (byShop.size > 1) blocks.push({ kind: 'breakdown', title: 'From', parts: [...byShop.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([label, value]) => ({ label, value })), format: 'number' });
  return { card: { headline: onWay.length ? `${onWay.length} on the way` : 'Nothing on the way', sub: out[0] ? `${out[0].title} out for delivery${out[0].data.otp ? ` · OTP ${out[0].data.otp}` : ''}` : null, alert: false }, blocks };
}
