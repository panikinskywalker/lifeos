import type { PhotoAsk } from '@core/brain/photo';
import type { LifeOSContext } from '@core/registry/context';
import type { StockData } from './types';
import { buy, productKey, spaceNamed, stillGood, stockState, undoStock, useUp, type StockUndo } from './stock';
import { dishAsk } from './brain';

/**
 * Snap the fridge (docs/MODEL.md layer 8, *Slices 4 and 6*; HOME-BRIEF screen
 * 5): the photo and the names of the Fridge's pills go to Claude because you
 * pressed the button; it says what it cannot see and what it found, and one
 * dish. The differences come back as pills to accept or fix. The photo is
 * never stored here; the board drops it once the answer is in.
 */

export const FRIDGE_SYSTEM = `You look at one photo of a home fridge in India for LifeOS, a personal app. You are given the names of what LifeOS thinks is in the fridge.
- not_seen: names from the list that you cannot see in the photo, copied exactly as given. Only list one when you are fairly sure; something hidden at the back may still be there, so leave out what could be out of view.
- found: things you can clearly see that are not on the list, each as a short shop name ("Coriander", "Lemons", "Amul curd 400 g"). Leave out the fridge itself, containers you cannot read, and condiments unless clear.
- dish: one dish to cook tonight from what you see, using the ones marked use soon first: the dish, then the 3 to 5 things it uses ("Palak paneer: spinach, paneer, cream"). Empty when nothing fits.
Plain British English, no em dashes, no emoji.`;

export const FRIDGE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['not_seen', 'found', 'dish'],
  properties: {
    not_seen: { type: 'array', items: { type: 'string' } },
    found: { type: 'array', items: { type: 'string' } },
    dish: { type: 'string' },
  },
} as const;

export interface FridgeDiff {
  /** On the list, not in the photo: accept = used up, fix = still there. */
  missing: Array<{ stockId: string; title: string }>;
  /** In the photo, not on the list: accept = added to the Fridge, fix = not there. */
  found: string[];
  dish: string | null;
}

const inFridge = (os: LifeOSContext, spaceId: string) =>
  os.records.query<StockData>('stock', { filter: { and: [{ field: 'data.spaceId', op: 'eq', value: spaceId }] } }, { limit: 2000 }).filter((s) => s.data.quantity > 0);

/** The Fridge space, if Home has one. */
export const fridgeSpace = (os: LifeOSContext) => spaceNamed(os, 'Fridge') ?? null;

/** What leaves with the photo: the Fridge's pills by name, the ones to use soon marked. Null without a Fridge. */
export function fridgeQuestion(os: LifeOSContext, now = Date.now()): { spaceId: string; ask: Omit<PhotoAsk, 'image'> } | null {
  const space = fridgeSpace(os);
  if (!space) return null;
  const here = inFridge(os, space.id);
  const soon = here.filter((s) => stockState(s.data, now).state === 'use soon').map((s) => s.title);
  return {
    spaceId: space.id,
    ask: {
      module: 'inventory',
      moduleName: 'Home',
      why: 'you pressed Snap the fridge',
      what: 'a photo of the fridge',
      system: FRIDGE_SYSTEM,
      prompt: 'This is my fridge now. Compare it with what LifeOS thinks is in it.',
      record: { in_the_fridge: here.map((s) => s.title), use_soon: soon },
      schema: FRIDGE_SCHEMA as unknown as Record<string, unknown>,
      maxTokens: 1000,
    },
  };
}

/** Claude's answer as pills: only names that are on the list count as not seen; what is on it already is not found. */
export function fridgeDiff(os: LifeOSContext, spaceId: string, answer: unknown): FridgeDiff {
  const a = (answer ?? {}) as { not_seen?: unknown; found?: unknown; dish?: unknown };
  const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()).map((x) => x.trim()) : []);
  const here = inFridge(os, spaceId);
  const byKey = new Map(here.map((s) => [productKey(s.title), s]));
  const missing = new Map<string, { stockId: string; title: string }>();
  for (const n of strings(a.not_seen)) {
    const s = byKey.get(productKey(n));
    if (s) missing.set(s.id, { stockId: s.id, title: s.title });
  }
  const seen = new Set<string>();
  const found = strings(a.found).filter((n) => {
    const k = productKey(n);
    if (!k || byKey.has(k) || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const dish = typeof a.dish === 'string' && a.dish.trim() ? a.dish.replace(/\s*[\u2014\u2013]\s*/g, ', ').trim() : null;
  return { missing: [...missing.values()], found, dish };
}

/** Not seen, accepted: used up. */
export const acceptMissing = (os: LifeOSContext, stockId: string, now = Date.now()): StockUndo | null => useUp(os, stockId, now);
/** Not seen, fixed: it is still there. */
export const fixMissing = (os: LifeOSContext, stockId: string, now = Date.now()): StockUndo | null => stillGood(os, stockId, now);
/** Found, accepted: into the Fridge, bought today as far as LifeOS knows. */
export const acceptFound = (os: LifeOSContext, name: string, spaceId: string, now = Date.now()): StockUndo => buy(os, { name, spaceId, at: now, source: 'you' });
export { undoStock as undoFridge };

/**
 * The photo's dish fills Cook tonight for what the Fridge holds now (the same
 * key a pass would ask under), unless a dish is already there. Call it once
 * the differences are settled. Returns whether it was kept.
 */
export function keepFridgeDish(os: LifeOSContext, dish: string | null, now = Date.now()): boolean {
  const ask = dish ? dishAsk(os, now) : null;
  if (!ask || os.brain.learned.has(ask.key)) return false;
  os.brain.learned.put(ask.key, dish, { module: 'inventory', source: 'claude', at: now });
  return true;
}
