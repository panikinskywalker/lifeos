import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import type { StopData, TripData } from './types';
import { DAY, isoOf, linkedTo } from './trips';
import { nightsOf, type Night } from './stops';

/**
 * A trip's bookings and journeys (the trip template, R7g slice 2; MODEL.md
 * *Event, new Fields for travel*): stays with what is paid and still to pay,
 * tickets with each person's fare, flights, journeys between stops, a day's
 * view, and the deadlines (seats open, free cancellation ends, cards charged).
 * All read from Events linked to the trip; projects owns the Object.
 */

export type BookingStatus = 'confirmed' | 'pending' | 'planned' | 'cancelled';

export interface TravelEvent {
  kind?: string;
  startAt?: number;
  endAt?: number;
  allDay?: boolean;
  location?: string;
  notes?: string;
  personIds?: string[];
  cost?: number;
  airline?: string;
  flightNo?: string;
  stopId?: string;
  booking?: BookingStatus;
  currency?: string;
  toPay?: number;
  paidBy?: string;
  payHow?: string;
  chargeOn?: string;
  cancelBy?: string;
  cancelNote?: string;
  checkIn?: string;
  checkOut?: string;
  access?: string;
  reference?: string;
  bookingUrl?: string;
  mapUrl?: string;
  fromStopId?: string;
  toStopId?: string;
  mode?: string;
  plan?: string;
  fare?: number;
  estimate?: boolean;
  takes?: string;
  bookNote?: string;
  seatsOpenAt?: number;
  book?: Array<{ label: string; url: string }>;
  lastConnection?: string;
  steps?: string;
  sourceKey?: string;
}

export const statusOf = (e: { data: Pick<TravelEvent, 'booking'> }): BookingStatus => e.data.booking ?? 'confirmed';
export const STATUS_LABEL: Record<BookingStatus, string> = { confirmed: 'Confirmed', pending: 'Pending', planned: 'Planned', cancelled: 'Cancelled' };

function events(os: LifeOSContext, tripId: string, kind: string): ObjectRecord<TravelEvent>[] {
  if (!os.registry.objects.has('event')) return [];
  return linkedTo<TravelEvent>(os, tripId, 'event')
    .filter((e) => e.data.kind === kind && e.data.startAt)
    .sort((a, b) => a.data.startAt! - b.data.startAt! || a.title.localeCompare(b.title));
}

export interface Money {
  currency: string;
  total: number | null;
  toPay: number;
  paid: number;
}

/** A booking's money in its own currency: the total, what is left, what is paid. */
export function moneyOf(e: ObjectRecord<TravelEvent>): Money {
  const total = e.data.cost ?? null;
  // Not told what is left: all of it, until a mail or you say otherwise.
  const toPay = Math.max(0, e.data.toPay ?? total ?? 0);
  return { currency: e.data.currency ?? 'INR', total, toPay, paid: total != null ? Math.max(0, total - toPay) : 0 };
}

/** "To pay", "Part paid", "Paid", or the status when it is not confirmed. */
export function payWord(e: ObjectRecord<TravelEvent>): string {
  const s = statusOf(e);
  if (s !== 'confirmed') return STATUS_LABEL[s];
  const m = moneyOf(e);
  if (m.total == null) return 'Confirmed';
  return m.toPay <= 0.5 ? 'Paid' : m.paid > 0.5 ? 'Part paid' : 'To pay';
}

export const tripStays = (os: LifeOSContext, tripId: string) => events(os, tripId, 'stay');
export const tripTickets = (os: LifeOSContext, tripId: string) => events(os, tripId, 'ticket');
export const tripFlights = (os: LifeOSContext, tripId: string) => events(os, tripId, 'flight');
export const tripJourneys = (os: LifeOSContext, tripId: string) => events(os, tripId, 'journey');
export const tripOthers = (os: LifeOSContext, tripId: string) => [...events(os, tripId, 'activity'), ...events(os, tripId, 'other')].sort((a, b) => a.data.startAt! - b.data.startAt!);

/** What is still to pay at the stays, and paid already, by currency (planned and cancelled ones left out). */
export function stayMoney(stays: ObjectRecord<TravelEvent>[]): { toPay: Record<string, number>; paid: Record<string, number> } {
  const out = { toPay: {} as Record<string, number>, paid: {} as Record<string, number> };
  for (const e of stays) {
    const s = statusOf(e);
    if (s === 'cancelled' || s === 'planned') continue;
    const m = moneyOf(e);
    out.toPay[m.currency] = (out.toPay[m.currency] ?? 0) + m.toPay;
    out.paid[m.currency] = (out.paid[m.currency] ?? 0) + m.paid;
  }
  return out;
}

