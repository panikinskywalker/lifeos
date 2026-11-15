import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBetterSqliteAdapter } from '@core/db/betterSqliteAdapter';
import { createLifeOS } from '@core/lifeos';
import { Registry } from '@core/registry/registry';
import type { LifeOSContext } from '@core/registry/context';
import { bus } from '@core/events/bus';
import { crmModule } from '@modules/crm';
import { financeModule } from '@modules/finance';
import { accountBalance } from './lib';
import { proposeChanges, readStatement } from './statementRead';
import type { AccountData, InvestmentData } from './types';

/** Upload a statement (docs/MODEL.md): read once, matched on the phone, nothing changes until you apply, each with Undo. */

let os: LifeOSContext;
beforeEach(async () => {
  bus.clear();
  os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules: [crmModule, financeModule], registry: new Registry() });
});
afterEach(() => os.db.close());

const card = () => os.records.create<AccountData>({ object: 'account', title: 'ICICI Bank card', data: { kind: 'credit', institution: 'ICICI Bank', last4: '8013', currency: 'INR', openingBalance: 0 } as AccountData });
const bank = () => os.records.create<AccountData>({ object: 'account', title: 'SBI', data: { kind: 'bank', institution: 'SBI', last4: '1234', currency: 'INR', openingBalance: 0 } as AccountData });

describe('Upload a statement', () => {
  it('a card statement sets what you owe and its bill; a bank screenshot sets the balance; Undo puts them back', () => {
    const c = card();
    const b = bank();
    const read = readStatement({
      accounts: [
        { bank: 'ICICI', last4: '8013', kind: 'credit', balance: 0, owed: 14768.76, minDue: 740, dueOn: '2026-11-26', asOf: '2026-11-12' },
        { bank: 'SBI', last4: 'XX1234', kind: 'bank', balance: 52180, owed: 0, minDue: 0, dueOn: '', asOf: '2026-11-14' },
      ],
      holdings: [],
    });
    const ps = proposeChanges(os, read, Date.parse('2026-11-16T10:00:00'));
    expect(ps.map((p) => p.label)).toEqual(['ICICI Bank card ••8013: you owe ₹14,768.76', 'SBI ••1234: balance ₹52,180']);
    // Nothing changed yet.
    expect(os.records.get<AccountData>(c.id)!.data.knownBalance).toBeUndefined();
    const undos = ps.map((p) => p.apply());
    expect(accountBalance(os, os.records.get<AccountData>(c.id)!)).toBeCloseTo(-14768.76, 2);
    expect(os.records.get<AccountData>(c.id)!.data.statement).toMatchObject({ total: 14768.76, min: 740, dueOn: '2026-11-26' });
    expect(accountBalance(os, os.records.get<AccountData>(b.id)!)).toBe(52180);
    undos.forEach((u) => u());
    expect(os.records.get<AccountData>(c.id)!.data.knownBalance).toBeUndefined();
    expect(os.records.get<AccountData>(b.id)!.data.knownBalance).toBeUndefined();
  });

  it('a fund summary updates the holding it matches by name and adds the one it does not', () => {
    const pp = os.records.create<InvestmentData>({ object: 'investment', title: 'Parag Parikh Flexi Cap', data: { instrument: 'mutual_fund', invested: 540000, currentValue: 682400 } as InvestmentData });
    const read = readStatement({ accounts: [], holdings: [
      { name: 'Parag Parikh Flexi Cap Fund - Direct Growth', units: 812.3, value: 691200, invested: 545000, sip: 5000, sipDay: 5 },
      { name: 'HDFC Index Nifty 50 Fund', units: 0, value: 124600, invested: 112000, sip: 2000, sipDay: 5 },
    ] });
    const ps = proposeChanges(os, read);
    expect(ps.map((p) => p.label)).toEqual(['Parag Parikh Flexi Cap: worth ₹6,91,200 · ₹5,45,000 in · SIP ₹5,000 on the 5', 'New holding: HDFC Index Nifty 50 Fund']);
    const undos = ps.map((p) => p.apply());
    expect(os.records.get<InvestmentData>(pp.id)!.data).toMatchObject({ currentValue: 691200, invested: 545000, sip: 5000, sipDay: 5, units: 812.3 });
    expect(os.records.query('investment')).toHaveLength(2);
    undos.forEach((u) => u());
    expect(os.records.get<InvestmentData>(pp.id)!.data).toMatchObject({ currentValue: 682400, invested: 540000 });
    expect(os.records.query('investment')).toHaveLength(1);
  });

  it('keeps only what makes sense from a reading', () => {
    expect(readStatement({ accounts: [{ bank: '', last4: '', kind: 'bank', balance: 1, owed: 0, minDue: 0, dueOn: 'soon', asOf: '' }], holdings: [{ name: 'X', units: 0, value: 0, invested: 0, sip: 0, sipDay: 0 }] })).toEqual({ accounts: [], holdings: [] });
  });
});
