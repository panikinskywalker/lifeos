import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBetterSqliteAdapter } from '@core/db/betterSqliteAdapter';
import { createLifeOS } from '@core/lifeos';
import { Registry } from '@core/registry/registry';
import type { LifeOSContext } from '@core/registry/context';
import type { ModuleManifest } from '@core/registry/types';
import { bus } from '@core/events/bus';
import { accountType, investmentType, subscriptionType, transactionType } from './types';
import { foldInstitutions, postDueSubscriptions, targetStatus } from './lib';
import { categoryTargets, foldBudgetsIntoTargets, setCategoryTarget } from './categories';
import { orgType } from '../places/types';

const mod: ModuleManifest = { id: 'finance', name: 'Finance', version: '1', description: '', icon: 'x', color: '#000', objects: [accountType, transactionType, subscriptionType, investmentType, orgType] };
let os: LifeOSContext;
beforeEach(async () => {
  bus.clear();
  os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules: [mod], registry: new Registry() });
});
afterEach(() => os.db.close());

describe('subscriptions × cycles', () => {
  it('auto-post files the expense, logs the renewal as done and rolls both dates', () => {
    const s = os.records.create({ object: 'subscription', data: { name: 'Jio', amount: 399, rrule: 'FREQ=DAILY;INTERVAL=28', nextBillingAt: '2026-09-01' }, status: 'active' });
    const renewal = os.cycles.forEntity(s.id)[0]!;
    expect(postDueSubscriptions(os, '2026-09-20')).toBe(1);
    expect(os.records.get<{ nextBillingAt: string }>(s.id)!.data.nextBillingAt).toBe('2026-09-29');
    const c = os.cycles.get(renewal.id)!;
    expect(new Date(c.nextDueAt!).getDate()).toBe(29);
    expect(os.cycles.stats(renewal.id)).toMatchObject({ count: 1, totalCost: 399 });
    expect(os.records.query('transaction')).toHaveLength(1);
    expect(postDueSubscriptions(os, '2026-09-20')).toBe(0);
  });

  it('paid by hand in Upkeep: the billing date moves, so auto-post does not charge twice', () => {
    const s = os.records.create({ object: 'subscription', data: { name: 'Gym', amount: 1500, rrule: 'FREQ=MONTHLY;INTERVAL=1', nextBillingAt: '2026-09-10' }, status: 'active' });
    const renewal = os.cycles.forEntity(s.id)[0]!;
    os.cycles.markDone(renewal.id, { at: new Date('2026-09-09T12:00:00').getTime() });
    expect(os.records.get<{ nextBillingAt: string }>(s.id)!.data.nextBillingAt).toBe('2026-10-10');
    expect(postDueSubscriptions(os, '2026-09-20')).toBe(0);
  });

  it('auto-post off leaves it due; cancelling takes it out of Upkeep', () => {
    const s = os.records.create({ object: 'subscription', data: { name: 'Netflix', amount: 649, rrule: 'FREQ=MONTHLY;INTERVAL=1', nextBillingAt: '2026-09-05', autoPost: false }, status: 'active' });
    expect(postDueSubscriptions(os, '2026-09-20')).toBe(0);
    expect(os.cycles.all()).toHaveLength(1);
    os.records.setStatus(s.id, 'cancelled');
    expect(os.cycles.all()).toHaveLength(0);
    os.records.setStatus(s.id, 'active');
    expect(os.cycles.all()).toHaveLength(1);
  });
});

