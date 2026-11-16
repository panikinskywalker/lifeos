import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import { balancesOf, owedOf, type Balances, type Party, type SplitSpec } from '@core/money/split';
import type { TripData } from './types';
import { isoOf } from './trips';
import { moneyOf, statusOf, tripJourneys, tripOthers, tripStays, tripTickets, type TravelEvent } from './booked';
import { thingsOf, thingStatus } from './outings';

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
  const push = (cat: string, level: Level, inr: number, per: Record<Party, number>, label: string, ref?: string) => {
    if (inr > 0.005) items.push({ cat, level, inr, per, label, ref });
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
    if (s === 'planned') {
      push('planned', 'estimate', m.total * rate, even(m.total * rate, who), label, e.id);
      continue;
    }
    if (!billed.has(e.id)) push(cat, 'paid', m.paid * rate, even(m.paid * rate, who), label, e.id);
    push(cat, 'booked', m.toPay * rate, even(m.toPay * rate, who), label, e.id);
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
  return tripJourneys(os, trip.id).map((j) => ({ id: j.id, day: isoOf(j.data.startAt!), title: j.title, takes: j.data.takes ?? null, fare: j.data.fare ?? null, currency: j.data.currency ?? trip.data.localCurrency ?? 'INR', estimate: !!j.data.estimate }));
}

