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
import { assetsModule } from '../assets';
import { inventoryModule } from '../inventory';
import { addToTrip, backHome, clothesKind, linkTripPlace, pack, packingKey, packingList, parseFlight, parseStay, spentWhileAway, travelBrain, travelModule, tripBookings, tripDays, tripSpend, tripsTo, type TripData } from '.';

/**
 * R7d travel: trips, spend vs budget through Links, flights and stays from
 * booking mail, the packing list and the brain's coming up.
 *
 * The booking mails below are plausible samples written for these tests
 * (IndiGo, Air India, MakeMyTrip flight and hotel, Booking.com, Airbnb), laid
 * out the way those senders' plain-text parts usually are; none is a real
 * mail. Real ones are listed in docs/handover/r7d-travel.md.
 */

let os: LifeOSContext;
const SENT = Date.parse('2026-11-02T10:00:00');
const mail = (from: string, fromName: string, subject: string, text: string, uid = 1, date = SENT) => ({ uid, from, fromName, subject, text, date });
const at = (s: string) => new Date(s).getTime();

const INDIGO = mail('reservations@customer.goindigo.in', 'IndiGo', 'Your IndiGo Itinerary - PNR X5RT9P', 'Dear Rutvij,\nThank you for choosing IndiGo.\nPNR: X5RT9P\nBooking Date: 02 Nov 2026\nFlight 6E 6123\nBengaluru (BLR) 06:15 → Goa (GOX) 07:35\nDate: Fri, 18 Dec 2026\nDeparture 06:15 hrs\nPassenger: Mr Rutvij\nTotal fare: ₹6,412', 1);
const AIR_INDIA = mail('noreply@airindia.com', 'Air India', 'Air India e-Ticket - Booking Reference 7HQWZ2', 'Booking Reference (PNR): 7HQWZ2\nFlight AI 2894\nGOX - BLR\nDeparture: 22 Dec 2026, 18:30\nArrival: 22 Dec 2026, 19:45\nTotal fare: ₹5,210', 2);
const MMT_FLIGHT = mail('noreply@makemytrip.com', 'MakeMyTrip', 'Flight booking confirmed - Mumbai to Delhi', 'Hi Rutvij, your flight booking is confirmed.\nBooking ID: NF7AB12CD34\nMumbai to Delhi\nIndiGo 6E-2175\nOnward: Thu, 14 Jan 2027, 07:05\nAirline PNR: QZ81TR', 3);
const MMT_HOTEL = mail('noreply@makemytrip.com', 'MakeMyTrip', 'Hotel booking confirmed - The Park Calangute', 'Your booking is confirmed!\nBooking ID: NH2611AB34\nHotel: The Park Calangute\nCalangute, Goa\nCheck-in: Fri, 18 Dec 2026, 2:00 PM\nCheck-out: Tue, 22 Dec 2026, 12:00 PM\n1 Room, 2 Adults', 4);
const BOOKING = mail('noreply@booking.com', 'Booking.com', 'Your booking is confirmed at Lemon Tree Premier, Aerocity', 'Thanks, Rutvij! Your booking in New Delhi is confirmed.\nLemon Tree Premier, Aerocity\nAerocity, New Delhi, 110037, India\nCheck-in Thursday, 14 January 2027 (from 14:00)\nCheck-out Saturday, 16 January 2027 (until 12:00)\nConfirmation number: 4012345678', 5);
const AIRBNB = mail('automated@airbnb.com', 'Airbnb', 'Reservation confirmed - Cosy cabin in Old Manali', "You're going to Old Manali!\nCosy cabin in Old Manali\nEntire cabin hosted by Tenzin\nCheck-in\nFri, Feb 12\n3:00 PM\nCheckout\nMon, Feb 15\n11:00 AM\nConfirmation code: HMQ4K2X9TZ", 6);

beforeEach(async () => {
  bus.clear();
  os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules: [crmModule, financeModule, projectsModule, placesModule, assetsModule, inventoryModule, travelModule], registry: new Registry() });
});
afterEach(() => os.db.close());

const trips = () => os.records.query<TripData>('trip', { sort: [{ field: 'data.startDate', dir: 'asc' }] });
const trip = (destination: string, data: Partial<TripData> = {}) => os.records.create<TripData>({ object: 'trip', data: { destination, ...data } });
const spend = (amount: number, date: string, data: Record<string, unknown> = {}) => os.records.create({ object: 'transaction', data: { amount, kind: 'expense', category: 'food', date, ...data } });
const cloth = (title: string, state?: string) => os.records.create({ object: 'asset', title, data: { category: 'clothing', ...(state ? { state } : {}) } });

