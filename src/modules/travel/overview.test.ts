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
import { comingUpOf, durationWords, importTripApp, kanjiNumber, needsAttention, seatsOpenBoard, serviceName, stageOfTrip, stampsOfTrip, stopsLineOf, travelModule, wayThere, weatherOfStops, TRIP_APP_FORMAT, type TripAppSnapshot, type TripData } from '.';

/**
 * The Overview before the trip: the stage, the way there, the notes that need
 * attention, what is coming up until the flight, the seats-open board, the
 * line with its nights, the stamps and the weather. Made-up trip data.
 */

let os: LifeOSContext;
beforeEach(async () => {
  bus.clear();
  os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules: [crmModule, financeModule, projectsModule, placesModule, travelModule], registry: new Registry() });
});
afterEach(() => os.db.close());

const at = (s: string) => new Date(s).getTime();
const snap: TripAppSnapshot = {
  format: TRIP_APP_FORMAT,
  key: 'ov-sample',
  destination: 'Japan',
  look: 'japan',
  meta: { travellers: ['Asha', 'Ben'], start: '2026-12-17', end: '2026-12-24', fx: { JPY: 0.59 } },
  places: [
    { id: 'tokyo', name: 'Tokyo', jp: '東京', kind: 'stop', order: 1, color: 'green' },
    { id: 'kawa', name: 'Kawaguchiko', jp: '河口湖', kind: 'stop', order: 2, color: 'teal' },
  ],
  bookings: [
    { id: 's1', kind: 'stay', status: 'Confirmed', title: 'Inn A', placeId: 'tokyo', start: '2026-12-18', end: '2026-12-22', total: 40000, outstanding: 36000, currency: 'JPY', cancelBy: '2026-12-10', checkIn: 'from 15:00' },
    { id: 's2', kind: 'stay', status: 'Confirmed', title: 'Inn B', placeId: 'kawa', start: '2026-12-22', end: '2026-12-24', total: 18000, outstanding: 18000, currency: 'JPY' },
  ],
  transport: [
    { id: 'f1', mode: 'Flight', status: 'Booked', date: '2026-12-17', time: '23:05', from: 'Mumbai BOM T2', to: 'Hanoi HAN T2', details: 'XX101, lands 05:05 on 18 Dec.' },
    { id: 'f2', mode: 'Flight', status: 'Booked', date: '2026-12-18', time: '08:40', from: 'Hanoi HAN T2', to: 'Tokyo Haneda HND T3', details: 'XX202, lands 15:05.' },
    { id: 'j1', mode: 'Bus', status: 'Suggested', date: '2026-12-22', from: 'Tokyo', fromId: 'tokyo', to: 'Kawaguchiko', toId: 'kawa', bookNote: 'Highway bus seats open 22 Nov; book early.' },
  ],
  checklist: [
    { id: 'c1', text: 'Apply for the visa', group: 'Documents', due: '2026-11-25', done: false },
    { id: 'c2', text: 'Buy a power bank', group: 'Packing', done: false },
    { id: 'c3', text: 'Get yen', group: 'Money', due: '2026-12-01', done: true },
  ],
  alerts: [
    { id: 'a1', level: 'critical', title: 'Visa for all', body: 'Apply well ahead.' },
    { id: 'a2', level: 'warning', title: 'Tight travel day', body: 'Leave early.' },
    { id: 'a3', level: 'info', title: 'Carry cash' },
    { id: 'a4', level: 'warning', title: 'Old note', resolved: true },
  ],
};

const load = () => {
  const r = importTripApp(os, snap, { me: 'Asha' });
  return os.records.get<TripData>(r.tripId)!;
};

