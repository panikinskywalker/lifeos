/** Activity trackers: a day counts when any rule matches what happened that day. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBetterSqliteAdapter } from '@core/db/betterSqliteAdapter';
import { createLifeOS } from '@core/lifeos';
import { Registry } from '@core/registry/registry';
import type { LifeOSContext } from '@core/registry/context';
import { bus } from '@core/events/bus';
import { ingestMessage } from '@core/ingest/ingest';
import { saveHealthDays, saveUsageDays } from '@core/sources/deviceData';
import { DEFAULT_TRACKERS, knownCalendars, trackerDays, trackerSummary, trackers, upsertTracker, type Tracker } from '@core/activity/trackers';
import { measurementType, workoutType } from './health/types';
import { accountType, transactionType } from './finance/types';
import { eventType } from './projects/types';

let os: LifeOSContext;
const NOW = Date.parse('2026-09-27T20:00:00'); // Sunday
const day = (n: number) => {
  const d = new Date(NOW);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const at = (n: number, h = 13) => new Date(`${day(n)}T${String(h).padStart(2, '0')}:00:00`).getTime();
beforeEach(async () => {
  bus.clear();
  os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules: [{ id: 'm', name: 'm', version: '1', description: '', icon: 'x', color: '#000', entityTypes: [measurementType, workoutType, accountType, transactionType, eventType] }], registry: new Registry() });
});
afterEach(() => os.db.close());
const get = (id: string) => trackers(os).find((t) => t.id === id)!;

describe('activity trackers', () => {
  it('starts with days worked, workouts, steps goal, ordered food', () => {
    expect(trackers(os).map((t) => t.id)).toEqual(DEFAULT_TRACKERS.map((t) => t.id));
  });

  it('ordered food: any day a Zomato / Swiggy text came in (even one set aside), or a payment to them', () => {
    ingestMessage(os, { source: 'sms', from: 'AX-ZOMATO', body: 'Your Zomato order from Truffles is on its way!', receivedAt: at(-1, 21) });
    ingestMessage(os, { source: 'sms', from: 'VM-HDFCBK', body: 'Sent Rs.450.00 From HDFC Bank A/C *1234 To SWIGGY On ' + day(-3).split('-').reverse().join('/').replace(/^(\d+)\/(\d+)\/20(\d+)$/, '$1/$2/$3'), receivedAt: at(-3) });
    ingestMessage(os, { source: 'sms', from: 'AX-FRIEND', body: 'dinner at 8?', receivedAt: at(-2) });
    expect([...trackerDays(os, get('food'), day(-10), day(0))].sort()).toEqual([day(-3), day(-1)]);
  });

  it('days worked: 30+ min in work apps, or an event on the work calendar; workouts; steps goal', () => {
    saveUsageDays(os, [
      { day: day(-1), totalMs: 5 * 3_600_000, apps: [{ package: 'com.Slack', label: 'Slack', ms: 45 * 60_000 }] },
      { day: day(-2), totalMs: 5 * 3_600_000, apps: [{ package: 'com.Slack', label: 'Slack', ms: 10 * 60_000 }, { package: 'com.instagram.android', label: 'Instagram', ms: 3 * 3_600_000 }] },
    ]);
    os.entities.create({ type: 'event', title: 'Quarterly planning', data: { startAt: at(-4, 11), calendars: ['Work · me@acme.in'] } });
    upsertTracker(os, { ...get('worked'), rules: [...get('worked').rules, { kind: 'calendar', calendars: ['Work · me@acme.in'] }] });
    expect([...trackerDays(os, get('worked'), day(-10), day(0))].sort()).toEqual([day(-4), day(-1)]);
    expect(knownCalendars(os)).toEqual(['Work · me@acme.in']);
    os.entities.create({ type: 'workout', data: { kind: 'run', durationMin: 30, date: day(-5) } });
    expect([...trackerDays(os, get('workouts'), day(-10), day(0))]).toEqual([day(-5)]);
    saveHealthDays(os, [{ day: day(-1), steps: 9000 }, { day: day(-2), steps: 5000 }]);
    expect([...trackerDays(os, get('steps'), day(-10), day(0))]).toEqual([day(-1)]); // goal 8,000 until there's a month of history
  });

  it('the grid: weeks × 7 ending this week, future days empty; this week, streak, longest', () => {
    const t: Tracker = { id: 'x', name: 'Runs', icon: 'activity', tint: 'health', rules: [{ kind: 'record', type: 'workout' }] };
    for (const n of [0, -1, -2, -5, -6, -7, -8]) os.entities.create({ type: 'workout', data: { kind: 'run', durationMin: 20, date: day(n) } });
    const s = trackerSummary(os, t, NOW, 4);
    expect(s.days).toHaveLength(28);
    expect(s.days.at(-1)).toEqual({ day: day(0), value: 1 }); // Sunday ends the week
    expect(s).toMatchObject({ thisWeek: 5, streak: 3, longest: 4, total: 7 });
  });
});