describe('flights and stays from booking mail (plausible samples)', () => {
  it('IndiGo: the route from the codes in brackets, the flight day not the booking day', () => {
    expect(parseFlight(INDIGO)).toEqual({ airline: 'IndiGo', flightNo: '6E 6123', pnr: 'X5RT9P', from: 'BLR', to: 'GOX', date: '2026-12-18', time: '06:15' });
  });

  it('Air India: PNR from the subject, route and time', () => {
    expect(parseFlight(AIR_INDIA)).toEqual({ airline: 'Air India', flightNo: 'AI 2894', pnr: '7HQWZ2', from: 'GOX', to: 'BLR', date: '2026-12-22', time: '18:30' });
  });

  it('MakeMyTrip flight: the airline named in the body, the route from the cities', () => {
    expect(parseFlight(MMT_FLIGHT)).toEqual({ airline: 'IndiGo', flightNo: '6E 2175', pnr: 'QZ81TR', from: 'BOM', to: 'DEL', date: '2027-01-14', time: '07:05' });
  });

  it('MakeMyTrip hotel, Booking.com and Airbnb stays', () => {
    expect(parseStay(MMT_HOTEL)).toEqual({ name: 'The Park Calangute', checkIn: '2026-12-18', checkOut: '2026-12-22', place: 'Goa' });
    expect(parseStay(BOOKING)).toEqual({ name: 'Lemon Tree Premier, Aerocity', checkIn: '2027-01-14', checkOut: '2027-01-16', place: 'Delhi' });
    expect(parseStay(AIRBNB)).toEqual({ name: 'Cosy cabin in Old Manali', checkIn: '2027-02-12', checkOut: '2027-02-15', place: 'Old Manali' });
  });

  it('filed: one booked trip per journey, its Place, its end moved by the return flight; the fare is its spend', () => {
    for (const m of [INDIGO, MMT_HOTEL, AIR_INDIA, MMT_FLIGHT, BOOKING, AIRBNB]) fileMail(os, m, 'rutvij@gmail.com');
    expect(trips().map((t) => [t.title, t.data.startDate, t.data.endDate, t.status])).toEqual([
      ['Trip to Goa', '2026-12-18', '2026-12-22', 'booked'],
      ['Trip to Delhi', '2027-01-14', '2027-01-16', 'booked'],
      ['Trip to Old Manali', '2027-02-12', '2027-02-15', 'booked'],
    ]);
    const [goa, delhi] = trips();
    expect(tripBookings(os, goa!.id).map((b) => [b.kind, b.title, b.pnr])).toEqual([
      ['flight', 'Flight Bengaluru → Goa', 'X5RT9P'],
      ['stay', 'Stay · The Park Calangute', null],
      ['flight', 'Flight Goa → Bengaluru', '7HQWZ2'],
    ]);
    expect(tripBookings(os, delhi!.id).map((b) => b.kind)).toEqual(['flight', 'stay']);
    // Its destination is a Place, word `to`, and the Place lists it.
    const place = os.records.get(goa!.data.placeId!)!;
    expect(place).toMatchObject({ object: 'place', title: 'Goa' });
    expect(tripsTo(os, place.id).map((t) => t.id)).toEqual([goa!.id]);
    expect(tripSpend(os, goa!).spent).toBe(6412 + 5210);
  });
});

describe('a trip and its Place', () => {
  it('matches a Place of that name (a city first), else makes one; the R7d fold links trips made before', () => {
    const area = os.records.create({ object: 'place', title: 'Kyoto', data: { kind: 'restaurant' } });
    const city = os.records.create({ object: 'place', title: 'Kyoto', data: { kind: 'city' } });
    expect(trip('Kyoto').data.placeId).toBeUndefined();
    const t = trips()[0]!;
    expect(os.records.get<TripData>(t.id)!.data.placeId).toBe(city.id);
    expect(area.id).not.toBe(city.id);
    const made = os.records.get<TripData>(trip('Hampi').id)!;
    expect(os.records.get(made.data.placeId!)).toMatchObject({ title: 'Hampi', data: { kind: 'city' } });
    expect(os.links.forEntity(made.id, 'to')[0]!.other.title).toBe('Hampi');
    // Already linked: left alone.
    expect(linkTripPlace(os, made)).toBe(made.data.placeId);
  });
});

