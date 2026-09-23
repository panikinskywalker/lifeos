/** Pure input parsing for kit fields — no React Native, unit-tested. */

/** Parses what a person types into a number: strips grouping, keeps one dot and a leading minus. */
export function parseNumberInput(text: string): number | undefined {
  const clean = text.replace(/[^0-9.\-]/g, '').replace(/(?!^)-/g, '').replace(/(\..*)\./g, '$1');
  if (clean === '' || clean === '-' || clean === '.') return undefined;
  const n = Number(clean);
  return Number.isFinite(n) ? n : undefined;
}
