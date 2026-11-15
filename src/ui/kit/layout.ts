/**
 * Pure layout math for kit components — no React Native, unit-tested.
 */

export type TileSize = '1x1' | '2x1' | '2x2';
export const TILE_SPAN: Record<TileSize, { cols: 1 | 2; rows: 1 | 2 }> = {
  '1x1': { cols: 1, rows: 1 },
  '2x1': { cols: 2, rows: 1 },
  '2x2': { cols: 2, rows: 2 },
};

export interface BentoPlacement {
  x: number;
  y: number;
  width: number;
  height: number;
  col: number;
  row: number;
}

/**
 * Dense two-column bento packing. Each tile goes in the first slot (top to
 * bottom, left to right) where it fits, so a later 1×1 back-fills the hole a
 * lone 1×1 leaves before a wide tile. Cells are square: a 1×1 is `cell` wide
 * and tall, where cell = (width − gap) / 2.
 */
export function packBento(sizes: TileSize[], width: number, gap: number): { placements: BentoPlacement[]; height: number } {
  const cell = Math.max(0, (width - gap) / 2);
  const grid: boolean[][] = [];
  const free = (r: number, c: number) => !grid[r]?.[c];
  const take = (r: number, c: number) => {
    (grid[r] ??= [false, false])[c] = true;
  };
  const placements = sizes.map((size) => {
    const { cols, rows } = TILE_SPAN[size];
    for (let r = 0; ; r++) {
      for (let c = 0; c + cols <= 2; c++) {
        let fits = true;
        for (let dr = 0; dr < rows && fits; dr++) for (let dc = 0; dc < cols && fits; dc++) fits = free(r + dr, c + dc);
        if (!fits) continue;
        for (let dr = 0; dr < rows; dr++) for (let dc = 0; dc < cols; dc++) take(r + dr, c + dc);
        return {
          col: c,
          row: r,
          x: c * (cell + gap),
          y: r * (cell + gap),
          width: cols * cell + (cols - 1) * gap,
          height: rows * cell + (rows - 1) * gap,
        };
      }
    }
  });
  const rowsUsed = grid.length;
  return { placements, height: rowsUsed ? rowsUsed * cell + (rowsUsed - 1) * gap : 0 };
}

/**
 * Segment widths for a StackedBar: proportional to value, `gap` px between
 * visible segments, zero/negative values dropped, and every visible segment
 * at least `min` px wide (taken from the largest segments).
 */
export function stackSegments(values: number[], width: number, gap = 3, min = 6): Array<{ index: number; x: number; width: number }> {
  const visible = values.map((v, index) => ({ index, v: Math.max(0, v) })).filter((s) => s.v > 0);
  if (!visible.length || width <= 0) return [];
  const avail = Math.max(0, width - gap * (visible.length - 1));
  const total = visible.reduce((s, x) => s + x.v, 0);
  const widths = visible.map((s) => (s.v / total) * avail);
  // Lift tiny segments to `min`, paying for it from the widest ones.
  let debt = 0;
  widths.forEach((w, i) => {
    if (w < min) {
      debt += min - w;
      widths[i] = min;
    }
  });
  while (debt > 0.01) {
    const i = widths.indexOf(Math.max(...widths));
    if (widths[i]! - min <= 0.01) break;
    const pay = Math.min(debt, widths[i]! - min);
    widths[i]! -= pay;
    debt -= pay;
  }
  let x = 0;
  return visible.map((s, i) => {
    const seg = { index: s.index, x, width: widths[i]! };
    x += widths[i]! + gap;
    return seg;
  });
}

/** Ring geometry: radius, circumference and dash offset for progress 0..1 (clamped). */
export function ringGeometry(size: number, stroke: number, progress: number) {
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const p = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
  return { r, circumference, offset: circumference * (1 - p), progress: p };
}

/**
 * The kit's "Ring with badges" (NR-KitCharts, ref 8): one round-capped arc per
 * part, in order clockwise from the top, a small gap between them. A part's
 * visible length (caps included) is its share of the circle; a tiny part keeps
 * at least its two caps and a sliver, so its icon still has a home. Each part
 * reports its path and where its icon sits (the start of the arc).
 */
export function ringSegments(values: number[], opts: { size?: number; stroke?: number; gapDeg?: number } = {}) {
  const size = opts.size ?? 256;
  const stroke = opts.stroke ?? 36;
  const gap = opts.gapDeg ?? 7;
  const c = size / 2;
  const r = (size - stroke) / 2 - 4;
  const cap = ((stroke / 2 / r) * 180) / Math.PI; // one rounded end, in degrees
  const live = values.map((v) => (Number.isFinite(v) && v > 0 ? v : 0));
  const n = live.filter((v) => v > 0).length;
  const sum = live.reduce((a, b) => a + b, 0);
  const at = (deg: number) => {
    const a = (deg * Math.PI) / 180;
    return { x: Math.round((c + r * Math.sin(a)) * 10) / 10, y: Math.round((c - r * Math.cos(a)) * 10) / 10 };
  };
  if (!n || !sum) return { size, stroke, r, segments: [] as Array<{ index: number; d: string; start: number; end: number; icon: { x: number; y: number } }> };
  const room = 360 - (n > 1 ? n * gap : gap);
  const least = 2 * cap + 1;
  const raw = live.map((v) => (v / sum) * room);
  const small = raw.map((x, i) => live[i]! > 0 && x < least);
  const fixed = small.reduce((a, s) => a + (s ? least : 0), 0);
  const rest = raw.reduce((a, x, i) => a + (small[i] || !live[i] ? 0 : x), 0);
  const k = rest ? Math.max(0, room - fixed) / rest : 0;
  let cursor = 0;
  const segments: Array<{ index: number; d: string; start: number; end: number; icon: { x: number; y: number } }> = [];
  live.forEach((v, index) => {
    if (!v) return;
    const visible = small[index] ? least : raw[index]! * k;
    const start = cursor + cap;
    const end = Math.max(start + 0.5, cursor + visible - cap);
    const p0 = at(start);
    const p1 = at(end);
    segments.push({ index, start, end, d: `M${p0.x} ${p0.y} A${r} ${r} 0 ${end - start > 180 ? 1 : 0} 1 ${p1.x} ${p1.y}`, icon: p0 });
    cursor += visible + gap;
  });
  return { size, stroke, r, segments };
}

