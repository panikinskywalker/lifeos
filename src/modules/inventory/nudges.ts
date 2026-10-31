import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import type { StockData } from './types';
import { daysSince, runningLow, shopLabel, spanWords, stockState, type StateRead } from './stock';

/**
 * What Home can bring you (docs/MODEL.md layer 8, *Four kinds of nudge*):
 * the *running out* and *going off* candidates, found in code from Stock
 * alone, with no model call. The brain (not built) gets this short list,
 * judges it and words it; until then the board shows them as they are.
 */

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const allStock = (os: LifeOSContext) => os.records.query<StockData>('stock', {}, { limit: 5000 });

/** "today" · "yesterday" · "Mon" (this week) · "4 Oct". */
export function dayWords(day: string | undefined, now = Date.now()): string {
  const n = daysSince(day, now);
  if (n == null) return '';
  if (n === 0) return 'today';
  if (n === 1) return 'yesterday';
  const d = new Date(`${day!.slice(0, 10)}T12:00:00`);
  if (n > 1 && n < 7) return WEEKDAY[d.getDay()]!;
  return `${d.getDate()} ${d.toLocaleString('en-GB', { month: 'short' })}`;
}

/** "use today" · "use by tomorrow" · "use by Thu" · "2 d past" (from days of life left). */
export function useByWords(daysLeft: number | null, now = Date.now()): string {
  if (daysLeft == null) return '';
  if (daysLeft < 0) return `${-daysLeft} d past`;
  if (daysLeft === 0) return 'use today';
  if (daysLeft === 1) return 'use by tomorrow';
  return `use by ${WEEKDAY[new Date(now + daysLeft * 86_400_000).getDay()]}`;
}

export interface StockNudge {
  kind: 'running out' | 'going off';
  stockId: string;
  title: string;
  /** The nudge, as it would read in To check ("Paneer: bought Mon, use by tomorrow"). */
  line: string;
  /** The short "why" under a pill ("every 3 wk · 18 d", "bought Mon · keeps 4 d"). */
  why: string;
  /** Urgent ones always notify (layer 8): going off today or tomorrow, or past the rate with none left. */
  urgent: boolean;
  /** Lower is sooner; sorts the candidates. */
  rank: number;
  /** The state rests on LifeOS's estimate. */
  estimated: boolean;
}

/** *Going off*: use soon or probably gone, soonest first. */
export function goingOffCandidates(os: LifeOSContext, now = Date.now()): StockNudge[] {
  return allStock(os)
    .flatMap((s) => {
      const st = stockState(s.data, now);
      if (st.state !== 'use soon' && st.state !== 'probably gone') return [];
      return [goingOff(s, st, now)];
    })
    .sort((a, b) => a.rank - b.rank || a.title.localeCompare(b.title));
}

function goingOff(s: ObjectRecord<StockData>, st: StateRead, now: number): StockNudge {
  const bought = dayWords(s.data.boughtOn, now);
  const why = `bought ${bought} · keeps ${spanWords(s.data.lifeDays ?? 0)}`;
  const line = st.state === 'probably gone' ? `${s.title}: bought ${bought}, probably gone — still there?` : `${s.title}: bought ${bought}, ${useByWords(st.daysLeft, now)}`;
  return { kind: 'going off', stockId: s.id, title: s.title, line, why, urgent: st.state === 'use soon' && (st.daysLeft ?? 9) <= 1, rank: st.daysLeft ?? 0, estimated: st.estimated };
}

/** *Running out*: the rate nearly up with one or less left, or half of the last one; soonest first. */
export function runningOutCandidates(os: LifeOSContext, now = Date.now()): StockNudge[] {
  return allStock(os)
    .flatMap((s) => {
      const low = runningLow(s.data, now);
      if (!low.low) return [];
      const age = daysSince(s.data.boughtOn, now);
      const line = s.data.rateDays && low.why !== 'half left' ? `${s.title}: you rebuy every ${spanWords(s.data.rateDays)}, it's been ${age} days` : `${s.title}: half left`;
      return [{ kind: 'running out' as const, stockId: s.id, title: s.title, line, why: low.why!, urgent: (low.dueIn ?? 9) <= 0 && s.data.quantity <= 0.5, rank: low.dueIn ?? 3, estimated: true }];
    })
    .sort((a, b) => a.rank - b.rank || a.title.localeCompare(b.title));
}

/**
 * Home's nudges for the day: at most two (layer 8, *How many*), urgent first,
 * then going off before running out (food is lost; butter can wait).
 */
