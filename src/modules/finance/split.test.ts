import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createBetterSqliteAdapter } from '@core/db/betterSqliteAdapter';
import { createLifeOS } from '@core/lifeos';
import { Registry } from '@core/registry/registry';
import type { LifeOSContext } from '@core/registry/context';
import type { ModuleManifest } from '@core/registry/types';
import { bus } from '@core/events/bus';
import { accountType, debtType, transactionType } from './types';
import { applySplit, balanceWith, balances, clearSplit, foldSplitShares, settleUp, sharedWith, splitAmounts, undoSettle } from './split';
import { incomeInRange, spendByCategory, spendInRange } from './lib';

describe('splitAmounts', () => {
  it('equal splits add up exactly, extra paise to the first', () => {
    expect(splitAmounts(100, 'equal', [{ party: 'me' }, { party: 'a' }, { party: 'b' }]).map((s) => s.amount)).toEqual([33.34, 33.33, 33.33]);
    expect(splitAmounts(2600, 'equal', [{ party: 'me' }, { party: 'priya' }]).map((s) => s.amount)).toEqual([1300, 1300]);
  });
  it('shares, percent and exact', () => {
    expect(splitAmounts(900, 'shares', [{ party: 'me', value: 1 }, { party: 'a', value: 2 }]).map((s) => s.amount)).toEqual([300, 600]);
    expect(splitAmounts(1000, 'percent', [{ party: 'me', value: 25 }, { party: 'a', value: 75 }]).map((s) => s.amount)).toEqual([250, 750]);
    expect(splitAmounts(500, 'exact', [{ party: 'me', value: 120.5 }, { party: 'a', value: 379.5 }]).map((s) => s.amount)).toEqual([120.5, 379.5]);
  });
  it('rejects splits that don’t add up', () => {
    expect(() => splitAmounts(500, 'exact', [{ party: 'me', value: 100 }, { party: 'a', value: 100 }])).toThrow(/add up to 200.00, not 500.00/);
    expect(() => splitAmounts(500, 'percent', [{ party: 'me', value: 50 }])).toThrow(/not 100%/);
    expect(() => splitAmounts(500, 'equal', [])).toThrow();
  });
});

const person = { id: 'person', module: 'm', label: 'Person', labelPlural: 'People', icon: 'x', schema: z.object({ name: z.string() }), fields: [], computeTitle: (x: Record<string, unknown>) => String(x.name) };
const group = { id: 'group', module: 'm', label: 'Group', labelPlural: 'Groups', icon: 'x', schema: z.object({ name: z.string() }), fields: [], computeTitle: (x: Record<string, unknown>) => String(x.name) };
const mod: ModuleManifest = { id: 'finance', name: 'F', version: '1', description: '', icon: 'x', color: '#000', objects: [accountType, transactionType, debtType, person, group] };
let os: LifeOSContext;
beforeEach(async () => {
  bus.clear();
  os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules: [mod], registry: new Registry() });
});
afterEach(() => os.db.close());

describe('splits, balances, settle up', () => {
  it('I paid: each person owes me their share; re-split replaces; clear removes', () => {
    const priya = os.records.create({ object: 'person', data: { name: 'Priya' } }).id;
    const arjun = os.records.create({ object: 'person', data: { name: 'Arjun' } }).id;
    const tx = os.records.create({ object: 'transaction', data: { amount: 3000, kind: 'expense', category: 'food', merchant: 'Toit', date: '2026-09-20' } });
    applySplit(os, tx.id, { payer: 'me', method: 'equal', parts: [{ party: 'me' }, { party: priya }, { party: arjun }] });
    expect(balanceWith(os, priya)).toBe(1000);
    expect(balances(os).map((b) => b.amount)).toEqual([1000, 1000]);
    expect(os.records.get<{ personIds: string[]; split: { shares: unknown[] } }>(tx.id)!.data).toMatchObject({ personIds: [priya, arjun], split: { method: 'equal' } });

    applySplit(os, tx.id, { payer: 'me', method: 'equal', parts: [{ party: 'me' }, { party: priya }] });
    expect(balanceWith(os, priya)).toBe(1500);
    expect(balanceWith(os, arjun)).toBe(0);
    clearSplit(os, tx.id);
    expect(balances(os)).toEqual([]);
  });

  it('someone else paid: I owe them my share; settling clears the balance; undo restores it', () => {
    const priya = os.records.create({ object: 'person', data: { name: 'Priya' } }).id;
    const goa = os.records.create({ object: 'group', data: { name: 'Goa' } }).id;
    const cab = os.records.create({ object: 'transaction', data: { amount: 1200, kind: 'expense', category: 'travel', merchant: 'Cab', date: '2026-09-20' } });
    applySplit(os, cab.id, { payer: priya, method: 'equal', parts: [{ party: 'me' }, { party: priya }], groupId: goa });
    const dinner = os.records.create({ object: 'transaction', data: { amount: 2000, kind: 'expense', category: 'food', merchant: 'Dinner', date: '2026-09-21' } });
    applySplit(os, dinner.id, { payer: 'me', method: 'equal', parts: [{ party: 'me' }, { party: priya }] });
    expect(balanceWith(os, priya)).toBe(400); // 1000 − 600
    expect(balanceWith(os, priya, goa)).toBe(-600);

    const s = settleUp(os, priya);
    expect(balanceWith(os, priya)).toBe(0);
    expect(os.records.get<{ direction: string; amount: number }>(s.paymentId!)!.data).toMatchObject({ direction: 'i_owe', amount: 400 });
    undoSettle(os, s);
    expect(balanceWith(os, priya)).toBe(400);
  });
});

