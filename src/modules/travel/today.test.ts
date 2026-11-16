import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBetterSqliteAdapter } from '@core/db/betterSqliteAdapter';
import { createLifeOS } from '@core/lifeos';
import { Registry } from '@core/registry/registry';
import type { LifeOSContext } from '@core/registry/context';
import { bus } from '@core/events/bus';
import { crmModule } from '../crm';
import { financeModule, makePayment } from '../finance';
import { projectsModule } from '../projects';
import { placesModule } from '../places';
import { healthModule } from '../health';
import { assetsModule } from '../assets';
import {
  bringAndPack, cashNeed, departOf, hm, changeWallet, dayAgenda, dayTrack, halfOfDay, hourlyNormals, importTripApp, keepOf, lastConnection, leaveBy, legsOf, movesOf, nextLeg, nightsOf, packedClothes, PACKED_FOR, setKeep, settledOf,
  spentByStop, stampsOf, stampToday, stopNormals, sunTimes, tempAt, toTheWash, travelModule, tripJourneys, tripLedger, tripSteps, walletOf, stopsOf, TRIP_APP_FORMAT, type TripAppSnapshot, type TripData,
} from '.';

/**
 * The trip while away and after (JP-Today, JP-TodayPM, JP-Recap): leaving,
 * the next leg, the rest of the day, the wallet, the stamps, the normals and
 * the sun, bring and pack, and the recap. The snapshot is made up in the
 * Japan app's shape.
 */

let os: LifeOSContext;
beforeEach(async () => {
  bus.clear();
  os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules: [crmModule, financeModule, projectsModule, placesModule, healthModule, assetsModule, travelModule], registry: new Registry() });
});
afterEach(() => os.db.close());

const at = (s: string) => new Date(s).getTime();
const snap: TripAppSnapshot = {
  format: TRIP_APP_FORMAT,
  key: 'today-sample',
  destination: 'Japan',
  look: 'japan',
  meta: { travellers: ['Asha', 'Ben'], start: '2026-12-10', end: '2026-12-15', fx: { JPY: 0.6 } },
  places: [
    { id: 'naga', name: 'Nagano', jp: '長野', kind: 'stop', order: 1, color: 'green', lat: 36.65, lon: 138.18 },
    { id: 'mago', name: 'Magome', jp: '馬籠', kind: 'stop', order: 2, color: 'wood', lat: 35.53, lon: 137.57 },
    { id: 'ise', name: 'Ise', jp: '伊勢', kind: 'stop', order: 3, color: 'plum' },
  ],
  bookings: [
    { id: 's1', kind: 'stay', status: 'Confirmed', title: 'Inn One', placeId: 'naga', start: '2026-12-10', end: '2026-12-12', total: 20000, outstanding: 0, currency: 'JPY' },
    { id: 's2', kind: 'stay', status: 'Confirmed', title: 'Hill Inn', placeId: 'mago', start: '2026-12-12', end: '2026-12-13', total: 18000, outstanding: 18000, currency: 'JPY', payNote: 'Cash only, at the desk', checkIn: '15:00–19:00' },
    { id: 's3', kind: 'stay', status: 'Confirmed', title: 'Sea Inn', placeId: 'ise', start: '2026-12-13', end: '2026-12-15', total: 24000, outstanding: 24000, currency: 'JPY', payNote: 'Card charged automatically' },
  ],
  transport: [
    { id: 'j1', mode: 'Train + bus', status: 'Booked', date: '2026-12-12', leaveBy: '10:30', arriveAt: '≈14:45', from: 'Nagano', fromId: 'naga', to: 'Magome', toId: 'mago', lastConnection: 'Last bus Town → Magome is 17:45 on Saturdays. Take the 14:00 at the latest.', timeline: '10:30 Check out of Inn One | walk 15 min\n12:00 Limited express Shinano Nagano → Nakatsugawa | car 3\n14:15 Bus Nakatsugawa → Magome | 30 min\n≈14:45 Arrive in Magome' },
    { id: 'j2', mode: 'Train', status: 'Booked', date: '2026-12-13', leaveBy: '10:45', arriveAt: '≈15:30', from: 'Magome', fromId: 'mago', to: 'Ise', toId: 'ise', timeline: '09:00 Check out of Hill Inn\n≈10:45 Bus Magome → Nakatsugawa' },
  ],
  expenses: [
    { id: 'e1', what: 'Dinner', amount: 6000, currency: 'JPY', inr: 3600, date: '2026-12-12', category: 'Food', paidBy: 'Asha', forWho: ['Asha', 'Ben'] },
    { id: 'e2', what: 'Ramen', amount: 2000, currency: 'JPY', inr: 1200, date: '2026-12-10', category: 'Food', paidBy: 'Ben', forWho: ['Asha', 'Ben'] },
  ],
};