describe('spend vs budget, through Links', () => {
  it('counts expenses linked by the Trip Field or a booking mail once each; income stays out; per day and what is left', () => {
    const t = trip('Goa', { startDate: '2026-12-18', endDate: '2026-12-21', budget: 30000 });
    const fare = spend(6000, '2026-11-02', { category: 'travel' });
    os.links.link(fare.id, t.id, 'part_of');
    spend(2400, '2026-12-18', { tripId: t.id });
    const both = spend(1600, '2026-12-19', { tripId: t.id });
    os.links.link(both.id, t.id, 'part_of');
    spend(500, '2026-12-19', { tripId: t.id, kind: 'income' });
    const s = tripSpend(os, os.records.get<TripData>(t.id)!, at('2026-12-19T20:00:00'));
    expect(s).toMatchObject({ spent: 10000, count: 3, budget: 30000, left: 20000, over: false, perDay: 5000, leftPerDay: 6667 });
    expect(s.byCategory).toEqual([{ category: 'travel', amount: 6000 }, { category: 'food', amount: 4000 }]);
    expect(tripDays(t.data)).toBe(4);
  });

  it('spends on the trip days linked to no trip are offered, and adding one goes through the Trip Field with Undo', () => {
    const t = trip('Goa', { startDate: '2026-12-18', endDate: '2026-12-21' });
    const loose = spend(850, '2026-12-20', { merchant: 'Britto’s' });
    spend(300, '2026-12-25');
    expect(spentWhileAway(os, t).map((x) => x.id)).toEqual([loose.id]);
    const undo = addToTrip(os, t.id, loose.id);
    expect(spentWhileAway(os, t)).toEqual([]);
    expect(tripSpend(os, os.records.get<TripData>(t.id)!).spent).toBe(850);
    undo();
    expect(tripSpend(os, os.records.get<TripData>(t.id)!).spent).toBe(0);
  });
});

describe('packing', () => {
  const wardrobe = () => {
    for (const x of ['White oxford shirt', 'Black polo', 'Grey tee', 'Olive kurta', 'Checked flannel shirt']) cloth(x);
    cloth('Blue linen shirt', 'wash');
    cloth('Dark blue jeans');
    cloth('Khaki shorts');
    cloth('Swim shorts');
    cloth('Pyjamas');
    cloth('Turf kit');
  };

  it('kinds from the name', () => {
    expect(['Swim shorts', 'Khaki shorts', 'Grey tee', 'Pyjamas', 'Fleece jacket', 'Turf kit'].map(clothesKind)).toEqual(['swim', 'bottom', 'top', 'sleep', 'warm', 'other']);
  });

  it('a four-day beach trip: tops by the days from what is clean, swimwear, the Bathroom’s things and the beach ones', () => {
    wardrobe();
    const bath = os.records.query('space').find((s) => s.title === 'Bathroom')!;
    os.records.create({ object: 'stock', title: 'Colgate', data: { spaceId: bath.id, quantity: 1 } });
    os.records.create({ object: 'stock', title: 'Dettol handwash', data: { spaceId: bath.id, quantity: 1 } });
    const t = trip('Goa', { startDate: '2026-12-18', endDate: '2026-12-21' });
    const l = packingList(os, t);
    expect(l).toMatchObject({ days: 4, daysGuessed: false, climate: 'beach', abroad: false, line: '4 days · beach · 5 tops, 2 bottoms, sleepwear, swimwear' });
    const picked = l.clothes.filter((c) => c.suggested).map((c) => c.title).sort();
    expect(picked).toEqual(['Black polo', 'Checked flannel shirt', 'Dark blue jeans', 'Grey tee', 'Khaki shorts', 'Olive kurta', 'Pyjamas', 'Swim shorts', 'White oxford shirt']);
    expect(l.clothes.find((c) => c.title === 'Blue linen shirt')).toMatchObject({ state: 'wash', suggested: false });
    expect(l.short).toEqual([]);
    expect(l.items.map((i) => i.title)).toEqual(['Colgate', 'Dettol handwash', 'Phone charger', 'ID card', 'Medicines', 'Sunscreen', 'Sunglasses', 'Flip-flops']);
  });

  it('abroad and for work: passport and laptop; a cold place wants warm layers you may not have; the learned list joins in', () => {
    const t = trip('Zurich', { startDate: '2027-01-10', endDate: '2027-01-12', purpose: 'work', localCurrency: 'EUR' });
    os.brain.learned.put(packingKey(t.data), ['Umbrella'], { module: 'travel' });
    const l = packingList(os, t);
    expect(l).toMatchObject({ climate: 'cold', abroad: true });
    expect(l.short.map((s) => s.kind)).toEqual(['top', 'bottom', 'sleep', 'warm']);
    expect(l.items.map((i) => i.title)).toEqual(expect.arrayContaining(['Passport', 'Forex card', 'Plug adapter', 'Laptop', 'Gloves', 'Umbrella']));
    expect(l.items.find((i) => i.title === 'Umbrella')!.from).toBe('brain');
  });

  it('Pack sets clothes packed and links them packed for the trip; a re-pack puts one back clean; Undo; Back home puts them in the wash', () => {
    wardrobe();
    const t = trip('Goa', { startDate: '2026-12-18', endDate: '2026-12-21' });
    const id = (title: string) => os.records.query('asset').find((a) => a.title === title)!.id;
    const state = (title: string) => os.records.get<{ state?: string }>(id(title))!.data.state ?? 'clean';
    pack(os, t.id, [id('Grey tee'), id('Swim shorts')], ['Sunscreen']);
    expect([state('Grey tee'), state('Swim shorts')]).toEqual(['packed', 'packed']);
    expect(os.links.forEntity(t.id, 'packed_for').map((r) => r.other.title).sort()).toEqual(['Grey tee', 'Swim shorts']);
    expect(os.records.get<TripData>(t.id)!.data.packed).toEqual(['Sunscreen']);
    expect(packingList(os, os.records.get<TripData>(t.id)!).items.find((i) => i.title === 'Sunscreen')!.packed).toBe(true);
    const undo = pack(os, t.id, [id('Grey tee')], []);
    expect([state('Grey tee'), state('Swim shorts')]).toEqual(['packed', 'clean']);
    undo();
    expect([state('Grey tee'), state('Swim shorts')]).toEqual(['packed', 'packed']);
    expect(os.links.forEntity(t.id, 'packed_for')).toHaveLength(2);
    const back = backHome(os, t.id);
    expect(back.count).toBe(2);
    expect([state('Grey tee'), state('Swim shorts')]).toEqual(['wash', 'wash']);
    back.undo();
    expect(state('Grey tee')).toBe('packed');
  });
});

