import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBetterSqliteAdapter } from '@core/db/betterSqliteAdapter';
import { createLifeOS } from '@core/lifeos';
import { Registry } from '@core/registry/registry';
import type { LifeOSContext } from '@core/registry/context';
import { bus } from '@core/events/bus';
import { crmModule } from '@modules/crm';
import { financeModule } from '@modules/finance';
import { readBill, readSaid, saveQuick } from './quickAdd';
import type { AccountData, TransactionData } from './types';

/** Add a payment (docs/MODEL.md): from what you say, or a bill Claude read; paid in cash lands in Cash. */

let os: LifeOSContext;
beforeEach(async () => {
  bus.clear();
  os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules: [crmModule, financeModule], registry: new Registry() });
});
afterEach(() => os.db.close());

const today = new Date('2026-11-15T12:00:00');

describe('Add a payment', () => {
  it('reads what you say: amount, who, paid in cash, who shares it', () => {
    const p = readSaid(os, "₹640 at Shree Sagar, paid in cash, half is Arjun's", today)!;
    expect(p).toMatchObject({ amount: 640, payee: 'Shree Sagar', paidWith: 'cash', splitWith: ['Arjun'], date: '2026-11-15' });
    expect(readSaid(os, 'auto 120 cash', today)).toMatchObject({ amount: 120, paidWith: 'cash' });
    expect(readSaid(os, 'paid 1,250 to Zepto by upi', today)).toMatchObject({ amount: 1250, payee: 'Zepto', paidWith: 'upi' });
    expect(readSaid(os, 'lunch with friends', today)).toBeNull();
    expect(readSaid(os, '1200 dinner with Arjun and Priya, Arjun paid', today)).toMatchObject({ amount: 1200, splitWith: ['Arjun', 'Priya'], payer: 'Arjun', paidWith: 'someone' });
  });

  it('keeps a bill reading to what makes sense: a total, a past date, a known category', () => {
    expect(readBill(os, { payee: 'Shree Sagar', amount: 640, date: '2026-11-14', items: ['2 masala dosa'], tax: 30, category: 'food' }, today)).toMatchObject({ amount: 640, date: '2026-11-14', category: 'food', items: ['2 masala dosa'], tax: 30 });
    expect(readBill(os, { payee: 'X', amount: 99, date: '2027-01-01', items: [], tax: 0, category: 'made-up' }, today)).toMatchObject({ date: '2026-11-15', tax: null });
    expect(readBill(os, { payee: 'A cat', amount: 0, date: '', items: [], tax: 0, category: 'food' }, today)).toBeNull();
  });

  it('a bill says how it was paid: cash, or a card by its last digits', () => {
    expect(readBill(os, { payee: 'Test Cafe', amount: 241.5, date: '2026-11-15', items: [], tax: 11.5, category: 'food', paidWith: 'cash', cardLast4: '' }, today)).toMatchObject({ paidWith: 'cash' });
    const card = readBill(os, { payee: 'Croma', amount: 4999, date: '2026-11-15', items: [], tax: 0, category: 'shopping', paidWith: 'card', cardLast4: 'XXXX8013' }, today)!;
    expect(card).toMatchObject({ paidWith: 'card', last4: '8013' });
    expect(readBill(os, { payee: 'Kiosk', amount: 50, date: '', items: [], tax: 0, category: 'food', paidWith: 'unknown', cardLast4: '' }, today)).toMatchObject({ paidWith: null });
  });

  it('paid in cash comes off your Cash account, made once; Undo takes the payment away', () => {
    const p = readSaid(os, '₹640 at Shree Sagar, paid in cash', today)!;
    const a = saveQuick(os, p, 'cash');
    const b = saveQuick(os, { ...p, amount: 80 }, 'cash');
    const cash = os.records.query<AccountData>('account');
    expect(cash).toHaveLength(1);
    expect(cash[0]!.data.kind).toBe('cash');
    const txs = os.records.query<TransactionData>('transaction');
    expect(txs.every((t) => t.data.accountId === cash[0]!.id)).toBe(true);
    a.undo();
    b.undo();
    expect(os.records.query('transaction')).toHaveLength(0);
  });
});
