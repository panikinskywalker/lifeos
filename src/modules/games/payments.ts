import type { LifeOSContext } from '@core/registry/context';
import type { OutboxItem } from '@core/repo/outboxRepo';
import type { AppearanceData } from './types';
import { dropPending, owedOn, recountPaid, refreshTurfDebts } from './sync';

/**
 * Payments made in LifeOS (docs/MODEL.md layer 2, *Money*; R9c.2). A payment
 * is an entry, never a tick: each one is queued for Turf web with its own id
 * (`os.outbox`) and shows at once on the Appearance as *sending*, counted in
 * paid so far, who owes and the Debts. When Turf web takes it, the next sync
 * brings the real entry (carrying the same id), which replaces the sending
 * one; when Turf web refuses it, the sending entry goes and the refusal shows
 * on the board with Turf web's words.
 */

export const TURF_SOURCE = 'turf';

export type PaymentKind = 'payment' | 'refund' | 'correction';

/** One request, exactly as Turf web's own screens send it to /api/data. */
export interface TurfAction {
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body: Record<string, unknown>;
}

/** Turf web's ids for a share, from its source key `turf:game_players:<game>:<player>`. */
export function turfShareIds(a: AppearanceData): { gameId: string; playerId: string } | null {
  const m = /^turf:game_players:([^:]+):([^:]+)$/.exec(a.sourceKey ?? '');
  return m ? { gameId: m[1]!, playerId: m[2]! } : null;
}

const shortDay = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });

/**
 * Record a payment entry on a share. `amount` is in rupees and positive, as
 * you'd say it ("₹147", "refunded ₹50"); a correction may go either way.
 * Turf web's own rules apply when it arrives (a share must exist, no zero).
 */
export function recordPayment(os: LifeOSContext, appearanceId: string, input: { amount: number; kind?: PaymentKind; note?: string; via?: 'sms' }): OutboxItem<TurfAction> {
  const a = os.records.get<AppearanceData>(appearanceId);
  if (!a || a.object !== 'appearance') throw new Error('That share isn’t here any more');
  const ids = turfShareIds(a.data);
  if (!ids) throw new Error('That share didn’t come from Turf web');
  const kind = input.kind ?? 'payment';
  const raw = Math.round(Number(input.amount) * 100) / 100;
  if (!Number.isFinite(raw) || raw === 0) throw new Error('Enter an amount');
  if (Math.abs(raw) > 100_000) throw new Error('That amount is too large');
  if (kind !== 'correction' && raw < 0) throw new Error('Enter the amount without a minus');
  const amount = kind === 'refund' ? -raw : raw;
  const note = input.note?.trim().slice(0, 200) || undefined;
  const name = os.records.get(a.data.personId)?.title ?? 'Someone';
  const money = os.format.currency(Math.abs(amount));
  const label = `${name} ${kind === 'refund' ? `refunded ${money}` : kind === 'correction' ? `corrected by ${amount < 0 ? '−' : '+'}${money}` : `paid ${money}`} · ${shortDay(a.data.gameDate)}`;

  let item!: OutboxItem<TurfAction>;
  os.db.transaction(() => {
    item = os.outbox.add<TurfAction>({ source: TURF_SOURCE, label, recordId: a.id, payload: { method: 'PATCH', body: { action: 'payment', ...ids, kind, amount, ...(note ? { note } : {}), ...(input.via ? { via: input.via } : {}) } } });
    os.records.timeline.add({
      entityId: a.id,
      kind: 'payment',
      title: `${kind === 'refund' ? 'Refunded' : kind === 'correction' ? 'Corrected by' : 'Paid'} ${money} (sending)`,
      body: note ?? null,
      actor: 'user',
      meta: { pending: true, actionId: item.id, amount, entry: kind, via: input.via ?? 'lifeos' },
      occurredAt: Date.now(),
    });
    recountPaid(os, a.id);
    refreshTurfDebts(os);
  });
  return item;
}

/** What's still owed on the share, as one payment. Null when nothing is owed. */
export function markPaid(os: LifeOSContext, appearanceId: string): OutboxItem<TurfAction> | null {
  const a = os.records.get<AppearanceData>(appearanceId);
  if (!a) return null;
  const owed = owedOn(a.data);
  return owed > 0 ? recordPayment(os, appearanceId, { amount: owed, note: 'Marked paid' }) : null;
}

/** Turf web said no: what the change showed here goes. */
export function undoRefused(os: LifeOSContext, item: OutboxItem): void {
  if (!item.recordId) return;
  os.db.transaction(() => {
    if (dropPending(os, item.recordId!, item.id)) {
      recountPaid(os, item.recordId!);
      refreshTurfDebts(os);
    }
  });
}

/** For the board: what is sending and what Turf web refused, newest refusals first. */
export function turfChanges(os: LifeOSContext) {
  return { sending: os.outbox.waiting<TurfAction>(TURF_SOURCE), refused: os.outbox.refused<TurfAction>(TURF_SOURCE) };
}

/** Is anything for this share still on its way? */
export const isSending = (os: LifeOSContext, appearanceId: string) => os.outbox.forRecord(appearanceId).some((i) => i.state === 'waiting');