/** Live stays with no check-in time yet. */
export const missingCheckIn = (stays: ObjectRecord<TravelEvent>[]) => stays.filter((e) => statusOf(e) !== 'cancelled' && !e.data.checkIn?.trim());

/** A journey's steps, one per line: "10:30 Check out" → { time: '10:30', what: 'Check out', note }. */
export function stepsOf(e: { data: Pick<TravelEvent, 'steps'> }): Array<{ time: string | null; what: string; note: string | null }> {
  return (e.data.steps ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const m = /^(≈?\d{1,2}:\d{2})\s+(.*)$/.exec(l);
      const [what, note] = (m ? m[2]! : l).split(/\s+\|\s+/);
      return { time: m ? m[1]! : null, what: what!.trim(), note: note?.trim() ?? null };
    });
}

/* ------------------------------------------------------------------ */
/* A day                                                                */
/* ------------------------------------------------------------------ */

export interface DayView {
  day: string;
  /** Day 1 is the trip's first day. */
  index: number;
  night: Night | null;
  stopId: string | null;
  /** The stop you wake up at (last night's). */
  fromStopId: string | null;
  checkIns: ObjectRecord<TravelEvent>[];
  checkOuts: ObjectRecord<TravelEvent>[];
  journeys: ObjectRecord<TravelEvent>[];
  flights: ObjectRecord<TravelEvent>[];
  /** Stays checking in today with something left to pay there. */
  toPay: ObjectRecord<TravelEvent>[];
}

/** One day of the trip: where you sleep, what you check in and out of, how you move, what to pay. */
export function dayView(os: LifeOSContext, trip: ObjectRecord<TripData>, day: string, nights = nightsOf(os, trip)): DayView {
  const start = trip.data.startDate ?? day;
  const i = nights.findIndex((n) => n.day === day);
  const night = i >= 0 ? nights[i]! : null;
  const prev = nights.slice(0, i < 0 ? nights.length : i).reverse().find((n) => n.stopId);
  const live = tripStays(os, trip.id).filter((e) => statusOf(e) !== 'cancelled');
  const on = (at: number | undefined) => !!at && isoOf(at) === day;
  const checkIns = live.filter((e) => on(e.data.startAt));
  return {
    day,
    index: Math.round((new Date(`${day}T12:00:00`).getTime() - new Date(`${start}T12:00:00`).getTime()) / DAY) + 1,
    night,
    stopId: night?.stopId ?? null,
    fromStopId: prev?.stopId ?? null,
    checkIns,
    checkOuts: live.filter((e) => on(e.data.endAt)),
    journeys: tripJourneys(os, trip.id).filter((e) => on(e.data.startAt)),
    flights: tripFlights(os, trip.id).filter((e) => on(e.data.startAt)),
    toPay: checkIns.filter((e) => moneyOf(e).toPay > 0.5),
  };
}

/* ------------------------------------------------------------------ */
/* Deadlines                                                            */
/* ------------------------------------------------------------------ */

export type DeadlineKind = 'seats' | 'cancel' | 'charge';
export interface Deadline {
  day: string;
  kind: DeadlineKind;
  eventId: string;
  title: string;
  line: string;
}

/** Seats opening, free cancellation ending and cards charged, from today on, soonest first. */
export function deadlines(os: LifeOSContext, trip: ObjectRecord<TripData>, now = Date.now()): Deadline[] {
  const today = isoOf(now);
  const out: Deadline[] = [];
  const name = (e: ObjectRecord<TravelEvent>) => e.title.replace(/^Stay · /, '');
  for (const e of tripJourneys(os, trip.id)) {
    if (e.data.seatsOpenAt && e.data.plan !== 'booked') out.push({ day: isoOf(e.data.seatsOpenAt), kind: 'seats', eventId: e.id, title: e.title, line: `Seats open: ${e.title}` });
  }
  for (const e of [...tripStays(os, trip.id), ...tripOthers(os, trip.id)]) {
    if (statusOf(e) === 'cancelled') continue;
    if (e.data.cancelBy) out.push({ day: e.data.cancelBy.slice(0, 10), kind: 'cancel', eventId: e.id, title: name(e), line: `${name(e)}: free cancellation ends${e.data.cancelNote ? ` ${e.data.cancelNote}` : ''}` });
    if (e.data.chargeOn && moneyOf(e).toPay > 0.5) out.push({ day: e.data.chargeOn.slice(0, 10), kind: 'charge', eventId: e.id, title: name(e), line: `${name(e)}: the card is charged` });
  }
  return out.filter((d) => d.day >= today).sort((a, b) => a.day.localeCompare(b.day) || a.kind.localeCompare(b.kind));
}