/** A colour mixed toward another (`t` of the first): the kit's disc behind an icon, the icon's ink on the ring. */
export function mixColor(a: string, b: string, t: number): string {
  const p = (h: string) => {
    const s = h.replace('#', '');
    const f = s.length === 3 ? s.split('').map((x) => x + x).join('') : s.slice(0, 6);
    return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16));
  };
  const [x, y] = [p(a), p(b)];
  return `#${x.map((v, i) => Math.round(v * t + y[i]! * (1 - t)).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

/* ------------------------------------------------------------------ */
/* The rest of NR-KitCharts (14 Nov): pure geometry, drawn by KitCharts.tsx. */
/* ------------------------------------------------------------------ */

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0);
const polar = (cx: number, cy: number, r: number, deg: number) => {
  const a = (deg * Math.PI) / 180;
  return { x: Math.round((cx + r * Math.sin(a)) * 10) / 10, y: Math.round((cy - r * Math.cos(a)) * 10) / 10 };
};

/** Ticks round an arc, the first `lit` of them lit: the dial (48 over 270° from bottom left) and the arc (46 over the top half). */
export function arcTicks(share: number, opts: { count: number; from: number; sweep: number; cx: number; cy: number; inner: number; outer: number }) {
  const lit = Math.round(clamp01(share) * opts.count);
  return Array.from({ length: opts.count }, (_, i) => {
    const deg = opts.from + (opts.sweep * i) / (opts.count - 1);
    const a = polar(opts.cx, opts.cy, opts.inner, deg);
    const b = polar(opts.cx, opts.cy, opts.outer, deg);
    return { x1: a.x, y1: a.y, x2: b.x, y2: b.y, lit: i < lit };
  });
}
export const dialTicks = (score: number) => arcTicks(score, { count: 48, from: 225, sweep: 270, cx: 60, cy: 60, inner: 47, outer: 58 });
export const halfTicks = (share: number) => arcTicks(share, { count: 46, from: 270, sweep: 180, cx: 120, cy: 120, inner: 90, outer: 116 });

/** Donut parts as dashes on one circle (the kit's 110 donut, r 48): the parts end to end, a small gap between, the first centred half a gap before the top. */
export function donutDashes(values: number[], r = 48, gap = 5) {
  const circ = 2 * Math.PI * r;
  const live = values.map((v) => (v > 0 ? v : 0));
  const sum = live.reduce((a, v) => a + v, 0);
  const room = circ - gap * live.filter(Boolean).length;
  let at = -gap / 2;
  return live.map((v) => {
    const length = sum ? (v / sum) * room : 0;
    const dash = { length, offset: -at, circ };
    if (length) at += length + gap;
    return dash;
  });
}

/** Hour ticks (24): a quiet tick for an hour with nothing, else one of three heights by how its amount compares with the busiest hour. */
export function hourLevels(values: number[]): Array<0 | 1 | 2 | 3> {
  const hours = Array.from({ length: 24 }, (_, i) => Math.max(0, values[i] ?? 0));
  const max = Math.max(...hours);
  return hours.map((v) => (!v || !max ? 0 : v > (2 * max) / 3 ? 3 : v > max / 3 ? 2 : 1));
}

/**
 * The kit's dot-matrix face (5 × 7), read off NR-KitCharts' Numerals: digits,
 * a colon, a point, minus, plus, percent, a space. Anything else is a space.
 * Returns the columns left to right, each 7 rows (true = lit).
 */
const DOT_FONT: Record<string, string[]> = {
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11111', '00010', '00100', '00010', '00001', '10001', '01110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  k: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  ':': ['00', '01', '01', '00', '01', '01', '00'],
  '.': ['00', '00', '00', '00', '00', '11', '11'],
  '-': ['000', '000', '000', '111', '000', '000', '000'],
  '+': ['00000', '00100', '00100', '11111', '00100', '00100', '00000'],
  '%': ['11001', '11010', '00010', '00100', '01000', '01011', '10011'],
  ' ': ['000', '000', '000', '000', '000', '000', '000'],
};
export function dotColumns(text: string): boolean[][] {
  const cols: boolean[][] = [];
  for (const ch of text.replace(/−/g, '-')) {
    const g = DOT_FONT[ch] ?? DOT_FONT[ch.toLowerCase()] ?? DOT_FONT[' ']!;
    for (let x = 0; x < g[0]!.length; x++) cols.push(g.map((row) => row[x] === '1'));
  }
  return cols;
}
