import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBetterSqliteAdapter } from '@core/db/betterSqliteAdapter';
import { createLifeOS } from '@core/lifeos';
import { Registry } from '@core/registry/registry';
import type { LifeOSContext } from '@core/registry/context';
import { bus } from '@core/events/bus';
import { balancesOf, owedOf, splitProblem, type LedgerEntry } from '@core/money/split';
import { crmModule } from '../crm';
import { financeModule, makeBill, makePayment, billBalanceWith } from '../finance';
import { balanceWith, settleUp, undoSettle } from '../finance/split';
import { projectsModule } from '../projects';
import { placesModule } from '../places';
import { byCategory, checklistOf, emergencyFor, filterChecklist, importTripApp, notesOf, notInSettleUp, projectedOf, readyToFly, sectionsOf, travelModule, tripBalances, tripLedger, TRIP_APP_FORMAT, type TripAppSnapshot, type TripData } from '.';

/**
 * The trip template, slices 4 and 5: money shared Splitwise's way (core's
 * arithmetic, finance's Bill, the trip's ledger) and prep (the checklist,
 * notes, ready to fly, emergency numbers). The snapshot is made up in the
 * Japan app's shape.
 */

let os: LifeOSContext;
beforeEach(async () => {
  bus.clear();
  os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules: [crmModule, financeModule, projectsModule, placesModule, travelModule], registry: new Registry() });
});
afterEach(() => os.db.close());

describe('splitting, as Splitwise does', () => {
  it('five ways to split; the shares always add up', () => {
    expect(owedOf(100, { method: 'equal', shares: { a: 1, b: 1, c: 1 } })).toEqual({ a: 33.33, b: 33.33, c: 33.34 });
    expect(owedOf(100, { method: 'exact', shares: { a: 70, b: 30 } })).toEqual({ a: 70, b: 30 });
    expect(owedOf(200, { method: 'percent', shares: { a: 25, b: 75 } })).toEqual({ a: 50, b: 150 });
    expect(owedOf(90, { method: 'shares', shares: { a: 2, b: 1 } })).toEqual({ a: 60, b: 30 });
    expect(owedOf(90, { method: 'adjust', shares: { a: 15, b: 0, c: 0 } })).toEqual({ a: 40, b: 25, c: 25 });
    expect(splitProblem(100, { payers: { a: 90 }, method: 'equal', shares: { a: 1 } })).toBe('What each person paid must add up to the amount.');
    expect(splitProblem(100, { payers: { a: 100 }, method: 'percent', shares: { a: 50, b: 40 } })).toBe('The percentages must add up to 100%.');
  });

  it('balances pair by pair or simplified; a payback evens them and is nobody’s spend', () => {
    const entries: LedgerEntry[] = [
      { amount: 300, inr: 300, spec: { payers: { a: 300 }, method: 'equal' as const, shares: { a: 1, b: 1, c: 1 } } },
      { amount: 90, inr: 90, spec: { payers: { b: 90 }, method: 'equal' as const, shares: { b: 1, c: 1 } } },
    ];
    const pairs = balancesOf(entries);
    expect(pairs.net).toEqual({ a: 200, b: -55, c: -145 });
    expect(pairs.debts).toEqual([{ from: 'b', to: 'a', amount: 100 }, { from: 'c', to: 'a', amount: 100 }, { from: 'c', to: 'b', amount: 45 }]);
    expect(balancesOf(entries, { simplify: true }).debts).toEqual([{ from: 'c', to: 'a', amount: 145 }, { from: 'b', to: 'a', amount: 55 }]);
    const paid = balancesOf([...entries, { amount: 145, inr: 145, spec: { payers: { c: 145 }, method: 'exact' as const, shares: { a: 145 } }, payment: true }], { simplify: true });
    expect(paid.debts).toEqual([{ from: 'b', to: 'a', amount: 55 }]);
    expect(paid.share.c).toBe(145);
  });
});

