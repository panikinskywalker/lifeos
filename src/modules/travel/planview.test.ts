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
import { calendarCells, calendarDays, crowdBars, ensureStop, faresEach, fitMap, happeningMark, kmBetween, legChip, legMode, legTimes, monthsTitle, nearestOnLine, nightsOf, planLegs, quietestThing, quietHours, saveStop, setStopPosition, stationCode, planNormals, stopsOf, takesHours, tightestMove, travelModule, type OutingData, type TripData } from '.';

/**
 * Plan as the trip template draws it: legs between stops, the calendar's
 * bars, the drawn map, station codes, crowds; and editing a stop. Made-up
 * data in the trip app's shape, not a real trip.
 */

let os: LifeOSContext;
beforeEach(async () => {
  bus.clear();
  os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules: [crmModule, financeModule, projectsModule, placesModule, travelModule], registry: new Registry() });
});
afterEach(() => os.db.close());

const at = (s: string) => new Date(s).getTime();
const trip = (data: Partial<TripData> = {}) => os.records.create<TripData>({ object: 'trip', data: { destination: 'Japan', startDate: '2030-03-02', endDate: '2030-03-07', ...data } });
const linked = (tripId: string, title: string, data: Record<string, unknown>) => {
  const e = os.records.create({ object: 'event', title, data });
  os.links.link(e.id, tripId, 'part_of');
  return e;
};

function lineTrip() {
  const t = trip();
  const a = ensureStop(os, t.id, 'Hakone', { localName: '箱根' }).stop;
  const b = ensureStop(os, t.id, 'Nagano', { localName: '長野' }).stop;
  const c = ensureStop(os, t.id, 'Nara', { localName: '奈良' }).stop;
  linked(t.id, 'Stay · Inn A', { kind: 'stay', startAt: at('2030-03-02T15:00:00'), endAt: at('2030-03-04T11:00:00'), stopId: a.id });
  linked(t.id, 'Stay · Inn B', { kind: 'stay', startAt: at('2030-03-04T15:00:00'), endAt: at('2030-03-05T11:00:00'), stopId: b.id });
  linked(t.id, 'Stay · Inn C', { kind: 'stay', startAt: at('2030-03-05T15:00:00'), endAt: at('2030-03-07T11:00:00'), stopId: c.id });
  const j1 = linked(t.id, 'Hakone → Nagano', { kind: 'journey', startAt: at('2030-03-04T10:30:00'), endAt: at('2030-03-04T15:15:00'), fromStopId: a.id, toStopId: b.id, mode: 'bus', takes: '≈2–2.5 h', fare: 3000, currency: 'JPY', seatsOpenAt: at('2030-02-04T10:00:00') });
  const j2 = linked(t.id, 'Nagano → Nara', { kind: 'journey', startAt: at('2030-03-05T09:00:00'), mode: 'train + bus', takes: '4–5 h', fare: 9000, currency: 'JPY', plan: 'booked', steps: '09:00 Leave\n12:00 Change\n14:00 Arrive' });
  return { t, a, b, c, j1, j2 };
}

describe('legs between the stops', () => {
  it('pairs each stop with the next, finding the journey by its stops or its day', () => {
    const { t, a, b, c, j1, j2 } = lineTrip();
    const legs = planLegs(os, t.id, stopsOf(os, t.id), nightsOf(os, t));
    expect(legs.map((l) => [l.fromStopId, l.toStopId, l.day, l.journey?.id])).toEqual([
      [a.id, b.id, '2030-03-04', j1.id],
      [b.id, c.id, '2030-03-05', j2.id],
    ]);
    expect(legTimes(legs[0]!.journey!)).toBe('10:30→15:15 · 2–2.5 h');
    expect(legMode(legs[0]!.journey)).toBe('bus');
    expect(legMode(legs[1]!.journey)).toBe('train');
    expect(legChip(legs[0]!.journey, at('2030-01-10T00:00:00'))).toEqual({ kind: 'seats', label: 'seats open 4 Feb' });
    expect(legChip(legs[0]!.journey, at('2030-02-10T00:00:00')).kind).toBe('open');
    expect(legChip(legs[1]!.journey).label).toBe('booked');
    expect(legChip(null).kind).toBe('none');
    expect(legChip({ data: { kind: 'journey', startAt: at('2030-03-04T10:30:00'), bookNote: 'Highway bus seats open about 4 Feb' } }, at('2030-01-10T00:00:00')).label).toBe('seats open 4 Feb');
    expect(legChip({ data: { kind: 'journey', startAt: at('2030-01-04T10:30:00'), bookNote: 'Reserve seats from 5 Dec' } }, at('2029-11-10T00:00:00')).label).toBe('seats open 5 Dec');
    expect(faresEach(legs)).toEqual({ JPY: 12000 });
    expect(tightestMove(legs)?.day).toBe('2030-03-05');
  });

  it('reads how long a journey takes', () => {
    expect(takesHours('≈2–2.5 h')).toBe(2.5);
    expect(takesHours('40–60 min')).toBe(1);
    expect(takesHours(undefined)).toBe(0);
  });
});