describe('travel’s candidates for the brain', () => {
  const NOW = at('2026-12-16T09:00:00');
  const keys = (c: Array<{ key: string }>) => c.map((x) => x.key.split(':').slice(0, 2).join(':')).sort();

  it('two days out: pack (with the packing ask) and before you go; nothing for far trips', () => {
    const t = trip('Goa', { startDate: '2026-12-18', endDate: '2026-12-21', purpose: 'leisure' });
    trip('Kyoto', { startDate: '2027-03-01' });
    const c = travelBrain.candidates(os, NOW);
    expect(keys(c)).toEqual(['travel:before', 'travel:pack']);
    const p = c.find((x) => x.key.startsWith('travel:pack'))!;
    expect(p).toMatchObject({ kind: 'coming up', shape: 'ask', subjectId: t.id, yes: 'Pack', route: `/module/travel/pack?trip=${t.id}`, line: 'Goa on Fri: pack 5 tops, 2 bottoms, sleepwear, swimwear' });
    expect(p.record).toMatchObject({ destination: 'Goa', days: 4, starts_in_days: 2, kind_of_place: 'beach' });
    expect(p.asks![0]!.key).toBe(packingKey(t.data));
    expect(travelBrain.act!(os, 'yes', { payload: p.payload } as never)).toEqual({ open: `/module/travel/pack?trip=${t.id}` });
  });

  it('once packed, no pack nudge', () => {
    const t = trip('Goa', { startDate: '2026-12-18', endDate: '2026-12-21' });
    pack(os, t.id, [], ['Charger']);
    expect(keys(travelBrain.candidates(os, NOW))).toEqual(['travel:before']);
  });

  it('check in: a flight within 48 hours, urgent within a day; Yes opens the airline; never the PNR', () => {
    const f = os.records.create({ object: 'event', title: 'Flight Bengaluru → Goa', data: { kind: 'flight', startAt: at('2026-12-17T06:15:00'), airline: 'IndiGo', flightNo: '6E 6123', notes: 'PNR X5RT9P' } });
    os.records.create({ object: 'event', title: 'Flight later', data: { kind: 'flight', startAt: at('2026-12-20T06:15:00') } });
    const [c] = travelBrain.candidates(os, NOW);
    expect(c).toMatchObject({ subjectId: f.id, urgent: true, yes: 'Check in', line: 'Check in: 6E 6123 tomorrow at 06:15' });
    expect(JSON.stringify(c!.record)).not.toContain('X5RT9P');
    expect(travelBrain.act!(os, 'yes', { payload: c!.payload } as never)).toEqual({ open: 'https://www.goindigo.in' });
  });

  it('back home: clothes still packed a few days after a trip', () => {
    const t = trip('Goa', { startDate: '2026-12-10', endDate: '2026-12-14' });
    pack(os, t.id, [cloth('Grey tee').id], []);
    const c = travelBrain.candidates(os, NOW);
    expect(c.map((x) => [x.line, x.yes])).toEqual([['Back from Goa? 1 thing is still packed', 'Unpack']]);
    backHome(os, t.id);
    expect(travelBrain.candidates(os, NOW)).toEqual([]);
  });
});
