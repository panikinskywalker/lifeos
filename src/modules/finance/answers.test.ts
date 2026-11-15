import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBetterSqliteAdapter } from '@core/db/betterSqliteAdapter';
import { createLifeOS } from '@core/lifeos';
import { parseMessage } from '@core/ai/parser';
import { Assistant, READ_ONLY_TOOLS } from '@core/ai/assistant';
import { Registry } from '@core/registry/registry';
import type { LifeOSContext } from '@core/registry/context';
import { bus } from '@core/events/bus';
import { financeModule } from '.';
import { answerMoney, chargedTwice, nextPayday, readMoneyQuestion } from './answers';

const NOW = new Date(2026, 9, 23, 12);
let os: LifeOSContext;
let account: string;
const tx = (date: string, amount: number, merchant: string, category: string, kind = 'expense') => os.records.create({ object: 'transaction', data: { amount, kind, category, merchant, date, accountId: account } });

beforeEach(async () => {
  bus.clear();
  os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules: [financeModule], registry: new Registry() });
  account = os.records.create({ object: 'account', title: 'HDFC savings', data: { kind: 'bank', openingBalance: 100000 } }).id;
});
afterEach(() => os.db.close());

describe('reading a money question', () => {
  it.each([
    ['Where did my money go this month?', 'where'],
    ['Where did my money go last month', 'where'],
    ['How much did I spend on food last month?', 'spent'],
    ['how much have i paid at Swiggy this year', 'spent'],
    ['What bills are due before payday and what will be left?', 'bills'],
    ['Did anything get charged twice?', 'twice'],
    ['Can I afford a 60,000 trip?', 'afford'],
    ['What is my net worth?', 'worth'],
    ['What is my account balance', 'balances'],
    ['How much do my subscriptions cost?', 'subscriptions'],
    ['How are my investments doing', 'portfolio'],
    ['What was my biggest expense this month?', 'biggest'],
    ['How much did I earn last month?', 'income'],
  ])('%s', (q, kind) => {
    expect(readMoneyQuestion(q)?.kind).toBe(kind);
  });

  it('leaves what it does not know to the model', () => {
    for (const q of ['What did Priya say about the flat?', 'Spent 450 on lunch', 'When did I last see Karan?']) expect(readMoneyQuestion(q)).toBeNull();
  });

  it('reads the category or merchant and the period', () => {
    expect(readMoneyQuestion('How much did I spend on food last month?')).toEqual({ kind: 'spent', period: 'last_month', about: 'food' });
    expect(readMoneyQuestion('how much did i spend at swiggy')).toEqual({ kind: 'spent', period: 'month', about: 'swiggy' });
    expect(readMoneyQuestion('how much did i spend this month')).toEqual({ kind: 'spent', period: 'month', about: null });
  });
});

describe('answering on the phone', () => {
  it('where the money went: the total, the comparison and the top categories, from the records', () => {
    tx('2026-10-01', 18000, 'Landlord', 'housing');
    tx('2026-10-05', 500, 'Swiggy', 'food');
    tx('2026-09-05', 1000, 'Swiggy', 'food');
    const { answer, card } = answerMoney(os, { kind: 'where', period: 'month' }, NOW);
    expect(answer).toContain('2 payments');
    expect(answer).toContain('Housing & Rent');
    expect(card).toMatchObject({ kind: 'chart' });
  });

  it('a category question lists the payments behind the figure, adding up to it', () => {
    tx(new Date().toISOString().slice(0, 10), 500, 'Swiggy', 'food');
    tx(new Date().toISOString().slice(0, 10), 40, 'Uber', 'transport');
    const q = readMoneyQuestion('how much did i spend on food this month')!;
    const { answer, card } = answerMoney(os, q);
    expect(answer).toContain('Food & Drink');
    expect(answer).toContain('1 payment');
    expect(card).toMatchObject({ kind: 'list' });
    expect((card as { items: unknown[] }).items).toHaveLength(1);
  });

  it('payday is the day of the latest salary; bills due before it and what is left', () => {
    tx('2026-10-01', 142000, 'ACME', 'salary', 'income');
    expect(nextPayday(os, NOW)).toBe('2026-11-01');
    os.records.create({ object: 'subscription', title: 'Netflix', status: 'active', data: { name: 'Netflix', amount: 649, rrule: 'FREQ=MONTHLY;INTERVAL=1', nextBillingAt: '2026-10-26', category: 'subscriptions' } });
    os.records.create({ object: 'subscription', title: 'Gym', status: 'active', data: { name: 'Gym', amount: 2000, rrule: 'FREQ=MONTHLY;INTERVAL=1', nextBillingAt: '2026-11-05', category: 'health' } });
    const { answer, card } = answerMoney(os, { kind: 'bills' }, NOW);
    expect(answer).toContain('1 bill due before payday');
    expect((card as { items: Array<{ title: string }> }).items.map((i) => i.title)).toEqual([expect.stringContaining('Netflix')]);
  });

  it('charged twice: same payee and amount a day apart; small ones and different days are not', () => {
    tx('2026-10-12', 799, 'Amazon', 'shopping');
    tx('2026-10-12', 799, 'Amazon', 'shopping');
    tx('2026-10-01', 500, 'Swiggy', 'food');
    tx('2026-10-15', 500, 'Swiggy', 'food');
    tx('2026-10-20', 20, 'Chai', 'food');
    tx('2026-10-20', 20, 'Chai', 'food');
    expect(chargedTwice(os, NOW).map((g) => g[0]!.data.merchant)).toEqual(['Amazon']);
    expect(answerMoney(os, { kind: 'twice' }, NOW).answer).toContain('Amazon');
  });

  it('afford: the arithmetic from the last 3 months, and it says when it has none', () => {
    expect(answerMoney(os, readMoneyQuestion('Can I afford a trip to Goa?')!, NOW).answer).toContain('No income is filed');
    tx('2026-09-01', 100000, 'ACME', 'salary', 'income');
    tx('2026-09-02', 40000, 'Landlord', 'housing');
    const { answer } = answerMoney(os, { kind: 'afford', amount: 60000 }, NOW);
    expect(answer).toContain('about ₹60,000 is left');
  });

  it('runs through the question path with no model, and the tool is read-only', async () => {
    tx(new Date().toISOString().slice(0, 10), 500, 'Swiggy', 'food');
    expect(parseMessage(os, 'Where did my money go this month?')?.intent).toBe('money_answer');
    expect(READ_ONLY_TOOLS.has('money_answer')).toBe(true);
    const a = new Assistant(os, { provider: null, toolFilter: (t) => READ_ONLY_TOOLS.has(t.name), confirm: async () => true });
    const turns = await a.send('Where did my money go this month?');
    expect(turns.filter((t) => t.role === 'assistant').map((t) => t.text).join(' ')).toContain('Food & Drink');
  });
});
