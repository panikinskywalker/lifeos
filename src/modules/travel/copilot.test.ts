import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBetterSqliteAdapter } from '@core/db/betterSqliteAdapter';
import { createLifeOS } from '@core/lifeos';
import { Registry } from '@core/registry/registry';
import type { LifeOSContext } from '@core/registry/context';
import type { BrainModel } from '@core/brain';
import { bus } from '@core/events/bus';
import { crmModule } from '../crm';
import { financeModule, makeBill } from '../finance';
import { projectsModule } from '../projects';
import { placesModule } from '../places';
import { applyChanges, askCopilot, changeLine, checklistOf, departureDay, docsShelf, dueToday, importTripApp, isDownload, offlineSheet, parseCopilot, searchTrip, travelModule, tripContext, tripPapers, TRIP_APP_FORMAT, type Change, type TripAppSnapshot, type TripData } from '.';

/**
 * The trip template's Prep, Search and Copilot: the docs shelf and papers,
 * the departure-day check, the search over the trip, and the copilot's
 * context, answer and changes (saved only when asked, with an Undo). The
 * snapshot is made up in the Japan app's shape; no test calls the API.
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
  meta: { travellers: ['Asha', 'Ben'], start: '2026-12-18', end: '2026-12-21', fx: { JPY: 0.6 } },
  places: [{ id: 'alpha', name: 'Alphaville', kind: 'stop', order: 1 }, { id: 'beta', name: 'Betaburg', kind: 'stop', order: 2 }],
  bookings: [
    { id: 's1', kind: 'stay', status: 'Confirmed', title: 'Alpha inn', placeId: 'alpha', start: '2026-12-18', end: '2026-12-20', total: 20000, outstanding: 12000, currency: 'JPY', ref: 'SECRET123', forWho: ['Asha', 'Ben'] },
    { id: 's2', kind: 'stay', status: 'Pending', title: 'Beta lodge', placeId: 'beta', start: '2026-12-20', end: '2026-12-21', total: 8000, outstanding: 8000, currency: 'JPY', forWho: ['Asha', 'Ben'] },
  ],
  things: [{ id: 't1', title: 'Alpha tower', place: 'alpha', kind: 'See', status: 'Idea' }],
  checklist: [
    { id: 'c1', text: 'Visa for each traveller', group: 'Documents', due: '2026-11-16', done: false },
    { id: 'c2', text: 'Travel insurance', group: 'Documents', due: '2026-11-10', done: true },
    { id: 'c3', text: 'Passports and printed visas', group: 'Documents', due: '2026-12-18', done: false },
    { id: 'c4', text: 'Download offline maps', group: 'To-do', due: '2026-12-07', done: false },
    { id: 'c5', text: 'Phones charged', group: 'To-do', due: '2026-12-18', done: false },
  ],
  alerts: [{ id: 'a1', title: 'Cash only at Alpha inn', level: 'warning', resolved: false, body: '' }],
};

const now = new Date('2026-11-16T09:00:00').getTime();

describe('prep', () => {
  it('due today, the departure-day check, downloads, the docs shelf and the papers (no reference among the lines)', () => {
    const r = importTripApp(os, snap, { me: 'Asha' });
    const trip = os.records.get<TripData>(r.tripId)!;
    const items = checklistOf(os, trip.id);
    expect(dueToday(items, now).map((t) => t.title)).toEqual(['Visa for each traveller']);
    expect(departureDay(items, trip).map((t) => t.title).sort()).toEqual(['Passports and printed visas', 'Phones charged']);
    expect(items.filter(isDownload).map((t) => t.title)).toEqual(['Download offline maps']);
    const shelf = docsShelf(os, trip, now);
    expect(shelf.map((s) => [s.title, s.status])).toEqual([
      ['Visa for each traveller', 'due'],
      ['Passports and printed visas', 'due'],
      ['Booking confirmations', 'pending'],
      ['Travel insurance', 'done'],
    ]);
    const papers = tripPapers(os, trip);
    expect(papers.map((p) => p.title)).toEqual(['Alpha inn', 'Beta lodge']);
    expect(papers[0]!.reference).toBe('SECRET123');
    expect(papers[0]!.lines.join(' ')).not.toContain('SECRET123');
    expect(offlineSheet(os, trip)).toContain('Alpha inn');
  });
});

describe('search', () => {
  it('finds stops, stays, things and the checklist, title starts first, with the match marked', () => {
    const r = importTripApp(os, snap, { me: 'Asha' });
    const trip = os.records.get<TripData>(r.tripId)!;
    const hits = searchTrip(os, trip, 'alpha');
    expect(hits.map((h) => h.kind)).toEqual(['stop', 'stay', 'thing', 'note']);
    expect(hits[0]).toMatchObject({ title: 'Alphaville', match: [0, 5], target: { to: 'stop' } });
    expect(hits[1]!.sub).toContain('¥12,000 to pay');
    expect(searchTrip(os, trip, 'VISA').map((h) => h.title)).toEqual(['Visa for each traveller', 'Passports and printed visas']);
    expect(searchTrip(os, trip, '  ')).toEqual([]);
  });
});

describe('copilot', () => {
  it('sends the trip as plain records with short keys and no references', () => {
    const r = importTripApp(os, snap, { me: 'Asha' });
    const trip = os.records.get<TripData>(r.tripId)!;
    const ctx = tripContext(os, trip, now);
    const json = JSON.stringify(ctx.record);
    expect(json).toContain('Alpha inn');
    expect(json).not.toContain('SECRET123');
    expect(ctx.keys.get('s1')).toBeTruthy();
    expect((ctx.record.trip as { travellers: string }).travellers).toBe('you, Ben');
  });

  it('reads the answer leniently and saves the changes only when asked, with an Undo', async () => {
    const r = importTripApp(os, snap, { me: 'Asha' });
    const trip = os.records.get<TripData>(r.tripId)!;
    const visa = checklistOf(os, trip.id).find((t) => t.title.startsWith('Visa'))!;
    const answer = {
      reply: 'Two ideas for Alphaville.',
      changes: [
        { type: 'add_thing', ref: '', title: 'Night walk', stop: 'p1', day: '2026-12-19', kind: 'do', status: 'want', section: '', due: '', line: '', priority: '', amount: 0, currency: '', category: '', value: '' },
        { type: 'set_check_in', ref: 's1', title: '', stop: '', day: '', kind: '', status: '', section: '', due: '', line: '', priority: '', amount: 0, currency: '', category: '', value: '15:00-23:00' },
        { type: 'tick_task', ref: '', title: '', stop: '', day: '', kind: '', status: '', section: '', due: '', line: '', priority: '', amount: 0, currency: '', category: '', value: '' },
        { type: 'add_bill', ref: '', title: 'Ramen', stop: '', day: '', kind: '', status: '', section: '', due: '', line: '', priority: '', amount: 2400, currency: 'jpy', category: 'food', value: '' },
        { type: 'book_flight', title: 'nope' },
      ],
      needs: ['gmail', 'gmail', 'fax'],
    };
    const model: BrainModel = { id: 'mock', model: 'mock-1', complete: async () => ({ text: JSON.stringify(answer), usage: { input: 900, output: 120, cacheRead: 0, cacheWrite: 0 } }) };
    const res = await askCopilot(os, model, trip, 'What can we do in Alphaville?', [], now);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // The tick with no ref and the unknown type are left out.
    expect(res.answer.changes.map((c) => c.type)).toEqual(['add_thing', 'set_check_in', 'add_bill']);
    expect(res.answer.needs).toEqual(['gmail']);
    expect(os.brain.sent.recent(5)[0]).toMatchObject({ pass: 'copilot', outcome: 'ok' });
    expect(changeLine(os, res.answer.changes[0]!, res.keys)).toEqual({ sign: '+', text: 'Alphaville: Night walk · Want to · 19 Dec' });
    expect(changeLine(os, res.answer.changes[1]!, res.keys).text).toBe('Alpha inn: check-in 15:00-23:00');
    // Nothing saved yet.
    expect(os.records.query('outing')).toHaveLength(1);
    const tick: Change = { ...res.answer.changes[0]!, type: 'tick_task', ref: [...res.keys].find(([, id]) => id === visa.id)![0] };
    const done = applyChanges(os, trip, [...res.answer.changes, tick], res.keys, (title, input) => makeBill(os, title, { ...input, split: { payers: { me: input.amount }, method: 'equal', shares: { me: 1 } } }).id, now);
    expect(done.saved).toBe(4);
    expect(os.records.query('outing')).toHaveLength(2);
    expect(os.records.query('bill')).toHaveLength(1);
    expect(os.records.get(visa.id)!.status).toBe('done');
    const stay = os.records.get<{ checkIn?: string }>(res.keys.get('s1')!)!;
    expect(stay.data.checkIn).toBe('15:00-23:00');
    done.undo();
    expect(os.records.query('outing')).toHaveLength(1);
    expect(os.records.query('bill')).toHaveLength(0);
    expect(os.records.get(visa.id)!.status).toBe('todo');
    expect(os.records.get<{ checkIn?: string }>(stay.id)!.data.checkIn).toBeUndefined();
  });

  it('no key, the brain off, or over the budget: nothing leaves', async () => {
    const r = importTripApp(os, snap, { me: 'Asha' });
    const trip = os.records.get<TripData>(r.tripId)!;
    expect(await askCopilot(os, null, trip, 'Hi', [], now)).toEqual({ ok: false, note: 'no key' });
    os.settings.set('brain', { budget: 10 });
    const model: BrainModel = { id: 'mock', model: 'mock-1', complete: async () => ({ text: '{}', usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }) };
    expect(await askCopilot(os, model, trip, 'Hi', [], now)).toEqual({ ok: false, note: 'over budget' });
    expect(parseCopilot({ reply: 3 })).toBeNull();
  });
});
