import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBetterSqliteAdapter } from '@core/db/betterSqliteAdapter';
import { createLifeOS } from '@core/lifeos';
import { Registry } from '@core/registry/registry';
import type { LifeOSContext } from '@core/registry/context';
import { bus } from '@core/events/bus';
import { financeModule } from '@modules/finance';
import { askOnPhone, chipsFor, compare, dropView, keepView, moneyViews, oddFine, oddThings, oneIsWrong, runQuery, starters, type MoneyQuery } from './ask';
import { oddNotices } from './brain';

/** Ask Money (docs/MODEL.md, built 15 Nov): every figure a money query the phone works out. */

let os: LifeOSContext;
beforeEach(async () => {
  bus.clear();
  os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules: [financeModule], registry: new Registry() });
});
afterEach(() => os.db.close());

const now = new Date('2026-11-20T12:00:00');
const tx = (amount: number, category: string, date: string, merchant = 'Shop', extra: Record<string, unknown> = {}) => os.records.create({ object: 'transaction', data: { amount, kind: 'expense', category, date, merchant, ...extra } });

describe('the money query', () => {
  it('adds up to its payments, splits by category or week, and leaves out rent', () => {
    tx(32000, 'housing', '2026-11-01', 'Rent');
    tx(500, 'food', '2026-11-03', 'Swiggy');
    tx(1200, 'food', '2026-11-10', 'Toit', { share: 600 });
    tx(300, 'transport', '2026-11-16', 'Uber');
    tx(999, 'food', '2026-10-20', 'Swiggy');
    const q: MoneyQuery = { measure: 'spent', period: 'month', by: 'category' };
    const f = runQuery(os, q, now);
    expect(f.total).toBe(33400);
    expect(f.rows.reduce((n, t) => n + ((t.data as { share?: number }).share ?? t.data.amount), 0)).toBe(33400);
    expect(f.groups.map((g) => [g.label, g.value])).toEqual([['Housing & Rent', 32000], ['Food & Drink', 1100], ['Transport', 300]]);
    const weeks = runQuery(os, { measure: 'spent', period: 'month', by: 'week', leaveOut: ['housing'] }, now);
    expect(weeks.total).toBe(1400);
    expect(weeks.groups.map((g) => [g.label, g.value])).toEqual([['1 to 7', 500], ['8 to 14', 600], ['15 to 21', 300]]);
    expect(runQuery(os, { measure: 'spent', period: 'month', payee: 'swiggy' }, now).total).toBe(500);
  });

  it('offers follow-ups worked out on the phone', () => {
    tx(32000, 'housing', '2026-11-01', 'Rent');
    tx(500, 'food', '2026-11-03');
    const q: MoneyQuery = { measure: 'spent', period: 'month', by: 'category' };
    expect(chipsFor(q, runQuery(os, q, now)).map((c) => c.label)).toEqual([`Compare with October`, 'Only Housing & Rent', 'Show it by week', 'Leave out rent']);
  });

  it('says when the payments do not go back far enough to compare', () => {
    tx(500, 'food', '2026-11-03');
    expect(compare(os, { measure: 'spent', period: 'month' }, now).text).toMatch(/only go back to .*3 Nov, so there is no October to compare with yet/);
    tx(800, 'food', '2026-10-02');
    expect(compare(os, { measure: 'spent', period: 'month' }, now).text).toMatch(/^₹500 so far in November, ₹300 less than the same days in October \(₹800\)/);
  });
});

