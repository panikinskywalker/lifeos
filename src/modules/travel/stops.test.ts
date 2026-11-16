import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBetterSqliteAdapter } from '@core/db/betterSqliteAdapter';
import { createLifeOS } from '@core/lifeos';
import { Registry } from '@core/registry/registry';
import type { LifeOSContext } from '@core/registry/context';
import { bus } from '@core/events/bus';
import { fileMail } from '@core/filing/messages';
import { crmModule } from '../crm';
import { financeModule } from '../finance';
import { projectsModule } from '../projects';
import { placesModule } from '../places';
import { addToLine, dayPlans, ensureStop, foldStops, importTripApp, isTripAppSnapshot, moveStop, movingDays, nightsOf, segmentsOf, stopMark, stopSpan, stopsOf, travelModule, tripIcs, TRIP_APP_FORMAT, type StopData, type TripAppSnapshot, type TripData } from '.';

/**
 * The trip template, slice 1: stops and the line, nights from the stays, the
 * fold, the calendar file, and the import from a trip app. The snapshot below
 * is made up in the Japan app's shape; it is not the real trip.
 */

let os: LifeOSContext;
beforeEach(async () => {
  bus.clear();
  os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules: [crmModule, financeModule, projectsModule, placesModule, travelModule], registry: new Registry() });
});
afterEach(() => os.db.close());

const trip = (destination: string, data: Partial<TripData> = {}) => os.records.create<TripData>({ object: 'trip', data: { destination, ...data } });
const at = (s: string) => new Date(s).getTime();
const stay = (tripId: string, title: string, from: string, to: string, stopId?: string) => {
  const e = os.records.create({ object: 'event', title: `Stay · ${title}`, data: { kind: 'stay', startAt: at(`${from}T15:00:00`), endAt: at(`${to}T11:00:00`), allDay: true, ...(stopId ? { stopId } : {}) } });
  os.links.link(e.id, tripId, 'part_of');
  return e;
};
const titles = (xs: Array<{ title: string }>) => xs.map((x) => x.title);

describe('stops and the line', () => {
  it('a stop per name, at the end of the line, with its Place and its own colour; ideas stay off the line', () => {
    const t = trip('Japan');
    const tokyo = ensureStop(os, t.id, 'Tokyo', { localName: '東京' }).stop;
    const kyoto = ensureStop(os, t.id, 'Kyoto').stop;
    expect(ensureStop(os, t.id, 'tokyo').created).toBe(false);
    ensureStop(os, t.id, 'Nara', { kind: 'idea' });
    expect(titles(stopsOf(os, t.id))).toEqual(['Tokyo', 'Kyoto']);
    expect(titles(stopsOf(os, t.id, ['idea']))).toEqual(['Nara']);
    expect([tokyo.data.order, kyoto.data.order]).toEqual([1, 2]);
    expect(tokyo.data.color).not.toBe(kyoto.data.color);
    expect(os.records.get(tokyo.data.placeId!)).toMatchObject({ object: 'place', title: 'Tokyo', data: { kind: 'city' } });
    expect(os.links.forEntity(tokyo.id, 'part_of')[0]!.other.id).toBe(t.id);
    expect(stopMark(tokyo, 'japan')).toBe('東');
    expect(stopMark(tokyo)).toBe('T');
  });

  it('swap two stops with Undo; an idea added to the line goes last', () => {
    const t = trip('Japan');
    for (const n of ['Tokyo', 'Kyoto', 'Osaka']) ensureStop(os, t.id, n);
    const nara = ensureStop(os, t.id, 'Nara', { kind: 'idea' }).stop;
    const kyoto = stopsOf(os, t.id)[1]!;
    const undo = moveStop(os, kyoto.id, -1)!;
    expect(titles(stopsOf(os, t.id))).toEqual(['Kyoto', 'Tokyo', 'Osaka']);
    expect(moveStop(os, stopsOf(os, t.id)[0]!.id, -1)).toBeNull();
    undo();
    expect(titles(stopsOf(os, t.id))).toEqual(['Tokyo', 'Kyoto', 'Osaka']);
    addToLine(os, nara.id);
    expect(titles(stopsOf(os, t.id))).toEqual(['Tokyo', 'Kyoto', 'Osaka', 'Nara']);
  });
});

