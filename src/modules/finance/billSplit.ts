import type { Party, SplitShare } from './split';

/**
 * Split a bill by item (docs/MODEL.md, Splitwise and settling up; the *Bill ·
 * Split a scanned bill by item* artboard): each line goes to whoever had it, in
 * portions (you had 2 glasses of the pitcher, Arjun 1); a line no one took is
 * shared by everyone; tax, service and rounding are shared in proportion to
 * what each had. The shares add up to the bill exactly, to the paisa.
 */

export interface BillLine {
  name: string;
  qty: number;
  /** What the line costs in all, before tax. */
  total: number;
}
/** For each line, each party's portions; none (or all zero) means everyone equally. */
export type LinePortions = Array<Partial<Record<Party, number>> | undefined>;

export function splitBill(lines: BillLine[], portions: LinePortions, everyone: Party[], billTotal: number): SplitShare[] {
  const base = new Map<Party, number>(everyone.map((p) => [p, 0]));
  lines.forEach((line, i) => {
    const mine = Object.entries(portions[i] ?? {}).filter(([, n]) => (n ?? 0) > 0) as Array<[Party, number]>;
    const who: Array<[Party, number]> = mine.length ? mine : everyone.map((p) => [p, 1]);
    const sum = who.reduce((n, [, w]) => n + w, 0);
    for (const [p, w] of who) base.set(p, (base.get(p) ?? 0) + (line.total * w) / sum);
  });
  const itemsTotal = [...base.values()].reduce((n, v) => n + v, 0);
  // Tax, service and rounding: in proportion to what each had (equally when nothing was had).
  const scale = itemsTotal > 0 ? billTotal / itemsTotal : 0;
  const raw = [...base.entries()].map(([party, v]) => ({ party, exact: itemsTotal > 0 ? v * scale * 100 : (billTotal * 100) / base.size }));
  const floor = raw.map((r) => ({ party: r.party, paise: Math.floor(r.exact), rem: r.exact - Math.floor(r.exact) }));
  let left = Math.round(billTotal * 100) - floor.reduce((n, r) => n + r.paise, 0);
  for (const r of [...floor].sort((a, b) => b.rem - a.rem)) {
    if (left <= 0) break;
    r.paise++;
    left--;
  }
  return floor.map((r) => ({ party: r.party, amount: r.paise / 100 })).filter((s) => s.amount > 0);
}
