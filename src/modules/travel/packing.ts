import { keyHash } from '@core/brain/contract';
import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import type { TripData } from './types';
import { tripDays } from './trips';

/**
 * The packing list (docs/MODEL.md layer 8, *Travel through the same brain*;
 * R7d): scaled to the days and the kind of place, drawn from your clean
 * clothes and Home's Bathroom. Clothes are clothing Assets and the Bathroom
 * is a Space with its Stock: other modules' Objects, found by their data and
 * written through core (an Asset's state, a *packed for* Link); this module
 * imports neither. The weather there and "forgot last time" wait.
 */

export const PACKED_FOR = 'packed_for';
/** When the dates are not known yet. */
export const DEFAULT_DAYS = 3;

export type Climate = 'beach' | 'cold' | 'city';
export type ClothesKind = 'top' | 'bottom' | 'sleep' | 'swim' | 'warm' | 'other';

const BEACH = /\b(goa|gokarna|varkala|kovalam|pondicherry|puducherry|andaman|port blair|havelock|lakshadweep|alibaug|diu|bali|phuket|krabi|maldives|mal[eé]|mauritius|seychelles|anjuna|calangute|baga|palolem)\b/i;
const COLD = /\b(manali|shimla|leh|ladakh|srinagar|gulmarg|kashmir|spiti|kasol|darjeeling|gangtok|sikkim|mussoorie|auli|tawang|nainital|zurich|switzerland|iceland|norway|finland|swiss)\b/i;
const ABROAD = /\b(dubai|abu dhabi|doha|singapore|bangkok|phuket|krabi|bali|kuala lumpur|colombo|sri lanka|kathmandu|nepal|bhutan|mal[eé]|maldives|mauritius|seychelles|hong kong|tokyo|kyoto|osaka|japan|vietnam|hanoi|london|paris|frankfurt|amsterdam|munich|zurich|switzerland|istanbul|europe|new york|san francisco|los angeles|chicago|seattle|boston|usa|toronto|vancouver|canada|sydney|melbourne|australia|iceland|norway|finland)\b/i;

const KINDS: Array<[RegExp, ClothesKind]> = [
  [/\b(swim\w*|trunks|bikini)\b/i, 'swim'],
  [/\b(pyjamas?|pajamas?|nightwear|night ?suit|sleep\w*)\b/i, 'sleep'],
  [/\b(jacket|hoodie|sweater|sweatshirt|fleece|coat|thermals?|pullover|cardigan)\b/i, 'warm'],
  [/\b(jeans|trousers|chinos|shorts|pants|joggers|skirt|track ?pants|leggings)\b/i, 'bottom'],
  [/\b(shirt|tee|t-shirt|tshirt|polo|kurta|top|blouse|henley|tank)\b/i, 'top'],
];
const FORMAL = /\b(formal|oxford|blazer|suit)\b/i;

export const clothesKind = (title: string): ClothesKind => KINDS.find(([re]) => re.test(title))?.[1] ?? 'other';

export function climateOf(d: Pick<TripData, 'destination'>): Climate {
  return BEACH.test(d.destination ?? '') ? 'beach' : COLD.test(d.destination ?? '') ? 'cold' : 'city';
}

export const isAbroad = (d: Pick<TripData, 'destination' | 'localCurrency'>) => (!!d.localCurrency && d.localCurrency !== 'INR') || ABROAD.test(d.destination ?? '');

/** How many of each kind to take for these days and this kind of place. */
export function clothesCounts(days: number, climate: Climate): Record<ClothesKind, number> {
  return {
    top: Math.min(10, days + (days >= 3 ? 1 : 0)),
    bottom: Math.min(4, Math.max(1, Math.ceil(days / 3))),
    sleep: 1,
    swim: climate === 'beach' ? 1 : 0,
    warm: climate === 'cold' ? 2 : 0,
    other: 0,
  };
}

export const KIND_WORDS: Record<ClothesKind, [string, string]> = { top: ['top', 'tops'], bottom: ['bottom', 'bottoms'], sleep: ['sleepwear', 'sleepwear'], swim: ['swimwear', 'swimwear'], warm: ['warm layer', 'warm layers'], other: ['other', 'other'] };

interface Cloth {
  category?: string;
  state?: string;
  spaceId?: string;
}

export interface PackCloth {
  id: string;
  title: string;
  kind: ClothesKind;
  state: 'clean' | 'wash' | 'packed';
  /** Packed for this trip (a *packed for* Link). */
  packedHere: boolean;
  /** In the suggested set. */
  suggested: boolean;
}