export function homeNudges(os: LifeOSContext, now = Date.now(), perDay = 2): StockNudge[] {
  const all = [...goingOffCandidates(os, now), ...runningOutCandidates(os, now)];
  const seen = new Set<string>();
  return all
    .sort((a, b) => Number(b.urgent) - Number(a.urgent) || (a.kind === b.kind ? a.rank - b.rank : a.kind === 'going off' ? -1 : 1))
    .filter((n) => (seen.has(n.stockId) ? false : (seen.add(n.stockId), true)))
    .slice(0, perDay);
}

/* ------------------------------------------------------------------ */
/* The shopping list                                                    */
/* ------------------------------------------------------------------ */

export interface ListEntry {
  stock: ObjectRecord<StockData>;
  /** LifeOS's suggestion (running low, or used up and rebought regularly) vs one you put there. */
  suggested: boolean;
  why: string | null;
  /** Where you usually buy it: the last order's shop, else offline. */
  shop: string;
}

/** The shopping list: what you put on it, then LifeOS's suggestions; each with where you usually buy it. */
export function shoppingList(os: LifeOSContext, now = Date.now()): ListEntry[] {
  const out: ListEntry[] = [];
  for (const s of allStock(os)) {
    const shop = s.data.source === 'order' && s.data.shop ? shopLabel(s.data.shop) : 'Offline';
    if (s.data.onList) {
      out.push({ stock: s, suggested: false, why: s.data.quantity > 0 ? null : s.data.usedUpOn ? `used up ${dayWords(s.data.usedUpOn, now)}` : null, shop });
      continue;
    }
    const low = runningLow(s.data, now);
    if (low.low) out.push({ stock: s, suggested: true, why: low.why, shop });
    else if (!(s.data.quantity > 0) && s.data.rateDays) out.push({ stock: s, suggested: true, why: `used up ${dayWords(s.data.usedUpOn, now)} · every ${spanWords(s.data.rateDays)}`, shop });
  }
  return out.sort((a, b) => Number(a.suggested) - Number(b.suggested) || a.shop.localeCompare(b.shop) || a.stock.title.localeCompare(b.stock.title));
}

/** The list as text to paste into Blinkit's search or a chat ("Amul butter 100 g\nMilk ×2"). */
export function listText(entries: ListEntry[]): string {
  return entries.map((e) => [e.stock.title, e.stock.data.size].filter(Boolean).join(' ')).join('\n');
}

/* ------------------------------------------------------------------ */
/* Just came in                                                         */
/* ------------------------------------------------------------------ */

export interface Arrival {
  /** "Blinkit", or "You" for things you added. */
  shop: string;
  at: number;
  /** The order's payment, when there is one. */
  orderId: string | null;
  amount: number | null;
  things: Array<{ id: string; title: string; quantity: number }>;
}

/**
 * The last thing that came in: the newest purchases of the last two weeks,
 * grouped by order (or by shop and day when there is no order).
 */
export function justCameIn(os: LifeOSContext, now = Date.now()): Arrival | null {
  const since = now - 14 * 86_400_000;
  const bought = os.records.timeline.recent(400, ['stock']).filter((e) => e.kind === 'bought' && e.occurredAt >= since);
  if (!bought.length) return null;
  const keyOf = (e: (typeof bought)[number]) => (e.meta.orderId as string | undefined) ?? `${e.meta.shop ?? e.meta.source ?? 'you'}:${new Date(e.occurredAt).toDateString()}`;
  const newest = [...bought].sort((a, b) => b.occurredAt - a.occurredAt)[0]!;
  const key = keyOf(newest);
  const group = bought.filter((e) => keyOf(e) === key);
  const orderId = (newest.meta.orderId as string | undefined) ?? null;
  const tx = orderId ? os.records.get<{ amount?: number }>(orderId) : null;
  const prices = group.map((e) => e.meta.price as number | undefined).filter((p): p is number => typeof p === 'number');
  const shop = newest.meta.shop ? shopLabel(String(newest.meta.shop)) : newest.meta.source === 'receipt' ? 'Receipt' : 'You';
  return {
    shop,
    at: newest.occurredAt,
    orderId,
    amount: tx?.data.amount ?? (prices.length ? prices.reduce((a, b) => a + b, 0) : null),
    things: group.map((e) => ({ id: e.entityId, title: e.entityTitle, quantity: Number(e.meta.quantity ?? 1) })),
  };
}
