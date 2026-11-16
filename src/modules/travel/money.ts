import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import { balancesOf, owedOf, type Balances, type Party, type SplitSpec } from '@core/money/split';
import type { TripData } from './types';
import { isoOf } from './trips';
import { moneyOf, statusOf, tripJourneys, tripOthers, tripStays, tripTickets, type TravelEvent } from './booked';
import { thingsOf, thingStatus } from './outings';
import { nightsOf } from './stops';

/**
 * Money on a trip (the trip template, R7g slice 4; MODEL.md *Money on a trip*):
 * one ledger, as the Japan app keeps it. Paid (the trip's Bills, and what a
 * booking says is paid that no Bill covers), booked (bookings' still to pay)
 * and estimates (planned bookings, journeys' cost each, things that cost, the
 * daily allowance for the days to come), each shared among the people it
 * covers, in ₹. Bills are finance's Object, read here as records; the split
 * arithmetic is core's.
 */

export interface BillLike {
  kind: 'spend' | 'payment';
  amount: number;
  currency: string;
  inr?: number;
  rate?: number;
  date: string;
  category?: string;
  split: SplitSpec;
  eventId?: string;
  tripId?: string;
  groupId?: string;
  notes?: string;
}

export type Level = 'paid' | 'booked' | 'estimate';
export interface LedgerItem {
  cat: string;
  level: Level;
  inr: number;
  per: Record<Party, number>;
  label: string;
  ref?: string;
  /** A quiet note for the line ("4 nights"). */
  sub?: string;
}

/** You and the people travelling with you. */
export const tripParties = (trip: ObjectRecord<TripData>): Party[] => ['me', ...(trip.data.personIds ?? [])];

/** ₹ for one of a currency on this trip: 1 for ₹, the trip's rate for its local currency, else unknown. */
export const rateFor = (trip: ObjectRecord<TripData>, cur: string | undefined): number | null => (!cur || cur === 'INR' ? 1 : cur === trip.data.localCurrency && trip.data.fxRate ? trip.data.fxRate : null);

export const billInrOf = (b: Pick<BillLike, 'amount' | 'currency' | 'inr' | 'rate'>, trip?: ObjectRecord<TripData>) => b.inr ?? (b.currency === 'INR' ? b.amount : b.rate ? b.amount * b.rate : trip ? b.amount * (rateFor(trip, b.currency) ?? 0) : 0);

export function tripBills(os: LifeOSContext, tripId: string): ObjectRecord<BillLike>[] {
  if (!os.registry.objects.has('bill')) return [];
  return os.records
    .query<BillLike>('bill', { filter: { and: [{ field: 'data.tripId', op: 'eq', value: tripId }] } }, { limit: 5000 })
    .filter((b) => !b.archived)
    .sort((a, b) => b.data.date.localeCompare(a.data.date) || a.title.localeCompare(b.title));
}

const dayMs = (iso: string) => new Date(`${iso}T12:00:00`).getTime();
const addDay = (iso: string, n: number) => isoOf(dayMs(iso) + n * 86_400_000);
/** A stay's nights: check-in day to check-out day, at least one. */
function stayNights(e: ObjectRecord<TravelEvent>): string[] {
  const from = isoOf(e.data.startAt!);
  const to = e.data.endAt ? isoOf(e.data.endAt) : addDay(from, 1);
  const out: string[] = [];
  for (let d = from; d < to; d = addDay(d, 1)) out.push(d);
  return out.length ? out : [from];
}
const nightsWord = (e: ObjectRecord<TravelEvent>) => {
  const n = stayNights(e).length;
  return `${n} ${n === 1 ? 'night' : 'nights'}`;
};

const CAT: Record<string, string> = { stay: 'stays', ticket: 'flights', activity: 'other', other: 'other' };
const even = (inr: number, who: Party[]) => Object.fromEntries(who.map((p) => [p, inr / who.length]));

/** Who a booking covers: a ticket its person (you when none), anything else you and the others named. */
function covers(e: ObjectRecord<TravelEvent>, parties: Party[]): Party[] {
  const people = (e.data.personIds ?? []).filter((p) => parties.includes(p));
  if (e.data.kind === 'ticket') return people.length ? people : ['me'];
  return ['me', ...people];
}

