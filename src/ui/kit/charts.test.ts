import { describe, expect, it } from 'vitest';
import { niceGrid, niceMax } from './chartScale';

describe('chart scale', () => {
  it('friendly steps that always cover the data', () => {
    expect(niceMax(48)).toBe(50);
    expect(niceGrid(48000)).toEqual([0, 20000, 40000, 60000]);
    const g = niceGrid(5.6, 4.1);
    expect(g[0]).toBeLessThanOrEqual(4.1);
    expect(g[3]).toBeGreaterThanOrEqual(5.6);
  });
});
