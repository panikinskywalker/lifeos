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
import { addThing, eventsOf, filterThings, happeningOn, importTripApp, onRouteAsks, onRouteKey, onRouteSuggestions, setThingStatus, stopsOf, thingsAt, thingStatus, travelBrain, travelModule, TRIP_APP_FORMAT, type OutingData, type TripAppSnapshot, type TripData } from '.';

/**
 * The trip template, slice 3: things to do at each stop, events on the route
 * and what to be aware of, and Claude's "what's on while you're there". The
 * snapshot is made up in the Japan app's shape.
 */

let os: LifeOSContext;
beforeEach(async () => {
  bus.clear();
  os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules: [crmModule, financeModule, projectsModule, placesModule, travelModule], registry: new Registry() });
});
afterEach(() => os.db.close());

const snap: TripAppSnapshot = {
  format: TRIP_APP_FORMAT,
  key: 'sample',
  destination: 'Japan',
  meta: { travellers: ['Asha'], start: '2026-12-26', end: '2027-01-02' },
  places: [
    { id: 'magome', name: 'Magome', jp: '馬籠', kind: 'stop', order: 1 },
    { id: 'kyoto', name: 'Kyoto', jp: '京都', kind: 'stop', order: 2 },
  ],
  bookings: [
    { id: 's1', kind: 'stay', status: 'Confirmed', title: 'Post Town Inn', placeId: 'magome', start: '2026-12-26', end: '2026-12-27' },
    { id: 's2', kind: 'stay', status: 'Confirmed', title: 'Kyoto inn', placeId: 'kyoto', start: '2026-12-27', end: '2027-01-02' },
  ],
  things: [
    { id: 't1', title: 'Nakasendo walk to Tsumago', place: 'magome', kind: 'Do', status: 'Idea', crowd: 1, quietest: 'Quiet in winter', note: '8 km, 2.5–3 h.', suggested: true },
    { id: 't2', title: 'Dinner at the inn', place: 'magome', kind: 'Eat', status: 'Planned', cost: 3630, day: '2026-12-26', note: 'Reserve a day ahead.', suggested: false },
    { id: 't3', title: 'Magome-juku post town', place: 'magome', kind: 'See', status: 'Want to', cost: 0, lat: 35.527, lon: 137.566, quietest: 'after 15:00', note: '', suggested: true, book: [{ label: 'Guided walk', url: 'https://example.com/walk' }] },
    { id: 't4', title: 'Hot spring', place: 'kyoto', kind: 'Onsen', status: 'Idea', note: '', suggested: true },
  ],
  events: [
    { id: 'e1', title: 'Joya no Kane', type: 'Festival', start: '2026-12-31', end: '2026-12-31', place: 'kyoto', where: 'Chion-in', conf: 'Past pattern', link: 'https://example.com/joya', note: '108 bell strikes.' },
    { id: 'e2', title: 'New Year closures', type: 'Closure', start: '2026-12-29', end: '2027-01-03', place: '', where: 'Museums', conf: 'Past pattern', note: 'Check opening days.' },
    { id: 'e3', title: 'Spring fair', type: 'Seasonal', start: '2027-04-01', end: '2027-04-03', place: 'kyoto', where: '', conf: 'Predicted', note: '' },
  ],
};