export function tripLedger(os: LifeOSContext, trip: ObjectRecord<TripData>, now = Date.now()): LedgerItem[] {
  const parties = tripParties(trip);
  const n = parties.length;
  const items: LedgerItem[] = [];
  const bills = tripBills(os, trip.id);
  const billed = new Set(bills.filter((b) => b.data.kind === 'spend' && b.data.eventId).map((b) => b.data.eventId!));
  const push = (cat: string, level: Level, inr: number, per: Record<Party, number>, label: string, ref?: string, sub?: string) => {
    if (inr > 0.005) items.push({ cat, level, inr, per, label, ref, ...(sub ? { sub } : {}) });
  };
  for (const e of [...tripStays(os, trip.id), ...tripTickets(os, trip.id), ...tripOthers(os, trip.id)]) {
    const s = statusOf(e);
    if (s === 'cancelled') continue;
    const m = moneyOf(e);
    const rate = rateFor(trip, m.currency);
    if (m.total == null || rate == null) continue;
    const who = covers(e, parties);
    const cat = CAT[e.data.kind ?? 'other'] ?? 'other';
    const label = e.title.replace(/^(Stay|Ticket) · /, '');
    const sub = e.data.kind === 'stay' ? nightsWord(e) : undefined;
    if (s === 'planned') {
      push('planned', 'estimate', m.total * rate, even(m.total * rate, who), label, e.id, sub);
      continue;
    }
    if (!billed.has(e.id)) push(cat, 'paid', m.paid * rate, even(m.paid * rate, who), label, e.id, sub);
    push(cat, 'booked', m.toPay * rate, even(m.toPay * rate, who), label, e.id, sub);
  }
  for (const b of bills) {
    if (b.data.kind !== 'spend' || !b.data.amount) continue;
    const inr = billInrOf(b.data, trip);
    const f = inr / b.data.amount;
    const per = Object.fromEntries(Object.entries(owedOf(b.data.amount, b.data.split)).map(([p, v]) => [p, v * f]));
    push(b.data.category ?? 'other', 'paid', inr, per, b.title, b.id);
  }
  for (const j of tripJourneys(os, trip.id)) {
    const rate = rateFor(trip, j.data.currency ?? trip.data.localCurrency);
    if (j.data.fare && rate != null) push('transport', 'estimate', j.data.fare * rate * n, even(j.data.fare * rate * n, parties), j.title, j.id);
  }
  const lr = rateFor(trip, trip.data.localCurrency);
  for (const t of thingsOf(os, trip.id)) {
    if (!t.data.cost || lr == null || !['want', 'planned', 'done'].includes(thingStatus(t))) continue;
    push('things', 'estimate', t.data.cost * lr * n, even(t.data.cost * lr * n, parties), t.title, t.id);
  }
  const { startDate, endDate, dailyAllowance } = trip.data;
  if (dailyAllowance && lr != null && startDate && endDate) {
    const today = isoOf(now);
    const from = today > startDate ? today : startDate;
    const days = Math.max(0, Math.round((new Date(`${endDate}T12:00:00`).getTime() - new Date(`${from}T12:00:00`).getTime()) / 86_400_000));
    if (days) push('daily', 'estimate', dailyAllowance * lr * days * n, even(dailyAllowance * lr * days * n, parties), `${days} days × ${dailyAllowance.toLocaleString('en-US')} a person`);
  }
  return items;
}

export interface Projected {
  paid: number;
  booked: number;
  estimate: number;
  total: number;
}

/** The three levels, for one person (their part) or everyone (the whole). */
export function projectedOf(items: LedgerItem[], party?: Party): Projected {
  const p: Projected = { paid: 0, booked: 0, estimate: 0, total: 0 };
  for (const it of items) {
    const v = party ? it.per[party] ?? 0 : it.inr;
    p[it.level] += v;
    p.total += v;
  }
  return p;
}

export const CATEGORY_LABEL: Record<string, string> = { flights: 'Flights', stays: 'Stays', transport: 'Trains & buses', things: 'Things to do', daily: 'Daily spending', planned: 'Planned bookings', food: 'Food', fun: 'Fun', shopping: 'Shopping', other: 'Other' };

