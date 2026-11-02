import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import type { TripData } from './types';

/**
 * What a trip adds up to (R7d), read through Links only: what it cost against
 * its budget, its flights and stays, its Place. Transactions, Events and
 * Places are other modules' Objects; this module reads them as records.
 */

export const DAY = 86_400_000;
const pad = (n: number) => String(n).padStart(2, '0');
/** The local day of a time ("2026-12-18"). */
export const isoOf = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const noon = (day: string) => new Date(`${day}T12:00:00`).getTime();
export const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();

/** Link words that tie a record to a trip: the form's Trip Field, and a booking mail. */
export const TRIP_WORDS = ['trip', 'part_of'];

/** Days away, both ends counted; null without both dates. */
export function tripDays(d: Pick<TripData, 'startDate' | 'endDate'>): number | null {
  if (!d.startDate || !d.endDate) return null;
  return Math.max(1, Math.round((noon(d.endDate) - noon(d.startDate)) / DAY) + 1);
}

/** Days from today to the start (0 today, negative once begun); null undated. */
export function daysToStart(d: Pick<TripData, 'startDate'>, now = Date.now()): number | null {
  return d.startDate ? Math.round((noon(d.startDate) - noon(isoOf(now))) / DAY) : null;
}

export type TripPhase = 'undated' | 'upcoming' | 'away' | 'back';

export function tripPhase(d: Pick<TripData, 'startDate' | 'endDate'>, now = Date.now()): TripPhase {
  if (!d.startDate) return 'undated';
  const today = isoOf(now);
  if (d.startDate > today) return 'upcoming';
  return (d.endDate ?? d.startDate) >= today ? 'away' : 'back';
}

export function trips(os: LifeOSContext): ObjectRecord<TripData>[] {
  return os.records.query<TripData>('trip', { sort: [{ field: 'data.startDate', dir: 'asc' }] }, { limit: 1000 }).filter((t) => !t.archived);
}

/** The trip you are on, else the next one. */
export function nextTrip(os: LifeOSContext, now = Date.now()): ObjectRecord<TripData> | null {
  const all = trips(os);
  return all.find((t) => tripPhase(t.data, now) === 'away') ?? all.find((t) => tripPhase(t.data, now) === 'upcoming') ?? null;
}

/** Records of an Object linked to the trip by either word, once each. */
export function linkedTo<T = Record<string, unknown>>(os: LifeOSContext, tripId: string, object: string): ObjectRecord<T>[] {
  const ids = new Set<string>();
  for (const w of TRIP_WORDS) for (const r of os.links.forEntity(tripId, w)) if (r.other.object === object) ids.add(r.other.id);
  return [...ids].map((id) => os.records.get<T>(id)).filter((r): r is ObjectRecord<T> => !!r);
}

interface Txn {
  amount?: number;
  kind?: string;
  category?: string;
  date?: string;
  tripId?: string;
}

export interface TripSpend {
  spent: number;
  count: number;
  budget: number | null;
  /** Budget minus spent (negative when over). */
  left: number | null;
  over: boolean;
  /** Spent over the days away (or so far, while away). */
  perDay: number | null;
  /** What is left per day still to go, while upcoming or away. */
  leftPerDay: number | null;
  byCategory: Array<{ category: string; amount: number }>;
  items: ObjectRecord<Txn>[];
}

/** Money out on the trip: expense Transactions linked to it, in ₹. */
export function tripSpend(os: LifeOSContext, trip: ObjectRecord<TripData>, now = Date.now()): TripSpend {
  const items = os.registry.objects.has('transaction') ? linkedTo<Txn>(os, trip.id, 'transaction').filter((t) => (t.data.kind ?? 'expense') === 'expense') : [];
  items.sort((a, b) => (b.data.date ?? '').localeCompare(a.data.date ?? ''));
  const spent = Math.round(items.reduce((n, t) => n + (t.data.amount ?? 0), 0) * 100) / 100;
  const cats = new Map<string, number>();
  for (const t of items) cats.set(t.data.category ?? 'other', (cats.get(t.data.category ?? 'other') ?? 0) + (t.data.amount ?? 0));
  const budget = trip.data.budget ?? null;
  const days = tripDays(trip.data);
  const phase = tripPhase(trip.data, now);
  const sofar = phase === 'away' && trip.data.startDate ? Math.round((noon(isoOf(now)) - noon(trip.data.startDate)) / DAY) + 1 : days;
  const togo = phase === 'upcoming' ? days : phase === 'away' && days && sofar ? Math.max(1, days - sofar + 1) : null;
  const left = budget != null ? budget - spent : null;
  return {
    spent,
    count: items.length,
    budget,
    left,
    over: left != null && left < 0,
    perDay: sofar && spent ? Math.round(spent / sofar) : null,
    leftPerDay: left != null && togo ? Math.round(Math.max(0, left) / togo) : null,
    byCategory: [...cats].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount),
    items,
  };
}

