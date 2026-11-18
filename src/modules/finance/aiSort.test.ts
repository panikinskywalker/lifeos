import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBetterSqliteAdapter } from '@core/db/betterSqliteAdapter';
import { createLifeOS } from '@core/lifeos';
import { Registry } from '@core/registry/registry';
import type { LifeOSContext } from '@core/registry/context';
import type { LLMProvider } from '@core/ai/provider';
import { bus } from '@core/events/bus';
import { crmModule } from '@modules/crm';
import { financeModule } from '@modules/finance';
import { learnedCategory } from './filing/rules';
import { otherShops, sortWithAI, undoSort } from './aiSort';
import type { TransactionData } from './types';

/** AI sorts what is left in Other (docs/MODEL.md, Better categories). */

let os: LifeOSContext;
beforeEach(async () => {
  bus.clear();
  os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules: [crmModule, financeModule], registry: new Registry() });
});
afterEach(() => os.db.close());

const spend = (title: string, amount: number) => os.records.create<TransactionData>({ object: 'transaction', title, data: { amount, kind: 'expense', category: 'other', date: '2026-11-02', merchant: title } as TransactionData }, 'assistant');

describe('AI sorts the payments in Other', () => {
  it('sends shop names with rounded amounts (never people), teaches what it is sure of, and Undo puts it back', async () => {
    spend('BLINKIT', 487);
    spend('BLINKIT', 312);
    spend('MYSTERY CO', 999);
    os.records.create({ object: 'person', title: 'Priya Sharma', data: {} });
    spend('Priya Sharma', 2600);
    let sent = '';
    const model: LLMProvider = {
      id: 'fake',
      complete: async ({ messages }) => {
        sent = String(messages[0]!.content);
        return { content: [{ type: 'text', text: 'Here you go: {"BLINKIT": "groceries", "MYSTERY CO": "not-a-category", "Priya Sharma": "food"}' }], stopReason: 'end_turn' };
      },
    };
    expect(otherShops(os).map((s) => s.name)).toEqual(['BLINKIT', 'MYSTERY CO']);
    const done = (await sortWithAI(os, model))!;
    expect(sent).toContain('BLINKIT (about ₹400, 2 payments)');
    expect(sent).not.toContain('Priya');
    expect(done.shops).toEqual([{ name: 'BLINKIT', category: 'groceries' }]);
    expect(os.records.query<TransactionData>('transaction').filter((t) => t.title === 'BLINKIT').map((t) => t.data.category)).toEqual(['groceries', 'groceries']);
    expect(learnedCategory(os, 'BLINKIT')).toBe('groceries');
    undoSort(os, done);
    expect(os.records.query<TransactionData>('transaction').filter((t) => t.title === 'BLINKIT').map((t) => t.data.category)).toEqual(['other', 'other']);
    expect(learnedCategory(os, 'BLINKIT')).toBeNull();
  });
});
