import type { LifeOSContext } from '@core/registry/context';
import type { FileContext, FileOutcome, MessageParser, ParserRead, RawMessage } from '@core/filing/contract';
import type { DeliveryData } from '../types';
import { STAGE } from '../lib';
import { SHOP_APPS } from './quick';

/**
 * A delivery's links (R7b): its shop → Organisation (word `vendor`) and its
 * order → the Transaction that paid for it (word `bought_in`). Deliveries
 * never imports finance or places: it finds their records by name through
 * core, and only reads a Transaction's title (the merchant), when it
 * happened and whether it was spent.
 */

const DAY = 86_400_000;
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** How a shop appears as a payee in bank and UPI texts. */
const PAYEE: Record<string, RegExp> = {
  Amazon: /\bamazon|\bamzn/i,
  Flipkart: /\bflipkart/i,
  Myntra: /\bmyntra/i,
  Instamart: /\bswiggy|\binstamart/i,
  Zepto: /\bzepto|\bkiranakart/i,
  Blinkit: /\bblinkit|\bblink ?commerce|\bgrofers/i,
};
const payeeRe = (shop: string) => PAYEE[shop] ?? new RegExp(`\\b${shop.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');

/** The shop's Organisation: the one named so (case and punctuation aside), else one made once (kind shop), which finance's payee matching then finds too. */
export function shopOrg(os: LifeOSContext, shop: string | null | undefined): string | undefined {
  if (!shop || !os.registry.objects.has('org')) return undefined;
  const n = norm(shop);
  const orgs = os.records.query('org', {}, { limit: 5000 });
  const hit = orgs.find((o) => norm(o.title) === n);
  return (hit ?? os.records.create({ object: 'org', title: shop, data: { kind: 'shop' } }, 'assistant')).id;
}

/** Is this Transaction already some delivery's order? */
const taken = (os: LifeOSContext, txId: string) => os.links.forEntity(txId, 'bought_in').some((r) => r.direction === 'in' && r.other.object === 'delivery');

/** The order's payment: the newest spend to the shop from 2 days before `at` up to `at`, not already another delivery's. */
export function paymentFor(os: LifeOSContext, shop: string | null | undefined, at: number): string | undefined {
  if (!shop || !os.registry.objects.has('transaction')) return undefined;
  const re = payeeRe(shop);
  const txs = os.records.query<{ kind?: string }>('transaction', { sort: [{ field: 'occurredAt', dir: 'desc' }] }, { limit: 300 });
  return txs.find((x) => {
    const when = x.occurredAt ?? x.createdAt;
    return when <= at + 10 * 60_000 && when >= at - 2 * DAY && (x.data.kind ?? 'expense') === 'expense' && re.test(x.title) && !taken(os, x.id);
  })?.id;
}

/* ------------------------------------------------------------------ */
/* A payment that comes after the order's first text (cash on delivery, */
/* a late bank SMS): links to the shop's open delivery.                 */
/* ------------------------------------------------------------------ */

type PaymentRead = ParserRead & { kind: 'order-payment'; shop: string };

function read(_os: LifeOSContext, m: RawMessage): PaymentRead | null {
  if (m.source === 'email' || (m.source === 'notification' && SHOP_APPS[m.from])) return null;
  const text = `${m.title ?? ''} ${m.body}`;
  if (!/\b(debited|spent|paid|sent|deducted|purchase|txn)\b/i.test(text)) return null;
  // Codes, failures and refunds are the money parser's to set aside, in its own words.
  if (/\b(otp|one time password|declined|failed|reversed|refund(?:ed)?)\b/i.test(text)) return null;
  const shop = Object.keys(PAYEE).find((s) => PAYEE[s]!.test(text));
  return shop ? { kind: 'order-payment', shop } : null;
}

function file(os: LifeOSContext, m: RawMessage, r: ParserRead, ctx: FileContext): FileOutcome {
  const { shop } = r as PaymentRead;
  // The money parser ran first: the Transaction it filed from this message.
  const txId = os.filings.forSource(ctx.id).find((f) => f.kind === 'transaction' && !f.undone)?.entityId;
  if (!txId || !os.registry.objects.has('delivery') || taken(os, txId)) return { status: 'dismissed', note: 'no payment to link' };
  // Delivered counts too: cash on delivery is paid as it arrives.
  const open = os.records
    .query<DeliveryData>('delivery', { sort: [{ field: 'createdAt', dir: 'desc' }] }, { limit: 100 })
    .find((d) => d.data.shop === shop && !d.data.paymentId && STAGE[d.data.status] < 4 && d.createdAt >= m.receivedAt - 2 * DAY);
  if (!open) return { status: 'dismissed', note: 'no open delivery from the shop' };
  os.records.update(open.id, { data: { paymentId: txId } }, 'assistant');
  return { status: 'confirmed', entityId: open.id, note: `the order of ${open.title}` };
}

/** After the money parser (priority 30) and Home's orders (40): links a shop's payment to its open delivery. */
export const orderPaymentParser: MessageParser = { id: 'deliveries.payments', module: 'deliveries', priority: 45, read, file };
