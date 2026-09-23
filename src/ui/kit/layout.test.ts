import { packBento, ringGeometry, stackSegments } from './layout';

describe('packBento', () => {
  it('pairs 1×1 tiles and gives wide tiles a full row', () => {
    const { placements, height } = packBento(['1x1', '1x1', '2x1'], 332, 12);
    expect(placements.map((p) => [p.col, p.row])).toEqual([[0, 0], [1, 0], [0, 1]]);
    expect(placements[0]!.width).toBe(160);
    expect(placements[1]!.x).toBe(172);
    expect(placements[2]!.width).toBe(332);
    expect(placements[2]!.height).toBe(160);
    expect(height).toBe(160 * 2 + 12);
  });

  it('back-fills a hole left before a wide tile', () => {
    const { placements } = packBento(['1x1', '2x2', '1x1'], 332, 12);
    expect(placements.map((p) => [p.col, p.row])).toEqual([[0, 0], [0, 1], [1, 0]]);
    expect(placements[1]!.height).toBe(160 * 2 + 12);
  });

  it('is empty for no tiles', () => {
    expect(packBento([], 320, 12)).toEqual({ placements: [], height: 0 });
  });
});

describe('stackSegments', () => {
  it('splits width proportionally with gaps between segments', () => {
    const segs = stackSegments([1, 1, 2], 106, 3, 0);
    expect(segs.map((s) => s.width)).toEqual([25, 25, 50]);
    expect(segs.map((s) => s.x)).toEqual([0, 28, 56]);
  });

  it('drops zero and negative values', () => {
    expect(stackSegments([0, 5, -2], 100).map((s) => s.index)).toEqual([1]);
  });

  it('keeps tiny segments visible without overflowing', () => {
    const segs = stackSegments([1000, 1], 200, 3, 6);
    expect(segs[1]!.width).toBe(6);
    expect(segs[0]!.width + segs[1]!.width + 3).toBeCloseTo(200);
  });
});

describe('ringGeometry', () => {
  it('clamps progress and computes the dash offset', () => {
    expect(ringGeometry(40, 4, 1.5).offset).toBe(0);
    expect(ringGeometry(40, 4, -1).progress).toBe(0);
    const g = ringGeometry(40, 4, 0.25);
    expect(g.r).toBe(18);
    expect(g.offset).toBeCloseTo(g.circumference * 0.75);
  });
});