export interface PackingList {
  days: number;
  /** The days were guessed (no dates yet). */
  daysGuessed: boolean;
  climate: Climate;
  abroad: boolean;
  /** "4 days · beach · 5 tops, 2 bottoms, sleepwear, swimwear". */
  line: string;
  counts: Record<ClothesKind, number>;
  /** Every clothing Asset you own, suggested ones first. */
  clothes: PackCloth[];
  /** Kinds where you have fewer clean than the count ("swimwear: none clean"). */
  short: Array<{ kind: ClothesKind; want: number; have: number }>;
  /** Not clothes: toiletries (Home's Bathroom when it has Stock), the rest by kind of trip, and what Claude added. */
  items: Array<{ title: string; from: 'bathroom' | 'list' | 'brain'; packed: boolean }>;
}

/** The learned key for this kind of trip's list (a four-day beach trip for work): the same key is never asked twice. */
export function packingKey(d: TripData): string {
  const days = tripDays(d) ?? DEFAULT_DAYS;
  return `travel:packing:${keyHash([climateOf(d), String(days), d.purpose ?? 'leisure', isAbroad(d) ? 'abroad' : 'home'])}`;
}

function bathroom(os: LifeOSContext): string[] {
  if (!os.registry.objects.has('space') || !os.registry.objects.has('stock')) return [];
  const space = os.records.query<{ holds?: string }>('space', {}, { limit: 50 }).find((s) => /bath/i.test(s.title) && s.data.holds !== 'clothes');
  if (!space) return [];
  return os.records
    .query<{ spaceId?: string; quantity?: number }>('stock', { filter: { and: [{ field: 'data.spaceId', op: 'eq', value: space.id }] } }, { limit: 200 })
    .filter((s) => (s.data.quantity ?? 1) > 0)
    .map((s) => s.title)
    .sort((a, b) => a.localeCompare(b));
}

function listFor(d: TripData, climate: Climate, abroad: boolean): string[] {
  return [
    'Phone charger',
    'ID card',
    'Medicines',
    ...(climate === 'beach' ? ['Sunscreen', 'Sunglasses', 'Flip-flops'] : []),
    ...(climate === 'cold' ? ['Gloves', 'Lip balm'] : []),
    ...(abroad ? ['Passport', 'Forex card', 'Plug adapter'] : []),
    ...(d.purpose === 'work' ? ['Laptop', 'Laptop charger'] : []),
  ];
}

export function packingList(os: LifeOSContext, trip: ObjectRecord<TripData>): PackingList {
  const d = trip.data;
  const known = tripDays(d);
  const days = known ?? DEFAULT_DAYS;
  const climate = climateOf(d);
  const abroad = isAbroad(d);
  const counts = clothesCounts(days, climate);
  const here = new Set(os.links.forEntity(trip.id, PACKED_FOR).filter((r) => r.direction === 'in').map((r) => r.other.id));
  const owned = os.registry.objects.has('asset')
    ? os.records.query<Cloth>('asset', { filter: { and: [{ field: 'data.category', op: 'eq', value: 'clothing' }] } }, { limit: 2000 }).filter((a) => !a.archived && a.status !== 'sold' && a.status !== 'lost')
    : [];
  const clothes: PackCloth[] = owned
    .map((a) => ({ id: a.id, title: a.title, kind: clothesKind(a.title), state: (a.data.state ?? 'clean') as PackCloth['state'], packedHere: here.has(a.id), suggested: false }))
    .sort((a, b) => a.title.localeCompare(b.title));
  // The suggested set: per kind, what is packed here already, then clean ones (formal first for work).
  const short: PackingList['short'] = [];
  for (const kind of Object.keys(counts) as ClothesKind[]) {
    const want = counts[kind];
    if (!want) continue;
    const pool = clothes
      .filter((c) => c.kind === kind && (c.packedHere || c.state === 'clean'))
      .sort((a, b) => Number(b.packedHere) - Number(a.packedHere) || (d.purpose === 'work' ? Number(FORMAL.test(b.title)) - Number(FORMAL.test(a.title)) : 0));
    pool.slice(0, want).forEach((c) => (c.suggested = true));
    if (pool.length < want) short.push({ kind, want, have: pool.length });
  }
  clothes.sort((a, b) => Number(b.suggested) - Number(a.suggested));
  const ticked = new Set((d.packed ?? []).map((x) => x.toLowerCase()));
  const seen = new Set<string>();
  const items: PackingList['items'] = [];
  const add = (title: string, from: PackingList['items'][number]['from']) => {
    const k = title.trim().toLowerCase();
    if (!k || seen.has(k)) return;
    seen.add(k);
    items.push({ title: title.trim(), from, packed: ticked.has(k) });
  };
  const bath = bathroom(os);
  for (const t of bath.length ? bath : ['Toothbrush', 'Toothpaste', 'Deodorant']) add(t, bath.length ? 'bathroom' : 'list');
  for (const t of listFor(d, climate, abroad)) add(t, 'list');
  const learned = os.brain?.learned.get<string[] | string>(packingKey(d));
  for (const t of Array.isArray(learned) ? learned : []) add(t, 'brain');
  for (const t of d.packed ?? []) add(t, 'list');
  const parts = (Object.keys(counts) as ClothesKind[]).filter((k) => counts[k]).map((k) => (k === 'top' || k === 'bottom' || k === 'warm' ? `${counts[k]} ${KIND_WORDS[k][counts[k] === 1 ? 0 : 1]}` : KIND_WORDS[k][0]));
  return {
    days,
    daysGuessed: known == null,
    climate,
    abroad,
    line: [`${days} day${days === 1 ? '' : 's'}`, climate === 'city' ? null : climate, parts.join(', ')].filter(Boolean).join(' · '),
    counts,
    clothes,
    short,
    items,
  };
}