describe('agent tools', () => {
  it('split_transaction asks first, adds "me", and undo removes the split; settle_debt undoes', async () => {
    const { financeAiTools } = await import('./aiTools');
    const t = (n: string) => financeAiTools.find((x) => x.name === n)!;
    expect(t('split_transaction').confirm).toBe(true);
    expect(t('settle_debt').confirm).toBe(true);
    const arjun = os.records.create({ object: 'person', data: { name: 'Arjun' } }).id;
    const tx = os.records.create({ object: 'transaction', data: { amount: 1800, kind: 'expense', category: 'food', merchant: 'Dinner', date: '2026-09-20' } });
    const { extrasOf } = await import('@core/ai/cards');
    const out = await t('split_transaction').run({ transactionId: tx.id, payer: 'me', method: 'equal', parts: [{ party: arjun }] }, os);
    expect(balanceWith(os, arjun)).toBe(900);
    extrasOf(out).undo!();
    expect(balanceWith(os, arjun)).toBe(0);
    await t('split_transaction').run({ transactionId: tx.id, payer: 'me', method: 'equal', parts: [{ party: arjun }] }, os);
    const s = await t('settle_debt').run({ personId: arjun }, os);
    expect(balanceWith(os, arjun)).toBe(0);
    extrasOf(s).undo!();
    expect(balanceWith(os, arjun)).toBe(900);
  });
});

describe('shared with someone (the donut on their page)', () => {
  it("adds up each party's share across the splits they are in, you first, then them", () => {
    const priya = os.records.create({ object: 'person', data: { name: 'Priya' } }).id;
    const arjun = os.records.create({ object: 'person', data: { name: 'Arjun' } }).id;
    const toit = os.records.create({ object: 'transaction', data: { amount: 3000, kind: 'expense', category: 'food', merchant: 'Toit', date: '2026-11-04' } });
    applySplit(os, toit.id, { payer: 'me', method: 'equal', parts: [{ party: 'me' }, { party: priya }, { party: arjun }] });
    const cab = os.records.create({ object: 'transaction', data: { amount: 400, kind: 'expense', category: 'transport', merchant: 'Uber', date: '2026-11-06' } });
    applySplit(os, cab.id, { payer: 'me', method: 'equal', parts: [{ party: 'me' }, { party: priya }] });
    const other = os.records.create({ object: 'transaction', data: { amount: 900, kind: 'expense', category: 'food', merchant: 'Truffles', date: '2026-11-07' } });
    applySplit(os, other.id, { payer: 'me', method: 'equal', parts: [{ party: 'me' }, { party: arjun }] });
    const s = sharedWith(os, priya, '2026-11-01', '2026-11-30');
    expect(s.total).toBe(3400);
    expect(s.shares).toEqual([{ party: 'me', amount: 1200 }, { party: priya, amount: 1200 }, { party: arjun, amount: 1000 }]);
    expect(sharedWith(os, priya, '2026-10-01', '2026-10-31')).toEqual({ total: 0, shares: [] });
  });
});

