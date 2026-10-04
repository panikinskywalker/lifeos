import type { LifeOSContext } from '@core/registry/context';
import type { FileContext, FileOutcome, MessageParser, ParserRead, RawMessage } from '@core/filing/contract';
import { mailKind, type Mail } from '@core/filing/mail';
import { fileFlight, fileStay, parseFlight, parseStay, type ParsedFlight, type ParsedStay } from './bookings';

/**
 * The bookings parser (travel filing): a ticket mail → a flight event in its
 * trip, a booking → a stay. Runs before the money parser so the payment in
 * the same mail links to the flight through ctx.related ('paid_for', 'part_of').
 */

type BookingRead = ParserRead & ({ kind: 'flight'; flight: ParsedFlight } | { kind: 'stay'; stay: ParsedStay });

const mailOf = (m: RawMessage): Mail => ({ from: m.from, fromName: String(m.meta?.fromName ?? ''), subject: m.title ?? '', text: m.body, date: m.receivedAt, uid: Number(m.meta?.uid ?? 0) });

function read(_os: LifeOSContext, m: RawMessage): BookingRead | null {
  if (m.source !== 'email') return null;
  const k = mailKind({ from: m.from, fromName: String(m.meta?.fromName ?? ''), subject: m.title ?? '' });
  if (k !== 'flight' && k !== 'stay') return null;
  const mail = mailOf(m);
  if (k === 'flight') {
    const f = parseFlight(mail);
    return f ? { kind: 'flight', flight: f } : null;
  }
  const s = parseStay(mail);
  return s ? { kind: 'stay', stay: s } : null;
}

function file(os: LifeOSContext, m: RawMessage, r: ParserRead, ctx: FileContext): FileOutcome {
  const mail = mailOf(m);
  const account = m.account ?? 'Gmail';
  const res = r.kind === 'flight' ? fileFlight(os, ctx.id, (r as BookingRead & { kind: 'flight' }).flight, mail, account) : fileStay(os, ctx.id, (r as BookingRead & { kind: 'stay' }).stay, mail, account);
  if (!res.eventId) return { status: 'dismissed', note: 'events not installed' };
  const related = [{ id: res.eventId, word: 'paid_for' }, ...(res.tripId ? [{ id: res.tripId, word: 'part_of' }] : [])];
  return { status: 'confirmed', entityId: res.eventId, note: r.kind, related };
}

export const bookingsParser: MessageParser = { id: 'travel.bookings', module: 'travel', priority: 20, read, file };
export const travelParsers: MessageParser[] = [bookingsParser];
