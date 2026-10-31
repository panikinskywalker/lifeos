/**
 * Today at a glance and module overviews (v4 home): the day in order, what's
 * done, goals learned from history, and every module's overview on sample data.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBetterSqliteAdapter } from '@core/db/betterSqliteAdapter';
import { createLifeOS } from '@core/lifeos';
import { Registry } from '@core/registry/registry';
import type { LifeOSContext } from '@core/registry/context';
import { bus } from '@core/events/bus';
import { doneToday, goals, myDay, progress, setGoal } from '@core/dashboard/day';
import { saveHealthDays } from '@core/sources/deviceData';
import { measurementType, workoutType } from './health/types';
import { accountType, subscriptionType, transactionType } from './finance/types';
import { setCategoryTarget } from './finance/categories';
import { groupType, personType } from './crm/types';
import { eventType, projectType, taskType } from './projects/types';
import { tripType } from './travel/types';
import { deliveryType } from './deliveries/types';
import { financeOverview } from '@boards/finance/overview';
import { peopleOverview } from '@boards/crm/overview';
import { projectsOverview } from '@boards/projects/overview';
import { travelOverview } from '@boards/travel/overview';
import { deliveriesOverview } from '@boards/deliveries/overview';
import { healthOverview } from '@boards/health/overview';

let os: LifeOSContext;
const NOW = Date.parse('2026-09-26T15:00:00');
const day = (n: number) => {
  const d = new Date(NOW);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
beforeEach(async () => {
  bus.clear();
  os = await createLifeOS({
    db: createBetterSqliteAdapter(':memory:'),
    modules: [{ id: 'm', name: 'm', version: '1', description: '', icon: 'x', color: '#000', objects: [measurementType, workoutType, accountType, subscriptionType, transactionType, personType, groupType, eventType, taskType, projectType, tripType, deliveryType] }],
    registry: new Registry(),
  });
});
afterEach(() => os.db.close());

describe('Today at a glance', () => {
  it('my day: all-day things first, then timed ones in order; overdue tasks flagged; deliveries with their OTP', () => {
    os.records.create({ object: 'event', title: 'Standup', data: { startAt: Date.parse('2026-09-26T10:00:00') } });
    os.records.create({ object: 'event', title: 'Dinner', data: { startAt: Date.parse('2026-09-26T20:00:00') } });
    os.records.create({ object: 'event', title: 'Tomorrow thing', data: { startAt: Date.parse('2026-09-27T10:00:00') } });
    os.records.create({ object: 'task', title: 'File taxes', data: { dueDate: day(-2) } });
    os.records.create({ object: 'task', title: 'Call bank', data: { dueDate: day(0) } });
    os.records.create({ object: 'task', title: 'Later', data: { dueDate: day(5) } });
    os.records.create({ object: 'delivery', data: { item: 'Trimmer', status: 'out_for_delivery', otp: '4821' } });
    const d = myDay(os, NOW);
    expect(d.map((x) => x.title)).toEqual(['File taxes', 'Call bank', 'Trimmer', 'Standup', 'Dinner']);
    expect(d.find((x) => x.title === 'File taxes')!.late).toBe(true);
    expect(d.find((x) => x.title === 'Trimmer')!.sub).toBe('out for delivery · OTP 4821');
    expect(d.find((x) => x.title === 'Standup')!.done).toBe(true);
  });

  it('done today: spend, received, workouts, tasks done', () => {
    os.records.create({ object: 'transaction', data: { amount: 450, kind: 'expense', category: 'food', date: day(0) } });
    os.records.create({ object: 'transaction', data: { amount: 50, kind: 'expense', category: 'food', date: day(0) } });
    os.records.create({ object: 'transaction', data: { amount: 900, kind: 'expense', category: 'food', date: day(-1) } });
    os.records.create({ object: 'transaction', data: { amount: 147, kind: 'income', category: 'other', date: day(0) } });
    os.records.create({ object: 'workout', data: { kind: 'run', durationMin: 30, date: day(0) } });
    os.records.create({ object: 'task', title: 'Done thing', status: 'done', data: { completedAt: NOW - 3_600_000 } });
    const d = doneToday(os, NOW);
    expect(d).toMatchObject({ payments: 2, workouts: 1, workoutMin: 30, tasksDone: 1 });
    expect([d.spent, d.received]).toEqual([500, 147]);
  });

  it('goals from your own last 30 days, a little better; yours win; defaults until there is history', () => {
    expect(goals(os, NOW).find((g) => g.id === 'steps')).toMatchObject({ target: 8000, source: 'default' });
    saveHealthDays(os, Array.from({ length: 20 }, (_, i) => ({ day: day(-1 - i), steps: 6000, sleepMin: 390 })));
    const g = Object.fromEntries(goals(os, NOW).map((x) => [x.id, x]));
    expect(g.steps).toMatchObject({ target: 6500, source: 'history' }); // 6000 × 1.05 → 6300 → nearest 500
    expect(g.sleep).toMatchObject({ target: 6.75, source: 'history' }); // 6.5 h + 15 min
    setGoal(os, 'steps', 10000);
    expect(goals(os, NOW).find((x) => x.id === 'steps')).toMatchObject({ target: 10000, source: 'you' });
    saveHealthDays(os, [{ day: day(0), steps: 5000 }]);
    const p = progress(os, NOW).find((x) => x.id === 'steps')!;
    expect(p).toMatchObject({ value: 5000, target: 10000, ratio: 0.5 });
    expect(p.week).toHaveLength(7);
  });
});

describe('module overviews', () => {
  it('every overview gives a card and blocks, on data and on nothing', () => {
    for (const f of [financeOverview, peopleOverview, projectsOverview, travelOverview, deliveriesOverview, healthOverview]) {
      const empty = f(os, NOW);
      expect(empty.card?.headline).toBeTruthy();
    }
    os.records.create({ object: 'transaction', data: { amount: 1200, kind: 'expense', category: 'food', date: day(-1) } });
    os.records.create({ object: 'transaction', data: { amount: 800, kind: 'expense', category: 'transport', date: day(-2) } });
    os.records.create({ object: 'transaction', data: { amount: 3000, kind: 'expense', category: 'food', date: '2026-08-10' } });
    setCategoryTarget(os, 'food', 1000);
    const f = financeOverview(os, NOW);
    expect(f.card!.headline).toBe('₹2,000');
    expect(f.blocks.find((b) => b.kind === 'breakdown')).toMatchObject({ parts: [{ label: 'Food & Drink', value: 1200 }, { label: 'Transport', value: 800 }] });
    expect(f.blocks.find((b) => b.kind === 'progress')).toMatchObject({ items: [{ ratio: 1.2, over: true }] });
    os.records.create({ object: 'task', title: 'Late one', data: { dueDate: day(-3) } });
    expect(projectsOverview(os, NOW).card).toMatchObject({ headline: '1 overdue', alert: true });
    os.records.create({ object: 'trip', data: { destination: 'Goa', startDate: day(14) } });
    expect(travelOverview(os, NOW).card!.headline).toBe('Goa in 14 d');
  });
});
