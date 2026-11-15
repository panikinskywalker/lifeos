import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import type { StopData, TripData } from './types';
import { ensureStop, stopsOf } from './stops';

/**
 * Bringing in a trip from its own trip app (MODEL.md layer 2, *The Japan trip
 * comes from the Japan app's data*): a snapshot of the app's database, shared
 * into LifeOS as a file and imported once. Each R7g slice imports its part;
 * slice 1 brings the trip, its stops (the app's places), its stays and flights
 * as Events (the money on them comes with slice 2), and each day's plan as a
 * Fact on the trip. Importing the same snapshot again updates what it made.
 */

export const TRIP_APP_FORMAT = 'lifeos.tripapp.v1';

type Doc = Record<string, unknown> & { id: string };
export interface TripAppSnapshot {
  format: typeof TRIP_APP_FORMAT;
  /** A short id for the trip ("japan-dec-2026"): what a second import finds it by. */
  key: string;
  /** The trip's destination ("Japan"). */
  destination: string;
  look?: string;
  meta: { travellers?: string[]; start?: string; arrive?: string; end?: string; fx?: Record<string, number>; fxDate?: string; budgetPP?: number; dailyPP?: number };
  places?: Doc[];
  bookings?: Doc[];
  transport?: Doc[];
  days?: Doc[];
}

export function isTripAppSnapshot(x: unknown): x is TripAppSnapshot {
  const s = x as Partial<TripAppSnapshot> | null;
  return !!s && s.format === TRIP_APP_FORMAT && typeof s.key === 'string' && typeof s.destination === 'string' && !!s.meta;
}