describe('the Overview before the trip', () => {
  it('the stage: prep when every night has a bed and the flight is booked; travel while away; home after', () => {
    const t = load();
    expect(stageOfTrip(os, t, at('2026-11-16T09:00:00'))).toBe('prep');
    expect(stageOfTrip(os, t, at('2026-12-20T09:00:00'))).toBe('travel');
    expect(stageOfTrip(os, t, at('2027-01-02T09:00:00'))).toBe('home');
    const bare = os.records.create<TripData>({ object: 'trip', title: 'Goa', data: { destination: 'Goa' } }, 'user');
    expect(stageOfTrip(os, bare)).toBe('plan');
  });

  it('the way there: legs joined, across time zones', () => {
    const w = wayThere(os, load())!;
    expect([w.from.code, w.to.code, w.fromCity, w.toCity, w.via, w.departs, w.lands, w.fromZone, w.toZone, w.flightNos]).toEqual(['BOM', 'HND', 'Mumbai', 'Tokyo', ['Hanoi'], '23:05', '15:05', 'IST', 'JST', ['XX101', 'XX202']]);
    expect(w.minutes).toBe(12 * 60 + 30);
    expect(durationWords(w.minutes!)).toBe('12 H 30');
  });

  it('needs attention: critical and heads-up notes, open ones; all the notes counted', () => {
    const a = needsAttention(os, load().id);
    expect(a.rows.map((r) => [r.title, r.level])).toEqual([['Visa for all', 'critical'], ['Tight travel day', 'heads']]);
    expect([a.critical, a.heads, a.all]).toEqual([1, 1, 4]);
  });

  it('coming up until the flight: seats and tasks to act on, a cancellation ending, the flight; the rail', () => {
    const c = comingUpOf(os, load(), at('2026-11-16T09:00:00'))!;
    expect([c.until, c.days]).toEqual(['2026-12-17', 31]);
    expect(c.items.map((i) => [i.day, i.group, i.kind, i.title])).toEqual([
      ['2026-11-22', 'action', 'seats', 'Book Tokyo → Kawaguchiko'],
      ['2026-11-25', 'action', 'task', 'Apply for the visa'],
      ['2026-12-10', 'heads', 'cancel', 'Inn A: free cancellation ends'],
      ['2026-12-17', 'know', 'flight', 'Fly out of Mumbai · XX101 23:05'],
    ]);
    expect(c.items[2]!.amount).toEqual({ value: 36000, currency: 'JPY' });
    expect(c.items[3]!.sub).toBe('Everyone · Mumbai T2');
    expect(c.counts).toEqual({ action: 2, heads: 1, know: 1, deadlines: 2 });
    expect(c.rail).toEqual([{ day: '2026-11-22', kind: 'seats' }, { day: '2026-12-10', kind: 'cancel' }]);
    expect(comingUpOf(os, load(), at('2026-12-20T09:00:00'))).toBeNull();
  });

  it('the seats-open board: journeys not booked, from today on', () => {
    const t = load();
    expect(seatsOpenBoard(os, t, at('2026-11-16T09:00:00'))).toEqual([expect.objectContaining({ opens: '2026-11-22', inDays: 6, name: 'Highway bus', from: 'Tokyo', to: 'Kawaguchiko', day: '2026-12-22' })]);
    expect(seatsOpenBoard(os, t, at('2026-11-23T09:00:00'))).toEqual([]);
    expect(serviceName('Shinano seats open 26 Nov; reserve.', 'train')).toBe('Shinano');
    expect(serviceName('Reserve JR seats (Azusa) from 24 Nov.', 'train')).toBe('JR · Azusa');
    expect(serviceName('Kintetsu limited express Nagoya → Ise is all-reserved; seats open 27 Nov.', 'train')).toBe('Kintetsu Ltd Exp Nagoya');
    expect(serviceName(undefined, 'train + bus')).toBe('Train + bus');
  });

  it('the line with its nights, the stamps, the weather by stop', () => {
    const t = load();
    const line = stopsLineOf(os, t);
    expect(line.stops.map((s) => [s.title, s.localName, s.from, s.nights])).toEqual([['Tokyo', '東京', '2026-12-18', 4], ['Kawaguchiko', '河口湖', '2026-12-22', 2]]);
    expect([line.nights, line.rooms, line.moves]).toEqual([6, 2, 1]);
    const before = stampsOfTrip(line, at('2026-11-16T09:00:00'));
    expect([before.got, before.stops.map((s) => s.next), before.first?.title]).toEqual([0, [true, false], 'Tokyo']);
    expect(stampsOfTrip(line, at('2026-12-23T09:00:00')).got).toBe(2);
    expect(weatherOfStops(line, t).map((w) => [w.stop.title, w.normals.hi, w.normals.lo, w.normals.sky])).toEqual([['Tokyo', 12, 4, 'sun'], ['Kawaguchiko', 8, -3, 'sun']]);
  });

  it('numbers in kanji', () => {
    expect([1, 10, 14, 20, 37].map(kanjiNumber)).toEqual(['一', '十', '十四', '二十', '三十七']);
  });
});
