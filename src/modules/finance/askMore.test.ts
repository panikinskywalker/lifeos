import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBetterSqliteAdapter } from '@core/db/betterSqliteAdapter';
import { createLifeOS } from '@core/lifeos';
import { Registry } from '@core/registry/registry';
import type { LifeOSContext } from '@core/registry/context';
import { bus } from '@core/events/bus';
import { financeModule } from '@modules/finance';
import { categoryFor } from './filing/rules';
import { askOnPhone, oddThings } from './ask';
import type { TransactionData } from './types';

/** What Claude's Personal Finance answers that Ask Money did not (docs/MODEL.md, 15 Nov). */

let os: LifeOSContext;
beforeEach(async () => {
  bus.clear();
  os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules: [financeModule], registry: new Registry() });
});
afterEach(() => os.db.close());

const now = new Date('2026-11-15T12:00:00');
const tx = (kind: string, category: string, amount: number, date: string, merchant?: string) => os.records.create<TransactionData>({ object: 'transaction', title: merchant, data: { amount, kind, category, date, merchant } as TransactionData }, 'assistant');

describe('fees, creeping bills, interest and spending more than you make', () => {
  it('a bank charging you is a fee by its words; interest you earn is not', () => {
    expect(categoryFor(os, null, 'Interest charged of Rs 1,234.00 on your ICICI Bank Credit Card XX3007', 1234, 'debit')).toBe('fees');
    expect(categoryFor(os, 'ADOBE', 'Forex markup fee of INR 61.20 on ICICI Bank Card XX3007', 61.2, 'debit')).toBe('fees');
    expect(categoryFor(os, null, 'Interest of Rs 412 credited to your SBI A/c XX1234', 412, 'credit')).not.toBe('fees');
  });

  it("what an APR is, and what interest cost this year", () => {
    tx('expense', 'fees', 1_234, '2026-03-05', 'Finance charges');
    tx('expense', 'fees', 866, '2026-09-05', 'Interest charged');
    tx('expense', 'fees', 590, '2026-04-01', 'Annual fee');
    const a = askOnPhone(os, "What's an APR, and what has mine cost me this year?", now)!;
    expect(a.text).toMatch(/^APR is the yearly interest rate/);
    expect(a.text).toContain('₹2,100 across 2 charges');
  });

  it('am I spending more than I make: a usual month over the last 3', () => {
    for (const m of ['08', '09', '10']) {
      tx('income', 'salary', 50_000, `2026-${m}-01`, 'ACME');
      tx('expense', 'shopping', 56_000, `2026-${m}-12`, 'Amazon');
    }
    expect(askOnPhone(os, 'Am I spending more than I make?', now)!.text).toMatch(/^Yes\. .*₹6,000 more than came in/);
  });

  it('a bill that crept up 10% or more over the year shows in Anything wrong', () => {
    os.records.create({ object: 'subscription', title: 'MSEDCL', data: { name: 'MSEDCL', amount: 1_560, rrule: 'FREQ=MONTHLY;INTERVAL=1', nextBillingAt: '2026-12-05', priceHistory: [{ amount: 1_200, from: '2025-10-05' }, { amount: 1_380, from: '2026-03-05' }, { amount: 1_560, from: '2026-08-05' }] }, status: 'active' }, 'assistant');
    const p = oddThings(os, now).prices;
    expect(p.map((x) => [x.sub.title, x.from, x.to])).toEqual([['MSEDCL', 1_200, 1_560]]);
  });
});