export interface TripAppImport {
  tripId: string;
  createdTrip: boolean;
  stops: number;
  stays: number;
  flights: number;
  days: number;
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const at = (day: string, time: string) => new Date(`${day}T${/^\d{1,2}:\d{2}$/.test(time) ? time.padStart(5, '0') : '12:00'}:00`).getTime();
const AIRLINES: Record<string, string> = { VN: 'Vietnam Airlines', '6E': 'IndiGo', AI: 'Air India', NH: 'ANA', JL: 'Japan Airlines', SQ: 'Singapore Airlines' };

function bySourceKey<T>(os: LifeOSContext, object: string, key: string): ObjectRecord<T> | undefined {
  return os.records.query<T>(object, { filter: { and: [{ field: 'data.sourceKey', op: 'eq', value: key }] } }, { limit: 2 })[0];
}

/** A traveller as a Person: one with that name (the whole name, or its first word), else a new one. */
function personFor(os: LifeOSContext, name: string): string | null {
  if (!os.registry.objects.has('person')) return null;
  const n = name.toLowerCase();
  const people = os.records.query('person', {}, { limit: 5000 }).filter((p) => !p.archived);
  const hit = people.find((p) => p.title.toLowerCase() === n) ?? people.find((p) => p.title.toLowerCase().split(/\s+/)[0] === n);
  return hit?.id ?? os.records.create({ object: 'person', title: name, data: {} }, 'assistant').id;
}

/** Upsert an Event by its source key, linked *part of* the trip. */
function upsertEvent(os: LifeOSContext, tripId: string, key: string, title: string, data: Record<string, unknown>): void {
  const same = bySourceKey(os, 'event', key);
  const full = { ...data, source: 'tripapp', sourceKey: key };
  const id = same ? os.records.update(same.id, { title, data: full }, 'assistant').id : os.records.create({ object: 'event', title, data: full }, 'assistant').id;
  if (!os.links.forEntity(id, 'part_of').some((r) => r.other.id === tripId)) os.links.link(id, tripId, 'part_of', {}, 'assistant');
}

/**
 * Import a trip app's snapshot. `me` is which traveller you are (left out of
 * Travelling with); the others become People.
 */
export function importTripApp(os: LifeOSContext, snap: TripAppSnapshot, opts: { me?: string } = {}): TripAppImport {
  const m = snap.meta;
  const travellers = (m.travellers ?? []).filter((x) => typeof x === 'string' && x.trim());
  const me = opts.me ?? travellers[0];
  const local = Object.keys(m.fx ?? {}).find((c) => c !== 'INR' && c !== 'USD') ?? Object.keys(m.fx ?? {})[0];
  const out: TripAppImport = { tripId: '', createdTrip: false, stops: 0, stays: 0, flights: 0, days: 0 };
  os.db.transaction(() => {
    // The trip.
    const tripKey = `tripapp:${snap.key}`;
    const tripData: Partial<TripData> = {
      destination: snap.destination,
      startDate: m.start,
      endDate: m.end,
      budget: num(m.budgetPP),
      dailyAllowance: num(m.dailyPP),
      localCurrency: local,
      fxRate: local ? num(m.fx?.[local]) : undefined,
      fxDate: str(m.fxDate),
      look: str(snap.look),
      purpose: 'leisure',
      personIds: travellers.filter((x) => x !== me).map((x) => personFor(os, x)).filter((x): x is string => !!x),
      sourceKey: tripKey,
    };
    const had = bySourceKey<TripData>(os, 'trip', tripKey);
    const trip = had ? os.records.update<TripData>(had.id, { data: tripData }, 'assistant') : os.records.create<TripData>({ object: 'trip', data: tripData as TripData, status: 'booked' }, 'assistant');
    out.tripId = trip.id;
    out.createdTrip = !had;

    // Stops, from the app's places.
    const stopOf = new Map<string, string>();
    for (const p of snap.places ?? []) {
      const name = str(p.name);
      if (!name) continue;
      const key = `${tripKey}:place:${p.id}`;
      const kind = (['stop', 'idea', 'airport'].includes(String(p.kind)) ? p.kind : 'stop') as StopData['kind'];
      const fields: Partial<StopData> = { kind, order: num(p.order), color: str(p.color), localName: str(p.jp), about: str(p.blurb), sourceKey: key };
      const lat = num(p.lat), lng = num(p.lon);
      const same = bySourceKey<StopData>(os, 'stop', key);
      const stop = same ? os.records.update<StopData>(same.id, { title: name, data: fields }, 'assistant') : ensureStop(os, trip.id, name, { ...fields, coordinates: lat != null && lng != null ? { lat, lng } : undefined }).stop;
      if (!same && stop.data.sourceKey !== key) os.records.update<StopData>(stop.id, { data: fields }, 'assistant');
      stopOf.set(p.id, stop.id);
      out.stops++;
    }

    // Stays and flights, as Events (slice 2 adds their money and status Fields).
    for (const b of snap.bookings ?? []) {
      if (b.kind !== 'stay' || b.status === 'Cancelled' || !str(b.start) || !str(b.title)) continue;
      const stopId = stopOf.get(String(b.placeId ?? '')) ?? stopsOf(os, trip.id, ['stop', 'airport']).find((s) => s.title.toLowerCase() === String(b.place ?? '').toLowerCase())?.id;
      const place = stopId ? os.records.get(stopId)?.title : str(b.place);
      upsertEvent(os, trip.id, `${tripKey}:booking:${b.id}`, `Stay · ${b.title}`, { kind: 'stay', startAt: at(String(b.start), '15:00'), ...(str(b.end) ? { endAt: at(String(b.end), '11:00') } : {}), allDay: true, location: place, notes: str(b.details), stopId });
      out.stays++;
    }
    for (const l of snap.transport ?? []) {
      if (l.mode !== 'Flight' || !str(l.date)) continue;
      const code = (s: unknown) => /\b([A-Z]{3})\b/.exec(String(s ?? ''))?.[1] ?? str(s) ?? '?';
      const no = /\b([A-Z]{2}|[A-Z]\d|\d[A-Z])\s?(\d{2,4})\b/.exec(String(l.details ?? ''));
      const flightNo = no ? `${no[1]}${no[2]}` : undefined;
      upsertEvent(os, trip.id, `${tripKey}:leg:${l.id}`, `Flight ${code(l.from)} → ${code(l.to)}`, { kind: 'flight', startAt: at(String(l.date), String(l.time ?? '')), allDay: !str(l.time), location: `${str(l.from) ?? ''} → ${str(l.to) ?? ''}`, notes: str(l.details), ...(flightNo ? { flightNo, airline: AIRLINES[no![1]!] } : {}) });
      out.flights++;
    }

    // Each day's plan, as a Fact on the trip dated that day.
    const facts = os.facts.list({ subjectId: trip.id, limit: 1000 });
    for (const d of snap.days ?? []) {
      const plan = str(d.plan);
      if (!plan || !/^\d{4}-\d{2}-\d{2}$/.test(d.id)) continue;
      const ref = `${tripKey}:day:${d.id}`;
      const same = facts.find((f) => f.sourceRef === ref);
      if (same && same.text === plan) continue;
      if (same) os.facts.forget(same.id);
      os.facts.add({ text: plan, subjectId: trip.id, source: 'user', sourceRef: ref, statedAt: at(d.id, '12:00') });
      out.days++;
    }
  });
  return out;
}

/** A day's own plan lines: Facts on the trip whose source names the day ("…:day:2026-12-18"). */
export function dayPlans(os: LifeOSContext, tripId: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const f of os.facts.list({ subjectId: tripId, limit: 1000 })) {
    const day = /(?:^|:)day:(\d{4}-\d{2}-\d{2})$/.exec(f.sourceRef ?? '')?.[1];
    if (day && !out.has(day)) out.set(day, f.text);
  }
  return out;
}
