import { parseNumberInput } from './parse';

describe('parseNumberInput', () => {
  it.each([
    ['6,400', 6400],
    ['₹ 719.50', 719.5],
    ['-12', -12],
    ['1.2.3', 1.23],
    ['4-5', 45],
    ['', undefined],
    ['-', undefined],
    ['.', undefined],
    ['abc', undefined],
  ])('%s → %s', (input, expected) => {
    expect(parseNumberInput(input)).toBe(expected);
  });
});