describe('nights, from the stays', () => {
  it('each night at a stay and its stop, the plane, a gap with no bed; runs and moving days', () => {
    const t = trip('Japan', { startDate: '2026-12-17', endDate: '2026-12-24' });
    const tokyo = ensureStop(os, t.id, 'Tokyo').stop;
    const fuji = ensureStop(os, t.id, 'Kawaguchiko').stop;
    const f = os.records.create({ object: 'event', title: 'Flight BOM → HAN', data: { kind: 'flight', startAt: at('2026-12-17T23:05:00') } });
    os.links.link(f.id, t.id, 'part_of');
    stay(t.id, 'Hotel Sumida', '2026-12-18', '2026-12-21', tokyo.id);
    stay(t.id, 'Lakeside Inn', '2026-12-22', '2026-12-23', fuji.id);
    const nights = nightsOf(os, os.records.get<TripData>(t.id)!);
    expect(nights.map((n) => n.kind)).toEqual(['air', 'stay', 'stay', 'stay', 'gap', 'stay', 'gap']);
    expect(segmentsOf(nights).map((g) => [g.kind, g.from, g.nights])).toEqual([
      ['air', '2026-12-17', 1],
      ['stay', '2026-12-18', 3],
      ['gap', '2026-12-21', 1],
      ['stay', '2026-12-22', 1],
      ['gap', '2026-12-23', 1],
    ]);
    expect(movingDays(nights)).toEqual([{ day: '2026-12-22', fromStopId: tokyo.id, toStopId: fuji.id }]);
    expect(stopSpan(nights, tokyo.id)).toEqual({ from: '2026-12-18', to: '2026-12-21', nights: 3 });
  });

  it('the calendar file: the trip, and each run of nights with its stay', () => {
    const t = trip('Japan', { startDate: '2026-12-18', endDate: '2026-12-22' });
    const tokyo = ensureStop(os, t.id, 'Tokyo').stop;
    stay(t.id, 'Hotel Sumida, Sumida', '2026-12-18', '2026-12-22', tokyo.id);
    const ics = tripIcs(os, os.records.get<TripData>(t.id)!, at('2026-11-15T10:00:00Z'));
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics).toContain('DTSTART;VALUE=DATE:20261218\r\nDTEND;VALUE=DATE:20261223\r\nSUMMARY:Japan');
    expect(ics).toContain('SUMMARY:Tokyo · Hotel Sumida\\, Sumida\r\nDESCRIPTION:4 nights · Japan');
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
  });
});

describe('the fold and booking mail', () => {
  it('once: a trip with no stops gets its destination; a stay with no stop gets the stop for its city', () => {
    const t = trip('Goa', { startDate: '2026-12-18', endDate: '2026-12-22' });
    const s = stay(t.id, 'The Park', '2026-12-18', '2026-12-22');
    os.records.update(s.id, { data: { location: 'Calangute' } });
    foldStops(os);
    expect(titles(stopsOf(os, t.id))).toEqual(['Goa', 'Calangute']);
    expect(os.records.get<{ stopId?: string }>(s.id)!.data.stopId).toBe(stopsOf(os, t.id)[1]!.id);
    expect(os.links.forEntity(s.id, 'stop')[0]!.other.title).toBe('Calangute');
    foldStops(os);
    expect(stopsOf(os, t.id)).toHaveLength(2);
  });

  it('a stay from booking mail lands on its stop', () => {
    fileMail(os, { uid: 1, from: 'noreply@makemytrip.com', fromName: 'MakeMyTrip', subject: 'Hotel booking confirmed - The Park Calangute', text: 'Your booking is confirmed!\nHotel: The Park Calangute\nCalangute, Goa\nCheck-in: Fri, 18 Dec 2026, 2:00 PM\nCheck-out: Tue, 22 Dec 2026, 12:00 PM', date: at('2026-11-02T10:00:00') }, 'rutvij@gmail.com');
    const [t] = os.records.query<TripData>('trip');
    const [s] = stopsOf(os, t!.id);
    expect(s!.title).toBe('Goa');
    const [ev] = os.records.query<{ stopId?: string }>('event');
    expect(ev!.data.stopId).toBe(s!.id);
    expect(stopSpan(nightsOf(os, os.records.get<TripData>(t!.id)!), s!.id)).toMatchObject({ nights: 4 });
  });
});

