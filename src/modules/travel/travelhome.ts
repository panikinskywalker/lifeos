import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import type { StopData, TripData } from './types';
import { DAY, daysToStart, tripDays, tripPhase, trips, tripSpend } from './trips';
import { nightsOf } from './stops';
import { statusOf, tripFlights, tripStays, tripTickets, type TravelEvent } from './booked';
import { projectedOf, tripLedger } from './money';
import { notesOf } from './prep';

/**
 * The Travel home (JP-Travel, "Travel · all trips") and the view-only trip
 * (JP-ViewOnly), as data: the next trip's card (its stage, the countdown,
 * what each person is projected to spend against the budget, its most urgent
 * note), the other trips coming up, the trips you have been on with what they
 * cost you, the year in three numbers, and a trip's flights as journeys.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const parts = (iso: string) => ({ y: Number(iso.slice(0, 4)), m: Number(iso.slice(5, 7)) - 1, d: Number(iso.slice(8, 10)) });

/** "12–15 Feb", "28 Dec–2 Jan", "14–17 Mar 2025" (the year when it is not this one); "No dates yet". */
export function homeDates(d: Pick<TripData, 'startDate' | 'endDate'>, now = Date.now()): string {
  if (!d.startDate) return 'No dates yet';
  const a = parts(d.startDate);
  const b = parts(d.endDate && d.endDate >= d.startDate ? d.endDate : d.startDate);
  const year = b.y !== new Date(now).getFullYear() ? ` ${b.y}` : '';
  if (d.startDate === (d.endDate ?? d.startDate)) return `${a.d} ${MONTHS[a.m]}${year}`;
  return a.m === b.m && a.y === b.y ? `${a.d}–${b.d} ${MONTHS[b.m]}${year}` : `${a.d} ${MONTHS[a.m]}–${b.d} ${MONTHS[b.m]}${year}`;
}

/** "17 DEC – 7 JAN", the card's mono dates. */
export function monoDates(d: Pick<TripData, 'startDate' | 'endDate'>): string {
  if (!d.startDate) return 'NO DATES YET';
  const one = (iso: string) => `${parts(iso).d} ${MONTHS[parts(iso).m]!.toUpperCase()}`;
  return d.endDate && d.endDate !== d.startDate ? `${one(d.startDate)} – ${one(d.endDate)}` : one(d.startDate);
}

/* ------------------------------------------------------------------ */
/* Stage                                                               */
/* ------------------------------------------------------------------ */

export type HomeStage = 'plan' | 'book' | 'prep' | 'travel' | 'home';

/**
 * Where the trip is: home once back, travel while away, plan with nothing
 * booked (or no dates), book while a night has no bed or a stay is only
 * planned, else prep.
 */
export function tripStageOf(os: LifeOSContext, trip: ObjectRecord<TripData>, now = Date.now()): HomeStage {
  const phase = tripPhase(trip.data, now);
  if (phase === 'back') return 'home';
  if (phase === 'away') return 'travel';
  if (phase === 'undated') return 'plan';
  const live = (e: ObjectRecord<TravelEvent>) => statusOf(e) !== 'cancelled' && statusOf(e) !== 'planned';
  const booked = [...tripStays(os, trip.id), ...tripFlights(os, trip.id), ...tripTickets(os, trip.id)].filter(live);
  if (!booked.length) return 'plan';
  const nights = nightsOf(os, trip);
  if (nights.some((n) => n.kind === 'gap' || n.planned)) return 'book';
  return 'prep';
}

/* ------------------------------------------------------------------ */
/* Money                                                               */
/* ------------------------------------------------------------------ */

/**
 * What a trip cost you, in ₹: your part of what is paid on its ledger (and,
 * once back, what was still to pay there, since it has been paid by now);
 * a trip with no ledger counts the expenses linked to it.
 */
export function spentOnTrip(os: LifeOSContext, trip: ObjectRecord<TripData>, now = Date.now()): number {
  const p = projectedOf(tripLedger(os, trip, now), 'me');
  const own = tripPhase(trip.data, now) === 'back' ? p.paid + p.booked : p.paid;
  if (own > 0.5) return Math.round(own);
  return Math.round(tripSpend(os, trip, now).spent);
}

/* ------------------------------------------------------------------ */
/* The next trip's card                                                */
/* ------------------------------------------------------------------ */

