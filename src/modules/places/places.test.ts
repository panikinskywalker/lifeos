import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBetterSqliteAdapter } from '@core/db/betterSqliteAdapter';
import { createLifeOS } from '@core/lifeos';
import { Registry } from '@core/registry/registry';
import type { LifeOSContext } from '@core/registry/context';
import { bus } from '@core/events/bus';
import { saveCalendarEvents } from '@core/sources/phone';
import { fileMail } from '@core/filing/messages';
import { graphTools, newSession, upsertNode } from '@core/graph/tools';
import { projectsModule } from '../projects';
import { travelModule } from '../travel';
import { crmModule } from '../crm';
import { placesModule, parseLocation, parseTable, placeInfo, placesBeen, placesNear, parentChain, type PlaceData, type OrgData } from '.';

let os: LifeOSContext;
const places = () => os.records.query<PlaceData>('place', {}, { limit: 1000 });
const place = (title: string) => places().find((p) => p.title === title)!;
const atOf = (id: string) => os.links.forEntity(id, 'at').filter((r) => r.direction === 'out').map((r) => r.other.title);

async function boot() {
  bus.clear();
  os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules: [crmModule, projectsModule, travelModule, placesModule], registry: new Registry() });
}

beforeEach(async () => boot());
afterEach(() => os.db.close());

describe('Place and Organisation', () => {
  it('a Place hangs in its parent; the chain reads nearest first', () => {
    const india = os.records.create({ object: 'place', title: 'India', data: { kind: 'country' } });
    const blr = os.records.create({ object: 'place', title: 'Bengaluru', data: { kind: 'city', parentId: india.id } });
    const kor = os.records.create<PlaceData>({ object: 'place', title: 'Koramangala', data: { kind: 'area', parentId: blr.id } });
    expect(parentChain(os, kor).map((p) => p.title)).toEqual(['Bengaluru', 'India']);
    expect(os.links.forEntity(kor.id, 'located_in')[0]!.other.title).toBe('Bengaluru');
  });

  it("Turf's venues stay valid: kind venue, maps link out of notes", () => {
    const v = os.records.create<PlaceData>({ object: 'place', title: 'Dome Turf', data: { kind: 'venue', notes: 'https://maps.app.goo.gl/abc123' } });
    const after = os.records.get<PlaceData>(v.id)!;
    expect(after.data.kind).toBe('venue');
    expect(after.data.mapsUrl).toBe('https://maps.app.goo.gl/abc123');
    expect(after.data.notes).toBeUndefined();
  });

  it('a name from a dump gets its kind (enrich)', () => {
    const s = newSession(os.dumps.add({ body: 'had beers at Toit brewpub' }).id);
    const n = upsertNode(os, s, { name: 'Toit brewpub', type: 'place' })!;
    expect(os.records.get<PlaceData>(n.id)!.data.kind).toBe('restaurant');
    const o = upsertNode(os, s, { name: 'HDFC Bank', type: 'org' })!;
    expect(os.records.get<OrgData>(o.id)!.data.kind).toBe('bank');
  });
});

describe('the R3 fold', () => {
  it('city and country text become parent Places, once', async () => {
    bus.clear();
    const db = createBetterSqliteAdapter(':memory:');
    const before = await createLifeOS({ db, modules: [crmModule, travelModule, projectsModule, { ...placesModule, onStart: undefined }], registry: new Registry() });
    before.records.create({ object: 'place', title: 'Toit', data: { kind: 'restaurant', city: 'Bengaluru', country: 'India' } });
    before.records.create({ object: 'place', title: 'Pune', data: { kind: 'city', city: 'Pune', country: 'India' } });
    os.db.close();
    bus.clear();
    os = await createLifeOS({ db, modules: [crmModule, travelModule, projectsModule, placesModule], registry: new Registry() });
    expect(parentChain(os, place('Toit')).map((p) => p.title)).toEqual(['Bengaluru', 'India']);
    expect(parentChain(os, place('Pune')).map((p) => p.title)).toEqual(['India']);
    expect(place('Toit').data.city).toBeUndefined();
    expect(places().filter((p) => p.title === 'India')).toHaveLength(1);
  });
});

describe('filing: events with a location', () => {
  it('calendar locations become Places; online meetings and bare rooms do not', () => {
    os.records.create({ object: 'place', title: 'Indiranagar', data: { kind: 'area' } });
    os.records.create({ object: 'place', title: 'Blue Tokai', data: { kind: 'restaurant' } });
    saveCalendarEvents(os, [
      { id: 'a', title: 'Dinner with Priya', start: Date.parse('2026-10-10T20:00:00'), location: 'Toit, 298 100 Feet Rd, Indiranagar, Bengaluru 560038' },
      { id: 'b', title: 'Coffee', start: Date.parse('2026-10-12T10:00:00'), location: 'Blue Tokai' },
      { id: 'c', title: 'Standup', start: Date.parse('2026-10-12T11:00:00'), location: 'https://meet.google.com/abc-defg' },
      { id: 'd', title: 'Sync', start: Date.parse('2026-10-12T15:00:00'), location: 'Room 4B' },
    ]);
    const ev = (t: string) => os.records.query('event', {}, { limit: 100 }).find((e) => e.title === t)!;
    expect(atOf(ev('Dinner with Priya').id)).toEqual(['Toit']);
    expect(place('Toit').data).toMatchObject({ kind: 'restaurant', address: '298 100 Feet Rd, Indiranagar, Bengaluru 560038', parentId: place('Indiranagar').id });
    expect(atOf(ev('Coffee').id)).toEqual(['Blue Tokai']);
    expect(atOf(ev('Standup').id)).toEqual([]);
    expect(atOf(ev('Sync').id)).toEqual([]);
    // The new Place is in To check; the matched one is not.
    expect(os.db.all<{ label: string }>(`SELECT label FROM filings WHERE kind='place'`).map((r) => r.label)).toEqual(['Place: Toit · from “Dinner with Priya”']);
  });

  it('parseLocation names the place and finds its city in the address', () => {
    const blr = os.records.create({ object: 'place', title: 'Bengaluru', data: { kind: 'city' } });
    expect(parseLocation(os, 'Third Wave Coffee, 12th Main, HAL 2nd Stage, Bengaluru, Karnataka 560038, India')).toMatchObject({ name: 'Third Wave Coffee', parentId: blr.id });
    expect(parseLocation(os, 'Zoom')).toBeNull();
    expect(parseLocation(os, '298, 100 Feet Rd')).toBeNull();
  });
});

