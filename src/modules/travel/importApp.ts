import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import type { StopData, TripData } from './types';
import { ensureStop, stopsOf } from './stops';
import type { BookingStatus } from './booked';

/**
 * Bringing in a trip from its own trip app (MODEL.md layer 2, *The Japan trip
 * comes from the Japan app's data*): a snapshot of the app's database, shared
 * into LifeOS as a file and imported once. Each R7g slice imports its part;
 * slice 1 brings the trip, its stops (the app's places) and each day's plan as
 * a Fact on the trip; slice 2 its bookings with their money and status (stays,
 * each person's ticket, activities), flights and journeys between stops. Importing the same snapshot again updates what it made.
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
  /** Stays, tickets (kind flight: one per person), activities and others, with their payment fields merged in. */
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
  tickets: number;
  journeys: number;
  others: number;
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const at = (day: string, time: string) => new Date(`${day}T${/^\d{1,2}:\d{2}$/.test(time) ? time.padStart(5, '0') : '12:00'}:00`).getTime();
const AIRLINES: Record<string, string> = { VN: 'Vietnam Airlines', '6E': 'IndiGo', AI: 'Air India', NH: 'ANA', JL: 'Japan Airlines', SQ: 'Singapore Airlines' };

const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

/** "Shinano seats open 26 Nov" → that day at 10:00, in the year before the journey's day. */
export function seatsOpen(note: string, journeyDay: string): number | undefined {
  const m = /\bopen(?:s|ing)?\s+(?:on\s+)?(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*/i.exec(note);
  if (!m) return undefined;
  const year = Number(journeyDay.slice(0, 4));
  const pad = (n: number) => String(n).padStart(2, '0');
  const iso = (y: number) => `${y}-${pad(MONTHS[m[2]!.toLowerCase()]! + 1)}-${pad(Number(m[1]))}`;
  const day = iso(year) <= journeyDay ? iso(year) : iso(year - 1);
  return at(day, '10:00');
}

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
  const out: TripAppImport = { tripId: '', createdTrip: false, stops: 0, stays: 0, flights: 0, days: 0, tickets: 0, journeys: 0, others: 0 };
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

    // Bookings (R7g slice 2): stays, each person's ticket, activities and others, with their money and status.
    const STATUS: Record<string, BookingStatus> = { Confirmed: 'confirmed', Pending: 'pending', Planned: 'planned', Cancelled: 'cancelled' };
    const party = (name: unknown) => (typeof name !== 'string' || !name.trim() ? undefined : name === me ? 'me' : personFor(os, name) ?? undefined);
    const others = (names: unknown) => (Array.isArray(names) ? names.filter((x): x is string => typeof x === 'string' && x !== me).map((x) => personFor(os, x)).filter((x): x is string => !!x) : undefined);
    for (const b of snap.bookings ?? []) {
      if (!str(b.start) || !str(b.title)) continue;
      const money = { booking: STATUS[String(b.status)] ?? 'confirmed', cost: num(b.total), currency: str(b.currency), toPay: num(b.outstanding), paidBy: party(b.paidBy), payHow: str(b.payNote), reference: str(b.ref), bookingUrl: str(b.link), personIds: others(b.forWho), notes: [str(b.details), str(b.paid) ? `Paid: ${str(b.paid)}` : null].filter(Boolean).join('\n') || undefined };
      const key = `${tripKey}:booking:${b.id}`;
      if (b.kind === 'stay') {
        const stopId = stopOf.get(String(b.placeId ?? '')) ?? stopsOf(os, trip.id, ['stop', 'airport']).find((x) => x.title.toLowerCase() === String(b.place ?? '').toLowerCase())?.id;
        const place = stopId ? os.records.get(stopId)?.title : str(b.place);
        upsertEvent(os, trip.id, key, `Stay · ${b.title}`, { kind: 'stay', startAt: at(String(b.start), '15:00'), ...(str(b.end) ? { endAt: at(String(b.end), '11:00') } : {}), allDay: true, location: place, stopId, ...money, chargeOn: str(b.chargeOn), cancelBy: str(b.cancelBy), cancelNote: str(b.cancelNote), checkIn: str(b.checkIn), checkOut: str(b.checkOut), access: str(b.access), mapUrl: str(b.mapLink) });
        out.stays++;
      } else if (b.kind === 'flight') {
        upsertEvent(os, trip.id, key, `Ticket · ${b.title}`, { kind: 'ticket', startAt: at(String(b.start), '12:00'), ...(str(b.end) ? { endAt: at(String(b.end), '12:00') } : {}), allDay: true, location: str(b.place), ...money });
        out.tickets++;
      } else {
        upsertEvent(os, trip.id, key, String(b.title), { kind: b.kind === 'activity' ? 'activity' : 'other', startAt: at(String(b.start), '10:00'), ...(str(b.end) ? { endAt: at(String(b.end), '18:00') } : {}), allDay: true, location: str(b.place), ...money, cancelBy: str(b.cancelBy), cancelNote: str(b.cancelNote) });
        out.others++;
      }
    }

    // Journeys between stops, and flights (each leg).
    const PLAN: Record<string, string> = { Booked: 'booked', Suggested: 'suggested', 'Decided, not booked': 'decided', 'To decide': 'undecided' };
    for (const l of snap.transport ?? []) {
      if (!str(l.date)) continue;
      const day = String(l.date);
      if (l.mode === 'Flight') {
        const code = (x: unknown) => /\b([A-Z]{3})\b/.exec(String(x ?? ''))?.[1] ?? str(x) ?? '?';
        const no = /\b([A-Z]{2}|[A-Z]\d|\d[A-Z])\s?(\d{2,4})\b/.exec(String(l.details ?? ''));
        const flightNo = no ? `${no[1]}${no[2]}` : undefined;
        upsertEvent(os, trip.id, `${tripKey}:leg:${l.id}`, `Flight ${code(l.from)} → ${code(l.to)}`, { kind: 'flight', startAt: at(day, String(l.time ?? '')), allDay: !str(l.time), location: `${str(l.from) ?? ''} → ${str(l.to) ?? ''}`, notes: str(l.details), booking: l.status === 'Booked' ? 'confirmed' : undefined, ...(flightNo ? { flightNo, airline: AIRLINES[no![1]!] } : {}) });
        out.flights++;
        continue;
      }
      const leave = str(l.leaveBy) ?? str(l.time);
      const arrive = /(\d{1,2}:\d{2})/.exec(String(l.arriveAt ?? ''))?.[1];
      const title = `${str(l.from) ?? '?'} → ${str(l.to) ?? '?'}`;
      upsertEvent(os, trip.id, `${tripKey}:leg:${l.id}`, title, {
        kind: 'journey',
        startAt: at(day, leave ?? ''),
        ...(arrive ? { endAt: at(day, arrive) } : {}),
        allDay: !leave,
        location: title,
        fromStopId: stopOf.get(String(l.fromId ?? '')),
        toStopId: stopOf.get(String(l.toId ?? '')),
        mode: str(l.mode)?.toLowerCase(),
        plan: PLAN[String(l.status)] ?? undefined,
        fare: num(l.costPP),
        currency: str(l.costCur),
        estimate: l.estimate === true,
        takes: str(l.duration)?.replace(/^≈\s*/, ''),
        bookNote: str(l.bookNote),
        seatsOpenAt: seatsOpen(String(l.bookNote ?? ''), day),
        book: Array.isArray(l.book) ? (l.book as Array<{ label?: unknown; url?: unknown }>).filter((x) => str(x.url)).map((x) => ({ label: str(x.label) ?? 'Book', url: str(x.url)! })) : undefined,
        lastConnection: str(l.lastConnection),
        steps: str(l.timeline),
        notes: str(l.details),
      });
      out.journeys++;
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
