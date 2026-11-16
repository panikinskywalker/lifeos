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
import { dayView, deadlines, importTripApp, missingCheckIn, moneyOf, nightsOf, payWord, seatsOpen, stayMoney, statusOf, stepsOf, stopsOf, travelBrain, travelModule, tripJourneys, tripStays, tripTickets, TRIP_APP_FORMAT, type TripAppSnapshot, type TripData } from '.';

/**
 * The trip template, slice 2: bookings with their money and status, tickets,
 * journeys between stops, a day, the deadlines and their nudges, and what a
 * stay mail says. The snapshot is made up in the Japan app's shape.
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
  key: 'sample',
  destination: 'Japan',
  look: 'japan',
  meta: { travellers: ['Asha', 'Ben'], start: '2026-12-17', end: '2026-12-24', fx: { JPY: 0.59 } },
  places: [
    { id: 'tokyo', name: 'Tokyo', jp: '東京', kind: 'stop', order: 1 },
    { id: 'kawa', name: 'Kawaguchiko', jp: '河口湖', kind: 'stop', order: 2 },
  ],
  bookings: [
    { id: 's1', kind: 'stay', status: 'Confirmed', title: 'Inn A', placeId: 'tokyo', start: '2026-12-18', end: '2026-12-22', total: 40000, outstanding: 36000, currency: 'JPY', paidBy: 'Asha', forWho: ['Asha', 'Ben'], checkIn: 'from 15:00', cancelBy: '2026-12-10', cancelNote: '23:59 JST', chargeOn: '2026-12-05', ref: 'AB12CD', link: 'https://example.com/booking/1', payNote: 'Card at the desk', paid: 'US$40 paid online' },
    { id: 's2', kind: 'stay', status: 'Confirmed', title: 'Inn B', placeId: 'kawa', start: '2026-12-22', end: '2026-12-24', total: 18000, outstanding: 18000, currency: 'JPY', payNote: 'cash only' },
    { id: 's3', kind: 'stay', status: 'Cancelled', title: 'Old inn', placeId: 'tokyo', start: '2026-12-18', end: '2026-12-20', total: 30000, outstanding: 0, currency: 'JPY' },
    { id: 's4', kind: 'stay', status: 'Planned', title: 'Maybe inn', placeId: 'kawa', start: '2026-12-24', end: '2026-12-25', total: 9000, currency: 'JPY' },
    { id: 'f1', kind: 'flight', status: 'Confirmed', title: 'Asha One', start: '2026-12-17', end: '2026-12-24', total: 52000, outstanding: 0, currency: 'INR', paidBy: 'Asha', forWho: ['Asha'], ref: 'FX1' },
    { id: 'f2', kind: 'flight', status: 'Confirmed', title: 'Ben Two', start: '2026-12-17', end: '2026-12-24', total: 51000, outstanding: 0, currency: 'INR', paidBy: 'Asha', forWho: ['Ben'] },
  ],
  transport: [
    { id: 'j1', mode: 'Train + bus', status: 'Suggested', date: '2026-12-22', leaveBy: '10:30', arriveAt: '≈14:45', from: 'Tokyo', fromId: 'tokyo', to: 'Kawaguchiko', toId: 'kawa', costPP: 2600, costCur: 'JPY', estimate: true, duration: '≈2–2.5 h', bookNote: 'Keio bus seats open 22 Nov; book early.', book: [{ label: 'Reserve the Keio bus', url: 'https://example.com/keio' }], lastConnection: 'Last bus 17:45', timeline: '10:30 Check out | leave bags\n11:00 Keio bus Shinjuku → Kawaguchiko | 2 h\n≈14:45 Arrive' },
  ],
};

describe('bookings, from the import', () => {
  it('stays with status and money, tickets with each fare and who paid, the journey between stops', () => {
    const r = importTripApp(os, snap, { me: 'Asha' });
    expect(r).toMatchObject({ stays: 4, tickets: 2, journeys: 1 });
    const stays = tripStays(os, r.tripId);
    expect(stays.map((e) => [e.title, statusOf(e), payWord(e)])).toEqual([
      ['Stay · Inn A', 'confirmed', 'Part paid'],
      ['Stay · Old inn', 'cancelled', 'Cancelled'],
      ['Stay · Inn B', 'confirmed', 'To pay'],
      ['Stay · Maybe inn', 'planned', 'Planned'],
    ]);
    const a = stays[0]!;
    expect(moneyOf(a)).toEqual({ currency: 'JPY', total: 40000, toPay: 36000, paid: 4000 });
    expect(a.data).toMatchObject({ paidBy: 'me', checkIn: 'from 15:00', cancelBy: '2026-12-10', cancelNote: '23:59 JST', reference: 'AB12CD', bookingUrl: 'https://example.com/booking/1', payHow: 'Card at the desk' });
    expect(a.data.notes).toContain('Paid: US$40 paid online');
    expect(a.data.personIds!.map((id) => os.records.get(id)!.title)).toEqual(['Ben']);
    expect(stayMoney(stays)).toEqual({ toPay: { JPY: 54000 }, paid: { JPY: 4000 } });
    expect(missingCheckIn(stays).map((e) => e.title)).toEqual(['Stay · Inn B', 'Stay · Maybe inn']);
    // A cancelled stay holds no night; a planned one is marked.
    const t = os.records.get<TripData>(r.tripId)!;
    const nights = nightsOf(os, t);
    expect(nights.filter((n) => n.stayId === stays[1]!.id)).toEqual([]);
    expect(nights.find((n) => n.day === '2026-12-23')).toMatchObject({ kind: 'stay', stayId: stays[2]!.id });

    const tickets = tripTickets(os, r.tripId);
    expect(tickets.map((e) => [e.title, e.data.cost, e.data.paidBy === 'me', e.data.reference ?? null])).toEqual([
      ['Ticket · Asha One', 52000, true, 'FX1'],
      ['Ticket · Ben Two', 51000, true, null],
    ]);

    const [j] = tripJourneys(os, r.tripId);
    const [tokyo, kawa] = stopsOf(os, r.tripId);
    expect(j!.data).toMatchObject({ fromStopId: tokyo!.id, toStopId: kawa!.id, mode: 'train + bus', plan: 'suggested', fare: 2600, currency: 'JPY', estimate: true, takes: '2–2.5 h', lastConnection: 'Last bus 17:45', book: [{ label: 'Reserve the Keio bus', url: 'https://example.com/keio' }] });
    expect(j!.data.startAt).toBe(at('2026-12-22T10:30:00'));
    expect(j!.data.endAt).toBe(at('2026-12-22T14:45:00'));
    expect(j!.data.seatsOpenAt).toBe(at('2026-11-22T10:00:00'));
    expect(os.links.forEntity(j!.id, 'from_stop')[0]!.other.title).toBe('Tokyo');
    expect(stepsOf(j!)).toEqual([
      { time: '10:30', what: 'Check out', note: 'leave bags' },
      { time: '11:00', what: 'Keio bus Shinjuku → Kawaguchiko', note: '2 h' },
      { time: '≈14:45', what: 'Arrive', note: null },
    ]);
  });

  it('a moving day: the journey, checking out and in, what to pay on arrival', () => {
    const r = importTripApp(os, snap, { me: 'Asha' });
    const t = os.records.get<TripData>(r.tripId)!;
    const d = dayView(os, t, '2026-12-22');
    const [tokyo, kawa] = stopsOf(os, t.id);
    expect(d).toMatchObject({ index: 6, stopId: kawa!.id, fromStopId: tokyo!.id });
    expect([d.journeys.length, d.checkOuts.map((e) => e.title), d.checkIns.map((e) => e.title), d.toPay.map((e) => e.title)]).toEqual([1, ['Stay · Inn A'], ['Stay · Inn B'], ['Stay · Inn B']]);
  });

  it('deadlines from today, soonest first; the nudges for them, and for missing check-in times', () => {
    const r = importTripApp(os, snap, { me: 'Asha' });
    const t = os.records.get<TripData>(r.tripId)!;
    expect(deadlines(os, t, at('2026-11-20T09:00:00')).map((x) => [x.day, x.kind])).toEqual([
      ['2026-11-22', 'seats'],
      ['2026-12-05', 'charge'],
      ['2026-12-10', 'cancel'],
    ]);
    const c = travelBrain.candidates(os, at('2026-11-20T09:00:00')).filter((x) => x.key.startsWith('travel:seats'));
    expect(c.map((x) => [x.line, x.yes, x.urgent ?? false])).toEqual([['Seats open: Tokyo → Kawaguchiko in 2 days', 'Book', false]]);
    expect(travelBrain.act!(os, 'yes', { payload: c[0]!.payload } as never)).toEqual({ open: 'https://example.com/keio' });
    const cancel = travelBrain.candidates(os, at('2026-12-08T09:00:00')).filter((x) => x.key.startsWith('travel:cancel'));
    expect(cancel.map((x) => x.line)).toEqual(['Inn A: free cancellation ends 23:59 JST in 2 days']);
    const missing = travelBrain.candidates(os, at('2026-12-01T09:00:00')).find((x) => x.key.startsWith('travel:checkin-times'));
    expect(missing!.line).toBe('2 stays have no check-in time: Inn B, Maybe inn');
  });
});

describe('what a stay mail says', () => {
  it('times, the total and free cancellation land on the stay', () => {
    fileMail(os, { uid: 1, from: 'noreply@booking.com', fromName: 'Booking.com', subject: 'Your booking is confirmed at Lemon Tree Premier, Aerocity', text: 'Thanks, Rutvij! Your booking in New Delhi is confirmed.\nCheck-in Thursday, 14 January 2027 (from 14:00)\nCheck-out Saturday, 16 January 2027 (until 12:00)\nTotal price: ₹14,300\nFree cancellation until 10 January 2027, 23:59', date: at('2026-11-02T10:00:00') }, 'rutvij@gmail.com');
    const [e] = os.records.query<{ checkIn?: string; checkOut?: string; cost?: number; currency?: string; cancelBy?: string; toPay?: number }>('event');
    expect(e!.data).toMatchObject({ checkIn: 'from 14:00', checkOut: 'by 12:00', cost: 14300, currency: 'INR', cancelBy: '2027-01-10' });
    expect(e!.data.toPay).toBeUndefined();
  });

  it('seats open: the day in the note, before the journey', () => {
    expect(seatsOpen('Shinano seats open 26 Nov; reserve.', '2026-12-26')).toBe(at('2026-11-26T10:00:00'));
    expect(seatsOpen('seats open on 1 Dec', '2027-01-03')).toBe(at('2026-12-01T10:00:00'));
    expect(seatsOpen('no booking needed', '2026-12-26')).toBeUndefined();
  });
});
