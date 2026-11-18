import { dialTicks, donutDashes, dotColumns, halfTicks, hourLevels, mixColor, packBento, ringGeometry, ringSegments, stackSegments } from './layout';

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

describe('ringSegments (the kit ring with badges)', () => {
  it('goes clockwise from the top, in order, a gap between parts, lengths by share', () => {
    const { segments } = ringSegments([38, 24, 18, 12, 5, 3]);
    expect(segments).toHaveLength(6);
    for (let i = 1; i < segments.length; i++) expect(segments[i]!.start).toBeGreaterThan(segments[i - 1]!.end);
    expect(segments[0]!.start).toBeGreaterThan(0);
    expect(segments[5]!.end).toBeLessThan(360);
    const len = (i: number) => segments[i]!.end - segments[i]!.start;
    expect(len(0)).toBeGreaterThan(len(1));
    expect(len(1)).toBeGreaterThan(len(2));
  });

  it('a tiny part keeps a sliver for its icon; nothing at all draws nothing', () => {
    const { segments } = ringSegments([97, 1]);
    expect(segments[1]!.end - segments[1]!.start).toBeGreaterThanOrEqual(0.5);
    expect(ringSegments([0, 0]).segments).toEqual([]);
    expect(ringSegments([5, 0, 5]).segments.map((s) => s.index)).toEqual([0, 2]);
  });

  it("mixes the kit's disc and ink colours", () => {
    expect(mixColor('#E8DD7A', '#000000', 0.38)).toBe('#58542E');
    expect(mixColor('#E8DD7A', '#1A1A1E', 0.28)).toBe('#545138');
  });
});

describe('the rest of the kit charts', () => {
  it('dial: 48 ticks from bottom left over 270°, lit by score', () => {
    const t = dialTicks(0.78);
    expect(t).toHaveLength(48);
    expect(t.filter((x) => x.lit)).toHaveLength(37);
    expect([t[0]!.x1, t[0]!.y1, t[0]!.x2, t[0]!.y2]).toEqual([26.8, 93.2, 19, 101]);
  });
  it('arc ticks: 46 over the top half, lit by share', () => {
    const t = halfTicks(0.78);
    expect(t).toHaveLength(46);
    expect(t.filter((x) => x.lit)).toHaveLength(36);
    expect([t[0]!.x1, t[0]!.y1]).toEqual([30, 120]);
  });
  it("donut dashes: end to end round the circle like the kit's, a gap apart, the first just before the top", () => {
    const d = donutDashes([50, 30, 20]);
    expect(d[0]!.offset).toBe(2.5);
    expect(Math.round(d[1]!.offset * 10) / 10).toBe(-Math.round((-2.5 + d[0]!.length + 5) * 10) / 10);
    const total = d.reduce((a, x) => a + x.length, 0) + 3 * 5;
    expect(Math.round(total * 10) / 10).toBe(Math.round(d[0]!.circ * 10) / 10);
    expect(d[0]!.length / d[2]!.length).toBeCloseTo(2.5, 5);
  });
  it('hour levels: nothing is quiet, the busiest is the tallest', () => {
    const v = Array(24).fill(0);
    v[7] = 100; v[12] = 900; v[13] = 400;
    expect([hourLevels(v)[0], hourLevels(v)[7], hourLevels(v)[12], hourLevels(v)[13]]).toEqual([0, 1, 3, 2]);
    expect(hourLevels([]).every((l) => l === 0)).toBe(true);
  });
  it('dot-matrix face: digits 5 wide, a colon 2, unknown is a space', () => {
    expect(dotColumns('78')).toHaveLength(10);
    expect(dotColumns('9:56')).toHaveLength(17);
    expect(dotColumns('1').map((c) => c.filter(Boolean).length)).toEqual([0, 2, 7, 0, 0].map((n, i) => (i === 1 ? 2 : i === 2 ? 7 : i === 3 ? 1 : n)));
    expect(dotColumns('₹')).toHaveLength(3);
  });
});