export interface NextTripCard {
  trip: ObjectRecord<TripData>;
  stage: HomeStage;
  /** Days to go (0 today); null undated. */
  days: number | null;
  /** While away: which day of the trip it is (1 is the first). */
  dayOf: number | null;
  /** Your part of everything, paid, booked and estimated, in ₹. */
  projectedEach: number;
  /** The budget per person, in ₹. */
  budget: number | null;
  /** The most urgent open note, and how many more there are. */
  note: { id: string; title: string; body: string | null; priority: string } | null;
  moreNotes: number;
}

export function nextTripCard(os: LifeOSContext, trip: ObjectRecord<TripData>, now = Date.now()): NextTripCard {
  const notes = notesOf(os, trip.id);
  const top = notes[0];
  const until = daysToStart(trip.data, now);
  const away = tripPhase(trip.data, now) === 'away';
  return {
    trip,
    stage: tripStageOf(os, trip, now),
    days: until,
    dayOf: away && until != null ? 1 - until : null,
    projectedEach: Math.round(projectedOf(tripLedger(os, trip, now), 'me').total),
    budget: trip.data.budget ?? null,
    note: top ? { id: top.id, title: top.title, body: top.data.notes?.split('\n')[0]?.trim() || null, priority: top.data.priority ?? 'medium' } : null,
    moreNotes: Math.max(0, notes.length - 1),
  };
}

/* ------------------------------------------------------------------ */
/* All trips                                                           */
/* ------------------------------------------------------------------ */

export interface TripRow {
  trip: ObjectRecord<TripData>;
  /** You and the people going. */
  people: number;
  /** Days to go; null undated or begun. */
  days: number | null;
  /** The first stay's name, when there is one. */
  stay: string | null;
  /** What it cost you (trips you have been on). */
  spent: number;
}

export interface TravelHomeData {
  count: number;
  next: NextTripCard | null;
  /** Other trips not over yet, soonest first, undated last. */
  coming: TripRow[];
  /** Trips you are back from, newest first. */
  been: TripRow[];
  year: { year: number; trips: number; nights: number; spent: number };
}

const peopleOf = (t: ObjectRecord<TripData>) => 1 + (t.data.personIds?.length ?? 0);
const firstStay = (os: LifeOSContext, tripId: string) => {
  const s = tripStays(os, tripId).find((e) => statusOf(e) !== 'cancelled');
  return s ? s.title.replace(/^Stay · /, '') : null;
};

/** Everything the Travel home shows. */
export function travelHomeOf(os: LifeOSContext, now = Date.now()): TravelHomeData {
  const all = trips(os);
  const nextTrip = all.find((t) => tripPhase(t.data, now) === 'away') ?? all.find((t) => tripPhase(t.data, now) === 'upcoming') ?? null;
  const row = (t: ObjectRecord<TripData>, spent = 0): TripRow => ({ trip: t, people: peopleOf(t), days: tripPhase(t.data, now) === 'upcoming' ? daysToStart(t.data, now) : null, stay: firstStay(os, t.id), spent });
  const phase = (t: ObjectRecord<TripData>) => tripPhase(t.data, now);
  const coming = [...all.filter((t) => t.id !== nextTrip?.id && (phase(t) === 'upcoming' || phase(t) === 'away')), ...all.filter((t) => phase(t) === 'undated')].map((t) => row(t));
  const been = all
    .filter((t) => phase(t) === 'back')
    .sort((a, b) => (b.data.endDate ?? b.data.startDate ?? '').localeCompare(a.data.endDate ?? a.data.startDate ?? ''))
    .map((t) => row(t, spentOnTrip(os, t, now)));
  const y = new Date(now).getFullYear();
  const thisYear = all.filter((t) => t.data.startDate?.startsWith(String(y)));
  return {
    count: all.length,
    next: nextTrip ? nextTripCard(os, nextTrip, now) : null,
    coming,
    been,
    year: {
      year: y,
      trips: thisYear.length,
      nights: thisYear.reduce((n, t) => n + Math.max(0, (tripDays(t.data) ?? 1) - 1), 0),
      spent: thisYear.reduce((n, t) => n + spentOnTrip(os, t, now), 0),
    },
  };
}