describe('Bill, and People’s balances', () => {
  it('a Bill you paid for someone is what they owe you; settling makes a payback Bill; Undo removes it', () => {
    const priya = os.records.create({ object: 'person', title: 'Priya', data: {} }).id;
    makeBill(os, 'Priya’s visa', { amount: 4000, date: '2026-11-16', split: { payers: { me: 4000 }, method: 'equal', shares: { [priya]: 1 } } });
    makeBill(os, 'Dinner', { amount: 2000, currency: 'JPY', rate: 0.6, date: '2026-12-26', split: { payers: { [priya]: 2000 }, method: 'equal', shares: { me: 1, [priya]: 1 } } });
    expect(billBalanceWith(os, priya)).toBe(3400);
    expect(balanceWith(os, priya)).toBe(3400);
    const s = settleUp(os, priya);
    expect(balanceWith(os, priya)).toBe(0);
    expect(os.records.get(s.billId!)!.title).toBe('Priya paid You');
    undoSettle(os, s);
    expect(balanceWith(os, priya)).toBe(3400);
    makePayment(os, priya, 'me', 400, { date: '2026-12-27' });
    expect(balanceWith(os, priya)).toBe(3000);
  });
});

const snap: TripAppSnapshot = {
  format: TRIP_APP_FORMAT,
  key: 'sample',
  destination: 'Japan',
  meta: { travellers: ['Asha', 'Ben', 'Cy'], start: '2026-12-18', end: '2026-12-20', fx: { JPY: 0.6 }, budgetPP: 100000, dailyPP: 5000 },
  places: [{ id: 'tokyo', name: 'Tokyo', kind: 'stop', order: 1 }],
  bookings: [
    { id: 's1', kind: 'stay', status: 'Confirmed', title: 'Inn', placeId: 'tokyo', start: '2026-12-18', end: '2026-12-20', total: 30000, outstanding: 24000, currency: 'JPY', forWho: ['Asha', 'Ben', 'Cy'] },
    { id: 's2', kind: 'stay', status: 'Confirmed', title: 'Paid inn', placeId: 'tokyo', start: '2026-12-18', end: '2026-12-19', total: 9000, outstanding: 0, currency: 'JPY', paidBy: 'Ben', forWho: ['Asha', 'Ben', 'Cy'] },
    { id: 'f1', kind: 'flight', status: 'Confirmed', title: 'Ben B', start: '2026-12-18', end: '2026-12-20', total: 50000, outstanding: 0, currency: 'INR', paidBy: 'Asha', forWho: ['Ben'] },
  ],
  things: [{ id: 't1', title: 'Museum', place: 'tokyo', kind: 'See', status: 'Want to', cost: 1000, note: '' }],
  expenses: [
    { id: 'x1', what: 'Inn deposit', amount: 6000, currency: 'JPY', inr: 3600, date: '2026-11-08', category: 'Stay', paidBy: 'Asha', payers: { Asha: 6000 }, split: 'equal', shares: { Asha: 1, Ben: 1, Cy: 1 }, booking: 's1' },
    { id: 'x2', what: "Ben's flight", amount: 50000, currency: 'INR', inr: 50000, date: '2026-11-08', category: 'Flights', payers: { Asha: 50000 }, split: 'equal', shares: { Ben: 1 }, booking: 'f1' },
    { id: 'x3', what: 'Ben paid Asha', amount: 20000, currency: 'INR', inr: 20000, date: '2026-11-10', category: 'Settlement', payment: true, payers: { Ben: 20000 }, split: 'exact', shares: { Asha: 20000 } },
  ],
  checklist: [
    { id: 'c1', text: 'Visa for each traveller', group: 'Documents', who: 'Everyone', due: '2026-11-16', done: false },
    { id: 'c2', text: 'Travel insurance', group: 'Documents', who: 'Everyone', due: '2026-11-15', done: true },
    { id: 'c3', text: 'Forex card', group: 'Money', who: 'Asha', due: '2026-11-22', done: false },
    { id: 'c4', text: 'Carry yen for Magome', group: 'Money', who: 'Everyone', due: '2026-12-19', done: false },
    { id: 'c5', text: 'Install trip apps', group: 'To-do', who: 'Ben', done: false },
  ],
  alerts: [
    { id: 'a1', title: 'Visa for all three', level: 'critical', resolved: false, body: 'Apply well ahead.' },
    { id: 'a2', title: 'Cash only at Magome', level: 'info', resolved: false, body: '' },
    { id: 'a3', title: 'Old worry', level: 'warning', resolved: true, body: '' },
  ],
};

