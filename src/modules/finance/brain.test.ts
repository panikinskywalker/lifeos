import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBetterSqliteAdapter } from '@core/db/betterSqliteAdapter';
import { createLifeOS } from '@core/lifeos';
import { Registry } from '@core/registry/registry';
import type { LifeOSContext } from '@core/registry/context';
import { bus } from '@core/events/bus';
import { answerNudge, fileNudge, runPass, upkeepCandidates } from '@core/brain';
import { financeBrain, financeModule, unusualSpends, type TransactionData } from '.';

/** What Money brings the brain (layer 8, slice 6): renewals, bills, a maturity, an unusual spend. */

const DAY = 86_400_000;
const NOW = Date.now();
const day = (n: number) => {
  const d = new Date(NOW + n * DAY);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
let os: LifeOSContext;
beforeEach(async () => {
  bus.clear();
  os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules: [financeModule], registry: new Registry() });
});
afterEach(() => os.db.close());

const sub = (name: string, amount: number, inDays: number, autoPost = true) =>
  os.records.create({ object: 'subscription', data: { name, amount, rrule: 'FREQ=MONTHLY;INTERVAL=1', nextBillingAt: day(inDays), autoPost }, status: 'active' });
const spend = (merchant: string, amount: number, daysAgo: number, category = 'food') =>
  os.records.create<TransactionData>({ object: 'transaction', data: { amount, kind: 'expense', category, merchant, date: day(-daysAgo) } });

describe('Money’s candidates', () => {
  it('a renewal that bills itself is a heads-up; a bill is shall I? Paid; Upkeep no longer offers them', () => {
    sub('Netflix', 649, 2);
    sub('Electricity', 2140, 1, false);
    sub('Far off', 99, 20);
    const c = financeBrain.candidates(os, NOW);
    expect(c.map((x) => [x.title, x.kind, x.shape, x.yes, !!x.urgent])).toEqual([
      ['Electricity', 'due', 'ask', 'Paid', false],
      ['Netflix', 'due', 'check', 'Keep it', false],
    ]);
    expect(c[0]!.line).toMatch(/^Electricity: ₹2,140(\.00)? due tomorrow$/);
    expect(c[1]!.line).toMatch(/^Netflix: ₹649(\.00)? renews \w{3}$/);
    expect(c[1]!.record).toMatchObject({ name: 'Netflix', amount: 649, every: 'month', bills_itself: true, days_left: 2 });
    expect(c.map((x) => x.line).join('\n')).not.toMatch(/[\u2014\u2013]/);
    expect(upkeepCandidates(os, NOW)).toEqual([]);
  });

  it('a bill due today or late is urgent; Paid marks it done and files the expense', () => {
    const s = sub('Rent', 25000, -2, false);
    const [bill] = financeBrain.candidates(os, NOW);
    expect(bill).toMatchObject({ title: 'Rent', urgent: true });
    expect(bill!.line).toMatch(/^Rent: ₹25,000(\.00)?, 2 days late$/);
    const n = fileNudge(os, 'finance', bill!, { passId: 'p', line: bill!.line, at: NOW });
    answerNudge(os, n.id, 'yes');
    const paid = os.records.query<TransactionData>('transaction', {});
    expect(paid.map((t) => [t.data.amount, t.data.kind])).toEqual([[25000, 'expense']]);
    expect(os.cycles.forEntity(s.id)[0]!.lastDoneAt).not.toBeNull();
  });

  it('a renewal that bills itself and is past due is left to auto-post; a heads-up changes nothing', () => {
    sub('Spotify', 119, -1);
    expect(financeBrain.candidates(os, NOW)).toEqual([]);
    const s = sub('iCloud', 75, 1);
    const [c] = financeBrain.candidates(os, NOW);
    answerNudge(os, fileNudge(os, 'finance', c!, { passId: 'p', line: c!.line, at: NOW }).id, 'yes');
    expect(os.cycles.forEntity(s.id)[0]!.lastDoneAt).toBeNull();
    expect(os.records.query('transaction', {})).toEqual([]);
  });

  it('a deposit maturing is a heads-up from its own Cycle', () => {
    os.records.create({ object: 'investment', title: 'HDFC FD', data: { instrument: 'fd', invested: 100000, currentValue: 107000, maturesOn: day(10) }, status: 'active' });
    const [c] = financeBrain.candidates(os, NOW);
    expect(c).toMatchObject({ title: 'HDFC FD', shape: 'check', yes: 'Right' });
    expect(c!.line).toMatch(/^HDFC FD: matures on \d+ \w{3}( \d{4})?$/);
    expect(c!.record).toMatchObject({ what: 'matures', amount: 107000, days_left: 10 });
  });

  it('an unusual spend: three times the category’s usual, ₹1,000 or more, with five before it', () => {
    for (let i = 1; i <= 6; i++) spend('Zomato', 400 + i * 10, 10 + i * 7);
    spend('Swiggy', 1800, 0);
    spend('Groceries', 5000, 0, 'groceries'); // no history in its category
    spend('Chai', 900, 0); // under ₹1,000
    const [c, ...rest] = unusualSpends(os, NOW);
    expect(rest).toEqual([]);
    expect(c).toMatchObject({ kind: 'due', shape: 'check', title: 'Swiggy', yes: 'Right' });
    expect(c!.line).toMatch(/^Swiggy: ₹1,800(\.00)? today, about 4x your usual Food & Drink$/);
    expect(c!.record).toEqual({ payee: 'Swiggy', category: 'Food & Drink', amount: 1800, currency: null, day: day(0), usual: 435, times: 4 });
    // An older one is not news.
    spend('Swiggy', 3000, 3);
    expect(unusualSpends(os, NOW).map((x) => x.record.amount)).toEqual([1800]);
  });

  it('a pass files Money’s own, at most two a day', async () => {
    sub('Netflix', 649, 2);
    sub('Electricity', 2140, 1, false);
    sub('Water', 300, 0, false);
    const r = await runPass(os, { pass: 'morning', model: null, now: NOW });
    expect(r.filed.map((n) => [n.module, n.title])).toEqual([['finance', 'Water'], ['finance', 'Electricity']]);
  });
});
