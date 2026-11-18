import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBetterSqliteAdapter } from '@core/db/betterSqliteAdapter';
import { createLifeOS } from '@core/lifeos';
import { Registry } from '@core/registry/registry';
import type { LifeOSContext } from '@core/registry/context';
import { bus } from '@core/events/bus';
import { crmModule } from '@modules/crm';
import { financeModule, makeBill } from '@modules/finance';
import { balanceWith } from './split';
import { linkPerson, setSwConfig, swConfig } from './splitwise';
import type { DebtData } from './split';
import { isUpiId, plainReminder, settleFromPayment, upiLink, upiOf } from './settleUpi';

/** Settling from the bank text, and paying by UPI (docs/MODEL.md, Splitwise and settling up). */

let os: LifeOSContext;
beforeEach(async () => {
  bus.clear();
  os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules: [crmModule, financeModule], registry: new Registry() });
});
afterEach(() => os.db.close());

const debt = (personId: string, amount: number, date: string, direction: DebtData['direction'] = 'they_owe') =>
  os.records.create<DebtData>({ object: 'debt', status: 'open', data: { personId, direction, amount, reason: 'Turf', date, kind: 'split' } });
const fromThem = (personId: string, amount: number, kind: 'income' | 'expense' = 'income') => {
  const tx = os.records.create({ object: 'transaction', title: 'Kalpak', data: { amount, kind, category: 'other', date: '2026-11-16' } });
  os.links.link(tx.id, personId, 'person', {}, 'system');
  return tx;
};

describe('settling from the bank text', () => {
  it('money in for the whole balance settles everything with them on its own; it is a payback, not income', () => {
    const k = os.records.create({ object: 'person', title: 'Kalpak', data: {} });
    const a = debt(k.id, 200, '2026-11-14');
    const b = debt(k.id, 125, '2026-11-03');
    // Tying the payment to him is enough: it settles on its own.
    const tx = fromThem(k.id, 325);
    expect(os.records.get(a.id)!.status).toBe('settled');
    expect(os.records.get(b.id)!.status).toBe('settled');
    expect((os.records.get(tx.id)!.data as { share?: number }).share).toBe(0);
    // Done once.
    expect(settleFromPayment(os, tx.id)).toBeNull();
  });

  it('less than the balance settles their oldest shares up to it', () => {
    const k = os.records.create({ object: 'person', title: 'Kalpak', data: {} });
    const old = debt(k.id, 125, '2026-11-03');
    const newer = debt(k.id, 200, '2026-11-14');
    settleFromPayment(os, fromThem(k.id, 150).id);
    expect(os.records.get(old.id)!.status).toBe('settled');
    expect(os.records.get(newer.id)!.status).toBe('open');
  });

  it('a payment that is not for a balance changes nothing', () => {
    const k = os.records.create({ object: 'person', title: 'Kalpak', data: {} });
    const d = debt(k.id, 200, '2026-11-14');
    // You paying them is not them paying you back.
    expect(settleFromPayment(os, fromThem(k.id, 200, 'expense').id)).toBeNull();
    expect(os.records.get(d.id)!.status).toBe('open');
  });

  it('you paying what you owe settles it', () => {
    const y = os.records.create({ object: 'person', title: 'Yash', data: {} });
    const d = debt(y.id, 450, '2026-11-14', 'i_owe');
    settleFromPayment(os, fromThem(y.id, 450, 'expense').id);
    expect(os.records.get(d.id)!.status).toBe('settled');
  });
});

describe('paying by UPI', () => {
  it('reads a UPI ID from the person and builds the link the UPI app opens', () => {
    const y = os.records.create({ object: 'person', title: 'Yash', data: { upi: 'not-one, yash@ybl' } });
    expect(upiOf(os, y.id)).toBe('yash@ybl');
    expect(isUpiId('name@okhdfc')).toBe(true);
    expect(isUpiId('name.okhdfc')).toBe(false);
    expect(upiLink({ upi: 'yash@ybl', name: 'Yash', amount: 450, note: 'Turf · Sat 14 Nov' })).toBe('upi://pay?pa=yash%40ybl&pn=Yash&am=450.00&cu=INR&tn=Turf%20%C2%B7%20Sat%2014%20Nov');
    expect(plainReminder('Kalpak', '₹1,600', 'turf')).toContain('₹1,600 for turf');
  });
});

describe('settling from the bank text, Bills and Splitwise', () => {
  it('money in from someone who owes you on a Bill is a payback Bill, so the balance is clear', () => {
    const k = os.records.create({ object: 'person', title: 'Kalpak', data: {} });
    makeBill(os, 'Turf snacks', { amount: 1000, date: '2026-11-14', split: { payers: { me: 1000 }, method: 'equal', shares: { me: 1, [k.id]: 1 } } });
    const tx = fromThem(k.id, 500);
    expect(balanceWith(os, k.id)).toBe(0);
    expect((os.records.get(tx.id)!.data as { share?: number }).share).toBe(0);
  });

  it('money in from a linked person who owes only on Splitwise is noted here and queued for Splitwise', () => {
    const k = os.records.create({ object: 'person', title: 'Kalpak', data: {} });
    linkPerson(os, k.id, { id: 7, name: 'Kalpak' }, 0);
    setSwConfig(os, { balances: { [k.id]: 300 } });
    const tx = fromThem(k.id, 300);
    expect(swConfig(os).toSend).toMatchObject([{ personId: k.id, amount: 300 }]);
    expect(swConfig(os).balances[k.id]).toBe(0);
    expect((os.records.get(tx.id)!.data as { share?: number }).share).toBe(0);
    // Done once; and someone not on Splitwise with nothing owed changes nothing.
    expect(settleFromPayment(os, tx.id)).toBeNull();
    const p = os.records.create({ object: 'person', title: 'Priya', data: {} });
    expect(settleFromPayment(os, fromThem(p.id, 300).id)).toBeNull();
  });
});
