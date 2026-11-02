import type { LifeOSContext } from '@core/registry/context';
import type { Row } from '@core/db/adapter';
import { setQueueItem, toItem, type RawMessage } from '@core/filing/queue';
import type { DeliveryData } from '../types';
import { isQuick, isoDay as iso, STAGE, STATUS_WORD } from '../lib';
import { parseDeliverySms, type ParsedDelivery } from './delivery';
import { paymentFor, shopOrg } from './links';

/** Parcels from shipping texts, shop apps' notifications and mails (deliveries filing, R1 / R7b): one Delivery per order, status only moving forward. */

const DAY = 86_400_000;

/**
 * One delivery per order: found by tracking / order number, or the same
 * shop's open order from the last month (the last 6 hours for quick
 * commerce, whose orders have no number in their notifications). Status
 * only moves forward. A new one is linked to its shop's Organisation and,
 * when finance has it, the payment.
 */
export function fileDelivery(os: LifeOSContext, ingestId: string, d: ParsedDelivery, m: RawMessage): string {
  type D = DeliveryData;
  const window = isQuick({ shop: d.shop ?? undefined }) ? 6 * 3_600_000 : 30 * DAY;
  const recent = os.records.query<D>('delivery', { sort: [{ field: 'createdAt', dir: 'desc' }] }, { limit: 300 });
  const norm2 = (x?: string | null) => (x ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const hit =
    recent.find((e) => (d.tracking && e.data.tracking === d.tracking) || (d.orderId && e.data.orderId === d.orderId)) ??
    recent.find(
      (e) =>
        STAGE[e.data.status]! < 3 &&
        m.receivedAt - e.createdAt < window &&
        ((d.shop && e.data.shop === d.shop) || (d.carrier && e.data.carrier === d.carrier)) &&
        (!d.item || !e.data.item || norm2(e.data.item).includes(norm2(d.item).split(' ')[0]!) || norm2(d.item).includes(norm2(e.data.item).split(' ')[0]!)),
    );
  const day = iso(m.receivedAt);
  const via = m.source === 'email' ? ` · from ${m.account ?? 'email'}` : '';
  if (!hit) {
    const e = os.records.create({ object: 'delivery', data: { shop: d.shop ?? undefined, shopId: shopOrg(os, d.shop), paymentId: paymentFor(os, d.shop, m.receivedAt), item: d.item ?? undefined, carrier: d.carrier ?? undefined, tracking: d.tracking ?? undefined, orderId: d.orderId ?? undefined, trackingUrl: d.link ?? undefined, otp: d.otp ?? undefined, otpAt: d.otp ? m.receivedAt : undefined, status: d.status, expectedDate: d.status === 'delivered' ? undefined : (d.expected ?? undefined), deliveredOn: d.status === 'delivered' ? day : undefined } }, 'assistant');
    os.records.timeline.add({ entityId: e.id, kind: m.source, title: `${STATUS_WORD[d.status]!}${via}`, body: m.body.slice(0, 300), actor: 'system', occurredAt: m.receivedAt, meta: { ingestId } });
    os.filings.add({ source: m.source, sourceRef: ingestId, kind: 'delivery', entityId: e.id, label: `Delivery: ${e.title} · ${STATUS_WORD[d.status]}${d.expected && d.status !== 'delivered' ? ` · by ${d.expected.slice(8)}/${d.expected.slice(5, 7)}` : ''}${via}` });
    return e.id;
  }
  const patch: Record<string, unknown> = {};
  const before: Record<string, unknown> = {};
  const set = (k: keyof D, v: unknown) => {
    if (v == null || v === '' || hit.data[k] === v) return;
    patch[k] = v;
    before[k] = hit.data[k] ?? null;
  };
  if (STAGE[d.status]! >= STAGE[hit.data.status]!) set('status', d.status);
  if (d.status === 'delivered') set('deliveredOn', day);
  else if (d.expected) set('expectedDate', d.expected);
  if (!hit.data.item) set('item', d.item);
  if (!hit.data.carrier) set('carrier', d.carrier);
  if (!hit.data.tracking) set('tracking', d.tracking);
  if (!hit.data.orderId) set('orderId', d.orderId);
  if (!hit.data.shop) set('shop', d.shop);
  if (!hit.data.trackingUrl) set('trackingUrl', d.link);
  if (!hit.data.shopId && (hit.data.shop || d.shop)) set('shopId', shopOrg(os, hit.data.shop ?? d.shop));
  if (!hit.data.paymentId) set('paymentId', paymentFor(os, hit.data.shop ?? d.shop, hit.createdAt));
  // A new code replaces the old one; once it's delivered the code is no use.
  if (d.otp) (set('otp', d.otp), set('otpAt', m.receivedAt));
  if (d.status === 'delivered' && hit.data.otp) (patch.otp = undefined, before.otp = hit.data.otp);
  if (Object.keys(patch).length) {
    os.records.update(hit.id, { data: patch }, 'assistant');
    os.filings.add({ source: m.source, sourceRef: ingestId, kind: 'delivery', action: 'updated', entityId: hit.id, label: `${os.records.get(hit.id)?.title ?? 'Delivery'} · ${STATUS_WORD[(patch.status as D['status'] | undefined) ?? hit.data.status]}${via}`, before });
  }
  os.records.timeline.add({ entityId: hit.id, kind: m.source, title: `${STATUS_WORD[d.status]!}${via}`, body: m.body.slice(0, 300), actor: 'system', occurredAt: m.receivedAt, meta: { ingestId } });
  return hit.id;
}

/**
 * Once: texts read before delivery tracking existed (set aside as "not a
 * bank") are read again for shipping updates, oldest first so each order
 * moves forward. An order with no word for 10 days is taken as delivered,
 * flagged in To check so you can say otherwise.
 */
export function backfillDeliveries(os: LifeOSContext, now = Date.now(), days = 45): number {
  if (!os.registry.objects.has('delivery')) return 0;
  const rows = os.db.all<Row>(`SELECT * FROM ingest_queue WHERE source='sms' AND status='dismissed' AND received_at >= ? ORDER BY received_at`, [now - days * DAY]);
  // Each order and when its last text came.
  const touched = new Map<string, number>();
  for (const r of rows) {
    const item = toItem(r);
    const d = parseDeliverySms(item.text, item.from, item.receivedAt);
    if (!d) continue;
    const id = fileDelivery(os, item.id, d, { source: 'sms', from: item.from, body: item.text, receivedAt: item.receivedAt });
    setQueueItem(os, item.id, { status: 'confirmed', entityId: id, note: 'delivery' });
    touched.set(id, item.receivedAt);
  }
  for (const [id, last] of touched) {
    const e = os.records.get<DeliveryData>(id);
    if (!e || STAGE[e.data.status] >= 3) continue;
    if (now - last < 10 * DAY) continue;
    os.records.update(id, { data: { status: 'delivered', deliveredOn: iso(last) } }, 'assistant');
    os.filings.add({ source: 'sms', kind: 'delivery', action: 'updated', entityId: id, label: `${e.title} · Delivered`, before: { status: e.data.status }, flag: `Assumed delivered: no update since ${iso(last).slice(8)}/${iso(last).slice(5, 7)}` });
  }
  return touched.size;
}