/** A stop's title, or null. */
export const stopTitle = (os: LifeOSContext, id: string | null | undefined) => (id ? os.records.get<StopData>(id)?.title ?? null : null);

/* ------------------------------------------------------------------ */
/* Flights: each leg's ends, and legs joined into a way there or home   */
/* ------------------------------------------------------------------ */

export interface AirportEnd {
  /** "Mumbai", "Tokyo Haneda": what is left of the end once the code and terminal are taken off. */
  city: string;
  code: string | null;
  terminal: string | null;
}

/** "Mumbai BOM T2" → { city: 'Mumbai', code: 'BOM', terminal: 'T2' }. */
export function airportEnd(s: string): AirportEnd {
  const t = s.trim();
  const m = /^(.*?)\s*\(?\b([A-Z]{3})\b\)?\s*(T\s?\d+[A-Z]?)?\s*$/.exec(t);
  if (!m) return { city: t, code: null, terminal: null };
  return { city: m[1]!.replace(/[\s,·-]+$/, '').trim() || m[2]!, code: m[2]!, terminal: m[3] ? m[3].replace(/\s/g, '') : null };
}

const MON = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

export interface FlightLeg {
  e: ObjectRecord<TravelEvent>;
  from: AirportEnd;
  to: AirportEnd;
  departAt: number;
  /** When it lands: the Event's end, else "lands 15:05 (on 18 Dec)" in its notes. */
  landAt: number | null;
}

/** A flight Event as a leg: where from and to, when it leaves and lands. */
export function flightLeg(e: ObjectRecord<TravelEvent>): FlightLeg {
  const [a, b] = (e.data.location ?? e.title.replace(/^Flight\s+/, '')).split(/\s*(?:→|->)\s*/);
  const departAt = e.data.startAt!;
  let landAt: number | null = e.data.endAt ?? null;
  if (landAt == null) {
    const m = /\b(?:lands?|landing|arriv\w*)\b[^0-9]{0,12}(\d{1,2}):(\d{2})(?:\D{0,6}?(\d{1,2})\s+([A-Za-z]{3}))?/i.exec(e.data.notes ?? '');
    if (m) {
      const d = new Date(departAt);
      const mon = m[4] ? MON.indexOf(m[4].toLowerCase()) : -1;
      const day = m[3] && mon >= 0 ? new Date(d.getFullYear() + (mon < d.getMonth() ? 1 : 0), mon, Number(m[3])) : new Date(d.getFullYear(), d.getMonth(), d.getDate());
      day.setHours(Number(m[1]), Number(m[2]), 0, 0);
      if (!(m[3] && mon >= 0) && day.getTime() < departAt) day.setDate(day.getDate() + 1);
      landAt = day.getTime();
    }
  }
  return { e, from: airportEnd(a ?? ''), to: airportEnd(b ?? ''), departAt, landAt };
}

export interface FlightTrip {
  legs: FlightLeg[];
  from: AirportEnd;
  to: AirportEnd;
  /** The airports changed at. */
  via: string[];
  departAt: number;
  landAt: number | null;
  flightNos: string[];
}

/** Legs joined into ways there and home: the next leg leaves from where the last one landed, within a day. */
export function flightTrips(flights: ObjectRecord<TravelEvent>[]): FlightTrip[] {
  const legs = flights.filter((e) => e.data.startAt && statusOf(e) !== 'cancelled').map(flightLeg).sort((x, y) => x.departAt - y.departAt);
  const groups: FlightLeg[][] = [];
  for (const l of legs) {
    const g = groups[groups.length - 1];
    const prev = g?.[g.length - 1];
    if (g && prev && prev.to.code && prev.to.code === l.from.code && l.departAt - (prev.landAt ?? prev.departAt) < DAY) g.push(l);
    else groups.push([l]);
  }
  return groups.map((g) => ({
    legs: g,
    from: g[0]!.from,
    to: g[g.length - 1]!.to,
    via: g.slice(1).map((l) => l.from.code ?? l.from.city),
    departAt: g[0]!.departAt,
    landAt: g[g.length - 1]!.landAt,
    flightNos: g.map((l) => l.e.data.flightNo).filter((x): x is string => !!x),
  }));
}

/* ------------------------------------------------------------------ */
/* A journey's long leg                                                 */
/* ------------------------------------------------------------------ */

