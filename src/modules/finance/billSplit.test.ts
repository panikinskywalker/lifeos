import { describe, expect, it } from 'vitest';
import { splitBill } from './billSplit';

/** Split a bill by item: who had what, in portions; tax and service in proportion; to the paisa. */

const lines = [
  { name: 'Truffle fries', qty: 1, total: 320 },
  { name: 'Chicken burger', qty: 1, total: 420 },
  { name: 'Paneer tikka pizza', qty: 1, total: 560 },
  { name: 'Pitcher of cold coffee', qty: 1, total: 600 },
  { name: 'Brownie sundae', qty: 2, total: 560 },
  { name: 'Fresh lime soda', qty: 2, total: 480 },
];

describe('splitting a bill by item', () => {
  it('the Truffles bill: you off the pizza, two glasses of the pitcher, the soda shared, tax and service in proportion', () => {
    const shares = splitBill(
      lines,
      [undefined, { me: 1 }, { arjun: 1, priya: 1, kalpak: 1 }, { me: 2, arjun: 1, priya: 1 }, { priya: 1, kalpak: 1 }, undefined],
      ['me', 'arjun', 'priya', 'kalpak'],
      3240,
    );
    expect(shares).toEqual([
      { party: 'me', amount: 1013.88 },
      { party: 'arjun', amount: 591.43 },
      { party: 'priya', amount: 900 },
      { party: 'kalpak', amount: 734.69 },
    ]);
    expect(shares.reduce((n, s) => n + s.amount * 100, 0)).toBe(324000);
  });

  it('with nothing picked, everyone shares the whole bill equally', () => {
    expect(splitBill(lines, [], ['me', 'a', 'b'], 100)).toEqual([
      { party: 'me', amount: 33.34 },
      { party: 'a', amount: 33.33 },
      { party: 'b', amount: 33.33 },
    ]);
  });
});