/** Where the money goes, biggest first, for one person or everyone. */
export function byCategory(items: LedgerItem[], party?: Party): Array<{ cat: string; inr: number; items: LedgerItem[] }> {
  const m = new Map<string, { cat: string; inr: number; items: LedgerItem[] }>();
  for (const it of items) {
    const v = party ? it.per[party] ?? 0 : it.inr;
    if (v <= 0.005) continue;
    const row = m.get(it.cat) ?? { cat: it.cat, inr: 0, items: [] };
    row.inr += v;
    row.items.push(it);
    m.set(it.cat, row);
  }
  return [...m.values()].sort((a, b) => b.inr - a.inr);
}

/** Everyone's balances from the trip's Bills, with the Group's Simplify debts. */
export function tripBalances(os: LifeOSContext, trip: ObjectRecord<TripData>): Balances {
  const simplify = trip.data.groupId ? !!os.records.get<{ simplifyDebts?: boolean }>(trip.data.groupId)?.data.simplifyDebts : false;
  return balancesOf(
    tripBills(os, trip.id).map((b) => ({ amount: b.data.amount, inr: billInrOf(b.data, trip), spec: b.data.split, payment: b.data.kind === 'payment' })),
    { simplify, parties: tripParties(trip) },
  );
}

/** Bookings with a paid part no Bill covers yet: offered to add to Settle up. */
export function notInSettleUp(os: LifeOSContext, trip: ObjectRecord<TripData>): Array<{ e: ObjectRecord<TravelEvent>; amount: number; currency: string }> {
  const billed = new Set(tripBills(os, trip.id).filter((b) => b.data.eventId).map((b) => b.data.eventId!));
  return [...tripStays(os, trip.id), ...tripTickets(os, trip.id), ...tripOthers(os, trip.id)]
    .filter((e) => statusOf(e) !== 'cancelled' && statusOf(e) !== 'planned' && !billed.has(e.id))
    .map((e) => ({ e, amount: moneyOf(e).paid, currency: moneyOf(e).currency }))
    .filter((x) => x.amount > 0.5);
}

/** The journeys table: date, journey, takes, cost each. */
export function journeysTable(os: LifeOSContext, trip: ObjectRecord<TripData>) {
  return tripJourneys(os, trip.id).map((j) => ({ id: j.id, day: isoOf(j.data.startAt!), title: j.title, mode: j.data.mode ?? null, takes: j.data.takes ?? null, fare: j.data.fare ?? null, currency: j.data.currency ?? trip.data.localCurrency ?? 'INR', estimate: !!j.data.estimate }));
}


/* ------------------------------------------------------------------ */
/* The Budget page's reading of the ledger (JP-Money)                   */
/* ------------------------------------------------------------------ */

/** A ledger line as the Budget page lists it: one per booking or spend, with how much of it is paid. */
export interface CategoryLine {
  ref?: string;
  label: string;
  sub?: string;
  inr: number;
  word: 'Paid' | 'Part paid' | 'To pay' | 'Estimate';
}

/** A category's lines, one per booking or spend (its paid and still-to-pay parts together), biggest first. */
export function categoryLines(items: LedgerItem[], party?: Party): CategoryLine[] {
  const m = new Map<string, { line: CategoryLine; paid: number; booked: number; estimate: number }>();
  items.forEach((it, i) => {
    const v = party ? it.per[party] ?? 0 : it.inr;
    if (v <= 0.005) return;
    const key = it.ref ? `${it.ref}` : `#${i}`;
    const row = m.get(key) ?? { line: { ref: it.ref, label: it.label, sub: it.sub, inr: 0, word: 'Paid' as const }, paid: 0, booked: 0, estimate: 0 };
    row.line.inr += v;
    row[it.level] += v;
    m.set(key, row);
  });
  return [...m.values()]
    .map(({ line, paid, booked, estimate }) => ({ ...line, word: estimate > 0.005 && !paid && !booked ? ('Estimate' as const) : booked > 0.005 ? (paid > 0.005 ? ('Part paid' as const) : ('To pay' as const)) : ('Paid' as const) }))
    .sort((a, b) => b.inr - a.inr);
}