export interface LongLeg {
  what: string;
  from: string | null;
  to: string | null;
  leave: string;
  /** The next step's time: an estimate. */
  arrive: string;
  minutes: number;
}

const mins = (t: string) => {
  const m = /(\d{1,2}):(\d{2})/.exec(t);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

// Steps that are not riding anything: a meal, a walk, a wait, checking in or out.
const STILL = /\b(lunch|dinner|breakfast|meal|walk|wait|check.?(in|out)|sightsee\w*|explore)\b/i;

/** The journey's longest timed ride (45 min or more, not a meal or a walk), with its stations when a step says "A → B". */
export function longLeg(e: { data: Pick<TravelEvent, 'steps'> }): LongLeg | null {
  const steps = stepsOf(e);
  let best: LongLeg | null = null;
  for (let i = 0; i < steps.length - 1; i++) {
    const s = steps[i]!;
    const n = steps[i + 1]!;
    const a = s.time ? mins(s.time) : null;
    const b = n.time ? mins(n.time) : null;
    if (a == null || b == null || b <= a) continue;
    const minutes = b - a;
    if (minutes < 45 || STILL.test(`${s.what} ${s.note ?? ''}`) || (best && best.minutes >= minutes)) continue;
    const arrow = [s.note, s.what].map((x) => /([^·|,→]+?)\s*(?:→|->)\s*([^·|,]+)/.exec(x ?? '')).find(Boolean);
    const words = /\bfrom\s+([A-Z][\w.' -]*?)(?:\s+to\s+([A-Z][\w.' -]*?))?(?=$|[,.;:·(]|\s+(?:toward|towards|via|for)\b)/.exec(s.what);
    const pair = arrow ?? (words ? [words[0], words[1], words[2] ?? null] : null);
    best = { what: s.what, from: pair?.[1]?.trim() ?? null, to: pair?.[2]?.trim() ?? null, leave: s.time!.replace(/^≈/, ''), arrive: n.time!.replace(/^≈/, ''), minutes };
  }
  return best;
}

/** "17:45" from "Last bus 17:45", and how long after arriving it is (minutes), or null. */
export function connectionMargin(e: { data: Pick<TravelEvent, 'lastConnection' | 'endAt'> }): number | null {
  const last = mins(e.data.lastConnection ?? '');
  if (last == null || !e.data.endAt) return null;
  const d = new Date(e.data.endAt);
  return last - (d.getHours() * 60 + d.getMinutes());
}

/* ------------------------------------------------------------------ */
/* Stays that overlap                                                   */
/* ------------------------------------------------------------------ */

export interface Overlap {
  cancel: ObjectRecord<TravelEvent>;
  keep: ObjectRecord<TravelEvent>;
  /** The day free cancellation ends for the one to cancel. */
  freeUntil: string | null;
}

/**
 * Live stays booked for the same night: the one to let go is the one still
 * free to cancel (the shorter one when both are), and the other is kept.
 */
export function overlappingStays(stays: ObjectRecord<TravelEvent>[], now = Date.now()): Overlap[] {
  const live = stays.filter((e) => (statusOf(e) === 'confirmed' || statusOf(e) === 'pending') && e.data.startAt && e.data.endAt);
  const out: Overlap[] = [];
  const seen = new Set<string>();
  const today = isoOf(now);
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i]!;
      const b = live[j]!;
      if (!(isoOf(a.data.startAt!) < isoOf(b.data.endAt!) && isoOf(b.data.startAt!) < isoOf(a.data.endAt!))) continue;
      const free = (e: ObjectRecord<TravelEvent>) => !!e.data.cancelBy && e.data.cancelBy.slice(0, 10) >= today;
      const len = (e: ObjectRecord<TravelEvent>) => e.data.endAt! - e.data.startAt!;
      const cancel = free(a) !== free(b) ? (free(a) ? a : b) : len(a) <= len(b) ? a : b;
      if (seen.has(cancel.id)) continue;
      seen.add(cancel.id);
      out.push({ cancel, keep: cancel === a ? b : a, freeUntil: cancel.data.cancelBy?.slice(0, 10) ?? null });
    }
  }
  return out;
}

/** Nights a stay covers (one at least). */
export const stayNights = (e: { data: Pick<TravelEvent, 'startAt' | 'endAt'> }) => (e.data.startAt && e.data.endAt ? Math.max(1, Math.round((new Date(`${isoOf(e.data.endAt)}T12:00:00`).getTime() - new Date(`${isoOf(e.data.startAt)}T12:00:00`).getTime()) / DAY)) : 1);