describe('importing a trip app', () => {
  const snap: TripAppSnapshot = {
    format: TRIP_APP_FORMAT,
    key: 'sample-trip',
    destination: 'Japan',
    look: 'japan',
    meta: { travellers: ['Asha', 'Ben', 'Cy'], start: '2026-12-17', arrive: '2026-12-18', end: '2026-12-24', fx: { JPY: 0.59, USD: 94 }, fxDate: '2026-11-15', budgetPP: 200000, dailyPP: 7000 },
    places: [
      { id: 'tokyo', name: 'Tokyo', jp: '東京', kind: 'stop', order: 1, color: 'green', lat: 35.68, lon: 139.77, blurb: 'Start here.' },
      { id: 'kawa', name: 'Kawaguchiko', jp: '河口湖', kind: 'stop', order: 2, color: 'teal', lat: 35.5, lon: 138.77 },
      { id: 'hnd', name: 'Haneda Airport', jp: '羽田空港', kind: 'airport', order: 0, color: 'slate' },
      { id: 'nara', name: 'Nara', jp: '奈良', kind: 'idea', order: 50, color: 'plum' },
    ],
    bookings: [
      { id: 'stay-a', kind: 'stay', status: 'Confirmed', title: 'Inn A', placeId: 'tokyo', place: 'Tokyo', start: '2026-12-18', end: '2026-12-22' },
      { id: 'stay-b', kind: 'stay', status: 'Confirmed', title: 'Inn B', placeId: 'kawa', place: 'Kawaguchiko', start: '2026-12-22', end: '2026-12-24' },
      { id: 'stay-x', kind: 'stay', status: 'Cancelled', title: 'Old inn', placeId: 'tokyo', start: '2026-12-18', end: '2026-12-20' },
      { id: 'fl-a', kind: 'flight', status: 'Confirmed', title: 'Asha', start: '2026-12-17', end: '2026-12-24' },
    ],
    transport: [
      { id: 'leg-1', mode: 'Flight', date: '2026-12-17', time: '23:05', from: 'Mumbai BOM T2', to: 'Hanoi HAN T2', details: 'VN123, lands 05:05.' },
      { id: 'leg-2', mode: 'Train', date: '2026-12-22', time: '10:30', from: 'Tokyo', to: 'Kawaguchiko' },
    ],
    days: [{ id: '2026-12-18', place: 'Tokyo', plan: 'Land at Haneda, check in, dinner nearby.' }],
  };

  it('the trip, its people, stops, stays, flights and day plans; you are left out; a second import changes nothing', () => {
    expect(isTripAppSnapshot(snap)).toBe(true);
    expect(isTripAppSnapshot({ format: 'x' })).toBe(false);
    const r = importTripApp(os, snap, { me: 'Asha' });
    // Since slice 2 the cancelled stay comes in too, marked cancelled (it holds no night), with the ticket and the journey.
    expect(r).toMatchObject({ createdTrip: true, stops: 4, stays: 3, flights: 1, days: 1, tickets: 1, journeys: 1 });
    const t = os.records.get<TripData>(r.tripId)!;
    expect(t).toMatchObject({ title: 'Japan', status: 'booked', data: { startDate: '2026-12-17', endDate: '2026-12-24', budget: 200000, dailyAllowance: 7000, localCurrency: 'JPY', fxRate: 0.59, look: 'japan' } });
    expect(t.data.personIds!.map((id) => os.records.get(id)!.title)).toEqual(['Ben', 'Cy']);
    expect(titles(stopsOf(os, t.id))).toEqual(['Tokyo', 'Kawaguchiko']);
    expect(titles(stopsOf(os, t.id, ['idea', 'airport']))).toEqual(['Haneda Airport', 'Nara']);
    const tokyo = stopsOf(os, t.id)[0]!;
    expect(tokyo.data).toMatchObject({ localName: '東京', about: 'Start here.', color: 'green' });
    expect(os.records.get<{ coordinates?: unknown }>(tokyo.data.placeId!)!.data.coordinates).toEqual({ lat: 35.68, lng: 139.77 });
    const nights = nightsOf(os, t);
    expect(nights.map((n) => n.kind)).toEqual(['air', 'stay', 'stay', 'stay', 'stay', 'stay', 'stay']);
    expect(stopSpan(nights, tokyo.id)).toMatchObject({ nights: 4 });
    expect(os.records.query('event').find((e) => e.title === 'Flight BOM → HAN')!.data).toMatchObject({ flightNo: 'VN123', airline: 'Vietnam Airlines' });
    expect(dayPlans(os, t.id).get('2026-12-18')).toBe('Land at Haneda, check in, dinner nearby.');

    const again = importTripApp(os, snap, { me: 'Asha' });
    expect(again).toMatchObject({ tripId: t.id, createdTrip: false, days: 0 });
    expect(os.records.query('trip')).toHaveLength(1);
    expect(os.records.query<StopData>('stop')).toHaveLength(4);
    expect(os.records.query('event')).toHaveLength(6);
    expect(os.records.query('person')).toHaveLength(2);
  });
});
