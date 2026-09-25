import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createBetterSqliteAdapter } from '@core/db/betterSqliteAdapter';
import { createLifeOS } from '@core/lifeos';
import { Registry } from '@core/registry/registry';
import type { LifeOSContext } from '@core/registry/context';
import type { ModuleManifest } from '@core/registry/types';
import { bus } from '@core/events/bus';
import { accountType, debtType, transactionType } from './types';
import { applySplit, balanceWith, balances, clearSplit, settleUp, splitAmounts, undoSettle } from './split';

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

const person = { type: 'person', module: 'm', label: 'Person', labelPlural: 'People', icon: 'x', schema: z.object({ name: z.string() }), fields: [], computeTitle: (x: Record<string, unknown>) => String(x.name) };
const group = { type: 'group', module: 'm', label: 'Group', labelPlural: 'Groups', icon: 'x', schema: z.object({ name: z.string() }), fields: [], computeTitle: (x: Record<string, unknown>) => String(x.name) };
const mod: ModuleManifest = { id: 'finance', name: 'F', version: '1', description: '', icon: 'x', color: '#000', entityTypes: [accountType, transactionType, debtType, person, group] };
let os: LifeOSContext;
beforeEach(async () => {
  bus.clear();
  os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules: [mod], registry: new Registry() });
});
afterEach(() => os.db.close());

describe('splits, balances, settle up', () => {
  it('I paid: each person owes me their share; re-split replaces; clear removes', () => {
    const priya = os.entities.create({ type: 'person', data: { name: 'Priya' } }).id;
    const arjun = os.entities.create({ type: 'person', data: { name: 'Arjun' } }).id;
    const tx = os.entities.create({ type: 'transaction', data: { amount: 3000, kind: 'expense', category: 'food', merchant: 'Toit', date: '2026-09-20' } });
    applySplit(os, tx.id, { payer: 'me', method: 'equal', parts: [{ party: 'me' }, { party: priya }, { party: arjun }] });
    expect(balanceWith(os, priya)).toBe(1000);
    expect(balances(os).map((b) => b.amount)).toEqual([1000, 1000]);
    expect(os.entities.get<{ personIds: string[]; split: { shares: unknown[] } }>(tx.id)!.data).toMatchObject({ personIds: [priya, arjun], split: { method: 'equal' } });

    applySplit(os, tx.id, { payer: 'me', method: 'equal', parts: [{ party: 'me' }, { party: priya }] });
    expect(balanceWith(os, priya)).toBe(1500);
    expect(balanceWith(os, arjun)).toBe(0);
    clearSplit(os, tx.id);
    expect(balances(os)).toEqual([]);
  });

  it('someone else paid: I owe them my share; settling clears the balance; undo restores it', () => {
    const priya = os.entities.create({ type: 'person', data: { name: 'Priya' } }).id;
    const goa = os.entities.create({ type: 'group', data: { name: 'Goa' } }).id;
    const cab = os.entities.create({ type: 'transaction', data: { amount: 1200, kind: 'expense', category: 'travel', merchant: 'Cab', date: '2026-09-20' } });
    applySplit(os, cab.id, { payer: priya, method: 'equal', parts: [{ party: 'me' }, { party: priya }], groupId: goa });
    const dinner = os.entities.create({ type: 'transaction', data: { amount: 2000, kind: 'expense', category: 'food', merchant: 'Dinner', date: '2026-09-21' } });
    applySplit(os, dinner.id, { payer: 'me', method: 'equal', parts: [{ party: 'me' }, { party: priya }] });
    expect(balanceWith(os, priya)).toBe(400); // 1000 − 600
    expect(balanceWith(os, priya, goa)).toBe(-600);

    const s = settleUp(os, priya);
    expect(balanceWith(os, priya)).toBe(0);
    expect(os.entities.get<{ direction: string; amount: number }>(s.paymentId!)!.data).toMatchObject({ direction: 'i_owe', amount: 400 });
    undoSettle(os, s);
    expect(balanceWith(os, priya)).toBe(400);
  });
});