describe('reports', () => {
  it('run-rate converts every billing cycle to per month', async () => {
    const { perMonth, subscriptionRunRate } = await import('./reports');
    expect(perMonth(1200, 'FREQ=YEARLY;INTERVAL=1')).toBe(100);
    expect(perMonth(300, 'FREQ=MONTHLY;INTERVAL=3')).toBe(100);
    expect(perMonth(399, 'FREQ=DAILY;INTERVAL=84')).toBeCloseTo(144.58, 1);
    os.records.create({ object: 'subscription', data: { name: 'Netflix', amount: 649, rrule: 'FREQ=MONTHLY;INTERVAL=1', nextBillingAt: '2026-10-01' }, status: 'active' });
    os.records.create({ object: 'subscription', data: { name: 'Old gym', amount: 5000, rrule: 'FREQ=MONTHLY;INTERVAL=1', nextBillingAt: '2026-10-01' }, status: 'cancelled' });
    const r = subscriptionRunRate(os);
    expect(r.rows.map((x) => x.sub.data.name)).toEqual(['Netflix']);
    expect(r).toMatchObject({ monthly: 649, yearly: 7788 });
  });

  it('month report and net worth over time', async () => {
    const { monthReport, netWorthSeries } = await import('./reports');
    const now = new Date('2026-09-20T12:00:00');
    const bank = os.records.create({ object: 'account', data: { name: 'HDFC', kind: 'bank', openingBalance: 10000 } });
    const tx = (amount: number, kind: string, date: string, category = 'food') => os.records.create({ object: 'transaction', data: { amount, kind, category, date, accountId: bank.id } });
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

describe('R1 finance Objects', () => {
  it('a monthly target lives on the category; spend paces against it', () => {
    setCategoryTarget(os, 'food', 1000);
    os.records.create({ object: 'transaction', data: { amount: 400, kind: 'expense', category: 'food', date: '2026-10-02' } });
    os.records.create({ object: 'transaction', data: { amount: 900, kind: 'expense', category: 'food', date: '2026-10-03' } });
    expect(targetStatus(os, 'food', Date.parse('2026-10-04T12:00:00'))).toMatchObject({ limit: 1000, spent: 1300, progress: 1.3, remaining: -300 });
    setCategoryTarget(os, 'food', null);
    expect(categoryTargets(os)).toEqual({});
  });

  it('old Budget rows fold into targets once and leave the records table', () => {
    const now = Date.now();
    os.db.run(`INSERT INTO records(id, object, title, data, created_at, updated_at, version) VALUES ('b1', 'budget', 'Food', '{"category":"food","amount":8000,"period":"monthly"}', ?, ?, 1)`, [now, now]);
    os.db.run(`INSERT INTO records(id, object, title, data, created_at, updated_at, version) VALUES ('b2', 'budget', 'Transport', '{"category":"transport","amount":1200,"period":"yearly"}', ?, ?, 1)`, [now, now]);
    expect(foldBudgetsIntoTargets(os)).toBe(2);
    expect(categoryTargets(os)).toEqual({ food: 8000, transport: 100 });
    expect(os.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM records WHERE object='budget' AND deleted_at IS NULL`)?.n).toBe(0);
    expect(foldBudgetsIntoTargets(os)).toBe(0); // once
  });

  it('an account\'s bank becomes an Organisation it links to', () => {
    const a = os.records.create({ object: 'account', data: { kind: 'bank', openingBalance: 0, institution: 'HDFC Bank' } });
    expect(foldInstitutions(os)).toBe(1);
    const linked = os.records.get<{ institutionId?: string }>(a.id)!.data.institutionId!;
    const org = os.records.get<{ kind: string }>(linked)!;
    expect(org.title).toBe('HDFC Bank');
    expect(org.data.kind).toBe('bank');
    expect(os.links.forEntity(a.id).map((l) => l.relation.kind)).toContain('institution');
    expect(foldInstitutions(os)).toBe(0);
  });

  it('an investment carries its SIP and maturity cycles; a buy is an investment transaction out of spend', () => {
    const inv = os.records.create({ object: 'investment', title: 'Parag Parikh Flexi Cap', data: { instrument: 'mutual_fund', invested: 50000, sip: 5000, sipDay: 5, maturesOn: '2027-03-31' }, status: 'active' });
    const cycles = os.cycles.forEntity(inv.id).map((c) => c.template).sort();
    expect(cycles).toEqual(['investment.maturity', 'investment.sip']);
    const tx = os.records.create({ object: 'transaction', data: { amount: 5000, kind: 'investment', category: 'investment', date: '2026-10-05', investmentId: inv.id } });
    expect(os.links.forEntity(inv.id).some((l) => l.other.id === tx.id)).toBe(true);
    expect(os.records.query('transaction', { filter: { and: [{ field: 'data.kind', op: 'eq', value: 'expense' }] } })).toHaveLength(0);
  });
});

describe('R1 finance tools', () => {
  const run = async (name: string, input: Record<string, unknown> = {}) => {
    const { financeAiTools } = await import('./aiTools');
    return financeAiTools.find((t) => t.name === name)!.run(input, os) as Promise<Record<string, unknown>>;
  };
  it('spend: a period total with change, by category and the transactions; investments are not spend', async () => {
    const now = new Date();
    const d = (day: number) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(Math.min(day, now.getDate())).padStart(2, '0')}`;
    os.records.create({ object: 'transaction', data: { amount: 1200, kind: 'expense', category: 'food', date: d(2) } });
    os.records.create({ object: 'transaction', data: { amount: 300, kind: 'expense', category: 'transport', date: d(3) } });
    os.records.create({ object: 'transaction', data: { amount: 5000, kind: 'investment', category: 'investment', date: d(3) } });
    const r = await run('spend', { period: 'month', kind: 'spending' });
    expect(r).toMatchObject({ total: 1500 });
    expect((r.byCategory as Array<{ category: string }>).map((c) => c.category)).toEqual(['food', 'transport']);
    expect((await run('spend', { period: 'month', kind: 'investments' })).total).toBe(5000);
  });
  it('portfolio and net worth count holdings at their latest value', async () => {
    os.records.create({ object: 'investment', title: 'PPFAS', data: { instrument: 'mutual_fund', invested: 50000, currentValue: 56000, sip: 5000 }, status: 'active' });
    os.records.create({ object: 'investment', title: 'SBI FD', data: { instrument: 'fd', invested: 100000, maturesOn: '2026-10-20' }, status: 'active' });
    os.records.create({ object: 'account', title: 'HDFC', data: { kind: 'bank', openingBalance: 20000 } });
    const p = await run('portfolio');
    expect(p).toMatchObject({ invested: 150000, value: 156000 });
    expect((p.sips as unknown[]).length).toBe(1);
    expect((p.maturing as Array<{ name: string }>).map((m) => m.name)).toEqual(['SBI FD']);
    const nw = await run('net_worth', { months: 3 });
    expect(nw).toMatchObject({ total: 176000, investments: 156000, assets: 20000 });
    expect((nw.series as unknown[]).length).toBe(3);
  });
});