const setup = () => {
  const r = importTripApp(os, snap, { me: 'Asha' });
  const trip = os.records.get<TripData>(r.tripId)!;
  return { trip, nights: nightsOf(os, trip), j1: tripJourneys(os, trip.id)[0]! };
};

describe('leaving and the next leg', () => {
  it('leave-by counts down to the journey; legs read "A → B" steps; the next one is the one still to catch', () => {
    const { j1 } = setup();
    expect(leaveBy(j1, at('2026-12-12T09:00:00'))).toMatchObject({ time: '10:30', seconds: 5400, what: 'Check out of Inn One', note: 'walk 15 min' });
    expect(legsOf(j1).map((l) => [l.name, l.from, l.to, l.time, l.arrive, l.mode])).toEqual([
      ['Limited express Shinano', 'Nagano', 'Nakatsugawa', '12:00', '14:15', 'train'],
      ['Bus', 'Nakatsugawa', 'Magome', '14:15', '14:45', 'bus'],
    ]);
    expect(nextLeg(j1, at('2026-12-12T09:00:00'))?.name).toBe('Limited express Shinano');
    expect(nextLeg(j1, at('2026-12-12T13:00:00'))?.name).toBe('Bus');
    expect(nextLeg(j1, at('2026-12-12T15:00:00'))).toBeNull();
    expect(lastConnection(j1)).toEqual({ title: 'Last bus Town → Magome is 17:45 on Saturdays', body: 'Take the 14:00 at the latest.', time: '17:45' });
  });

  it('a leave time the import kept as noon ("≈10:45") is read from the first leg', () => {
    const { trip } = setup();
    const j2 = tripJourneys(os, trip.id)[1]!;
    os.records.update(j2.id, { data: { startAt: at('2026-12-13T12:00:00') } }, 'user');
    expect(hm(departOf(os.records.get(j2.id) as typeof j2)!)).toBe('10:45');
    os.records.update(j2.id, { data: { startAt: at('2026-12-13T09:30:00') } }, 'user');
    expect(hm(departOf(os.records.get(j2.id) as typeof j2)!)).toBe('09:30');
  });

  it('morning until 14:00 or until the day’s journey has arrived', () => {
    expect(halfOfDay(at('2026-12-12T09:00:00'))).toBe('morning');
    expect(halfOfDay(at('2026-12-12T13:00:00'), at('2026-12-12T12:30:00'))).toBe('afternoon');
    expect(halfOfDay(at('2026-12-12T16:30:00'))).toBe('afternoon');
  });
});

