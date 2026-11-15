import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBetterSqliteAdapter } from '../db/betterSqliteAdapter';
import type { DatabaseAdapter } from '../db/adapter';
import { incomeOf, incomeSql, spentOf, spentSql } from './money';

/** Your share (MODEL layer 2): the same answer from code and from SQL. */
const cases = [
  { d: { kind: 'expense', amount: 2600 }, spent: 2600, income: 0 },
  { d: { kind: 'expense', amount: 2600, share: 1300 }, spent: 1300, income: 0 },
  { d: { kind: 'expense', amount: 1500, share: 0 }, spent: 0, income: 0 },
  { d: { kind: 'income', amount: 147, share: 0 }, spent: 0, income: 0 },
  { d: { kind: 'income', amount: 125000 }, spent: 0, income: 125000 },
  { d: { kind: 'income', amount: 18899.5, refund: true }, spent: -18899.5, income: 0 },
  { d: { kind: 'transfer', amount: 50000 }, spent: 0, income: 0 },
  { d: { kind: 'investment', amount: 3000 }, spent: 0, income: 0 },
];

let db: DatabaseAdapter;
beforeEach(() => {
  db = createBetterSqliteAdapter(':memory:');
  db.run(`CREATE TABLE t (id INTEGER PRIMARY KEY, data TEXT)`);
});
afterEach(() => db.close());

describe('your share', () => {
  it.each(cases)('%j', ({ d, spent, income }) => {
    expect(spentOf(d)).toBe(spent);
    expect(incomeOf(d)).toBe(income);
    db.run(`INSERT INTO t(data) VALUES (?)`, [JSON.stringify(d)]);
    const row = db.get<{ s: number; i: number }>(`SELECT ${spentSql()} AS s, ${incomeSql()} AS i FROM t`)!;
    expect([row.s, row.i]).toEqual([spent, income]);
  });
});
