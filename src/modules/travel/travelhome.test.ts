import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBetterSqliteAdapter } from '@core/db/betterSqliteAdapter';
import { createLifeOS } from '@core/lifeos';
import { Registry } from '@core/registry/registry';
import type { LifeOSContext } from '@core/registry/context';
import { bus } from '@core/events/bus';
import { crmModule } from '../crm';
import { financeModule } from '../finance';
import { projectsModule } from '../projects';
import { placesModule } from '../places';
import { homeDates, importTripApp, legLandsAt, monoDates, travelHomeOf, travelModule, tripStageOf, viewFlights, TRIP_APP_FORMAT, type TripAppSnapshot, type TripData } from '.';

/**
 * The Travel home and the view-only trip, as data: the next trip's card, the
 * trips coming up and been on, the year in numbers, and flights as journeys.
 * Every trip here is made up.
 */

let os: LifeOSContext;
beforeEach(async () => {
  bus.clear();
  os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules: [crmModule, financeModule, projectsModule, placesModule, travelModule], registry: new Registry() });
});
afterEach(() => os.db.close());

const NOW = new Date('2026-11-16T10:00:00').getTime();
const snap: TripAppSnapshot = {
  format: TRIP_APP_FORMAT,
  key: 'made-up',
  destination: 'Japan',
  look: 'japan',
  meta: { travellers: ['Asha', 'Ben'], start: '2026-12-18', end: '2026-12-21', fx: { JPY: 0.5 }, budgetPP: 100000 },
  places: [{ id: 'tokyo', name: 'Tokyo', jp: '東京', kind: 'stop', order: 1 }],
  bookings: [
    { id: 's1', kind: 'stay', status: 'Confirmed', title: 'Inn A', placeId: 'tokyo', start: '2026-12-18', end: '2026-12-21', total: 40000, outstanding: 40000, currency: 'JPY' },
    { id: 'f1', kind: 'flight', status: 'Confirmed', title: 'Asha One', start: '2026-12-18', end: '2026-12-21', total: 30000, outstanding: 0, currency: 'INR', paidBy: 'Asha', forWho: ['Asha'] },
  ],
  transport: [
    { id: 'l1', mode: 'Flight', status: 'Booked', date: '2026-12-17', time: '23:00', from: 'Home AAA T1', to: 'Middle BBB', details: 'ZZ101, lands 05:00 on 18 Dec.' },
    { id: 'l2', mode: 'Flight', status: 'Booked', date: '2026-12-18', time: '08:00', from: 'Middle BBB', to: 'Far CCC', details: 'ZZ102, lands 14:00.' },
    { id: 'l3', mode: 'Flight', status: 'Booked', date: '2026-12-21', time: '10:00', from: 'Far CCC', to: 'Home AAA', details: 'ZZ103, lands 22:30.' },
  ],
  alerts: [
    { id: 'a1', level: 'info', title: 'Pocket wifi', body: 'Pick it up at the airport', resolved: false },
    { id: 'a2', level: 'critical', title: 'Visa due today', body: 'At the consulate\nby noon', resolved: false },
    { id: 'a3', level: 'warning', title: 'Old one', body: '', resolved: true },
  ],
};

