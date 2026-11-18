import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBetterSqliteAdapter } from '@core/db/betterSqliteAdapter';
import { createLifeOS } from '@core/lifeos';
import { Registry } from '@core/registry/registry';
import type { LifeOSContext } from '@core/registry/context';
import { bus } from '@core/events/bus';
import { fileMessage } from '@core/filing/messages';
import { crmModule } from '@modules/crm';
import { placesModule } from '@modules/places';
import { financeModule } from '@modules/finance';
import { accountBalance, setBalance } from '../lib';
import type { AccountData, TransactionData } from '../types';

/** Balances follow the bank (docs/MODEL.md, 15 Nov). */

let os: LifeOSContext;
beforeEach(async () => {
  bus.clear();
  os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules: [crmModule, placesModule, financeModule], registry: new Registry() });
});
afterEach(() => os.db.close());

const sms = (from: string, body: string, at: number) => fileMessage(os, { source: 'sms', from, body, receivedAt: at });
const bank = () => os.records.create<AccountData>({ object: 'account', title: 'SBI ••1234', data: { kind: 'bank', institution: 'SBI', last4: '1234', currency: 'INR', openingBalance: 0 } });
const balanceOf = (id: string) => accountBalance(os, os.records.get<AccountData>(id)!);

describe('balances follow the bank', () => {
  it('a text that only states the balance sets it; a phone plan or reward points never do', () => {
    const a = bank();
    sms('VM-SBIBNK-S', 'Dear Customer, Available balance in your A/c XX1234 is Rs 52,000.00 as on 02-Nov-26. -SBI', Date.parse('2026-11-02T09:00:00'));
    expect(balanceOf(a.id)).toBe(52000);
    sms('VM-ViCARE-S', 'Last-Call:00:01:17, Charge:Rs0.00, Main-Bal:Rs0.00, ULPack-Exp:27-Aug-2026.  For Bal/Product info dial*121#', Date.parse('2026-11-02T10:00:00'));
    sms('AD-AXISBK-S', '10000 bonus reward points for card activation have been credited to your Axis Bank EDGE REWARDS A/c. Your point balance is 10000 as on 08-09-26.', Date.parse('2026-11-02T11:00:00'));
    expect(balanceOf(a.id)).toBe(52000);
    expect(os.records.query('account')).toHaveLength(1);
  });

  it('a payment that day after the bank’s figure counts; one before it does not', () => {
    const a = bank();
    const t0 = Date.parse('2026-11-02T09:00:00');
    sms('VM-SBIBNK-S', 'Dear Customer, Your A/c XX1234 is debited by Rs 200.00 on 02-Nov-26 trf to SWIGGY. Avl Bal Rs 5,000.00 -SBI', t0);
    sms('VM-SBIBNK-S', 'Dear Customer, Your A/c XX1234 is debited by Rs 300.00 on 02-Nov-26 trf to ZOMATO. -SBI', t0 + 3_600_000);
    expect(balanceOf(a.id)).toBe(4700);
  });

  it('a fund redemption arrives in the bank account; a buy leaves it', () => {
    const a = bank();
    setBalance(os, a.id, 10_000, Date.parse('2026-11-01T09:00:00'));
    os.records.create<TransactionData>({ object: 'transaction', data: { amount: 3000, kind: 'investment', category: 'investment', date: '2026-11-03', toAccountId: a.id } as TransactionData });
    os.records.create<TransactionData>({ object: 'transaction', data: { amount: 1000, kind: 'investment', category: 'investment', date: '2026-11-04', accountId: a.id } as TransactionData });
    expect(balanceOf(a.id)).toBe(12_000);
  });

  it("a card's statement sets what you owe from its day; spends add and payments come off after it", () => {
    const card = os.records.create<AccountData>({ object: 'account', title: 'ICICI Bank card ••3007', data: { kind: 'credit', institution: 'ICICI Bank', last4: '3007', currency: 'INR', openingBalance: 0 } });
    // Old spends the app heard about, and a missed payment, would say ₹90,000 owed.
    os.records.create({ object: 'transaction', data: { amount: 90_000, kind: 'expense', category: 'shopping', date: '2026-08-02', accountId: card.id } }, 'assistant');
    sms('JX-ICICIT-S', 'ICICI Bank Credit Card XX3007 Statement is sent to ru*****@gmail.com. Total of Rs 14,768.76 or minimum of Rs 13,480.00 is due by 07-SEP-26.', Date.parse('2026-08-27T10:00:00'));
    expect(balanceOf(card.id)).toBe(-14_768.76);
    os.records.create({ object: 'transaction', data: { amount: 699.01, kind: 'expense', category: 'subscriptions', date: '2026-08-29', accountId: card.id } }, 'assistant');
    os.records.create({ object: 'transaction', data: { amount: 14_768.76, kind: 'transfer', category: 'transfer', date: '2026-09-05', toAccountId: card.id } }, 'assistant');
    expect(balanceOf(card.id)).toBeCloseTo(-699.01, 2);
  });

  it('a debit card spend comes off your account at that bank, not a new credit card', () => {
    const a = bank();
    sms('VM-SBIBNK-S', 'Rs 500.00 spent on your SBI Debit Card XX9999 at AMAZON on 02-Nov-26. Avl Bal Rs 4,500.00', Date.parse('2026-11-02T09:00:00'));
    expect(os.records.query('account')).toHaveLength(1);
    expect(os.records.query<TransactionData>('transaction')[0]!.data.accountId).toBe(a.id);
  });
});
