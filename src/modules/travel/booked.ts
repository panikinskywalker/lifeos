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