describe('answers on the phone, in the fixed shape', () => {
  it('everyday questions come with a block and its query; reading only, no advice', () => {
    tx(500, 'food', '2026-11-03');
    const where = askOnPhone(os, 'Where did my money go this month?', now)!;
    expect(where.block).toMatchObject({ kind: 'bars', query: { measure: 'spent', period: 'month', by: 'category' } });
    expect(askOnPhone(os, 'How much did I spend on food?', now)!.block).toMatchObject({ kind: 'list', query: { only: ['food'] } });
    expect(askOnPhone(os, 'Pay my Amazon card bill', now)!.text).toMatch(/^I can only read your money/);
    expect(askOnPhone(os, 'Should I buy more Parag Parikh?', now)!.text).toBe('I do not give investment advice. Here is what you hold.');
    expect(askOnPhone(os, 'Why did my Zepto spend jump in a weird way compared to my friends', now)).toBeNull();
    expect(starters(os, now).map((s) => s.line)[0]).toBe('₹500 so far');
  });
});

describe('anything wrong', () => {
  it('charged twice, a new fee and a price change; fine is remembered, one is wrong deletes the later with Undo', () => {
    tx(799, 'shopping', '2026-11-18', 'Amazon');
    tx(799, 'shopping', '2026-11-18', 'Amazon');
    tx(118, 'fees', '2026-11-19', 'HDFC Bank');
    tx(118, 'fees', '2026-11-12', 'ICICI Bank');
    tx(118, 'fees', '2026-09-12', 'ICICI Bank');
    os.records.create({ object: 'subscription', data: { name: 'Netflix', amount: 649, rrule: 'FREQ=MONTHLY;INTERVAL=1', nextBillingAt: '2026-12-01', priceHistory: [{ amount: 499, from: '2026-03-01' }, { amount: 649, from: '2026-11-05' }] }, status: 'active' });
    const o = oddThings(os, now);
    expect(o.twice).toHaveLength(1);
    expect(o.fees.map((f) => f.tx.data.merchant)).toEqual(['HDFC Bank']);
    expect(o.prices.map((p) => [p.from, p.to])).toEqual([[499, 649]]);
    expect(oddNotices(os, now.getTime()).map((c) => c.line)).toEqual(['Amazon, ₹799, twice on Wed, 18 Nov', 'HDFC Bank took ₹118 on Thu, 19 Nov, a fee you have not paid before']);
    oddFine(os, o.fees[0]!.key);
    expect(oddThings(os, now).fees).toHaveLength(0);
    const undo = oneIsWrong(os, o.twice[0]!.txs);
    expect(os.records.query('transaction', { filter: { and: [{ field: 'data.merchant', op: 'eq', value: 'Amazon' }] } })).toHaveLength(1);
    undo();
    expect(os.records.query('transaction', { filter: { and: [{ field: 'data.merchant', op: 'eq', value: 'Amazon' }] } })).toHaveLength(2);
  });
});

describe('views you keep', () => {
  it('keep stores the query, not the numbers; drop has Undo', () => {
    const v = keepView(os, { title: 'Weekly spend without rent', kind: 'bars', query: { measure: 'spent', period: 'month', by: 'week', leaveOut: ['housing'] } });
    expect(moneyViews(os)).toEqual([v]);
    tx(500, 'food', '2026-11-03');
    expect(runQuery(os, v.query, now).total).toBe(500);
    const undo = dropView(os, v.id);
    expect(moneyViews(os)).toEqual([]);
    undo();
    expect(moneyViews(os)).toHaveLength(1);
  });
});

describe('what a model is given', () => {
  it('money_query returns the figures and the payments as payee, amount, date and category only', async () => {
    tx(500, 'food', '2026-11-03', 'Swiggy', { rawText: 'Rs 500 debited from A/c XX1234 to SWIGGY', note: 'Ref 123', accountId: 'acc1' });
    const tool = os.registry.aiTools.get('money_query')!;
    const out = (await tool.run({ measure: 'spent', period: 'all' } as never, os)) as { total: number; payments: Array<Record<string, unknown>> };
    expect(out.total).toBe(500);
    expect(Object.keys(out.payments[0]!).sort()).toEqual(['amount', 'category', 'date', 'payee']);
    expect(JSON.stringify(out)).not.toMatch(/XX1234|Ref 123|acc1/);
  });
});
