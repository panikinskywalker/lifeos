import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBetterSqliteAdapter } from '@core/db/betterSqliteAdapter';
import { createLifeOS } from '@core/lifeos';
import { Registry } from '@core/registry/registry';
import type { LifeOSContext } from '@core/registry/context';
import type { ModuleManifest } from '@core/registry/types';
import { bus } from '@core/events/bus';
import { accountType, subscriptionType, transactionType } from './types';
import { postDueSubscriptions } from './lib';

const mod: ModuleManifest = { id: 'finance', name: 'Finance', version: '1', description: '', icon: 'x', color: '#000', entityTypes: [accountType, transactionType, subscriptionType] };
let os: LifeOSContext;
beforeEach(async () => {
  bus.clear();
  os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules: [mod], registry: new Registry() });
});
afterEach(() => os.db.close());

describe('subscriptions × cycles', () => {
  it('auto-post files the expense, logs the renewal as done and rolls both dates', () => {
    const s = os.entities.create({ type: 'subscription', data: { name: 'Jio', amount: 399, rrule: 'FREQ=DAILY;INTERVAL=28', nextBillingAt: '2026-09-01' }, status: 'active' });
    const renewal = os.cycles.forEntity(s.id)[0]!;
    expect(postDueSubscriptions(os, '2026-09-20')).toBe(1);
    expect(os.entities.get<{ nextBillingAt: string }>(s.id)!.data.nextBillingAt).toBe('2026-09-29');
    const c = os.cycles.get(renewal.id)!;
    expect(new Date(c.nextDueAt!).getDate()).toBe(29);
    expect(os.cycles.stats(renewal.id)).toMatchObject({ count: 1, totalCost: 399 });
    expect(os.entities.query('transaction')).toHaveLength(1);
    expect(postDueSubscriptions(os, '2026-09-20')).toBe(0);
  });

  it('paid by hand in Upkeep: the billing date moves, so auto-post does not charge twice', () => {
    const s = os.entities.create({ type: 'subscription', data: { name: 'Gym', amount: 1500, rrule: 'FREQ=MONTHLY;INTERVAL=1', nextBillingAt: '2026-09-10' }, status: 'active' });
    const renewal = os.cycles.forEntity(s.id)[0]!;
    os.cycles.markDone(renewal.id, { at: new Date('2026-09-09T12:00:00').getTime() });
    expect(os.entities.get<{ nextBillingAt: string }>(s.id)!.data.nextBillingAt).toBe('2026-10-10');
    expect(postDueSubscriptions(os, '2026-09-20')).toBe(0);
  });

  it('auto-post off leaves it due; cancelling takes it out of Upkeep', () => {
    const s = os.entities.create({ type: 'subscription', data: { name: 'Netflix', amount: 649, rrule: 'FREQ=MONTHLY;INTERVAL=1', nextBillingAt: '2026-09-05', autoPost: false }, status: 'active' });
    expect(postDueSubscriptions(os, '2026-09-20')).toBe(0);
    expect(os.cycles.all()).toHaveLength(1);
    os.entities.setStatus(s.id, 'cancelled');
    expect(os.cycles.all()).toHaveLength(0);
    os.entities.setStatus(s.id, 'active');
    expect(os.cycles.all()).toHaveLength(1);
  });
});

describe('reports', () => {
  it('run-rate converts every billing cycle to per month', async () => {
    const { perMonth, subscriptionRunRate } = await import('./reports');
    expect(perMonth(1200, 'FREQ=YEARLY;INTERVAL=1')).toBe(100);
    expect(perMonth(300, 'FREQ=MONTHLY;INTERVAL=3')).toBe(100);
    expect(perMonth(399, 'FREQ=DAILY;INTERVAL=84')).toBeCloseTo(144.58, 1);
    os.entities.create({ type: 'subscription', data: { name: 'Netflix', amount: 649, rrule: 'FREQ=MONTHLY;INTERVAL=1', nextBillingAt: '2026-10-01' }, status: 'active' });
    os.entities.create({ type: 'subscription', data: { name: 'Old gym', amount: 5000, rrule: 'FREQ=MONTHLY;INTERVAL=1', nextBillingAt: '2026-10-01' }, status: 'cancelled' });
    const r = subscriptionRunRate(os);
    expect(r.rows.map((x) => x.sub.data.name)).toEqual(['Netflix']);
    expect(r).toMatchObject({ monthly: 649, yearly: 7788 });
  });

  it('month report and net worth over time', async () => {
    const { monthReport, netWorthSeries } = await import('./reports');
    const now = new Date('2026-09-20T12:00:00');
    const bank = os.entities.create({ type: 'account', data: { name: 'HDFC', kind: 'bank', openingBalance: 10000 } });
    const tx = (amount: number, kind: string, date: string, category = 'food') => os.entities.create({ type: 'transaction', data: { amount, kind, category, date, accountId: bank.id } });
    tx(50000, 'income', '2026-08-01', 'salary');
    tx(2000, 'expense', '2026-08-10');
    tx(50000, 'income', '2026-09-01', 'salary');
    tx(3000, 'expense', '2026-09-05');
    tx(1000, 'expense', '2026-09-06', 'transport');
    const m = monthReport(os, 0, now);
    expect(m).toMatchObject({ spend: 4000, income: 50000, net: 46000, vsLast: 1 });
    expect(m.byCategory.map((c) => [c.category, c.share])).toEqual([['food', 0.75], ['transport', 0.25]]);
    expect(m.daily).toHaveLength(30);
    expect(netWorthSeries(os, 3, now).map((p) => p.total)).toEqual([10000, 58000, 104000]);
  });
});