describe('the day', () => {
  it('the track has a cell a night, coloured by stop, with today marked', () => {
    const { nights } = setup();
    const t = dayTrack(os, nights, '2026-12-12');
    expect(t.map((c) => [c.color, c.when])).toEqual([['green', 'past'], ['green', 'past'], ['wood', 'today'], ['plum', 'future'], ['plum', 'future']]);
  });

  it('the agenda: steps, checking in with cash to pay, the last connection, packing for tomorrow; done, now and next', () => {
    const { trip, nights } = setup();
    const a = dayAgenda(os, trip, '2026-12-12', at('2026-12-12T14:30:00'), nights);
    expect(a.items.map((x) => [x.time, x.title, x.tag, x.state])).toEqual([
      ['10:30', 'Check out of Inn One', null, 'done'],
      ['12:00', 'Limited express Shinano Nagano → Nakatsugawa', null, 'done'],
      ['14:15', 'Bus Nakatsugawa → Magome', null, 'now'],
      ['14:45', 'Arrive in Magome', null, 'next'],
      ['15:00', 'Check in at Hill Inn', 'cash', 'later'],
      ['17:45', 'Last bus Town → Magome is 17:45 on Saturdays', 'heads-up', 'later'],
      ['21:00', 'Pack for Ise', null, 'later'],
    ]);
    const now = a.items[2]!;
    expect(now.minutesLeft).toBe(15);
    expect(now.progress).toBeCloseTo(0.5);
    expect(a.items[4]!.sub).toBe('pay ¥18,000 in cash at the desk');
    expect(a.items[6]!.sub).toBe('we leave at 10:45 tomorrow');
    expect(a.done).toHaveLength(2);
  });
});

describe('cash and the IC card', () => {
  it('cash needed is the cash-only stays still to pay in the next days; the wallet adds up and undoes', () => {
    const { trip } = setup();
    expect(cashNeed(os, trip, '2026-12-11')).toMatchObject({ amount: 18000, currency: 'JPY', by: '2026-12-12' });
    expect(cashNeed(os, trip, '2026-12-13').amount).toBe(0);
    expect(walletOf(trip)).toEqual({ cash: 0, ic: 0, currency: 'JPY', told: false });
    changeWallet(os, trip.id, { cash: 20000 });
    const undo = changeWallet(os, trip.id, { ic: 3000, cash: -500 });
    expect(walletOf(os.records.get<TripData>(trip.id)!)).toEqual({ cash: 19500, ic: 3000, currency: 'JPY', told: true });
    undo();
    expect(walletOf(os.records.get<TripData>(trip.id)!)).toMatchObject({ cash: 20000, ic: 0 });
    changeWallet(os, trip.id, { cash: -99999 });
    expect(walletOf(os.records.get<TripData>(trip.id)!).cash).toBe(0);
  });
});

describe('stamps', () => {
  it('a stamp a stop on the line, collected once its nights are over; today’s is the one checked out this morning', () => {
    const { trip, nights } = setup();
    const s = stampsOf(os, trip, '2026-12-12', nights);
    expect(s.map((x) => [x.mark, x.nights, x.collected])).toEqual([['長', 2, true], ['馬', 1, false], ['伊', 2, false]]);
    expect(stampToday(s, '2026-12-12')?.stop.title).toBe('Nagano');
    expect(stampToday(s, '2026-12-11')).toBeNull();
    expect(stampsOf(os, trip, '2026-12-15', nights).every((x) => x.collected)).toBe(true);
    expect(movesOf(nights)).toBe(2);
  });
});

describe('weather by the hour and the sun', () => {
  it('the usual temperature runs from the low near dawn to the high mid-afternoon', () => {
    const n = { hi: 8, lo: -2 };
    expect(tempAt(n, 300)).toBe(-2);
    expect(tempAt(n, 840)).toBe(8);
    expect(tempAt(n, 1140)).toBeLessThan(8);
    expect(tempAt(n, 1140)).toBeGreaterThan(-2);
    expect(hourlyNormals(n, 23, 3).map((h) => h.hour)).toEqual([23, 0, 1]);
    const { trip } = setup();
    expect(stopNormals(stopsOf(os, trip.id)[1], '2026-12-12')).toEqual({ hi: 8, lo: -2, sky: 'snow' });
  });

  it('sunset in Magome in late December is a little before 17:00, Japan time', () => {
    const s = sunTimes(35.53, 137.57, '2026-12-26')!;
    expect(s.set).toBeGreaterThan(16 * 60 + 35);
    expect(s.set).toBeLessThan(16 * 60 + 55);
    expect(s.rise).toBeGreaterThan(6 * 60 + 50);
    expect(s.rise).toBeLessThan(7 * 60 + 10);
  });
});

