import type { LifeOSContext } from '@core/registry/context';
import type { AppearanceData, GameData } from './types';
import { youPersonId } from './money';

/**
 * The turf you paid for (docs/MODEL.md layer 2, Your share): when you fronted
 * a game, the booking leaves your account in full but only your share is your
 * spending. An expense from up to 3 days before the game (booked ahead, on
 * Playo) to the day after (paid at the venue), for the game's total cost or its
 * advance, with only one such game, is that game's booking: linked to the game
 * (word `pays`) and its share set to your share of the game (0 when you did not
 * play). Shown in To check as filed, with Undo. Games never import finance:
 * the Transaction is read and written through core by its Field keys.
 */

export const TURF_BOOKING = 'turf-booking';
const DAY = 86_400_000;

interface Tx {
  amount: number;
  kind: string;
  date: string;
  share?: number;
}

const noon = (iso: string) => Date.parse(`${iso.slice(0, 10)}T12:00:00`);
const shortDay = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });

/** Look at one expense: link it to the game it booked, or leave it. Returns the game's id. */
export function matchVenuePayment(os: LifeOSContext, txId: string): string | null {
  const tx = os.records.get<Tx>(txId);
  if (!tx || tx.object !== 'transaction' || tx.data.kind !== 'expense' || typeof tx.data.share === 'number') return null;
  if (os.links.forEntity(txId, 'pays').length) return null;
  const me = youPersonId(os);
  if (!me) return null;
  const at = noon(tx.data.date);
  const games = os.records
    .query<GameData>('game', { filter: { and: [{ field: 'data.frontedById', op: 'eq', value: me }] } }, { limit: 5000 })
    .filter((g) => !g.archived && noon(g.data.date) - at <= 3 * DAY && at - noon(g.data.date) <= DAY)
    .filter((g) => [g.data.totalCost, g.data.advance].some((c) => typeof c === 'number' && c > 0 && Math.abs(c - tx.data.amount) < 0.5))
    .filter((g) => !os.links.forEntity(g.id, 'pays').some((l) => l.other.object === 'transaction'));
  if (games.length !== 1) return null;
  const game = games[0]!;
  const mine = os.records.query<AppearanceData>('appearance', { filter: { and: [{ field: 'data.gameId', op: 'eq', value: game.id }, { field: 'data.personId', op: 'eq', value: me }] } }, { limit: 5 })[0];
  const share = Math.round((mine?.data.share ?? 0) * 100) / 100;
  os.db.transaction(() => {
    os.links.link(txId, game.id, 'pays', {}, 'system');
    os.records.update(txId, { data: { share } }, 'system');
    os.filings.add({ source: 'turf', sourceRef: txId, kind: TURF_BOOKING, action: 'logged', entityId: txId, label: `Turf booked · ${os.format.currency(tx.data.amount)} for ${shortDay(game.data.date)} · your share ${os.format.currency(share)}`, before: { txId, gameId: game.id } });
  });
  return game.id;
}

/** Every recent expense not yet looked at (after a sync brings games in, and once on start). */
export function linkVenuePayments(os: LifeOSContext, days = 120): number {
  if (!os.registry.objects.has('transaction') || !youPersonId(os)) return 0;
  const since = new Date(Date.now() - days * DAY).toISOString().slice(0, 10);
  let n = 0;
  for (const t of os.records.query<Tx>('transaction', { filter: { and: [{ field: 'data.kind', op: 'eq', value: 'expense' }, { field: 'data.date', op: 'gte', value: since }] } }, { limit: 20000 })) {
    if (matchVenuePayment(os, t.id)) n++;
  }
  return n;
}

/** Undo: the payment is all yours again and no longer the game's booking. */
export function undoVenuePayment(os: LifeOSContext, filingId: string): void {
  const f = os.filings.get(filingId);
  const b = f?.before as { txId?: string; gameId?: string } | null;
  if (!f || !b?.txId) return;
  os.db.transaction(() => {
    if (b.gameId) os.links.unlink(b.txId!, b.gameId, 'pays', 'user');
    if (os.records.get(b.txId!)) os.records.update(b.txId!, { data: { share: undefined } }, 'user');
    os.filings.markUndone(filingId);
  });
}
