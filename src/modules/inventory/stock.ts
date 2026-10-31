import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import { DEFAULT_SPACES, type SpaceData, type StockData } from './types';

/**
 * Stock's rules (docs/MODEL.md §2 Things, *Stock and Space*): one record per
 * product, a *bought* Event per purchase, state from bought on and life, the
 * rate learned from purchases and used up, and the actions a pill offers —
 * each returning what Undo needs.
 */

const DAY = 86_400_000;

/** Local yyyy-MM-dd. */
export function isoDay(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Whole days from a yyyy-MM-dd to the day of `now` (0 = today); null without a date. */
export function daysSince(day: string | undefined, now = Date.now()): number | null {
  if (!day || !/^\d{4}-\d{2}-\d{2}/.test(day)) return null;
  const [y, m, d] = day.slice(0, 10).split('-').map(Number) as [number, number, number];
  const today = new Date(now);
  return Math.round((new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() - new Date(y, m - 1, d).getTime()) / DAY);
}

/* ------------------------------------------------------------------ */
/* Products, shelf lives, spaces                                        */
/* ------------------------------------------------------------------ */

const SIZE = /\b\d+(?:\.\d+)?\s*(?:g|gm|gms|grams?|kg|kgs|ml|l|ltr|litres?|liters?|pcs?|pieces?|x)\b/gi;

/** "Amul Butter 100g" and "amul butter" are the same product: sizes, case and punctuation ignored, plurals folded. */
export function productKey(name: string): string {
  return name
    .toLowerCase()
    .replace(SIZE, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (w.length > 3 && w.endsWith('es') && /(?:ch|sh|ss|x|o)es$/.test(w) ? w.slice(0, -2) : w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w))
    .join(' ');
}

/**
 * Shelf lives in days once bought, by name: LifeOS's estimate until the brain
 * gives better (layer 8) or you say. First match wins, so the specific comes
 * before the general. null: it doesn't go off (salt, rice, detergent).
 */
const LIVES: Array<[RegExp, number | null]> = [
  [/\bfrozen\b|\bice ?cream\b|\bmccain\b|\bfries\b/, 90],
  [/\bleftover|\bcooked\b/, 2],
  [/\bchicken\b|\bfish\b|\bmutton\b|\bprawns?\b|\bkeema\b/, 2],
  [/\bspinach\b|\bpalak\b|\bcoriander\b|\bdhania\b|\bmethi\b|\bmint\b|\bpudina\b|\blettuce\b|\bmushrooms?\b/, 3],
  [/\bmilk ?powder\b|\bmilkmaid\b|\bcondensed\b/, null],
  [/\bmilk\b|\bdoodh\b/, 3],
  [/\bpaneer\b|\btofu\b/, 4],
  [/\bbread\b|\bpav\b|\bbuns?\b/, 4],
  [/\bbananas?\b/, 4],
  [/\bcurd\b|\bdahi\b|\byog(?:h)?urt\b|\bbuttermilk\b|\bchaas\b/, 5],
  [/\bcream\b|\bmalai\b/, 5],
  [/\btomato(?:es)?\b|\bcapsicum\b|\bcucumber\b|\bbeans\b|\bcarrots?\b|\bbhindi\b|\bokra\b|\bgourd\b|\bbrinjal\b|\bcauliflower\b|\bcabbage\b/, 6],
  [/\blemons?\b|\bginger\b|\bgreen chill(?:i|ies)\b/, 14],
  [/\bapples?\b|\boranges?\b|\bgrapes\b|\bpomegranate\b/, 14],
  [/\beggs?\b/, 21],
  [/\bcheese\b/, 21],
  [/\bbutter\b/, 30],
  [/\bonions?\b|\bpotato(?:es)?\b|\bgarlic\b/, 30],
  [/\batta\b|\bflour\b|\bbesan\b|\bsooji\b|\brava\b/, 90],
];

/** LifeOS's estimate of how long a thing keeps (days), or null. */
export function estimatedLife(name: string): number | null {
  const n = name.toLowerCase();
  for (const [re, days] of LIVES) if (re.test(n)) return days;
  return null;
}

/** Which space a thing usually goes in, by name (a guess; you move it). */
const SPACE_WORDS: Array<[RegExp, string]> = [
  [/\bfrozen\b|\bice ?cream\b|\bmccain\b|\bfries\b|\bpeas\b/, 'Freezer'],
  [/\bdolo\b|\bcrocin\b|\bparacetamol\b|\bcombiflam\b|\bors\b|\bband[- ]?aids?\b|\bmedicine|\btablets?\b|\bsyrup\b|\bvicks\b|\bointment\b|\bbetadine\b|\bthermometer\b/, 'Cabinets'],
  [/\bsurf\b|\bdetergent\b|\bariel\b|\btide\b|\bvim\b|\bpril\b|\bdish ?wash|\bharpic\b|\blizol\b|\bcolin\b|\bphenyl\b|\bgarbage bags?\b|\bscrub|\bmop\b|\bcomfort\b|\bfabric\b/, 'Cleaning'],
  [/\bcolgate\b|\btooth ?paste\b|\btooth ?brush\b|\bshampoo\b|\bconditioner\b|\bsoap\b|\bhand ?wash\b|\bdettol\b|\bhead (?:&|and) shoulders\b|\bbody ?wash\b|\brazor\b|\bshaving\b|\bdeo|\btissues?\b|\btoilet\b|\bface ?wash\b|\blotion\b/, 'Bathroom'],
  [/\bmilk\b|\bcurd\b|\bdahi\b|\byog(?:h)?urt\b|\bpaneer\b|\bbutter\b|\bcheese\b|\bcream\b|\beggs?\b|\bspinach\b|\bpalak\b|\bcoriander\b|\bdhania\b|\bmethi\b|\bmint\b|\btomato|\blemons?\b|\bginger\b|\bleftover|\bchicken\b|\bfish\b|\bmutton\b|\bbuttermilk\b|\bcapsicum\b|\bcucumber\b|\bcarrots?\b|\bbeans\b|\bbhindi\b|\bmushrooms?\b|\bapples?\b|\bgrapes\b|\bchutney\b|\bbatter\b/, 'Fridge'],
];
export function guessSpaceName(name: string): string {
  const n = name.toLowerCase();
  for (const [re, space] of SPACE_WORDS) if (re.test(n)) return space;
  return 'Kitchen';
}

/** The spaces, in your order. */
export function spaces(os: LifeOSContext): ObjectRecord<SpaceData>[] {
  return os.records.query<SpaceData>('space', {}, { limit: 200 }).sort((a, b) => (a.data.order ?? 99) - (b.data.order ?? 99) || a.title.localeCompare(b.title));
}

/** A space by name (case ignored). */
export function spaceNamed(os: LifeOSContext, name: string): ObjectRecord<SpaceData> | undefined {
  const n = name.trim().toLowerCase();
  return spaces(os).find((s) => s.title.toLowerCase() === n);
}

/** The seven default spaces, made when there are none (once, on first open). */
export function ensureSpaces(os: LifeOSContext): void {
  if (os.records.count('space')) return;
  for (const s of DEFAULT_SPACES) os.records.create<SpaceData>({ object: 'space', title: s.title, data: { icon: s.icon, order: s.order, holds: s.holds } }, 'system');
}

/** A space you add: last in the order. */
export function addSpace(os: LifeOSContext, name: string, icon = 'box'): ObjectRecord<SpaceData> {
  const order = Math.max(-1, ...spaces(os).map((s) => s.data.order ?? 0)) + 1;
  return os.records.create<SpaceData>({ object: 'space', title: name.trim(), data: { icon, order, holds: 'stock' } });
}

/** The space a thing goes in: the one given, else its name's guess, else Kitchen, else the first. */
function spaceIdFor(os: LifeOSContext, name: string, given?: string): string | undefined {
  if (given && os.records.get(given)) return given;
  return spaceNamed(os, guessSpaceName(name))?.id ?? spaceNamed(os, 'Kitchen')?.id ?? spaces(os)[0]?.id;
}

/* ------------------------------------------------------------------ */
/* State, running low                                                   */
/* ------------------------------------------------------------------ */

export type StockState = 'fresh' | 'use soon' | 'probably gone' | 'used up';

export interface StateRead {
  state: StockState;
  /** Days of life left (0 = its last day, negative = past it); null without a life. */
  daysLeft: number | null;
  /** The state rests on LifeOS's estimate, not on your life. */
  estimated: boolean;
}

/** The days a "still good" holds before it is probably gone again. */
const STILL_GOOD_DAYS = 2;

/**
 * State from bought on and life (§2, *State*): used up at 0; probably gone
 * past its life; use soon in the last 2 days, or the last tenth of a long
 * life; else fresh. "Still good" counts as use soon for 2 more days.
 */
export function stockState(d: StockData, now = Date.now()): StateRead {
  const estimated = d.lifeBy !== 'yours';
  if (!(d.quantity > 0)) return { state: 'used up', daysLeft: null, estimated: false };
  const age = daysSince(d.boughtOn, now);
  if (!d.lifeDays || age == null) return { state: 'fresh', daysLeft: null, estimated };
  const left = d.lifeDays - age;
  const window = Math.max(2, Math.round(d.lifeDays / 10));
  const checked = daysSince(d.checkedOn, now);
  if (checked != null && d.checkedOn! >= d.boughtOn! && left <= window) {
    const more = STILL_GOOD_DAYS - checked;
    return { state: more >= 0 ? 'use soon' : 'probably gone', daysLeft: more, estimated };
  }
  if (left < 0) return { state: 'probably gone', daysLeft: left, estimated };
  if (left <= window) return { state: 'use soon', daysLeft: left, estimated };
  return { state: 'fresh', daysLeft: left, estimated };
}

/** "3 d" · "2 wk" · "5 wk" · "2 mo": a span in days, short. */
export function spanWords(days: number): string {
  if (days < 14) return `${days} d`;
  if (days < 63) return `${Math.round(days / 7)} wk`;
  return `${Math.round(days / 30)} mo`;
}

export interface LowRead {
  low: boolean;
  /** The "why" line: "every 3 wk · 18 d", "half left". */
  why: string | null;
  /** Days until the rate is up (negative: past it); null without a rate. */
  dueIn: number | null;
}

/** Running low (§2): a rate nearly up with one or less left (from 3 days before), or half of the last one left. */
export function runningLow(d: StockData, now = Date.now()): LowRead {
  if (!(d.quantity > 0)) return { low: false, why: null, dueIn: null };
  const age = daysSince(d.boughtOn, now);
  const dueIn = d.rateDays && age != null ? Math.round(d.rateDays - age) : null;
  if (dueIn != null && d.quantity <= 1 && dueIn <= 3) return { low: true, why: `every ${spanWords(Math.round(d.rateDays!))} · ${age} d`, dueIn };
  if (d.quantity < 1) return { low: true, why: 'half left', dueIn };
  return { low: false, why: null, dueIn };
}

/** "×2", "×1½", "½", "" for one. */
export function quantityWords(q: number): string {
  if (q === 1 || !(q > 0)) return '';
  const whole = Math.floor(q);
  const half = q - whole >= 0.5 ? '½' : '';
  return whole ? `×${whole}${half}` : half;
}

/* ------------------------------------------------------------------ */
/* Purchases and the rate                                               */
/* ------------------------------------------------------------------ */

/** What Undo needs: the record's data before (null = it was made by the action), and the events the action wrote. */
export interface StockUndo {
  id: string;
  before: StockData | null;
  events: string[];
}

/** Put a record back as it was before the action (or remove it, if the action made it). */
export function undoStock(os: LifeOSContext, u: StockUndo): void {
  os.db.transaction(() => {
    for (const e of u.events) os.records.timeline.remove(e);
    if (!u.before) {
      if (os.records.get(u.id)) os.records.delete(u.id, 'user');
      return;
    }
    const now = os.records.get<StockData>(u.id);
    if (!now) return;
    // Keys the action added are cleared; the rest go back.
    const cleared = Object.fromEntries(Object.keys(now.data).filter((k) => !(k in u.before!)).map((k) => [k, undefined]));
    os.records.update<StockData>(u.id, { data: { ...cleared, ...u.before } as StockData }, 'user');
  });
}

/** Undo several actions (an order stocked, a line added), last first. */
export function undoAll(os: LifeOSContext, us: StockUndo[]): void {
  for (const u of [...us].reverse()) undoStock(os, u);
}

/** The Stock record for a product, if you have it (any space; the one in `spaceId` first). */
export function findStock(os: LifeOSContext, name: string, spaceId?: string): ObjectRecord<StockData> | undefined {
  const key = productKey(name);
  if (!key) return undefined;
  const hits = os.records.query<StockData>('stock', {}, { limit: 5000 }).filter((s) => productKey(s.title) === key);
  return hits.find((s) => s.data.spaceId === spaceId) ?? hits[0];
}

export interface BuyInput {
  name: string;
  size?: string;
  quantity?: number;
  spaceId?: string;
  at?: number;
  source?: StockData['source'];
  shop?: string;
  orderId?: string;
  price?: number;
}

/**
 * A purchase: the product's record gains it (quantity up, bought on, used up
 * and still good cleared, off the list), or a new record is made with
 * LifeOS's life estimate. Each purchase is a *bought* Event, and the rate is
 * learned again.
 */
export function buy(os: LifeOSContext, input: BuyInput, actor: 'user' | 'assistant' | 'system' = 'user'): StockUndo & { created: boolean } {
  const at = input.at ?? Date.now();
  const day = isoDay(at);
  const q = input.quantity && input.quantity > 0 ? input.quantity : 1;
  const name = input.name.trim();
  const have = findStock(os, name, input.spaceId);
  const from = { source: input.source ?? 'you', shop: input.shop, orderId: input.orderId, price: input.price };
  let id: string;
  let before: StockData | null = null;
  os.db.transaction(() => {
    if (have) {
      before = { ...have.data };
      const est = estimatedLife(have.title);
      os.records.update<StockData>(
        have.id,
        {
          data: {
            quantity: leftAtRebuy(have.data, at) + q,
            boughtOn: day,
            usedUpOn: undefined,
            checkedOn: undefined,
            onList: undefined,
            ...(input.size ? { size: input.size } : {}),
            ...(have.data.lifeBy === 'yours' ? {} : est ? { lifeDays: est, lifeBy: 'estimated' as const } : {}),
            ...Object.fromEntries(Object.entries(from).filter(([, v]) => v !== undefined)),
          },
        },
        actor,
      );
      id = have.id;
    } else {
      const est = estimatedLife(name);
      const rec = os.records.create<StockData>(
        { object: 'stock', title: name.charAt(0).toUpperCase() + name.slice(1), data: { quantity: q, size: input.size, spaceId: spaceIdFor(os, name, input.spaceId), boughtOn: day, ...(est ? { lifeDays: est, lifeBy: 'estimated' as const } : {}), ...from } },
        actor,
      );
      id = rec.id;
    }
  });
  const ev = os.records.timeline.add({ entityId: id!, kind: 'bought', title: `Bought${q !== 1 ? ` ×${q}` : ''}${input.shop ? ` · ${shopLabel(input.shop)}` : ''}`, actor, occurredAt: at, meta: { quantity: q, ...from } });
  learnRate(os, id!);
  return { id: id!, before, events: [ev.id], created: !have };
}

export const shopLabel = (shop: string) => ({ blinkit: 'Blinkit', zepto: 'Zepto', instamart: 'Instamart', bigbasket: 'BigBasket' })[shop] ?? shop;

/**
 * What is still there when it is bought again. LifeOS never sees things used
 * up, so a rebuy usually means the last one ran out: what was left carries
 * over only while it is not probably gone and its rate is not nearly up.
 */
export function leftAtRebuy(d: StockData, at: number): number {
  if (!(d.quantity > 0)) return 0;
  if (stockState(d, at).state === 'probably gone') return 0;
  const age = daysSince(d.boughtOn, at);
  if (d.rateDays && age != null && age >= d.rateDays * 0.8) return 0;
  return d.quantity;
}

/** The purchases of a record, oldest first (the rate's history: dots on a line). */
export function purchases(os: LifeOSContext, id: string): Array<{ at: number; quantity: number; price?: number; shop?: string; orderId?: string }> {
  return os.records.timeline
    .forEntity(id, 500)
    .filter((e) => e.kind === 'bought')
    .map((e) => ({ at: e.occurredAt, quantity: Number(e.meta.quantity ?? 1), price: e.meta.price as number | undefined, shop: e.meta.shop as string | undefined, orderId: e.meta.orderId as string | undefined }))
    .reverse();
}

/**
 * The rate: how long one lasts you — the median of the last five spans from a
 * purchase to when it was next used up or bought again. Kept on the record;
 * unchanged until there is a span.
 */
export function learnRate(os: LifeOSContext, id: string): number | null {
  const evs = os.records.timeline
    .forEntity(id, 500)
    .filter((e) => e.kind === 'bought' || e.kind === 'used up')
    .sort((a, b) => a.occurredAt - b.occurredAt);
  const spans: number[] = [];
  evs.forEach((e, i) => {
    if (e.kind !== 'bought') return;
    const end = evs.slice(i + 1).find((x) => x.kind === 'used up' || x.kind === 'bought');
    if (!end) return;
    const days = Math.round((end.occurredAt - e.occurredAt) / DAY);
    if (days >= 1) spans.push(days);
  });
  if (!spans.length) return null;
  const last = spans.slice(-5).sort((a, b) => a - b);
  const mid = last.length % 2 ? last[(last.length - 1) / 2]! : Math.round((last[last.length / 2 - 1]! + last[last.length / 2]!) / 2);
  const rec = os.records.get<StockData>(id);
  if (rec && rec.data.rateDays !== mid) os.records.update<StockData>(id, { data: { rateDays: mid } }, 'system');
  return mid;
}

/* ------------------------------------------------------------------ */
/* What a pill does                                                     */
/* ------------------------------------------------------------------ */

function act(os: LifeOSContext, id: string, patch: (d: StockData, title: string) => { data: Partial<StockData>; event?: { kind: string; title: string } } | null, now = Date.now()): StockUndo | null {
  const rec = os.records.get<StockData>(id);
  if (!rec) return null;
  const p = patch(rec.data, rec.title);
  if (!p) return null;
  const before = { ...rec.data };
  os.records.update<StockData>(id, { data: p.data }, 'user');
  const events: string[] = [];
  if (p.event) events.push(os.records.timeline.add({ entityId: id, kind: p.event.kind, title: p.event.title, actor: 'user', occurredAt: now }).id);
  if (p.event?.kind === 'used up') learnRate(os, id);
  return { id, before, events };
}

/** Tap: one used up (×2 → ×1; the last one → used up, which the rate learns from). */
export function useOne(os: LifeOSContext, id: string, now = Date.now()): StockUndo | null {
  return act(os, id, (d) => {
    if (!(d.quantity > 0)) return null;
    const left = d.quantity > 1 ? d.quantity - 1 : 0;
    return left > 0 ? { data: { quantity: left }, event: { kind: 'used', title: 'Used one' } } : { data: { quantity: 0, usedUpOn: isoDay(now), checkedOn: undefined }, event: { kind: 'used up', title: 'Used up' } };
  }, now);
}

/** All of it used up at once. */
export function useUp(os: LifeOSContext, id: string, now = Date.now()): StockUndo | null {
  return act(os, id, (d) => (d.quantity > 0 ? { data: { quantity: 0, usedUpOn: isoDay(now), checkedOn: undefined }, event: { kind: 'used up', title: 'Used up' } } : null), now);
}

/** Long-press › Half left: the last one is half gone (×2 → ×1½, 1 → ½). Nothing if it is already a half. */
export function halfLeft(os: LifeOSContext, id: string, now = Date.now()): StockUndo | null {
  return act(os, id, (d) => (d.quantity > 0 && Number.isInteger(d.quantity) ? { data: { quantity: d.quantity - 0.5 }, event: { kind: 'used', title: 'Half left' } } : null), now);
}

/** Long-press › Still good: you looked; use soon for 2 more days. */
export function stillGood(os: LifeOSContext, id: string, now = Date.now()): StockUndo | null {
  return act(os, id, (d) => (d.quantity > 0 ? { data: { checkedOn: isoDay(now) } } : null), now);
}

/** Long-press › Move to another space. */
export function moveTo(os: LifeOSContext, id: string, spaceId: string): StockUndo | null {
  return act(os, id, (d) => (d.spaceId === spaceId ? null : { data: { spaceId } }));
}

/** − / + on the Stock page (in halves, never below 0). */
export function setQuantity(os: LifeOSContext, id: string, quantity: number, now = Date.now()): StockUndo | null {
  const q = Math.max(0, Math.round(quantity * 2) / 2);
  return act(os, id, (d) => (d.quantity === q ? null : q > 0 ? { data: { quantity: q, usedUpOn: undefined } } : { data: { quantity: 0, usedUpOn: isoDay(now) }, event: { kind: 'used up', title: 'Used up' } }), now);
}

/** Your life for it ("keeps 10 days"): yours wins from then on. Empty = it doesn't go off. */
export function setLife(os: LifeOSContext, id: string, days: number | null): StockUndo | null {
  return act(os, id, () => ({ data: days && days > 0 ? { lifeDays: Math.round(days), lifeBy: 'yours' } : { lifeDays: undefined, lifeBy: 'yours' } }));
}

/** On or off the shopping list. */
export function setOnList(os: LifeOSContext, id: string, on: boolean): StockUndo | null {
  return act(os, id, (d) => (!!d.onList === on ? null : { data: { onList: on || undefined } }));
}

/** "Add to list" for something typed: the product's record, or a new one with nothing in (quantity 0). */
export function addToList(os: LifeOSContext, name: string): StockUndo | null {
  const have = findStock(os, name);
  if (have) return setOnList(os, have.id, true);
  const n = name.trim();
  if (!n) return null;
  const rec = os.records.create<StockData>({ object: 'stock', title: n.charAt(0).toUpperCase() + n.slice(1), data: { quantity: 0, onList: true, spaceId: spaceIdFor(os, n), source: 'you' } });
  return { id: rec.id, before: null, events: [] };
}

/* ------------------------------------------------------------------ */
/* Several from one line                                                */
/* ------------------------------------------------------------------ */

const WORD_NUMBERS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, dozen: 12, 'a dozen': 12, half: 0.5 };
const UNIT_WORDS: Record<string, string> = { g: 'g', gm: 'g', gms: 'g', gram: 'g', grams: 'g', kg: 'kg', kgs: 'kg', ml: 'ml', l: 'L', ltr: 'L', litre: 'L', litres: 'L', liter: 'L', liters: 'L' };