describe('the calendar', () => {
  it('whole weeks from Monday, bars that break at the week, moving days and the day home', () => {
    const { t, a, b } = lineTrip();
    const days = calendarDays('2030-03-02', '2030-03-07');
    expect(days[0]).toBe('2030-02-25');
    expect(days.length).toBe(14);
    const cells = calendarCells(days, nightsOf(os, t), '2030-03-07');
    const c = (d: string) => cells.find((x) => x.day === d)!;
    expect(c('2030-03-02')).toMatchObject({ kind: 'stay', stopId: a.id, starts: true, ends: false });
    expect(c('2030-03-03')).toMatchObject({ starts: false, ends: true }); // Sunday ends the week
    expect(c('2030-03-04')).toMatchObject({ stopId: b.id, starts: true, ends: true, moving: true });
    expect(c('2030-03-07').kind).toBe('home');
    expect(c('2030-02-26').inTrip).toBe(false);
    expect(monthsTitle({ startDate: '2030-12-20', endDate: '2031-01-04' })).toBe('Dec → Jan');
  });
});

describe('a stop', () => {
  it('a station code, its weather, the nearest stop to an idea', () => {
    expect(stationCode('Magome')).toBe('MGM');
    expect(stationCode('Osaka')).toBe('OSK');
    expect(stationCode('Ise')).toBe('ISE');
    expect(planNormals({ title: 'Kyoto', data: { kind: 'stop' } }, '2030-12-30')).toEqual({ hi: 12, lo: 3, sky: 'cloud' });
    expect(planNormals({ title: 'Kyoto', data: { kind: 'stop' } }, null)).toBeNull();
    const tokyo = { lat: 35.68, lng: 139.77 }, osaka = { lat: 34.69, lng: 135.5 };
    expect(Math.round(kmBetween(tokyo, osaka))).toBeGreaterThan(390);
    expect(nearestOnLine({ lat: 34.9, lng: 135.7 }, [{ id: 't', pin: tokyo }, { id: 'o', pin: osaka }, { id: 'x', pin: null }])?.id).toBe('o');
  });

  it('the drawn map fits the pins inside its box', () => {
    const f = fitMap([{ lat: 35.68, lng: 139.77 }, { lat: 34.69, lng: 135.5 }], { x: 20, y: 100, w: 300, h: 200 });
    const a = f.at({ lat: 35.68, lng: 139.77 }), b = f.at({ lat: 34.69, lng: 135.5 });
    expect(Math.round(b.x)).toBe(20);
    expect(Math.round(a.x)).toBe(320);
    expect(a.y).toBeLessThan(b.y);
    expect(a.y).toBeGreaterThanOrEqual(100);
    expect(b.y).toBeLessThanOrEqual(300);
  });

  it('quiet hours from a note, and the busiest thing that has them', () => {
    expect(quietHours('after 15:00')).toEqual([15, 16, 17, 18, 19]);
    expect(quietHours('early morning')).toEqual([8, 9]);
    expect(quietHours('weekday mornings')).toEqual([8, 9, 10]);
    expect(quietHours('in winter')).toBeNull();
    expect(crowdBars(5)[4]).toBeGreaterThan(crowdBars(1)[4]!);
    const thing = (title: string, data: Partial<OutingData>) => ({ id: title, title, data: { kind: 'see', ...data } }) as never;
    expect(quietestThing([thing('A', { crowd: 2, quietest: 'after 15:00' }), thing('B', { crowd: 4, quietest: 'before 8:00' }), thing('C', { crowd: 5 })])).toMatchObject({ title: 'B' });
    expect(happeningMark({ data: { kind: 'event', happening: 'festival' } })).toBe('祭');
    expect(happeningMark({ data: { kind: 'event', happening: 'seasonal', day: '2030-12-26' } })).toBe('冬');
  });
});

describe('editing a stop', () => {
  it('saves names, kind, colour, about and its pin, with Undo', () => {
    const t = trip();
    const s = ensureStop(os, t.id, 'Takayama', { kind: 'idea' }).stop;
    ensureStop(os, t.id, 'Tokyo');
    const undo = saveStop(os, s.id, { title: 'Takayama', localName: '高山', kind: 'stop', color: 'plum', about: 'Old town', coordinates: { lat: 36.1, lng: 137.2 } });
    const after = os.records.get<{ kind: string; order: number; localName: string; color: string; placeId: string }>(s.id)!;
    expect(after.data).toMatchObject({ kind: 'stop', order: 2, localName: '高山', color: 'plum' });
    expect(os.records.get<{ coordinates: unknown }>(after.data.placeId)!.data.coordinates).toEqual({ lat: 36.1, lng: 137.2 });
    undo();
    expect(os.records.get<{ kind: string; localName?: string }>(s.id)!.data).toMatchObject({ kind: 'idea' });
    expect(os.records.get<{ localName?: string }>(s.id)!.data.localName).toBeUndefined();
  });

  it('puts a stop anywhere on the line, with Undo', () => {
    const t = trip();
    for (const n of ['Tokyo', 'Kyoto', 'Osaka']) ensureStop(os, t.id, n);
    const nara = ensureStop(os, t.id, 'Nara', { kind: 'idea' }).stop;
    const osaka = stopsOf(os, t.id)[2]!;
    const undo = setStopPosition(os, osaka.id, 0);
    expect(stopsOf(os, t.id).map((s) => s.title)).toEqual(['Osaka', 'Tokyo', 'Kyoto']);
    undo();
    expect(stopsOf(os, t.id).map((s) => s.title)).toEqual(['Tokyo', 'Kyoto', 'Osaka']);
    setStopPosition(os, nara.id, 1);
    expect(stopsOf(os, t.id).map((s) => s.title)).toEqual(['Tokyo', 'Nara', 'Kyoto', 'Osaka']);
  });
});
