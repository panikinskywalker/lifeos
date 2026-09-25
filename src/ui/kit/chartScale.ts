/** Pure axis maths for the kit charts (no React Native, unit-tested). */

/** Three friendly steps covering 0…max: 0, 20k, 40k, 60k rather than 0, 17k, 33k, 50k. */
export function niceGrid(max: number, min = 0): number[] {
  const span = Math.max(max - min, 1e-9);
  let step = niceMax(span / 3);
  let start = Math.floor(min / step) * step;
  // Snapping the start down can leave the top short of max: take the next friendly step.
  while (start + 3 * step < max) {
    step = niceMax(step * 1.01);
    start = Math.floor(min / step) * step;
  }
  return [0, 1, 2, 3].map((k) => start + k * step);
}

/** Round a max up to a friendly axis top (1, 2, 2.5, 5 × 10ⁿ). */
export function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (v <= m * p) return m * p;
  return 10 * p;
}