/** True once anything is packed for the trip. */
export function hasPacked(os: LifeOSContext, trip: ObjectRecord<TripData>): boolean {
  return (trip.data.packed?.length ?? 0) > 0 || os.links.forEntity(trip.id, PACKED_FOR).some((r) => r.direction === 'in');
}

/**
 * Pack: the bag becomes exactly these clothes and things. Each piece of
 * clothing is set *packed* and linked *packed for* the trip; one taken out
 * of the bag goes back to clean. Returns its Undo.
 */
export function pack(os: LifeOSContext, tripId: string, clothIds: string[], items: string[]): () => void {
  const trip = os.records.get<TripData>(tripId);
  if (!trip) throw new Error(`Trip ${tripId} not found`);
  const before = { packed: trip.data.packed, states: new Map<string, string | undefined>(), linked: new Set(os.links.forEntity(tripId, PACKED_FOR).filter((r) => r.direction === 'in').map((r) => r.other.id)) };
  const want = new Set(clothIds);
  const setState = (id: string, state: string | undefined) => {
    const a = os.records.get<Cloth>(id);
    if (!a) return;
    if (!before.states.has(id)) before.states.set(id, a.data.state);
    if (a.data.state !== state) os.records.update<Cloth>(id, { data: { state } as Cloth }, 'user');
  };
  for (const id of want) {
    setState(id, 'packed');
    if (!before.linked.has(id)) os.links.link(id, tripId, PACKED_FOR, {}, 'user');
  }
  for (const id of before.linked) {
    if (want.has(id)) continue;
    if (os.records.get<Cloth>(id)?.data.state === 'packed') setState(id, 'clean');
    os.links.unlink(id, tripId, PACKED_FOR, 'user');
  }
  os.records.update<TripData>(tripId, { data: { packed: items } }, 'user');
  return () => {
    for (const [id, state] of before.states) if (os.records.get(id)) os.records.update<Cloth>(id, { data: { state } as Cloth }, 'user');
    for (const id of want) if (!before.linked.has(id)) os.links.unlink(id, tripId, PACKED_FOR, 'user');
    for (const id of before.linked) if (!want.has(id)) os.links.link(id, tripId, PACKED_FOR, {}, 'user');
    if (os.records.get(tripId)) os.records.update<TripData>(tripId, { data: { packed: before.packed } }, 'user');
  };
}

/** Back home: what is still packed for the trip goes in the wash (the *packed for* Links stay, as what you took). Returns its Undo. */
export function backHome(os: LifeOSContext, tripId: string): { count: number; undo: () => void } {
  const ids = os.links
    .forEntity(tripId, PACKED_FOR)
    .filter((r) => r.direction === 'in' && os.records.get<Cloth>(r.other.id)?.data.state === 'packed')
    .map((r) => r.other.id);
  for (const id of ids) os.records.update<Cloth>(id, { data: { state: 'wash' } as Cloth }, 'user');
  return {
    count: ids.length,
    undo: () => {
      for (const id of ids) if (os.records.get(id)) os.records.update<Cloth>(id, { data: { state: 'packed' } as Cloth }, 'user');
    },
  };
}

/** Clothes still packed for a trip that has ended (Back home?). */
export function stillPacked(os: LifeOSContext, tripId: string): number {
  return os.links.forEntity(tripId, PACKED_FOR).filter((r) => r.direction === 'in' && os.records.get<Cloth>(r.other.id)?.data.state === 'packed').length;
}
