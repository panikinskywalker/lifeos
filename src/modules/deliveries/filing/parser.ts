import type { LifeOSContext } from '@core/registry/context';
import type { FileContext, FileOutcome, MessageParser, ParserRead, RawMessage } from '@core/filing/contract';
import { mailKind } from '@core/filing/mail';
import { parseDeliverySms, type ParsedDelivery } from './delivery';
import { fileDelivery } from './deliveries';

/**
 * The shipping parser (deliveries filing): courier and shop texts and mails →
 * one Delivery per order, updated as it moves. Runs before the money parser
 * and reads untrusted senders, so a shipping text is never read as spend.
 */

type ShippingRead = ParserRead & { kind: 'delivery'; delivery: ParsedDelivery };

function read(_os: LifeOSContext, m: RawMessage): ShippingRead | null {
  if (m.source === 'notification') return null;
  if (m.source === 'email') {
    const k = mailKind({ from: m.from, fromName: String(m.meta?.fromName ?? ''), subject: m.title ?? '' });
    if (k !== 'shipping') return null;
    const d = parseDeliverySms(`${m.title ?? ''}. ${m.body.slice(0, 1500)}`, `${String(m.meta?.fromName ?? '')} ${m.from}`, m.receivedAt);
    return d ? { kind: 'delivery', delivery: d } : { kind: 'skip', reason: 'shipping mail without an order' } as unknown as ShippingRead;
  }
  const d = parseDeliverySms(m.body, m.from, m.receivedAt);
  return d ? { kind: 'delivery', delivery: d } : null;
}

function file(os: LifeOSContext, m: RawMessage, r: ParserRead, ctx: FileContext): FileOutcome {
  if (!os.registry.objects.has('delivery')) return { status: 'dismissed', note: 'deliveries not installed' };
  const body = m.source === 'email' ? `${m.title ?? ''}\n${m.body}` : m.body;
  const entityId = fileDelivery(os, ctx.id, (r as ShippingRead).delivery, { ...m, body });
  return { status: 'confirmed', entityId, note: 'delivery' };
}

export const shippingParser: MessageParser = { id: 'deliveries.shipping', module: 'deliveries', priority: 10, untrusted: true, read, file };
export const deliveriesParsers: MessageParser[] = [shippingParser];
