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