describe('bring and pack', () => {
  it('snow and cold bring a waterproof layer, gloves and hand warmers; a warmer stop tomorrow sends thermals to the bottom', () => {
    const b = bringAndPack({ here: 'Magome', normals: { hi: 8, lo: -2, sky: 'snow' }, next: { name: 'Ise', normals: { hi: 12, lo: 2, sky: 'sun' } }, cashToday: true, cashSymbol: '¥' });
    expect(b.wear).toEqual(['Waterproof layer', 'Gloves and beanie', 'Warm layer', 'Walking shoes']);
    expect(b.bag).toEqual(['¥ cash', 'Hand warmers', 'Water', 'Power bank']);
    expect(b.tonight).toEqual(['Thermals to the bottom', 'Day bag on top', 'Charger']);
    expect(b.why).toBe('Snow is usual in Magome this month, and Ise is warmer tomorrow.');
    expect(bringAndPack({ here: 'Goa', normals: null }).tonight).toEqual([]);
  });
});

describe('the recap', () => {
  it('spent a day by stop: its stays and the Bills on its nights, for you, over its nights', () => {
    const { trip, nights } = setup();
    const s = spentByStop(os, trip, tripLedger(os, trip, at('2026-12-20T10:00:00')), 'me', nights);
    // Nagano: the inn (₹12,000, booked for you alone) + your half of the ramen (₹600), over 2 nights.
    expect(s.map((x) => [x.title, x.nights, Math.round(x.perDay)])).toEqual([['Nagano', 2, 6300], ['Magome', 1, 12600], ['Ise', 2, 7200]]);
  });

  it('steps from Health’s Measurements over the trip, the stop with the most a day', () => {
    const { trip, nights } = setup();
    expect(tripSteps(os, trip, nights)).toBeNull();
    for (const [date, value] of [['2026-12-10', 8000], ['2026-12-12', 16000], ['2026-12-20', 99999]] as const) os.records.create({ object: 'measurement', data: { metric: 'steps', value, date } }, 'user');
    const s = tripSteps(os, trip, nights)!;
    expect(s).toMatchObject({ total: 24000, perDay: 12000 });
    expect(os.records.get(s.topStopId!)?.title).toBe('Magome');
  });

  it('settled up once the paybacks even the Bills out', () => {
    const { trip } = setup();
    const before = settledOf(os, trip);
    expect(before.settled).toBe(false);
    const d = before.debts[0]!;
    makePayment(os, d.from, d.to, d.amount, { date: '2026-12-16', tripId: trip.id });
    expect(settledOf(os, trip)).toMatchObject({ settled: true, paybacks: 1, lastPayback: '2026-12-16' });
  });

  it('back home: chosen packed clothes go in the wash, with an Undo', () => {
    const { trip } = setup();
    const ids = ['Black polo', 'Dark jeans'].map((title) => {
      const a = os.records.create({ object: 'asset', title, data: { category: 'clothing', state: 'packed' } }, 'user');
      os.links.link(a.id, trip.id, PACKED_FOR, {}, 'user');
      return a.id;
    });
    expect(packedClothes(os, trip.id).map((c) => c.title)).toEqual(['Black polo', 'Dark jeans']);
    const undo = toTheWash(os, [ids[0]!]);
    expect(packedClothes(os, trip.id).map((c) => c.title)).toEqual(['Dark jeans']);
    undo();
    expect(packedClothes(os, trip.id)).toHaveLength(2);
  });

  it('keep for the next trip: packing and to-do on, the group off, until changed', () => {
    const { trip } = setup();
    expect(keepOf(trip)).toEqual({ packing: true, todo: true, group: false });
    const undo = setKeep(os, trip.id, 'group', true);
    expect(keepOf(os.records.get<TripData>(trip.id)!).group).toBe(true);
    undo();
    expect(keepOf(os.records.get<TripData>(trip.id)!).group).toBe(false);
  });
});
