import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import type { Party } from '@core/money/split';
import type { StopData, TripData } from './types';
import { DAY, isoOf } from './trips';
import { nightsOf, stopMark, stopsOf, stopSpan, type Night, type NightKind } from './stops';
import { dayView, moneyOf, statusOf, stepsOf, tripStays, type TravelEvent } from './booked';
import { happeningOn, thingStatus } from './outings';
import { normalsFor, type Normals, type Sky } from './weather';
import { tripBalances, tripBills, type LedgerItem } from './money';
import { PACKED_FOR } from './packing';

/**
 * The trip while you are away and after (the trip template, JP-Today,
 * JP-TodayPM, JP-Recap; JP-Parts 10 to 19 and 48 to 51): the day's track,
 * when to leave and the next leg (from the journey's steps), the last
 * connection, the rest of today, the cash and IC wallet, the stamps (a stop's
 * stamp is collected once its nights are over; derived, never stored), the
 * month's normals by the hour and the sunset, what to bring and pack, and the
 * recap: spent by stop, steps (Health's Measurements, read as records), settled
 * up, back home and what carries into the next trip.
 */

const pad = (n: number) => String(n).padStart(2, '0');
/** "09:05", local. */
export const hm = (t: number) => {
  const d = new Date(t);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
/** Minutes after midnight of the first time in a text ("≈11:00" → 660), or null. */
export function minutesOf(s: string | null | undefined): number | null {
  const m = /(\d{1,2}):(\d{2})/.exec(s ?? '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
/** The local time on a day, from minutes after midnight. */
export const atMinutes = (day: string, min: number) => new Date(`${day}T00:00:00`).getTime() + min * 60_000;
export const addDay = (day: string, n: number) => isoOf(new Date(`${day}T12:00:00`).getTime() + n * DAY);
const short = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const stayName = (e: ObjectRecord<TravelEvent>) => e.title.replace(/^Stay · /, '');

/** Good morning (before 12), afternoon (before 17), evening. */
export const greeting = (now: number) => {
  const h = new Date(now).getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

/** Morning until 14:00, or until a moving day's journey has arrived; afternoon after. */
export function halfOfDay(now: number, arriveAt?: number | null): 'morning' | 'afternoon' {
  if (new Date(now).getHours() >= 14) return 'afternoon';
  return arriveAt && now >= arriveAt ? 'afternoon' : 'morning';
}

/* ------------------------------------------------------------------ */
/* The day's track                                                      */
/* ------------------------------------------------------------------ */

export interface TrackCell {
  day: string;
  kind: NightKind;
  stopId: string | null;
  /** The stop's colour name ('wood'), or null for a gap or a plane. */
  color: string | null;
  when: 'past' | 'today' | 'future';
}

/** One cell a night of the trip, coloured by its stop; today's night is `today`. */
export function dayTrack(os: LifeOSContext, nights: Night[], today: string): TrackCell[] {
  const color = (id: string | null) => (id ? os.records.get<StopData>(id)?.data.color ?? null : null);
  return nights.map((n) => ({ day: n.day, kind: n.kind, stopId: n.stopId, color: color(n.stopId), when: n.day < today ? 'past' : n.day === today ? 'today' : 'future' }));
}

/* ------------------------------------------------------------------ */
/* Leaving, the next leg, the last connection                           */
/* ------------------------------------------------------------------ */

export interface LeaveBy {
  at: number;
  /** "10:30". */
  time: string;
  /** Whole seconds to go (0 once it is time). */
  seconds: number;
  /** The first step's line ("Check out of Inn A (by 10:30), walk 15 min to the station"). */
  what: string | null;
  note: string | null;
}

/**
 * When a journey leaves. A time the import could not read ("≈10:45") was kept
 * as noon: then the first leg's time from its steps stands in.
 */
export function departOf(journey: ObjectRecord<TravelEvent>): number | null {
  const { startAt, allDay } = journey.data;
  if (!startAt || allDay) return null;
  const d = new Date(startAt);
  if (d.getHours() !== 12 || d.getMinutes() !== 0) return startAt;
  const steps = stepsOf(journey).filter((x) => x.time);
  if (!steps.length || steps.some((x) => minutesOf(x.time) === 720)) return startAt;
  const leg = steps.find((x) => /→/.test(x.what)) ?? steps[0]!;
  return atMinutes(isoOf(startAt), minutesOf(leg.time)!);
}

/** When to leave for a journey with a time, and how long is left. */
export function leaveBy(journey: ObjectRecord<TravelEvent>, now: number): LeaveBy | null {
  const at = departOf(journey);
  if (!at) return null;
  const first = stepsOf(journey)[0];
  return { at, time: hm(at), seconds: Math.max(0, Math.round((at - now) / 1000)), what: first?.what ?? null, note: first?.note ?? null };
}

export interface Leg {
  at: number | null;
  time: string | null;
  approx: boolean;
  /** What runs ("Limited express Azusa"), from the words before the first station. */
  name: string;
  from: string | null;
  to: string | null;
  /** The next step's time, taken as the arrival. */
  arrive: string | null;
  arriveApprox: boolean;
  note: string | null;
  mode: 'train' | 'bus' | 'other';
}

const modeOf = (s: string): Leg['mode'] => (/\b(bus|shuttle|coach)\b/i.test(s) ? 'bus' : /\b(train|express|line|jr|shinkansen|rapid|limited|nagaden|kintetsu|nankai|metro|subway|railway|fujikyu)\b/i.test(s) ? 'train' : 'other');

/** The journey's legs: its steps with "A → B", with when each leaves and arrives. */
export function legsOf(journey: ObjectRecord<TravelEvent>): Leg[] {
  const day = journey.data.startAt ? isoOf(journey.data.startAt) : null;
  const steps = stepsOf(journey);
  const out: Leg[] = [];
  steps.forEach((s, i) => {
    const parts = s.what.split(/\s*→\s*/);
    if (parts.length < 2) return;
    const left = parts[0]!.trim().split(/\s+/);
    const from = left.length > 1 ? left.pop()! : null;
    const to = parts[1]!.split(/[,(|]/)[0]!.trim() || null;
    const next = steps.slice(i + 1).find((x) => x.time);
    const min = minutesOf(s.time);
    out.push({
      at: day && min != null ? atMinutes(day, min) : null,
      time: s.time ? s.time.replace('≈', '') : null,
      approx: !!s.time?.startsWith('≈'),
      name: left.join(' ') || s.what,
      from,
      to,
      arrive: next?.time ? next.time.replace('≈', '') : null,
      arriveApprox: !!next?.time?.startsWith('≈'),
      note: s.note,
      mode: modeOf(s.what),
    });
  });
  return out;
}

/** The next leg to catch (leaving from a couple of minutes ago on), else null. */
export function nextLeg(journey: ObjectRecord<TravelEvent>, now: number): Leg | null {
  return legsOf(journey).find((l) => l.at != null && l.at >= now - 2 * 60_000) ?? null;
}

/** The journey's last connection as a warning: a short title with its time, and the whole line. */
export function lastConnection(journey: ObjectRecord<TravelEvent>): { title: string; body: string; time: string | null } | null {
  const text = journey.data.lastConnection?.trim();
  if (!text) return null;
  const m = /(\d{1,2}:\d{2})/.exec(text);
  const time = m ? m[1]!.padStart(5, '0') : null;
  const first = text.split(/(?<=[.;])\s+/)[0]!.replace(/[.;]$/, '');
  const fits = first.length <= 44 && first !== text;
  return { title: fits ? first : time ? `Last connection · ${time}` : 'Last connection', body: fits ? text.slice(first.length).replace(/^[.;]\s*/, '') : text, time };
}

/* ------------------------------------------------------------------ */
/* The rest of today                                                    */
/* ------------------------------------------------------------------ */

export type AgendaTag = 'cash' | 'idea' | 'want' | 'planned' | 'heads-up' | null;
export interface AgendaItem {
  key: string;
  at: number | null;
  time: string | null;
  title: string;
  sub: string | null;
  tag: AgendaTag;
  kind: 'step' | 'flight' | 'check-in' | 'check-out' | 'thing' | 'last' | 'pack';
  /** The record it opens. */
  ref?: string;
  state: 'done' | 'now' | 'next' | 'later';
  /** While `now`: how far along until the next item (0 to 1), and the minutes left. */
  progress?: number;
  minutesLeft?: number;
}

export interface Agenda {
  day: string;
  items: AgendaItem[];
  done: AgendaItem[];
  rest: AgendaItem[];
}

const money0 = (n: number, cur: string) => `${cur === 'JPY' ? '¥' : cur === 'INR' ? '₹' : `${cur} `}${Math.round(n).toLocaleString(cur === 'INR' ? 'en-IN' : 'en-US')}`;

/** A day in order: the journey's steps, flights, checking in and out, things for the day, the last connection, packing for tomorrow; what is done, what is on now, what is next. */
export function dayAgenda(os: LifeOSContext, trip: ObjectRecord<TripData>, day: string, now: number, nights: Night[] = nightsOf(os, trip)): Agenda {
  const v = dayView(os, trip, day, nights);
  const items: Omit<AgendaItem, 'state'>[] = [];
  const stepText: string[] = [];
  for (const j of v.journeys) {
    stepsOf(j).forEach((s, i) => {
      const min = minutesOf(s.time);
      stepText.push(s.what);
      items.push({ key: `${j.id}:${i}`, at: min != null ? atMinutes(day, min) : null, time: s.time?.replace('≈', '') ?? null, title: s.what, sub: s.note, tag: null, kind: 'step', ref: j.id });
    });
    const last = lastConnection(j);
    if (last?.time) items.push({ key: `${j.id}:last`, at: atMinutes(day, minutesOf(last.time)!), time: last.time, title: last.title.startsWith('Last connection') ? 'Last connection' : last.title, sub: short(last.body || last.title, 90), tag: 'heads-up', kind: 'last', ref: j.id });
  }
  for (const f of v.flights) items.push({ key: f.id, at: f.data.allDay ? null : f.data.startAt!, time: f.data.allDay ? null : hm(f.data.startAt!), title: f.data.flightNo ? `${f.title} · ${f.data.flightNo}` : f.title, sub: f.data.location ?? null, tag: null, kind: 'flight', ref: f.id });
  const mentions = (re: RegExp) => stepText.some((t) => re.test(t));
  for (const e of v.checkOuts) {
    if (mentions(/check.?out/i)) continue;
    const min = minutesOf(e.data.checkOut) ?? 10 * 60;
    items.push({ key: `${e.id}:out`, at: atMinutes(day, min), time: hm(atMinutes(day, min)), title: `Check out of ${stayName(e)}`, sub: e.data.checkOut ? `by ${e.data.checkOut}` : null, tag: null, kind: 'check-out', ref: e.id });
  }
  for (const e of v.checkIns) {
    if (mentions(/check.?in/i)) continue;
    const min = minutesOf(e.data.checkIn) ?? 15 * 60;
    const m = moneyOf(e);
    const cash = /\bcash\b/i.test(e.data.payHow ?? '');
    items.push({ key: `${e.id}:in`, at: atMinutes(day, min), time: hm(atMinutes(day, min)), title: `Check in at ${stayName(e)}`, sub: m.toPay > 0.5 ? `pay ${money0(m.toPay, m.currency)}${cash ? ' in cash' : ''} at the desk` : e.data.checkIn ? `check-in ${e.data.checkIn}` : null, tag: cash && m.toPay > 0.5 ? 'cash' : null, kind: 'check-in', ref: e.id });
  }
  for (const t of happeningOn(os, trip, day, v.stopId).planned) {
    const st = thingStatus(t);
    if (st === 'done') continue;
    const min = minutesOf(t.data.quietest) ?? minutesOf(t.data.notes);
    const sub = [t.data.cost ? `${money0(t.data.cost, trip.data.localCurrency ?? 'INR')} each` : t.data.cost === 0 ? 'free' : null, t.data.quietest ? `quietest ${t.data.quietest}` : null].filter(Boolean).join(' · ') || (t.data.notes ? short(t.data.notes.split('\n')[0]!, 70) : null);
    items.push({ key: t.id, at: min != null ? atMinutes(day, min) : null, time: min != null ? hm(atMinutes(day, min)) : null, title: t.title, sub, tag: st === 'planned' ? 'planned' : st === 'want' ? 'want' : 'idea', kind: 'thing', ref: t.id });
  }
  const tomorrow = addDay(day, 1);
  const next = trip.data.endDate && tomorrow <= trip.data.endDate ? dayView(os, trip, tomorrow, nights).journeys[0] : undefined;
  if (next) {
    const to = next.data.toStopId ? os.records.get<StopData>(next.data.toStopId)?.title : null;
    const dep = departOf(next);
    const leave = dep ? hm(dep) : null;
    items.push({ key: `${next.id}:pack`, at: atMinutes(day, 21 * 60), time: '21:00', title: `Pack for ${to ?? 'tomorrow'}`, sub: leave ? `we leave at ${leave} tomorrow` : 'moving on tomorrow', tag: null, kind: 'pack', ref: next.id });
  }
  const timed = items.filter((x) => x.at != null).sort((a, b) => a.at! - b.at!);
  const untimed = items.filter((x) => x.at == null);
  const pack = timed.filter((x) => x.kind === 'pack');
  const ordered = [...timed.filter((x) => x.kind !== 'pack'), ...untimed, ...pack];
  const timedOnly = ordered.filter((x) => x.at != null);
  const out: AgendaItem[] = ordered.map((x) => {
    if (x.at == null) return { ...x, state: 'later' };
    const i = timedOnly.indexOf(x);
    const after = timedOnly[i + 1];
    if (x.at > now) return { ...x, state: 'next' };
    if (after && after.at! <= now) return { ...x, state: 'done' };
    if (x.kind !== 'step' && x.kind !== 'flight') return { ...x, state: 'done' };
    if (!after) return { ...x, state: now - x.at < 60 * 60_000 ? 'now' : 'done' };
    const span = after.at! - x.at;
    return { ...x, state: 'now', progress: span > 0 ? Math.min(1, (now - x.at) / span) : 1, minutesLeft: Math.max(0, Math.round((after.at! - now) / 60_000)) };
  });
  // Only the first upcoming item is "next"; the others wait.
  let seen = false;
  for (const x of out) {
    if (x.state !== 'next') continue;
    if (seen) x.state = 'later';
    seen = true;
  }
  return { day, items: out, done: out.filter((x) => x.state === 'done'), rest: out.filter((x) => x.state !== 'done') };
}

/* ------------------------------------------------------------------ */
/* Cash and the IC card                                                 */
/* ------------------------------------------------------------------ */

export interface Wallet {
  cash: number;
  ic: number;
  currency: string;
  /** Anything was ever told. */
  told: boolean;
}

export function walletOf(trip: ObjectRecord<TripData>): Wallet {
  const w = trip.data.wallet ?? {};
  return { cash: w.cash ?? 0, ic: w.ic ?? 0, currency: w.currency ?? trip.data.localCurrency ?? 'INR', told: w.cash != null || w.ic != null };
}

/** Add to (or, negative, take from) the cash or the IC card; never below zero. Returns its Undo. */
export function changeWallet(os: LifeOSContext, tripId: string, change: { cash?: number; ic?: number }): () => void {
  const trip = os.records.get<TripData>(tripId);
  if (!trip) throw new Error(`Trip ${tripId} not found`);
  const before = trip.data.wallet;
  const w = walletOf(trip);
  const next = { ...before, currency: w.currency, ...(change.cash != null ? { cash: Math.max(0, Math.round((w.cash + change.cash) * 100) / 100) } : {}), ...(change.ic != null ? { ic: Math.max(0, Math.round((w.ic + change.ic) * 100) / 100) } : {}) };
  os.records.update<TripData>(tripId, { data: { wallet: next } }, 'user');
  return () => {
    if (os.records.get(tripId)) os.records.update<TripData>(tripId, { data: { wallet: before } }, 'user');
  };
}

export interface CashNeed {
  amount: number;
  currency: string;
  /** The last day it is needed by. */
  by: string | null;
  items: Array<{ id: string; title: string; amount: number; day: string }>;
}

/** What must be paid in cash from today for `days` days: stays that take cash only, still to pay. */
export function cashNeed(os: LifeOSContext, trip: ObjectRecord<TripData>, today: string, days = 5): CashNeed {
  const currency = trip.data.localCurrency ?? 'INR';
  const end = addDay(today, days);
  const items = tripStays(os, trip.id)
    .filter((e) => {
      const s = statusOf(e);
      if (s === 'cancelled' || s === 'planned') return false;
      const d = isoOf(e.data.startAt!);
      return d >= today && d < end && /\bcash\b/i.test(e.data.payHow ?? '') && moneyOf(e).currency === currency && moneyOf(e).toPay > 0.5;
    })
    .map((e) => ({ id: e.id, title: stayName(e), amount: moneyOf(e).toPay, day: isoOf(e.data.startAt!) }));
  return { amount: items.reduce((s, x) => s + x.amount, 0), currency, by: items.length ? items[items.length - 1]!.day : null, items };
}

/* ------------------------------------------------------------------ */
/* Stamps                                                               */
/* ------------------------------------------------------------------ */

export interface Stamp {
  stop: ObjectRecord<StopData>;
  mark: string;
  color: string | null;
  /** 1 for the first stop on the line. */
  index: number;
  nights: number;
  from: string | null;
  to: string | null;
  /** Its nights are over (you checked out). */
  collected: boolean;
}

/** A stamp for every stop on the line, collected once its nights are over. */
export function stampsOf(os: LifeOSContext, trip: ObjectRecord<TripData>, today: string, nights: Night[] = nightsOf(os, trip)): Stamp[] {
  return stopsOf(os, trip.id).map((stop, i) => {
    const span = stopSpan(nights, stop.id);
    return { stop, mark: stopMark(stop, trip.data.look ?? (/japan/i.test(trip.data.destination ?? '') ? 'japan' : undefined)), color: stop.data.color ?? null, index: i + 1, nights: span?.nights ?? 0, from: span?.from ?? null, to: span?.to ?? null, collected: !!span && span.to <= today };
  });
}

/** The stamp pressed in today: the stop you checked out of this morning. */
export const stampToday = (stamps: Stamp[], today: string) => stamps.find((s) => s.to === today && s.collected) ?? null;

const NUM = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
/** "two nights", "a night", "12 nights". */
export const nightsWord = (n: number) => (n === 1 ? 'a night' : `${NUM[n] ?? n} nights`);

/* ------------------------------------------------------------------ */
/* The weather by the hour (the month's normals), the sun               */
/* ------------------------------------------------------------------ */

/** A stop's normals in the month of a day, from its name and local name. */
export function stopNormals(stop: Pick<ObjectRecord<StopData>, 'title' | 'data'> | null | undefined, day: string): Normals | null {
  if (!stop) return null;
  const month = Number(day.slice(5, 7));
  return normalsFor(`${stop.title} ${stop.data.localName ?? ''}`, month);
}

/** The usual temperature at a time of day from a day's high and low: the low near 05:00, the high near 14:00. */
export function tempAt(n: Pick<Normals, 'hi' | 'lo'>, minute: number): number {
  const m = ((minute % 1440) + 1440) % 1440;
  const rise = (x: number) => (1 - Math.cos(Math.PI * x)) / 2;
  if (m >= 300 && m <= 840) return n.lo + (n.hi - n.lo) * rise((m - 300) / 540);
  const since = m > 840 ? m - 840 : m + 600;
  return n.hi - (n.hi - n.lo) * rise(since / 900);
}

/** Hour by hour from an hour: the usual temperature, rounded. */
export const hourlyNormals = (n: Pick<Normals, 'hi' | 'lo'>, fromHour: number, count: number) => Array.from({ length: count }, (_, i) => ({ hour: (fromHour + i) % 24, temp: Math.round(tempAt(n, ((fromHour + i) % 24) * 60)) }));

export const SKY_WORD: Record<Sky, string> = { sun: 'Sun', cloud: 'Cloud', snow: 'Snow', rain: 'Rain' };

/** The hours from UTC where a pin is: Japan +9 and India +5:30 by box, else by longitude. */
export function tzHours(lat: number, lng: number): number {
  if (lat > 24 && lat < 46 && lng > 122 && lng < 154) return 9;
  if (lat > 6 && lat < 36 && lng > 68 && lng < 98) return 5.5;
  return Math.round(lng / 15);
}

/** Sunrise and sunset in minutes after local midnight (NOAA's approximation), or null near the poles. */
export function sunTimes(lat: number, lng: number, day: string, tz = tzHours(lat, lng)): { rise: number; set: number } | null {
  const d = new Date(`${day}T12:00:00Z`);
  const start = Date.UTC(d.getUTCFullYear(), 0, 1);
  const n = Math.floor((d.getTime() - start) / DAY) + 1;
  const g = ((2 * Math.PI) / 365) * (n - 1);
  const eq = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const rad = (x: number) => (x * Math.PI) / 180;
  const cos = Math.cos(rad(90.833)) / (Math.cos(rad(lat)) * Math.cos(decl)) - Math.tan(rad(lat)) * Math.tan(decl);
  if (cos < -1 || cos > 1) return null;
  const ha = (Math.acos(cos) * 180) / Math.PI;
  return { rise: Math.round(720 - 4 * (lng + ha) - eq + tz * 60), set: Math.round(720 - 4 * (lng - ha) - eq + tz * 60) };
}

/** A stop's pin, from its Place. */
export function stopPin(os: LifeOSContext, stop: ObjectRecord<StopData> | null | undefined): { lat: number; lng: number } | null {
  const id = stop?.data.placeId;
  const c = id ? os.records.get<{ coordinates?: { lat: number; lng: number } }>(id)?.data.coordinates : null;
  return c && typeof c.lat === 'number' && typeof c.lng === 'number' ? { lat: c.lat, lng: c.lng } : null;
}

/** "16:44" from minutes after midnight. */
export const clock = (min: number) => `${pad(Math.floor((((min % 1440) + 1440) % 1440) / 60))}:${pad(((min % 60) + 60) % 60)}`;

/* ------------------------------------------------------------------ */
/* Bring and pack                                                       */
/* ------------------------------------------------------------------ */

export interface BringPack {
  why: string;
  wear: string[];
  bag: string[];
  /** Packing tonight for tomorrow's stop (empty when you stay). */
  tonight: string[];
  tonightFor: string | null;
}

/** What to wear and carry today and pack tonight, from the month's normals here and at tomorrow's stop. */
export function bringAndPack(input: { here: string; normals: Normals | null; next?: { name: string; normals: Normals | null } | null; cashToday?: boolean; cashSymbol?: string; walking?: boolean }): BringPack {
  const n = input.normals;
  const wear: string[] = [];
  const bag: string[] = [];
  if (n?.sky === 'snow' || n?.sky === 'rain') wear.push('Waterproof layer');
  if (n && n.lo <= 3) wear.push('Gloves and beanie');
  if (n && n.hi <= 12) wear.push('Warm layer');
  if (n && n.hi >= 26) wear.push('Sun hat');
  wear.push('Walking shoes');
  if (input.cashToday) bag.push(`${input.cashSymbol ?? ''} cash`.trim());
  if (n && n.lo <= 3) bag.push('Hand warmers');
  if (n?.sky === 'rain') bag.push('Umbrella');
  bag.push('Water', 'Power bank');
  const tonight: string[] = [];
  const nx = input.next;
  if (nx) {
    if (n && nx.normals && nx.normals.hi >= n.hi + 2) tonight.push('Thermals to the bottom');
    else if (n && nx.normals && nx.normals.hi <= n.hi - 2) tonight.push('Warm layer on top');
    tonight.push('Day bag on top', 'Charger');
  }
  const sky = n ? (n.sky === 'snow' ? `snow is usual in ${input.here} this month` : n.sky === 'rain' ? `rain is usual in ${input.here} this month` : `${input.here} runs ${n.lo}° to ${n.hi}° this month`) : null;
  const then = nx?.normals && n ? (nx.normals.hi > n.hi + 1 ? `${nx.name} is warmer tomorrow` : nx.normals.hi < n.hi - 1 ? `${nx.name} is colder tomorrow` : `${nx.name} is much the same tomorrow`) : nx ? `you move to ${nx.name} tomorrow` : null;
  const why = [sky, then].filter(Boolean).join(', and ');
  return { why: why ? `${why.charAt(0).toUpperCase()}${why.slice(1)}.` : 'From the plan for today.', wear, bag, tonight, tonightFor: nx?.name ?? null };
}

/* ------------------------------------------------------------------ */
/* The recap                                                            */
/* ------------------------------------------------------------------ */

export interface StopSpend {
  stopId: string;
  title: string;
  mark: string;
  nights: number;
  total: number;
  perDay: number;
}

/**
 * What each stop cost a day, for one person (₹): its stays and the Bills dated
 * on its nights (paid and booked), over its nights. Flights and estimates are
 * the whole trip's and left out.
 */
export function spentByStop(os: LifeOSContext, trip: ObjectRecord<TripData>, items: LedgerItem[], party: Party = 'me', nights: Night[] = nightsOf(os, trip)): StopSpend[] {
  const byDay = new Map(nights.map((n) => [n.day, n.stopId]));
  const sum = new Map<string, number>();
  for (const it of items) {
    if (it.level === 'estimate' || !it.ref) continue;
    const r = os.records.get<{ stopId?: string; date?: string; kind?: string }>(it.ref);
    if (!r) continue;
    const stopId = r.object === 'event' ? (r.data.kind === 'stay' ? r.data.stopId : null) : r.object === 'bill' && r.data.date ? byDay.get(r.data.date) ?? null : null;
    if (!stopId) continue;
    sum.set(stopId, (sum.get(stopId) ?? 0) + (it.per[party] ?? 0));
  }
  const look = trip.data.look ?? (/japan/i.test(trip.data.destination ?? '') ? 'japan' : undefined);
  return stopsOf(os, trip.id).map((s) => {
    const n = stopSpan(nights, s.id)?.nights ?? 0;
    const total = sum.get(s.id) ?? 0;
    return { stopId: s.id, title: s.title, mark: stopMark(s, look), nights: n, total, perDay: n ? total / n : 0 };
  });
}

export interface TripSteps {
  total: number;
  perDay: number;
  days: Array<{ day: string; steps: number }>;
  /** The stop with the most steps a day. */
  topStopId: string | null;
}

/** Steps walked over the trip, from Health's step Measurements (read as records); null when none. */
export function tripSteps(os: LifeOSContext, trip: ObjectRecord<TripData>, nights: Night[] = nightsOf(os, trip)): TripSteps | null {
  const { startDate, endDate } = trip.data;
  if (!startDate || !endDate || !os.registry.objects.has('measurement')) return null;
  const rows = os.records.query<{ metric?: string; date?: string; value?: number }>('measurement', { filter: { and: [{ field: 'data.metric', op: 'eq', value: 'steps' }, { field: 'data.date', op: 'gte', value: startDate }, { field: 'data.date', op: 'lte', value: endDate }] } }, { limit: 2000 });
  const byDay = new Map<string, number>();
  for (const r of rows) if (r.data.date && typeof r.data.value === 'number') byDay.set(r.data.date, Math.max(byDay.get(r.data.date) ?? 0, r.data.value));
  if (!byDay.size) return null;
  const days = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, steps]) => ({ day, steps }));
  const total = days.reduce((s, d) => s + d.steps, 0);
  const stopOf = new Map(nights.map((n) => [n.day, n.stopId]));
  const per = new Map<string, { s: number; n: number }>();
  for (const d of days) {
    const id = stopOf.get(d.day);
    if (!id) continue;
    const x = per.get(id) ?? { s: 0, n: 0 };
    per.set(id, { s: x.s + d.steps, n: x.n + 1 });
  }
  const top = [...per.entries()].sort((a, b) => b[1].s / b[1].n - a[1].s / a[1].n)[0]?.[0] ?? null;
  return { total, perDay: total / days.length, days, topStopId: top };
}

export interface Settled {
  settled: boolean;
  paybacks: number;
  lastPayback: string | null;
  debts: Array<{ from: Party; to: Party; amount: number }>;
}

/** Whether everyone is square on the trip's Bills, and the paybacks recorded. */
export function settledOf(os: LifeOSContext, trip: ObjectRecord<TripData>): Settled {
  const b = tripBalances(os, trip);
  const pays = tripBills(os, trip.id).filter((x) => x.data.kind === 'payment');
  const debts = b.debts.filter((d) => d.amount >= 1);
  return { settled: !debts.length, paybacks: pays.length, lastPayback: pays.map((p) => p.data.date).sort().pop() ?? null, debts };
}

/** Clothes still packed for the trip (Back home?). */
export function packedClothes(os: LifeOSContext, tripId: string): Array<{ id: string; title: string }> {
  return os.links
    .forEntity(tripId, PACKED_FOR)
    .filter((r) => r.direction === 'in')
    .map((r) => os.records.get<{ state?: string }>(r.other.id))
    .filter((a): a is ObjectRecord<{ state?: string }> => !!a && a.data.state === 'packed')
    .map((a) => ({ id: a.id, title: a.title }))
    .sort((a, b) => a.title.localeCompare(b.title));
}

/** These packed clothes go in the wash (the *packed for* Links stay, as what you took). Returns its Undo. */
export function toTheWash(os: LifeOSContext, ids: string[]): () => void {
  const moved = ids.filter((id) => os.records.get<{ state?: string }>(id)?.data.state === 'packed');
  for (const id of moved) os.records.update(id, { data: { state: 'wash' } }, 'user');
  return () => {
    for (const id of moved) if (os.records.get(id)) os.records.update(id, { data: { state: 'packed' } }, 'user');
  };
}

export type KeepKey = 'packing' | 'todo' | 'group';
/** What carries into a trip started from this one: the packing list and the to-do list unless turned off, the group only when turned on. */
export const keepOf = (trip: ObjectRecord<TripData>): Record<KeepKey, boolean> => ({ packing: trip.data.keep?.packing ?? true, todo: trip.data.keep?.todo ?? true, group: trip.data.keep?.group ?? false });

export function setKeep(os: LifeOSContext, tripId: string, key: KeepKey, on: boolean): () => void {
  const trip = os.records.get<TripData>(tripId);
  if (!trip) throw new Error(`Trip ${tripId} not found`);
  const before = trip.data.keep;
  os.records.update<TripData>(tripId, { data: { keep: { ...keepOf(trip), [key]: on } } }, 'user');
  return () => {
    if (os.records.get(tripId)) os.records.update<TripData>(tripId, { data: { keep: before } }, 'user');
  };
}

/** The moves of the trip: the times the stop changes from one night to the next. */
export const movesOf = (nights: Night[]) => {
  let n = 0;
  let prev: string | null = null;
  for (const x of nights) {
    if (x.stopId && prev && x.stopId !== prev) n++;
    if (x.stopId) prev = x.stopId;
  }
  return n;
};