/* ------------------------------------------------------------------ */
/* Flights as journeys (the boarding-pass card)                         */
/* ------------------------------------------------------------------ */

export interface ViewFlightLeg {
  id: string;
  from: string;
  to: string;
  departAt: number;
  /** When it lands, read from its notes ("lands 05:05 on 18 Dec"); null when not said. */
  arriveAt: number | null;
  flightNo: string | null;
  airline: string | null;
  confirmed: boolean;
}

export interface ViewFlightJourney {
  legs: ViewFlightLeg[];
  from: string;
  to: string;
  /** The airports changed at. */
  via: string[];
  departAt: number;
  arriveAt: number | null;
}

const CODE = /\b([A-Z]{3})\b/;
const LANDS = /\b(?:lands|arrives?|arr\.?)\s+(\d{1,2}):(\d{2})(?:\s+on\s+(\d{1,2})\s+([A-Z][a-z]{2}))?/i;

/** When a leg lands: the time its notes give, on the day they say, else the same day (or the next, past midnight). */
export function legLandsAt(notes: string | undefined, departAt: number): number | null {
  const m = LANDS.exec(notes ?? '');
  if (!m) return null;
  const dep = new Date(departAt);
  const at = new Date(dep.getFullYear(), dep.getMonth(), dep.getDate(), Number(m[1]), Number(m[2]));
  if (m[3] && m[4]) {
    const mi = MONTHS.findIndex((x) => x.toLowerCase() === m[4]!.toLowerCase());
    if (mi >= 0) {
      at.setMonth(mi, Number(m[3]));
      if (at.getTime() < departAt - DAY) at.setFullYear(at.getFullYear() + 1);
    }
  } else if (at.getTime() <= departAt) at.setDate(at.getDate() + 1);
  return at.getTime();
}

/** The trip's flight legs joined into journeys: a leg leaving where the last one landed, within a day, carries on. */
export function viewFlights(os: LifeOSContext, tripId: string): ViewFlightJourney[] {
  const legs: ViewFlightLeg[] = tripFlights(os, tripId)
    .filter((e) => statusOf(e) !== 'cancelled')
    .map((e) => {
      const [a, b] = e.title.replace(/^Flight\s+/, '').split(/\s*→\s*/);
      return {
        id: e.id,
        from: CODE.exec(a ?? '')?.[1] ?? (a ?? '?').trim(),
        to: CODE.exec(b ?? '')?.[1] ?? (b ?? '?').trim(),
        departAt: e.data.startAt!,
        arriveAt: e.data.endAt ?? legLandsAt(e.data.notes, e.data.startAt!),
        flightNo: e.data.flightNo ?? null,
        airline: e.data.airline ?? null,
        confirmed: statusOf(e) === 'confirmed',
      };
    });
  const out: ViewFlightJourney[] = [];
  for (const l of legs) {
    const last = out[out.length - 1];
    const prev = last?.legs[last.legs.length - 1];
    if (last && prev && prev.to === l.from && l.departAt - (prev.arriveAt ?? prev.departAt) < DAY && l.departAt >= prev.departAt) {
      last.legs.push(l);
      last.via.push(l.from);
      last.to = l.to;
      last.arriveAt = l.arriveAt;
    } else out.push({ legs: [l], from: l.from, to: l.to, via: [], departAt: l.departAt, arriveAt: l.arriveAt });
  }
  return out;
}

/** "18 DEC 15:05": a time on the boarding pass. */
export function viewPassTime(at: number): string {
  const d = new Date(at);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getDate()} ${MONTHS[d.getMonth()]!.toUpperCase()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** "18 Dec–22 Dec": a stay's nights. */
export function viewStayDates(e: Pick<ObjectRecord<TravelEvent>, 'data'>): string {
  const one = (t: number) => `${new Date(t).getDate()} ${MONTHS[new Date(t).getMonth()]}`;
  if (!e.data.startAt) return '';
  return e.data.endAt ? `${one(e.data.startAt)}–${one(e.data.endAt)}` : one(e.data.startAt);
}

/** A stay's stop (for its mark and colour), or null. */
export function viewStayStop(os: LifeOSContext, e: Pick<ObjectRecord<TravelEvent>, 'data'>): ObjectRecord<StopData> | null {
  return (e.data.stopId ? os.records.get<StopData>(e.data.stopId) : null) ?? null;
}

