import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBetterSqliteAdapter } from '@core/db/betterSqliteAdapter';
import { createLifeOS } from '@core/lifeos';
import { Registry } from '@core/registry/registry';
import type { LifeOSContext } from '@core/registry/context';
import type { BrainModel } from '@core/brain';
import { bus } from '@core/events/bus';
import { crmModule } from '../crm';
import { financeModule } from '../finance';
import { projectsModule } from '../projects';
import { placesModule } from '../places';
import { askCopilot, clearCopilotChat, copilotChat, importTripApp, saveCopilotChat, travelModule, TRIP_APP_FORMAT, type TripAppSnapshot, type TripData } from '.';

/**
 * The copilot looks things up on the web when a question needs it (MODEL.md,
 * the trip copilot): Claude's notes go into the answer and their pages come
 * back with it; NO_RESEARCH skips the web; a failed search never stops the
 * answer; the chat is kept on the phone per trip. Made-up trip; no API call.
 */

let os: LifeOSContext;
beforeEach(async () => {
  bus.clear();
  os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules: [crmModule, financeModule, projectsModule, placesModule, travelModule], registry: new Registry() });
});
afterEach(() => os.db.close());

const snap: TripAppSnapshot = {
  format: TRIP_APP_FORMAT,
  key: 'web-sample',
  destination: 'Japan',
  meta: { travellers: ['Asha', 'Ben'], start: '2026-12-28', end: '2027-01-02' },
  places: [{ id: 'alpha', name: 'Alphaville', kind: 'stop', order: 1 }],
  bookings: [],
  things: [],
  checklist: [],
  alerts: [],
};
const now = new Date('2026-11-19T09:00:00').getTime();
const reply = { reply: 'Most shrines are open on 1 Jan; the museum is closed until 4 Jan.', changes: [], needs: [] };
const usage = { input: 100, output: 50, cacheRead: 0, cacheWrite: 0 };

describe('the copilot and the web', () => {
  it('uses the web notes in the answer and returns their pages', async () => {
    const trip = os.records.get<TripData>(importTripApp(os, snap, { me: 'Asha' }).tripId)!;
    const seen: string[] = [];
    const model: BrainModel = {
      id: 'mock', model: 'mock-1',
      research: async ({ user }) => {
        expect(user).toContain('Alphaville');
        return { text: '- The city museum closes 29 Dec to 3 Jan.', sources: [{ url: 'https://example.org/museum', title: 'City museum' }], searches: 2, usage };
      },
      complete: async ({ user }) => {
        seen.push(user);
        return { text: JSON.stringify(reply), usage };
      },
    };
    const res = await askCopilot(os, model, trip, 'Is anything closed over New Year?', [], now);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(seen[0]).toContain('From the web just now (1 page):\n- The city museum closes 29 Dec to 3 Jan.');
    expect(res.sources).toEqual([{ url: 'https://example.org/museum', title: 'City museum' }]);
    expect(res.searches).toBe(2);
    // Both calls are in Sent to Claude: the web research, then the answer.
    expect(os.brain.sent.recent(10).map((e) => e.pass).sort()).toEqual(['copilot', 'copilot-web']);
  });

  it('skips the web when the trip is enough, and answers even when the search fails', async () => {
    const trip = os.records.get<TripData>(importTripApp(os, snap, { me: 'Asha' }).tripId)!;
    const quiet: BrainModel = { id: 'mock', model: 'mock-1', research: async () => ({ text: 'NO_RESEARCH', sources: [], searches: 0, usage }), complete: async ({ user }) => ({ text: JSON.stringify({ ...reply, reply: user.includes('From the web') ? 'web' : 'trip only' }), usage }) };
    const a = await askCopilot(os, quiet, trip, 'Who is going?', [], now);
    expect(a.ok && a.answer.reply).toBe('trip only');
    expect(a.ok && a.sources).toEqual([]);
    const broken: BrainModel = { id: 'mock', model: 'mock-1', research: async () => { throw new Error('Claude API 500'); }, complete: async () => ({ text: JSON.stringify(reply), usage }) };
    const b = await askCopilot(os, broken, trip, 'Is anything closed over New Year?', [], now);
    expect(b.ok).toBe(true);
    // A model without web research (another provider) still answers.
    const plain: BrainModel = { id: 'mock', model: 'mock-1', complete: async () => ({ text: JSON.stringify(reply), usage }) };
    expect((await askCopilot(os, plain, trip, 'Hi', [], now)).ok).toBe(true);
  });

  it('keeps the chat on the phone per trip, the last 40 turns', () => {
    const trip = os.records.get<TripData>(importTripApp(os, snap, { me: 'Asha' }).tripId)!;
    saveCopilotChat(os, trip.id, Array.from({ length: 45 }, (_, i) => ({ q: `q${i}`, at: i, answer: reply })));
    expect(copilotChat(os, trip.id)).toHaveLength(40);
    expect(copilotChat(os, trip.id)[0]!.q).toBe('q5');
    clearCopilotChat(os, trip.id);
    expect(copilotChat(os, trip.id)).toEqual([]);
  });
});
