import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBetterSqliteAdapter } from '@core/db/betterSqliteAdapter';
import { createLifeOS } from '@core/lifeos';
import { Registry } from '@core/registry/registry';
import type { LifeOSContext } from '@core/registry/context';
import { bus } from '@core/events/bus';
import { financeModule } from '@modules/finance';
import { categoryTargets } from './categories';
import { adoptBudget, suggestBudget, undoBudget } from './budget';
import type { TransactionData } from './types';

/** A suggested budget (docs/MODEL.md, 15 Nov). */

let os: LifeOSContext;
beforeEach(async () => {
  bus.clear();
  os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules: [financeModule], registry: new Registry() });
});
afterEach(() => os.db.close());

const tx = (kind: string, category: string, amount: number, date: string) => os.records.create<TransactionData>({ object: 'transaction', data: { amount, kind, category, date } as TransactionData }, 'assistant');

describe('a suggested budget', () => {
  it('limits each category spent in at least twice at its middle month, rounded up; says what that leaves to save; Use these, with Undo', () => {
    const now = new Date('2026-11-15T12:00:00');
    // Aug, Sep, Oct: food 4,200 / 5,100 / 4,800; travel only once; salary 1,00,000 each.
    for (const [m, food] of [['08', 4200], ['09', 5100], ['10', 4800]] as const) {
      tx('expense', 'food', food, `2026-${m}-10`);
      tx('income', 'salary', 100_000, `2026-${m}-01`);
    }
    tx('expense', 'travel', 30_000, '2026-09-20');
    tx('expense', 'groceries', 1_430, '2026-08-05');
    tx('expense', 'groceries', 1_260, '2026-10-05');
    const s = suggestBudget(os, now)!;
    expect(s.items).toEqual([{ category: 'food', monthly: 5_000 }, { category: 'groceries', monthly: 1_300 }]);
    expect(s).toMatchObject({ total: 6_300, income: 100_000, save: 93_700 });
    const before = adoptBudget(os, s);
    expect(categoryTargets(os)).toEqual({ food: 5_000, groceries: 1_300 });
    undoBudget(os, s, before);
    expect(categoryTargets(os)).toEqual({});
  });
});