describe('your share (MODEL layer 2)', () => {
  const share = (id: string) => os.records.get<{ share?: number }>(id)!.data.share;
  it('a split you paid is your part; one someone else paid is 0 until you pay them back; clearing it gives it all back', () => {
    const priya = os.records.create({ object: 'person', data: { name: 'Priya' } }).id;
    const toit = os.records.create({ object: 'transaction', data: { amount: 2600, kind: 'expense', category: 'food', merchant: 'Toit', date: '2026-11-07' } });
    applySplit(os, toit.id, { payer: 'me', method: 'equal', parts: [{ party: 'me' }, { party: priya }] });
    expect(share(toit.id)).toBe(1300);
    expect(spendInRange(os, '2026-11-01', '2026-11-30')).toBe(1300);
    expect(spendByCategory(os, '2026-11-01', '2026-11-30')).toEqual([{ category: 'food', total: 1300, count: 1 }]);
    applySplit(os, toit.id, { payer: priya, method: 'equal', parts: [{ party: 'me' }, { party: priya }] });
    expect(share(toit.id)).toBe(0);
    clearSplit(os, toit.id);
    expect(share(toit.id)).toBeUndefined();
    expect(spendInRange(os, '2026-11-01', '2026-11-30')).toBe(2600);
  });

  it('Settle up finds their payment and makes it a payback, not income; Undo puts it back', () => {
    const priya = os.records.create({ object: 'person', data: { name: 'Priya' } }).id;
    const toit = os.records.create({ object: 'transaction', data: { amount: 2600, kind: 'expense', category: 'food', merchant: 'Toit', date: new Date().toISOString().slice(0, 10) } });
    applySplit(os, toit.id, { payer: 'me', method: 'equal', parts: [{ party: 'me' }, { party: priya }] });
    const back = os.records.create({ object: 'transaction', data: { amount: 1300, kind: 'income', category: 'other', merchant: 'PRIYA S', date: new Date().toISOString().slice(0, 10) } });
    os.links.link(back.id, priya, 'person');
    const today = new Date().toISOString().slice(0, 10);
    expect(incomeInRange(os, today, today)).toBe(1300);
    const s = settleUp(os, priya);
    expect(s.payback).toBe(back.id);
    expect(share(back.id)).toBe(0);
    expect(incomeInRange(os, today, today)).toBe(0);
    expect(balanceWith(os, priya)).toBe(0);
    undoSettle(os, s);
    expect(share(back.id)).toBeUndefined();
    expect(balanceWith(os, priya)).toBe(1300);
  });

  it('a refund comes off spending in its category and is not income', () => {
    os.records.create({ object: 'transaction', data: { amount: 18899.5, kind: 'expense', category: 'shopping', merchant: 'Adidas', date: '2026-11-03' } });
    os.records.create({ object: 'transaction', data: { amount: 5000, kind: 'expense', category: 'shopping', merchant: 'Nike', date: '2026-11-04' } });
    os.records.create({ object: 'transaction', data: { amount: 18899.5, kind: 'income', category: 'shopping', merchant: 'Adidas', date: '2026-11-06', refund: true } });
    os.records.create({ object: 'transaction', data: { amount: 125000, kind: 'income', category: 'salary', merchant: 'ACME', date: '2026-11-01' } });
    expect(spendInRange(os, '2026-11-01', '2026-11-30')).toBe(5000);
    expect(spendInRange(os, '2026-11-01', '2026-11-30', 'shopping')).toBe(5000);
    expect(incomeInRange(os, '2026-11-01', '2026-11-30')).toBe(125000);
  });
});

describe('splits saved before Your share', () => {
  it('get their share once on start: your part when you paid, 0 when someone else did', () => {
    const priya = os.records.create({ object: 'person', data: { name: 'Priya' } }).id;
    const mine = os.records.create({ object: 'transaction', data: { amount: 2600, kind: 'expense', category: 'food', date: '2026-11-07', split: { payer: 'me', method: 'equal', parts: [], shares: [{ party: 'me', amount: 1300 }, { party: priya, amount: 1300 }] } } });
    const theirs = os.records.create({ object: 'transaction', data: { amount: 900, kind: 'expense', category: 'food', date: '2026-11-08', split: { payer: priya, method: 'equal', parts: [], shares: [{ party: 'me', amount: 450 }, { party: priya, amount: 450 }] } } });
    expect(foldSplitShares(os)).toBe(2);
    expect([os.records.get<{ share?: number }>(mine.id)!.data.share, os.records.get<{ share?: number }>(theirs.id)!.data.share]).toEqual([1300, 0]);
    expect(foldSplitShares(os)).toBe(0);
  });
});
