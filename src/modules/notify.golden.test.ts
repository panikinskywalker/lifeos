import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBetterSqliteAdapter } from '@core/db/betterSqliteAdapter';
import { createLifeOS } from '@core/lifeos';
import { Registry } from '@core/registry/registry';
import type { LifeOSContext } from '@core/registry/context';
import { bus } from '@core/events/bus';
import { saveHealthDays } from '@core/sources/deviceData';
import { measurementType } from './health/types';
import { transactionType } from './finance/types';
import { eventType, taskType } from './projects/types';
import { morningBrief, notificationPlan, outOfQuiet, setNotifyPrefs } from '@core/notify/plan';

let os: LifeOSContext;
const AT = (s: string) => new Date(s).getTime();
beforeEach(async () => {
  bus.clear();
  os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules: [{ id: 'm', name: 'm', version: '1', description: '', icon: 'x', color: '#000', entityTypes: [measurementType, transactionType, eventType, taskType] }], registry: new Registry() });
});
afterEach(() => os.db.close());

describe('morning brief', () => {
  it('from real data: sleep vs goal, step goal, what is on with times, spend', () => {
    saveHealthDays(os, [{ day: '2026-09-27', sleepMin: 400 }]);
    os.entities.create({ type: 'event', title: 'Dentist', data: { startAt: AT('2026-09-27T11:00:00') } });
    os.entities.create({ type: 'task', title: 'Call bank', data: { dueDate: '2026-09-27' } });
    os.entities.create({ type: 'transaction', data: { amount: 4200, kind: 'expense', category: 'food', date: '2026-09-05' } });
    const b = morningBrief(os, AT('2026-09-27T08:00:00'));
    expect(b.title).toBe('Good morning — 2 things today');
    expect(b.lines[0]).toBe('Slept 6h 42m (goal 7h 00m)');
    expect(b.lines[1]).toBe('Steps goal: 8,000');
    expect(b.lines[2]).toMatch(/^2 things today: Call bank, 11:00 am Dentist$/);
    expect(b.lines[3]).toMatch(/^₹4,200 spent this month/);
  });
  it('a clear day says so', () => {
    expect(morningBrief(os, AT('2026-09-27T08:00:00')).title).toBe('Good morning — a clear day');
  });
});

describe('notification plan', () => {
  it('quiet hours move a notification to when they end, across midnight', () => {
    const q = { on: true, from: '22:30', to: '07:30' };
    expect(new Date(outOfQuiet(AT('2026-09-27T23:10:00'), q)).toString()).toBe(new Date(AT('2026-09-28T07:30:00')).toString());
    expect(new Date(outOfQuiet(AT('2026-09-27T05:00:00'), q)).toString()).toBe(new Date(AT('2026-09-27T07:30:00')).toString());
    expect(outOfQuiet(AT('2026-09-27T12:00:00'), q)).toBe(AT('2026-09-27T12:00:00'));
    expect(outOfQuiet(AT('2026-09-27T23:10:00'), { ...q, on: false })).toBe(AT('2026-09-27T23:10:00'));
  });
  it('the next brief, reminders; each kind can be switched off', () => {
    os.reminders.create({ title: 'Pay rent', dueAt: AT('2026-09-27T23:00:00') });
    const plan = notificationPlan(os, AT('2026-09-27T09:00:00'));
    expect(plan.map((n) => [n.kind, new Date(n.at).getHours()])).toEqual([['reminder', 7], ['brief', 8]]); // 23:00 waits for 07:30; brief is tomorrow 08:00
    setNotifyPrefs(os, { brief: { on: false, time: '08:00' }, reminders: false });
    expect(notificationPlan(os, AT('2026-09-27T09:00:00'))).toEqual([]);
  });
});
