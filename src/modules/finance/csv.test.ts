import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBetterSqliteAdapter } from '@core/db/betterSqliteAdapter';
import { createLifeOS } from '@core/lifeos';
import { Registry } from '@core/registry/registry';
import type { LifeOSContext } from '@core/registry/context';
import { bus } from '@core/events/bus';
import { financeModule } from '@modules/finance';
import { guessMapping, importStatement, parseCsv, paymentsCsv, readAmount, readDate, readStatement, undoImport } from './csv';
import type { TransactionData } from './types';

/** Import and export (docs/MODEL.md, 15 Nov). */

let os: LifeOSContext;
beforeEach(async () => {
  bus.clear();
  os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules: [financeModule], registry: new Registry() });
});
afterEach(() => os.db.close());

// Shaped like HDFC's statement download: a few lines first, money out and in in their own columns.
const HDFC = `HDFC BANK Ltd.,,,,,,
Statement of account,,,,,,
Date,Narration,Chq./Ref.No.,Value Dt,Withdrawal Amt.,Deposit Amt.,Closing Balance
02/11/26,UPI-SWIGGY-SWIGGY@ICICI-ICIC0000001-612345678901,0000612345678901,02/11/26,450.00,,52000.00
03/11/26,"NEFT CR-ACME SOFTWARE PVT LTD-SALARY, OCT",N307260000001,03/11/26,,"1,96,958.00",248958.00
04/11/26,UPI-BLINKIT-BLINKIT@YBL-612345678902,0000612345678902,04/11/26,812.50,,248145.50
,,,,,,
`;

describe('import and export', () => {
  it('reads dates and amounts the way Indian banks write them', () => {
    expect(['02/11/26', '02-11-2026', '2026-11-02', '02 Nov 2026', '02-Nov-26'].map(readDate)).toEqual(Array(5).fill('2026-11-02'));
    expect(['1,234.50', '(1,234.50)', '-1234.5', '1,234.50 Dr', ''].map(readAmount)).toEqual([1234.5, -1234.5, -1234.5, -1234.5, null]);
  });

  it('a bank CSV: header found under the bank’s lines, columns guessed, previewed, imported once, Undo takes it back', () => {
    const rows = parseCsv(HDFC);
    const m = guessMapping(rows)!;
    expect(m).toMatchObject({ header: 2, date: 0, description: 1, out: 4, in: 5 });
    const s = readStatement(rows, m);
    expect(s.rows.map((r) => [r.date, r.kind, r.amount])).toEqual([['2026-11-02', 'expense', 450], ['2026-11-03', 'income', 196958], ['2026-11-04', 'expense', 812.5]]);
    const acc = os.records.create({ object: 'account', title: 'HDFC ••4421', data: { kind: 'bank', openingBalance: 0 } });
    const first = importStatement(os, acc.id, s.rows);
    expect(first.created).toHaveLength(3);
    expect(importStatement(os, acc.id, s.rows)).toEqual({ created: [], already: 3 });
    const txs = os.records.query<TransactionData>('transaction');
    expect(txs.find((t) => t.data.amount === 196958)!.data.category).toBe('salary');
    undoImport(os, first.created);
    expect(os.records.query('transaction')).toHaveLength(0);
  });

  it('exports a date range with money out negative', () => {
    os.records.create({ object: 'transaction', title: 'Swiggy', data: { amount: 450, kind: 'expense', category: 'food', date: '2026-11-02', note: 'lunch, with Priya' } }, 'assistant');
    os.records.create({ object: 'transaction', title: 'ACME', data: { amount: 1000, kind: 'income', category: 'salary', date: '2026-11-03' } }, 'assistant');
    const { csv, count } = paymentsCsv(os, '2026-11-01', '2026-11-30');
    expect(count).toBe(2);
    expect(csv.split('\n')).toEqual(['Date,Payee,Category,Kind,Amount,Account,Note', '2026-11-02,Swiggy,Food & Drink,Spent,-450.00,,"lunch, with Priya"', '2026-11-03,ACME,Salary,Received,1000.00,,']);
  });
});