describe('filing: mail', () => {
  const mail = (from: string, subject: string, text: string, date: string, uid = 1) => ({ uid, from, fromName: from.split('@')[1]!, subject, text, date: Date.parse(date) });

  it('a table booking becomes an Event at the restaurant', () => {
    const r = fileMail(os, mail('noreply@district.in', 'Table confirmed', 'Your table for 4 guests is confirmed at Toit Brewpub on Sat, 24 Oct 2026 at 8:00 PM.\nAddress: 298 100 Feet Rd, Indiranagar', '2026-10-20T10:00:00'), 'rutvij@gmail.com');
    expect(r.status).toBe('confirmed');
    const ev = os.records.get<{ kind: string; startAt: number }>(r.entityId!)!;
    expect(ev.data.kind).toBe('reservation');
    expect(new Date(ev.data.startAt).getHours()).toBe(20);
    expect(atOf(ev.id)).toEqual(['Toit Brewpub']);
    expect(place('Toit Brewpub').data.kind).toBe('restaurant');
    expect(parseTable('Your booking', 'Booking at Nope', Date.now())).toBeNull();
  });

  it('mail from an Organisation’s domain lands on its timeline; other parsers’ records are sent by it', () => {
    const marriott = os.records.create<OrgData>({ object: 'org', title: 'Booking.com', data: { kind: 'airline', website: 'booking.com' } });
    const r = fileMail(os, mail('noreply@mail.booking.com', 'Your booking is confirmed at JW Marriott', 'Your stay at JW Marriott in Pune.\nCheck-in: Tue 3 Nov 2026\nCheck-out: Thu 5 Nov 2026', '2026-10-20T09:00:00'), 'rutvij@gmail.com');
    expect(os.records.timeline.forEntity(marriott.id).some((t) => t.title.startsWith('Mail · Your booking'))).toBe(true);
    // Travel filed the stay; places marks it sent by Booking.com and links it at the hotel, in Pune.
    const stay = os.records.get<{ kind: string }>(r.entityId!)!;
    expect(stay.data.kind).toBe('stay');
    expect(atOf(stay.id)).toEqual(['JW Marriott']);
    expect(parentChain(os, place('JW Marriott')).map((p) => p.title)).toEqual(['Pune']);
    expect(os.links.forEntity(stay.id, 'sent_by').map((l) => l.other.id)).toEqual([marriott.id]);
    // A mail no other parser reads stays a leftover.
    const left = fileMail(os, mail('news@booking.com', 'Autumn offers', 'Save 20%', '2026-10-21T09:00:00', 2), 'rutvij@gmail.com');
    expect(left.status).toBe('dismissed');
  });
});

describe('AI tools', () => {
  it('place_info, places_been and places_near', () => {
    const home = os.records.create({ object: 'place', title: 'Home', data: { kind: 'home', coordinates: { lat: 12.9352, lng: 77.6245 } } });
    const toit = os.records.create({ object: 'place', title: 'Toit', data: { kind: 'restaurant', coordinates: { lat: 12.9791, lng: 77.6408 } } });
    os.records.create({ object: 'place', title: 'Gym', data: { kind: 'gym', coordinates: { lat: 12.9361, lng: 77.6250 } } });
    const now = Date.parse('2026-10-22T12:00:00');
    for (const d of ['2026-10-01', '2026-10-15']) {
      const e = os.records.create({ object: 'event', title: 'Beers', data: { kind: 'drinks', startAt: Date.parse(`${d}T20:00:00`) } });
      os.links.link(e.id, toit.id, 'at');
    }
    expect(placesBeen(os, 30, now)).toEqual([{ id: toit.id, name: 'Toit', kind: 'restaurant', visits: 2, last: '2026-10-15' }]);
    expect(placeInfo(os, 'toit', now)).toMatchObject({ visits: 2, lastBeen: { date: '2026-10-15', daysAgo: 6 }, kmFromHome: 5.2 });
    expect(placesNear(os, null, 1).places.map((p) => p.name)).toEqual(['Gym']);
    void home;
  });

  it('file_place from a dump: Toit in Indiranagar in Bengaluru, undoable', async () => {
    const s = newSession(os.dumps.add({ body: 'Toit is a brewpub in Indiranagar, Bengaluru' }).id);
    const tool = graphTools(s, os).find((t) => t.name === 'file_place')!;
    const out = (await tool.run({ name: 'Toit', kind: 'restaurant', in: 'Indiranagar, Bengaluru' }, os)) as { in: string[] };
    expect(out.in).toEqual(['Indiranagar', 'Bengaluru']);
    expect(place('Indiranagar').data.kind).toBe('area');
    expect(os.filings.forDump(s.dumpId).map((f) => f.label)).toEqual(['Place: Bengaluru', 'Place: Indiranagar', 'Place: Toit (restaurant)']);
  });
});