/** Money out on the trip's days that is linked to no trip: offered to link, never linked on its own. */
export function spentWhileAway(os: LifeOSContext, trip: ObjectRecord<TripData>): ObjectRecord<Txn>[] {
  if (!trip.data.startDate || !os.registry.objects.has('transaction')) return [];
  const end = trip.data.endDate ?? trip.data.startDate;
  return os.records
    .query<Txn>('transaction', { filter: { and: [{ field: 'data.date', op: 'gte', value: trip.data.startDate }, { field: 'data.date', op: 'lte', value: end }, { field: 'data.kind', op: 'eq', value: 'expense' }] }, sort: [{ field: 'data.date', dir: 'desc' }] }, { limit: 200 })
    .filter((t) => !TRIP_WORDS.some((w) => os.links.forEntity(t.id, w).some((r) => r.other.object === 'trip')));
}

/** Put a Transaction on the trip through its Trip Field (so the Link stays when it is edited); returns its Undo. */
export function addToTrip(os: LifeOSContext, tripId: string, txId: string): () => void {
  const tx = os.records.get<Txn>(txId);
  if (!tx) throw new Error(`Transaction ${txId} not found`);
  const prev = tx.data.tripId;
  os.records.update<Txn>(txId, { data: { tripId } }, 'user');
  return () => {
    if (os.records.get(txId)) os.records.update<Txn>(txId, { data: { tripId: prev } }, 'user');
  };
}

export interface Booking {
  id: string;
  kind: 'flight' | 'stay';
  title: string;
  startAt: number;
  endAt: number | null;
  airline: string | null;
  flightNo: string | null;
  location: string | null;
  pnr: string | null;
}

/** Its flights and stays (Events linked to it), in time order. */
export function tripBookings(os: LifeOSContext, tripId: string): Booking[] {
  if (!os.registry.objects.has('event')) return [];
  return linkedTo<{ kind?: string; startAt?: number; endAt?: number; airline?: string; flightNo?: string; location?: string; notes?: string }>(os, tripId, 'event')
    .filter((e) => e.data.kind === 'flight' || e.data.kind === 'stay')
    .map((e) => ({ id: e.id, kind: e.data.kind as 'flight' | 'stay', title: e.title, startAt: e.data.startAt ?? 0, endAt: e.data.endAt ?? null, airline: e.data.airline ?? null, flightNo: e.data.flightNo ?? null, location: e.data.location ?? null, pnr: /\bPNR ([A-Z0-9]{6})\b/.exec(e.data.notes ?? '')?.[1] ?? null }))
    .sort((a, b) => a.startAt - b.startAt);
}

/* ------------------------------------------------------------------ */
/* Destination → Place                                                  */
/* ------------------------------------------------------------------ */

const WIDE = new Set(['city', 'area', 'country']);

/**
 * A trip's destination as a Place (word `to`): a Place of that name, a city,
 * area or country first, else a new city. The Place Object is places'; it is
 * matched by its data. Returns the Place's id, or null without places.
 */
export function linkTripPlace(os: LifeOSContext, trip: ObjectRecord<TripData>): string | null {
  if (trip.data.placeId || !os.registry.objects.has('place')) return trip.data.placeId ?? null;
  const name = trip.data.destination?.trim();
  if (!name) return null;
  const n = norm(name);
  const same = os.records.query<{ kind?: string }>('place', {}, { limit: 100_000 }).filter((p) => !p.archived && (norm(p.title) === n || norm(p.title.split(',')[0]!) === n));
  const place = same.find((p) => WIDE.has(p.data.kind ?? '')) ?? same[0] ?? os.records.create({ object: 'place', title: name, data: { kind: 'city' } }, 'assistant');
  os.records.update<TripData>(trip.id, { data: { placeId: place.id } }, 'assistant');
  return place.id;
}

/** Trips linked to a Place (its Trips here), newest first. */
export function tripsTo(os: LifeOSContext, placeId: string): ObjectRecord<TripData>[] {
  return os.links
    .forEntity(placeId, 'to')
    .filter((r) => r.direction === 'in' && r.other.object === 'trip')
    .map((r) => os.records.get<TripData>(r.other.id))
    .filter((t): t is ObjectRecord<TripData> => !!t)
    .sort((a, b) => (b.data.startDate ?? '').localeCompare(a.data.startDate ?? ''));
}