describe('the Travel home', () => {
  it('the next trip: its stage, the countdown, projected each against the budget, the most urgent note', () => {
    const { tripId } = importTripApp(os, snap, { me: 'Asha' });
    const d = travelHomeOf(os, NOW);
    expect(d.count).toBe(1);
    expect(d.next?.trip.id).toBe(tripId);
    expect(d.next?.stage).toBe('prep');
    expect(d.next?.days).toBe(32);
    expect(d.next?.budget).toBe(100000);
    // Your ticket (₹30,000, paid) and the stay, booked for you alone (¥40,000 at ₹0.5).
    expect(d.next?.projectedEach).toBe(50000);
    expect(d.next?.note).toMatchObject({ title: 'Visa due today', body: 'At the consulate', priority: 'urgent' });
    expect(d.next?.moreNotes).toBe(1);
    expect(d.coming).toEqual([]);
  });

  it('plan with nothing booked, book while a night has no bed, travel while away, home once back', () => {
    const plain = os.records.create<TripData>({ object: 'trip', data: { destination: 'Goa', startDate: '2026-12-01', endDate: '2026-12-04' } });
    expect(tripStageOf(os, plain, NOW)).toBe('plan');
    const { tripId } = importTripApp(os, { ...snap, meta: { ...snap.meta, end: '2026-12-23' } }, { me: 'Asha' });
    const jp = os.records.get<TripData>(tripId)!;
    expect(tripStageOf(os, jp, NOW)).toBe('book');
    expect(tripStageOf(os, jp, new Date('2026-12-19T09:00:00').getTime())).toBe('travel');
    expect(tripStageOf(os, jp, new Date('2027-01-02T09:00:00').getTime())).toBe('home');
  });

  it('coming up, been (newest first, with what it cost you) and the year', () => {
    importTripApp(os, snap, { me: 'Asha' });
    const later = os.records.create<TripData>({ object: 'trip', data: { destination: 'Hills', startDate: '2027-02-12', endDate: '2027-02-15' } });
    const idea = os.records.create<TripData>({ object: 'trip', data: { destination: 'Someday' } });
    const old = os.records.create<TripData>({ object: 'trip', data: { destination: 'Beach', startDate: '2025-03-14', endDate: '2025-03-17' } });
    const recent = os.records.create<TripData>({ object: 'trip', data: { destination: 'Lake', startDate: '2026-11-03', endDate: '2026-11-08', personIds: [] } });
    os.records.create({ object: 'bill', title: 'Cabin', data: { kind: 'spend', amount: 9000, currency: 'INR', date: '2026-11-04', split: { payers: { me: 9000 }, method: 'equal', shares: { me: 1 } }, tripId: recent.id } });
    const d = travelHomeOf(os, NOW);
    expect(d.coming.map((r) => r.trip.id)).toEqual([later.id, idea.id]);
    expect(d.coming[0]!.days).toBe(88);
    expect(d.been.map((r) => r.trip.id)).toEqual([recent.id, old.id]);
    expect(d.been[0]!.spent).toBe(9000);
    expect(d.year.year).toBe(2026);
    expect(d.year.trips).toBe(2);
    expect(d.year.nights).toBe(3 + 5);
    // The lake's cabin, and your ticket to Japan, paid already.
    expect(d.year.spent).toBe(9000 + 30000);
  });

  it('dates the way the cards say them', () => {
    expect(homeDates({ startDate: '2027-02-12', endDate: '2027-02-15' }, NOW)).toBe('12–15 Feb 2027');
    expect(homeDates({ startDate: '2026-11-03', endDate: '2026-11-08' }, NOW)).toBe('3–8 Nov');
    expect(homeDates({ startDate: '2026-12-28', endDate: '2026-12-30' }, NOW)).toBe('28–30 Dec');
    expect(homeDates({ startDate: '2026-12-17', endDate: '2027-01-07' }, NOW)).toBe('17 Dec–7 Jan 2027');
    expect(homeDates({}, NOW)).toBe('No dates yet');
    expect(monoDates({ startDate: '2026-12-17', endDate: '2027-01-07' })).toBe('17 DEC – 7 JAN');
  });
});

describe('flights as journeys', () => {
  it('legs that carry on join into one journey, via where they change; landing times come from the notes', () => {
    const { tripId } = importTripApp(os, snap, { me: 'Asha' });
    const js = viewFlights(os, tripId);
    expect(js.map((j) => [j.from, j.via.join(','), j.to])).toEqual([['AAA', 'BBB', 'CCC'], ['CCC', '', 'AAA']]);
    expect(js[0]!.legs.map((l) => l.flightNo)).toEqual(['ZZ101', 'ZZ102']);
    expect(new Date(js[0]!.arriveAt!).getHours()).toBe(14);
    expect(new Date(js[0]!.legs[0]!.arriveAt!).getDate()).toBe(18);
  });

  it('a landing time before take-off is the next day', () => {
    const dep = new Date('2026-12-17T23:00:00').getTime();
    expect(new Date(legLandsAt('lands 05:05', dep)!).getDate()).toBe(18);
    expect(legLandsAt('no time here', dep)).toBeNull();
  });
});
