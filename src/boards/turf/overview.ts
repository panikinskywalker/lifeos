import type { LifeOSContext } from '@core/registry/context';
import type { ModuleOverview } from '@core/dashboard/overview';
import { currentGame, whoOwes } from '@modules/games';

/**
 * Turf's card on Browse's module stack (docs/MODEL.md, Browse module cards):
 * the next match's day in dots with the venue under it; with none booked, it
 * takes turns between what is owed and BOOK (15 Nov, Rutvij: never a name).
 */
export function turfOverview(os: LifeOSContext, now = Date.now()): ModuleOverview {
  const next = currentGame(os, now);
  if (next?.upcoming) {
    const d = new Date(`${next.game.data.date}T12:00:00`);
    const day = `${d.toLocaleDateString('en-IN', { weekday: 'short' })} ${d.getDate()}`;
    return { card: { headline: `Next match ${day} · ${next.game.data.venueName}`, dots: day.toUpperCase() }, blocks: [] };
  }
  const owing = whoOwes(os);
  const total = Math.round(owing.reduce((s, o) => s + o.amount, 0));
  const book = { headline: 'No match booked · book the next one', dots: 'BOOK' };
  const cycle = total > 0 ? [{ headline: `${owing.length} owe ${os.format.currency(total)}`, dots: String(total) }, book] : [book];
  return { card: { ...cycle[0]!, cycle }, blocks: [] };
}