export interface LineThing {
  name: string;
  quantity: number;
  size?: string;
}

/** "eggs, butter, 2 milk" → Eggs · Butter · Milk ×2. Also "milk x2", "a dozen eggs", "1L milk", "paneer 200g", "x and y". */
export function parseStockLine(text: string): LineThing[] {
  return text
    .split(/[,;\n]|\s+and\s+/i)
    .map((s) => s.trim())
    .filter(Boolean)
    .flatMap((part) => {
      let s = part;
      let size: string | undefined;
      const sz = /(\d+(?:\.\d+)?)\s*(g|gm|gms|grams?|kg|kgs|ml|l|ltr|litres?|liters?)\b/i.exec(s);
      if (sz) {
        size = `${sz[1]} ${UNIT_WORDS[sz[2]!.toLowerCase()] ?? sz[2]}`;
        s = (s.slice(0, sz.index) + s.slice(sz.index + sz[0].length)).trim();
      }
      let quantity = 1;
      const lead = /^(\d+(?:\.\d+)?|a dozen|an?|one|two|three|four|five|six|seven|eight|nine|ten|twelve|dozen|half)\s*(?:x|×|of)?\s+(.+)$/i.exec(s);
      const tail = /^(.+?)\s*(?:x|×)\s*(\d+)$/i.exec(s);
      if (lead) {
        quantity = Number(lead[1]) || WORD_NUMBERS[lead[1]!.toLowerCase()] || 1;
        s = lead[2]!;
      } else if (tail) {
        quantity = Number(tail[2]) || 1;
        s = tail[1]!;
      }
      s = s.replace(/^(?:of|packs? of|bottles? of)\s+/i, '').trim();
      if (!s) return [];
      return [{ name: s.charAt(0).toUpperCase() + s.slice(1), quantity, ...(size ? { size } : {}) }];
    });
}

/** Add what one line says, each into the space its name suggests (or the one given). */
export function addFromLine(os: LifeOSContext, text: string, opts: { spaceId?: string; at?: number } = {}): Array<StockUndo & { created: boolean }> {
  return parseStockLine(text).map((t) => buy(os, { name: t.name, quantity: t.quantity, size: t.size, spaceId: opts.spaceId, at: opts.at, source: 'you' }));
}
