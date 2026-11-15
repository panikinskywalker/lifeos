import type { LifeOSContext } from '@core/registry/context';
import type { ModuleOverview } from '@core/dashboard/overview';
import { currentGame, whoOwes } from '@modules/games';

/**
 * Turf's card on Browse's module stack (docs/MODEL.md, Browse module cards):
 * the next match's day in dots with the venue under it; with none booked, the
 * name of whoever owes most, with what everyone owes.
 */
export function turfOverview(os: LifeOSContext, now = Date.now()): ModuleOverview {
  const next = currentGame(os, now);
  if (next?.upcoming) {
    const d = new Date(`${next.game.data.date}T12:00:00`);
    const day = `${d.toLocaleDateString('en-IN', { weekday: 'short' })} ${d.getDate()}`;
    return { card: { headline: `Next match ${day} · ${next.game.data.venueName}`, dots: day.toUpperCase() }, blocks: [] };
  }
  const owing = whoOwes(os);
  const top = owing[0];
  if (top) {
    const first = top.name.trim().split(/\s+/)[0] ?? top.name;
    const total = owing.reduce((s, o) => s + o.amount, 0);
    const others = owing.length > 1 ? ` · ${owing.length} owe ${os.format.currency(Math.round(total))}` : '';
    return { card: { headline: `${first} owes ${os.format.currency(Math.round(top.amount))}${others}`, dots: first.toUpperCase().slice(0, 8) }, blocks: [] };
  }
  return { card: { headline: 'Everyone has paid' }, blocks: [] };
}