describe('things to do', () => {
  it('imported per stop, with kind, status, cost, how busy, the quietest time, links to book and a Place for a pin', () => {
    const r = importTripApp(os, snap, { me: 'Asha' });
    expect(r).toMatchObject({ things: 4, events: 3 });
    const [magome, kyoto] = stopsOf(os, r.tripId);
    const here = thingsAt(os, magome!);
    expect(here.map((t) => [t.title, t.data.kind, thingStatus(t)])).toEqual([
      ['Dinner at the inn', 'eat', 'planned'],
      ['Magome-juku post town', 'see', 'want'],
      ['Nakasendo walk to Tsumago', 'do', 'idea'],
    ]);
    const juku = here[1]!;
    expect(juku.data).toMatchObject({ cost: 0, quietest: 'after 15:00', suggested: true, book: [{ label: 'Guided walk', url: 'https://example.com/walk' }] });
    expect(os.records.get<{ coordinates?: unknown }>(juku.data.placeId!)!.data.coordinates).toEqual({ lat: 35.527, lng: 137.566 });
    expect(os.links.forEntity(juku.id, 'stop')[0]!.other.id).toBe(magome!.id);
    expect(thingsAt(os, kyoto!).map((t) => t.data.kind)).toEqual(['relax']);
    expect(filterThings(here, 'free').map((t) => t.title)).toEqual(['Magome-juku post town']);
    expect(filterThings(here, 'planned').map((t) => t.title)).toEqual(['Dinner at the inn']);
    // A second import changes nothing.
    importTripApp(os, snap, { me: 'Asha' });
    expect(os.records.query('outing')).toHaveLength(7);
  });

  it('status with Undo; one added by hand starts as an idea', () => {
    const r = importTripApp(os, snap, { me: 'Asha' });
    const [magome] = stopsOf(os, r.tripId);
    const walk = thingsAt(os, magome!).find((t) => t.title.startsWith('Nakasendo'))!;
    const undo = setThingStatus(os, walk.id, 'planned');
    expect(thingStatus(os.records.get<OutingData>(walk.id)!)).toBe('planned');
    undo();
    expect(thingStatus(os.records.get<OutingData>(walk.id)!)).toBe('idea');
    const t = addThing(os, r.tripId, 'Gohei-mochi', { kind: 'eat', stopId: magome!.id });
    expect([t.status, t.data.kind, t.data.tripId]).toEqual(['idea', 'eat', r.tripId]);
  });
});

describe('events on the route', () => {
  it('on the trip dates only, soonest first; what is on a day, at its stop or trip-wide, and what is planned', () => {
    const r = importTripApp(os, snap, { me: 'Asha' });
    const t = os.records.get<TripData>(r.tripId)!;
    expect(eventsOf(os, t).map((e) => [e.title, e.data.happening, e.data.sure])).toEqual([
      ['New Year closures', 'closure', 'past'],
      ['Joya no Kane', 'festival', 'past'],
    ]);
    const [magome, kyoto] = stopsOf(os, t.id);
    expect(happeningOn(os, t, '2026-12-31', kyoto!.id).events.map((e) => e.title)).toEqual(['Joya no Kane', 'New Year closures']);
    expect(happeningOn(os, t, '2026-12-26', magome!.id)).toMatchObject({ events: [], planned: [{ title: 'Dinner at the inn' }] });
  });

  it('Claude is asked per stop and its dates; its answer is offered, without what is already there', () => {
    const r = importTripApp(os, snap, { me: 'Asha' });
    const now = new Date('2026-11-16T09:00:00').getTime();
    const asks = onRouteAsks(os, now);
    const [magome, kyoto] = stopsOf(os, r.tripId);
    expect(asks.map((a) => a.key)).toEqual([onRouteKey(magome!.id, '2026-12-26', '2026-12-27'), onRouteKey(kyoto!.id, '2026-12-27', '2027-01-02')]);
    expect(asks[1]!.record).toEqual({ place: 'Kyoto', country: 'Japan', from: '2026-12-27', to: '2027-01-02' });
    expect(travelBrain.asks!(os, now)).toHaveLength(2);
    os.brain.learned.put(asks[1]!.key, ['Joya no Kane | festival | 2026-12-31 | 2026-12-31 | official | bells', 'Okera Mairi | festival | 2026-12-31 | 2027-01-01 | past | a sacred flame to carry home', 'Snow on the hills | weather | 2026-12-28 | | predicted | '], { module: 'travel' });
    expect(onRouteSuggestions(os, kyoto!, { from: '2026-12-27', to: '2027-01-02' })).toEqual([
      { title: 'Okera Mairi', happening: 'festival', day: '2026-12-31', until: '2027-01-01', sure: 'past', line: 'a sacred flame to carry home' },
      { title: 'Snow on the hills', happening: 'weather', day: '2026-12-28', until: undefined, sure: 'predicted', line: undefined },
    ]);
    expect(onRouteAsks(os, new Date('2027-01-05T09:00:00').getTime())).toEqual([]);
  });
});