/** One day of the trip, in ₹: what is projected (the allowance, the night's stay, the fares, things planned) and what was spent (Bills dated that day). */
export interface DayCost {
  day: string;
  projected: number;
  allowance: number;
  stay: number;
  fares: number;
  things: number;
  spent: number;
  /** Where you sleep that night (none on the last day). */
  stopId: string | null;
  /** A journey that day, and where it goes. */
  moving: boolean;
  toStopId: string | null;
}

/** Each day from Starts to Ends, for one person (their part) or everyone (the whole). */
export function costByDay(os: LifeOSContext, trip: ObjectRecord<TripData>, party?: Party): DayCost[] {
  const { startDate, endDate } = trip.data;
  if (!startDate || !endDate || endDate < startDate) return [];
  const parties = tripParties(trip);
  const n = parties.length;
  const lr = rateFor(trip, trip.data.localCurrency);
  const nights = nightsOf(os, trip);
  const days = new Map<string, DayCost>();
  for (let d = startDate; d <= endDate; d = addDay(d, 1)) {
    const night = nights.find((x) => x.day === d);
    days.set(d, { day: d, projected: 0, allowance: 0, stay: 0, fares: 0, things: 0, spent: 0, stopId: night?.stopId ?? null, moving: false, toStopId: null });
  }
  const perHead = (inr: number, who: Party[]) => (party ? (who.includes(party) ? inr / who.length : 0) : inr);
  if (trip.data.dailyAllowance && lr != null && (!party || parties.includes(party))) {
    for (const d of days.values()) d.allowance = trip.data.dailyAllowance * lr * (party ? 1 : n);
  }
  for (const e of tripStays(os, trip.id)) {
    if (statusOf(e) === 'cancelled') continue;
    const m = moneyOf(e);
    const rate = rateFor(trip, m.currency);
    if (m.total == null || rate == null) continue;
    const ns = stayNights(e);
    const each = perHead((m.total * rate) / ns.length, covers(e, parties));
    for (const d of ns) {
      const x = days.get(d);
      if (x) x.stay += each;
    }
  }
  for (const j of tripJourneys(os, trip.id)) {
    const x = days.get(isoOf(j.data.startAt!));
    if (!x) continue;
    x.moving = true;
    x.toStopId = j.data.toStopId ?? x.toStopId;
    const rate = rateFor(trip, j.data.currency ?? trip.data.localCurrency);
    if (j.data.fare && rate != null) x.fares += j.data.fare * rate * (party ? (parties.includes(party) ? 1 : 0) : n);
  }
  if (lr != null) {
    for (const t of thingsOf(os, trip.id)) {
      const x = t.data.day ? days.get(t.data.day) : undefined;
      if (!x || !t.data.cost || !['planned', 'done'].includes(thingStatus(t))) continue;
      x.things += t.data.cost * lr * (party ? (parties.includes(party) ? 1 : 0) : n);
    }
  }
  for (const b of tripBills(os, trip.id)) {
    const x = days.get(b.data.date);
    if (!x || b.data.kind !== 'spend' || !b.data.amount) continue;
    const inr = billInrOf(b.data, trip);
    x.spent += party ? (owedOf(b.data.amount, b.data.split)[party] ?? 0) * (inr / b.data.amount) : inr;
  }
  return [...days.values()].map((d) => ({ ...d, projected: d.allowance + d.stay + d.fares + d.things }));
}

/** A 7-day ordinary Japan Rail Pass, in yen (the price since October 2023). */
export const JR_PASS_7 = 50000;

/** What the Budget page's insight cards say, worked out from the ledger; each only when the data supports it. */
export type Insight =
  | { kind: 'priciest'; day: string; inr: number; fares: number; stay: number; stopId: string | null; toStopId: string | null }
  | { kind: 'railpass'; pass: number; fares: number; payOff: boolean; buses: number }
  | { kind: 'stops'; dearStopId: string; dearAvg: number; cheapStopId: string | null; cheapNight: number }
  | { kind: 'spare'; left: number; days: number; perDay: number };

