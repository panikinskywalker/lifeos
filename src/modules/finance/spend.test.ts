import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBetterSqliteAdapter } from '@core/db/betterSqliteAdapter';
import { createLifeOS } from '@core/lifeos';
import { Registry } from '@core/registry/registry';
import type { LifeOSContext } from '@core/registry/context';
import { bus } from '@core/events/bus';
import { spendQuery } from './spend';
import { accountType, transactionType } from './types';

let os: LifeOSContext;
const NOW = new Date('2026-09-26T12:00:00');
beforeEach(async () => {
  bus.clear();
  os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules: [{ id: 'finance', name: 'F', version: '1', description: '', icon: 'x', color: '#000', objects: [accountType, transactionType] }], registry: new Registry() });
});
afterEach(() => os.db.close());

describe('Spend screen query', () => {
  it('this month vs last month by the same day, by category, filtered, sorted', () => {
    const hdfc = os.records.create({ object: 'account', title: 'HDFC', data: { kind: 'bank' } }).id;
    const tx = (date: string, amount: number, category: string, merchant: string, kind = 'expense', accountId?: string) => os.records.create({ object: 'transaction', data: { date, amount, category, merchant, kind, accountId } });
    tx('2026-09-02', 1200, 'food', 'Swiggy', 'expense', hdfc);
    tx('2026-09-10', 300, 'transport', 'Uber');
    tx('2026-09-20', 800, 'food', 'Zomato', 'expense', hdfc);
    tx('2026-09-21', 50000, 'salary', 'ACME', 'income');
    tx('2026-09-05', 5000, 'investment', 'PPFAS', 'transfer');
    tx('2026-08-15', 1000, 'food', 'Swiggy');
    tx('2026-08-28', 700, 'food', 'Swiggy'); // after 26 Aug: not in last month "by the same day"
    const r = spendQuery(os, { period: 'month', kind: 'spending' }, NOW);
    expect([r.total, r.count, r.prevTotal]).toEqual([2300, 3, 1000]);
    expect(r.change).toBeCloseTo(1.3);
    expect(r.byCategory.map((c) => [c.category, c.total])).toEqual([['food', 2000], ['transport', 300]]);
    expect(r.items.map((e) => e.data.merchant)).toEqual(['Zomato', 'Uber', 'Swiggy']);
    const f = spendQuery(os, { period: 'month', kind: 'spending', categories: ['food'], sort: 'largest' }, NOW);
    expect(f.items.map((e) => e.data.amount)).toEqual([1200, 800]);
    expect(f.byCategory).toHaveLength(2); // the breakdown still shows everything
    expect(spendQuery(os, { period: 'month', kind: 'spending', accountIds: [hdfc] }, NOW).total).toBe(2000);
    expect(spendQuery(os, { period: 'month', kind: 'spending', search: 'zom' }, NOW).total).toBe(800);
    expect(spendQuery(os, { period: 'month', kind: 'investments' }, NOW).total).toBe(5000);
    expect(spendQuery(os, { period: 'month', kind: 'income' }, NOW).total).toBe(50000);
    expect(spendQuery(os, { period: 'all', kind: 'spending', sort: 'oldest' }, NOW).items[0]!.data.date).toBe('2026-08-15');
  });
});
