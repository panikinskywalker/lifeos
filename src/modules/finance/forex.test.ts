import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBetterSqliteAdapter } from '@core/db/betterSqliteAdapter';
import { createLifeOS } from '@core/lifeos';
import { Registry } from '@core/registry/registry';
import type { LifeOSContext } from '@core/registry/context';
import { bus } from '@core/events/bus';
import { crmModule } from '@modules/crm';
import { financeModule } from '@modules/finance';
import { setFxRatesFromInrBase } from './filing/fx';
import { accountBalance, pocketBalances, setPockets } from './lib';
import type { AccountData, TransactionData } from './types';

/** A forex card holds several currencies (docs/MODEL.md, Account types): each set by you, spends in it come off, worth rupees at today's rate. */

let os: LifeOSContext;
beforeEach(async () => {
  bus.clear();
  os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules: [crmModule, financeModule], registry: new Registry() });
});
afterEach(() => os.db.close());

describe('a forex card in several currencies', () => {
  it('holds what you set in each currency, less spends in it since, and counts at today’s rates', () => {
    setFxRatesFromInrBase(os, '2026-11-17', { USD: 1 / 84, KWD: 1 / 273, JPY: 1 / 0.55 });
    const card = os.records.create<AccountData>({ object: 'account', title: 'ICICI Forex card', data: { kind: 'forex', currency: 'INR', openingBalance: 0 } as AccountData });
    const set = Date.parse('2026-11-17T10:00:00');
    setPockets(os, card.id, [{ currency: 'USD', amount: 400 }, { currency: 'KWD', amount: 30 }, { currency: 'JPY', amount: 0 }], set);
    os.records.create<TransactionData>({ object: 'transaction', title: 'Starbucks', data: { amount: 1260, kind: 'expense', category: 'food', date: '2026-11-18', accountId: card.id, originalAmount: 15, originalCurrency: 'USD', fxRate: 84 } as TransactionData }, 'assistant');
    os.records.create<TransactionData>({ object: 'transaction', title: 'Before it was set', data: { amount: 840, kind: 'expense', category: 'food', date: '2026-11-16', accountId: card.id, originalAmount: 10, originalCurrency: 'USD', fxRate: 84 } as TransactionData }, 'assistant');
    const a = os.records.get<AccountData>(card.id)!;
    expect(pocketBalances(os, a)).toEqual([
      { currency: 'USD', amount: 385, inr: 32340 },
      { currency: 'KWD', amount: 30, inr: 8190 },
    ]);
    expect(accountBalance(os, a)).toBe(40530);
  });
});