export function moneyInsights(os: LifeOSContext, trip: ObjectRecord<TripData>, days: DayCost[], items: LedgerItem[], party?: Party, now = Date.now()): Insight[] {
  const out: Insight[] = [];
  const priced = days.filter((d) => d.projected > 0.5);
  if (priced.length >= 2) {
    const top = priced.reduce((a, b) => (b.projected > a.projected ? b : a));
    out.push({ kind: 'priciest', day: top.day, inr: top.projected, fares: top.fares, stay: top.stay, stopId: top.stopId, toStopId: top.toStopId });
  }
  if (trip.data.localCurrency === 'JPY') {
    const js = tripJourneys(os, trip.id).filter((j) => j.data.fare && (j.data.currency ?? 'JPY') === 'JPY');
    if (js.length >= 2) {
      const fares = js.reduce((a, j) => a + j.data.fare!, 0);
      out.push({ kind: 'railpass', pass: JR_PASS_7, fares, payOff: fares > JR_PASS_7, buses: js.filter((j) => /bus/i.test(j.data.mode ?? '')).length });
    }
  }
  const byStop = new Map<string, { total: number; stay: number; n: number }>();
  for (const d of days) {
    if (!d.stopId) continue;
    const s = byStop.get(d.stopId) ?? { total: 0, stay: 0, n: 0 };
    s.total += d.projected;
    s.stay += d.stay;
    s.n++;
    byStop.set(d.stopId, s);
  }
  if (byStop.size >= 2) {
    const all = [...byStop.entries()].map(([id, s]) => ({ id, avg: s.total / s.n, night: s.stay / s.n }));
    const dear = all.reduce((a, b) => (b.avg > a.avg ? b : a));
    const stays = all.filter((x) => x.night > 0.5 && x.id !== dear.id);
    const cheap = stays.length ? stays.reduce((a, b) => (b.night < a.night ? b : a)) : null;
    if (dear.avg > 0.5) out.push({ kind: 'stops', dearStopId: dear.id, dearAvg: dear.avg, cheapStopId: cheap?.id ?? null, cheapNight: cheap?.night ?? 0 });
  }
  const cap = trip.data.budget ? trip.data.budget * (party ? 1 : tripParties(trip).length) : 0;
  if (cap) {
    const left = cap - projectedOf(items, party).total;
    const today = isoOf(now);
    const ahead = days.filter((d) => d.day >= today).length;
    if (left > 0.5 && ahead) out.push({ kind: 'spare', left, days: ahead, perDay: left / ahead });
  }
  return out;
}

/** Things that cost, a person, in the local currency: the planned ones and the ones you want to (with how many have no price yet). */
export function thingsCost(os: LifeOSContext, tripId: string): { planned: { count: number; names: string[]; cost: number; ids: string[] }; want: { count: number; names: string[]; cost: number; unknown: number; ids: string[] } } {
  const out = { planned: { count: 0, names: [] as string[], cost: 0, ids: [] as string[] }, want: { count: 0, names: [] as string[], cost: 0, unknown: 0, ids: [] as string[] } };
  for (const t of thingsOf(os, tripId).sort((a, b) => (a.data.day ?? '9').localeCompare(b.data.day ?? '9') || a.title.localeCompare(b.title))) {
    if (t.data.kind === 'event' || t.data.cost === 0) continue;
    const s = thingStatus(t);
    const g = s === 'planned' || s === 'done' ? out.planned : s === 'want' ? out.want : null;
    if (!g) continue;
    if (g === out.planned && t.data.cost == null) continue;
    g.count++;
    g.names.push(t.title);
    g.ids.push(t.id);
    if (t.data.cost != null) g.cost += t.data.cost;
    else out.want.unknown++;
  }
  return out;
}

/** Cancelled bookings with money paid on them: the refund still to come, and each person's part. */
export function pendingRefunds(os: LifeOSContext, trip: ObjectRecord<TripData>): Array<{ e: ObjectRecord<TravelEvent>; inr: number; each: number }> {
  const parties = tripParties(trip);
  return [...tripStays(os, trip.id), ...tripTickets(os, trip.id), ...tripOthers(os, trip.id)]
    .filter((e) => statusOf(e) === 'cancelled')
    .map((e) => {
      const m = moneyOf(e);
      const inr = m.paid * (rateFor(trip, m.currency) ?? 0);
      return { e, inr, each: inr / covers(e, parties).length };
    })
    .filter((x) => x.inr > 0.5);
}
