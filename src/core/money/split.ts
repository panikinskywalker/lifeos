/**
 * Dividing money among people, as Splitwise does (MODEL.md layer 2, *Bill*).
 * Plain arithmetic over parties ('me', or a Person's id), with no Objects: the
 * finance module's Bill and travel's trip ledger both use it, and a module
 * never imports another. Amounts round to paise (or sen); the last share
 * takes what is left so the shares always add up to the amount.
 */

export type Party = string;
export type SplitMethod = 'equal' | 'exact' | 'percent' | 'shares' | 'adjust';

export interface SplitSpec {
  /** Who paid how much; adds up to the amount. */
  payers: Record<Party, number>;
  method: SplitMethod;
  /** equal: who is in (any value > 0) · exact: amounts · percent: % · shares: weights · adjust: plus or minus each, on top of an equal part. */
  shares: Record<Party, number>;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** What each party's share of the amount is. */
export function owedOf(amount: number, spec: Pick<SplitSpec, 'method' | 'shares'>): Record<Party, number> {
  const out: Record<Party, number> = {};
  const entries = Object.entries(spec.shares ?? {});
  if (spec.method === 'adjust') {
    const keys = entries.map(([p]) => p);
    if (!keys.length) return out;
    const adj = entries.reduce((a, [, v]) => a + (Number(v) || 0), 0);
    const base = (amount - adj) / keys.length;
    let left = amount;
    entries.forEach(([p, v], i) => {
      const x = i === keys.length - 1 ? r2(left) : r2(base + (Number(v) || 0));
      out[p] = x;
      left -= x;
    });
    return out;
  }
  const live = entries.filter(([, v]) => Number(v) > 0);
  if (!live.length) return out;
  if (spec.method === 'exact') {
    for (const [p, v] of live) out[p] = r2(Number(v));
    return out;
  }
  const total = spec.method === 'percent' ? 100 : spec.method === 'shares' ? live.reduce((a, [, v]) => a + Number(v), 0) : live.length;
  let left = amount;
  live.forEach(([p, v], i) => {
    const x = i === live.length - 1 ? r2(left) : r2((amount * (spec.method === 'equal' ? 1 : Number(v))) / total);
    out[p] = x;
    left -= x;
  });
  return out;
}

/** Why a split does not add up, or null when it does. */
export function splitProblem(amount: number, spec: SplitSpec): string | null {
  const paid = Object.values(spec.payers).reduce((a, b) => a + (Number(b) || 0), 0);
  if (Math.abs(paid - amount) > 0.009) return 'What each person paid must add up to the amount.';
  const s = Object.values(spec.shares);
  if (spec.method !== 'adjust' && !s.some((v) => Number(v) > 0)) return 'Pick at least one person to split with.';
  if (spec.method === 'exact' && Math.abs(s.reduce((a, b) => a + (Number(b) || 0), 0) - amount) > 0.009) return 'The exact amounts must add up to the total.';
  if (spec.method === 'percent' && Math.abs(s.reduce((a, b) => a + (Number(b) || 0), 0) - 100) > 0.009) return 'The percentages must add up to 100%.';
  if (spec.method === 'adjust' && Object.values(owedOf(amount, spec)).some((v) => v < 0)) return 'The adjustments are bigger than the amount.';
  return null;
}

export interface LedgerEntry {
  amount: number;
  /** The amount in one currency (₹) for adding up; the ratio converts each share. */
  inr: number;
  spec: SplitSpec;
  /** A payback moves balances but is nobody's spend. */
  payment?: boolean;
}

export interface Balances {
  /** + is owed money, - owes. */
  net: Record<Party, number>;
  /** What each paid for (spends only), and their share of them. */
  paid: Record<Party, number>;
  share: Record<Party, number>;
  /** Payments each made and received. */
  sent: Record<Party, number>;
  received: Record<Party, number>;
  /** Who owes whom: pair by pair, or the fewest payments when simplified. */
  debts: Array<{ from: Party; to: Party; amount: number }>;
}

/** Everyone's balances over a set of entries, in ₹. */
export function balancesOf(entries: LedgerEntry[], opts: { simplify?: boolean; parties?: Party[] } = {}): Balances {
  const b: Balances = { net: {}, paid: {}, share: {}, sent: {}, received: {}, debts: [] };
  const pair: Record<Party, Record<Party, number>> = {};
  const add = (o: Record<Party, number>, p: Party, v: number) => (o[p] = (o[p] ?? 0) + v);
  for (const p of opts.parties ?? []) for (const o of [b.net, b.paid, b.share, b.sent, b.received]) o[p] = 0;
  for (const e of entries) {
    if (!e.amount) continue;
    const f = e.inr / e.amount;
    const owed = owedOf(e.amount, e.spec);
    const pos: Record<Party, number> = {};
    for (const p of new Set([...Object.keys(e.spec.payers), ...Object.keys(owed)])) {
      const v = ((e.spec.payers[p] ?? 0) - (owed[p] ?? 0)) * f;
      pos[p] = v;
      add(b.net, p, v);
      if (e.payment) {
        add(b.sent, p, (e.spec.payers[p] ?? 0) * f);
        add(b.received, p, (owed[p] ?? 0) * f);
      } else {
        add(b.paid, p, (e.spec.payers[p] ?? 0) * f);
        add(b.share, p, (owed[p] ?? 0) * f);
      }
    }
    // Pair by pair: each debtor owes each creditor in proportion.
    const cr = Object.keys(pos).filter((p) => pos[p]! > 0.005);
    const crTot = cr.reduce((a, p) => a + pos[p]!, 0);
    for (const d of Object.keys(pos).filter((p) => pos[p]! < -0.005)) for (const c of cr) add((pair[d] ??= {}), c, (-pos[d]! * pos[c]!) / crTot);
  }
  for (const o of [b.net, b.paid, b.share, b.sent, b.received]) for (const p of Object.keys(o)) o[p] = r2(o[p]!);
  if (opts.simplify) {
    const cr = Object.entries(b.net).filter(([, v]) => v > 0.5).map(([p, v]) => [p, v] as [Party, number]).sort((x, y) => y[1] - x[1]);
    const de = Object.entries(b.net).filter(([, v]) => v < -0.5).map(([p, v]) => [p, -v] as [Party, number]).sort((x, y) => y[1] - x[1]);
    let i = 0, j = 0;
    while (i < de.length && j < cr.length) {
      const x = Math.min(de[i]![1], cr[j]![1]);
      b.debts.push({ from: de[i]![0], to: cr[j]![0], amount: r2(x) });
      de[i]![1] -= x;
      cr[j]![1] -= x;
      if (de[i]![1] < 0.5) i++;
      if (cr[j]![1] < 0.5) j++;
    }
  } else {
    const ps = [...new Set([...Object.keys(pair), ...Object.values(pair).flatMap((o) => Object.keys(o))])];
    for (let a = 0; a < ps.length; a++)
      for (let c = a + 1; c < ps.length; c++) {
        const x = (pair[ps[a]!]?.[ps[c]!] ?? 0) - (pair[ps[c]!]?.[ps[a]!] ?? 0);
        if (Math.abs(x) > 0.5) b.debts.push(x > 0 ? { from: ps[a]!, to: ps[c]!, amount: r2(x) } : { from: ps[c]!, to: ps[a]!, amount: r2(-x) });
      }
  }
  b.debts.sort((x, y) => y.amount - x.amount || x.from.localeCompare(y.from) || x.to.localeCompare(y.to));
  return b;
}