describe('money on a trip', () => {
  it('the group, Bills from the expenses, the ledger’s three levels, each person’s projected, where it goes', () => {
    const r = importTripApp(os, snap, { me: 'Asha' });
    expect(r).toMatchObject({ bills: 3 });
    const t = os.records.get<TripData>(r.tripId)!;
    const group = os.records.get<{ kind?: string; memberIds?: string[] }>(t.data.groupId!)!;
    expect(group.data.kind).toBe('trip');
    expect(group.data.memberIds).toEqual(t.data.personIds);
    const [ben, cy] = t.data.personIds!;
    const now = new Date('2026-11-16T09:00:00').getTime();
    const items = tripLedger(os, t, now);
    // Inn: its paid part is a Bill (the deposit), so only the Bill counts as paid; the rest is booked. Paid inn: paid, no Bill.
    expect(items.map((i) => [i.label, i.level, Math.round(i.inr)])).toEqual([
      ['Inn', 'booked', 14400],
      ['Paid inn', 'paid', 5400],
      ["Ben's flight", 'paid', 50000],
      ['Inn deposit', 'paid', 3600],
      ['Museum', 'estimate', 1800],
      ['2 days × 5,000 a person', 'estimate', 18000],
    ]);
    const mine = projectedOf(items, 'me');
    expect(mine).toMatchObject({ paid: 3000, booked: 4800, estimate: 6600 });
    // Paying for someone else: Ben's flight is all his.
    expect(projectedOf(items, ben).paid).toBe(53000);
    expect(byCategory(items, 'me').map((c) => [c.cat, Math.round(c.inr)])).toEqual([['stays', 7800], ['daily', 6000], ['things', 600]]);
    expect(Math.round(projectedOf(items).total)).toBe(93200);
    // Settle up, for the whole group: Asha paid the deposit and Ben's flight; Ben paid 20,000 back.
    const b = tripBalances(os, t);
    expect(b.net).toEqual({ me: 32400, [ben!]: -31200, [cy!]: -1200 });
    expect(b.debts).toEqual([{ from: ben, to: 'me', amount: 31200 }, { from: cy, to: 'me', amount: 1200 }]);
    // The paid inn has no Bill yet: offered to add.
    expect(notInSettleUp(os, t).map((x) => [x.e.title, x.amount])).toEqual([['Stay · Paid inn', 9000]]);
    importTripApp(os, snap, { me: 'Asha' });
    expect(os.records.query('bill')).toHaveLength(3);
    expect(os.records.query('group')).toHaveLength(1);
  });
});

describe('prep', () => {
  it('the checklist in sections with its filters, ready to fly, the notes critical first, the emergency numbers', () => {
    const r = importTripApp(os, snap, { me: 'Asha' });
    expect(r).toMatchObject({ tasks: 5, notes: 3 });
    const t = os.records.get<TripData>(r.tripId)!;
    const items = checklistOf(os, t.id);
    expect(sectionsOf(items).map((g) => [g.section, g.items.length])).toEqual([['documents', 2], ['money', 2], ['to-do', 1]]);
    const now = new Date('2026-11-17T09:00:00').getTime();
    expect(filterChecklist(items, 'overdue', t, now).map((x) => x.title)).toEqual(['Visa for each traveller']);
    expect(filterChecklist(items, 'week', t, now).map((x) => x.title)).toEqual(['Forex card']);
    expect(filterChecklist(items, 'during', t, now).map((x) => x.title)).toEqual(['Carry yen for Magome']);
    expect(filterChecklist(items, 'nodate', t, now).map((x) => x.title)).toEqual(['Install trip apps']);
    expect(readyToFly(items, now)).toMatchObject({ done: 1, total: 5, overdue: 1 });
    expect(items.find((x) => x.title === 'Install trip apps')!.data.personIds!.map((id) => os.records.get(id)!.title)).toEqual(['Ben']);
    expect(notesOf(os, t.id).map((n) => [n.title, n.data.priority])).toEqual([['Visa for all three', 'urgent'], ['Cash only at Magome', 'low']]);
    expect(emergencyFor(t)).toMatchObject({ police: '110', ambulance: '119' });
    importTripApp(os, snap, { me: 'Asha' });
    expect(os.records.query('task')).toHaveLength(8);
  });
});
