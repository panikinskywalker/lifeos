import type { LifeOSContext } from '@core/registry/context';
import type { ObjectRecord } from '@core/domain/types';
import { billBalances, billBalanceWith, billsOf, makePayment } from './bills';

/** 'me' is the phone's owner; everyone else is a person record id. */
export type Party = 'me' | string;
export type SplitMethod = 'equal' | 'exact' | 'percent' | 'shares';

export interface SplitInput {
  payer: Party;
  method: SplitMethod;
  /** Participants and, for exact / percent / shares, their value (₹, %, weight). */
  parts: Array<{ party: Party; value?: number }>;
  groupId?: string | null;
}

export interface SplitShare {
  party: Party;
  amount: number;
}

/** Stored on the transaction as data.split. */
export interface SplitRecord extends SplitInput {
  shares: SplitShare[];
}

export interface DebtData {
  personId: string;
  /** they_owe: the person owes me · i_owe: I owe the person. */
  direction: 'they_owe' | 'i_owe';
  amount: number;
  reason?: string;
  date: string;
  kind: 'split' | 'loan' | 'payment';
  transactionId?: string;
  groupId?: string;
  currency?: string;
}

const paise = (n: number) => Math.round(n * 100);

/**
 * Divide `total` among parts. Amounts are whole paise and always add up to
 * the total exactly: rounding leftovers go one paisa at a time to the parts
 * with the largest remainders. Throws when exact amounts or percentages don't
 * add up, or no one is included.
 */
export function splitAmounts(total: number, method: SplitMethod, parts: SplitInput['parts']): SplitShare[] {
  if (!parts.length) throw new Error('Pick at least one person to split with');
  const t = paise(total);
  let weights: number[];
  if (method === 'equal') weights = parts.map(() => 1);
  else if (method === 'shares') weights = parts.map((p) => Math.max(0, p.value ?? 1));
  else if (method === 'percent') {
    const sum = parts.reduce((a, p) => a + (p.value ?? 0), 0);
    if (Math.abs(sum - 100) > 0.001) throw new Error(`Percentages add up to ${Math.round(sum * 100) / 100}%, not 100%`);
    weights = parts.map((p) => p.value ?? 0);
  } else {
    const cents = parts.map((p) => paise(p.value ?? 0));
    const sum = cents.reduce((a, b) => a + b, 0);
    if (sum !== t) throw new Error(`Amounts add up to ${(sum / 100).toFixed(2)}, not ${(t / 100).toFixed(2)}`);
    return parts.map((p, i) => ({ party: p.party, amount: cents[i]! / 100 }));
  }
  const wsum = weights.reduce((a, b) => a + b, 0);
  if (wsum <= 0) throw new Error('Give someone a share');
  const raw = weights.map((w) => (t * w) / wsum);
  const floors = raw.map(Math.floor);
  let left = t - floors.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - floors[i]!, i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (const [, i] of order) {
    if (left <= 0) break;
    floors[i]! += 1;
    left--;
  }
  return parts.map((p, i) => ({ party: p.party, amount: floors[i]! / 100 }));
}

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function openDebts(os: LifeOSContext, where: { personId?: string; groupId?: string; transactionId?: string }): ObjectRecord<DebtData>[] {
  const and: Array<{ field: string; op: 'eq' | 'neq'; value: string }> = [{ field: 'status', op: 'neq', value: 'settled' }];
  if (where.personId) and.push({ field: 'data.personId', op: 'eq', value: where.personId });
  if (where.groupId) and.push({ field: 'data.groupId', op: 'eq', value: where.groupId });
  if (where.transactionId) and.push({ field: 'data.transactionId', op: 'eq', value: where.transactionId });
  return os.records.query<DebtData>('debt', { filter: { and } }, { limit: 10000 });
}

/**
 * Split a transaction. Stores the split on the transaction, links the people,
 * and files a Debt for every share that involves me: if I paid, each person
 * owes me their share; if someone else paid, I owe them mine. Re-splitting
 * replaces the transaction's earlier split debts. Returns the new debt ids.
 */
export function applySplit(os: LifeOSContext, transactionId: string, input: SplitInput): string[] {
  const tx = os.records.get<{ amount: number; merchant?: string; date: string; currency?: string; personIds?: string[] }>(transactionId);
  if (!tx) throw new Error('Transaction not found');
  const shares = splitAmounts(tx.data.amount, input.method, input.parts);
  const reason = tx.data.merchant || tx.title;
  const made: string[] = [];
  os.db.transaction(() => {
    for (const d of os.records.query<DebtData>('debt', { filter: { and: [{ field: 'data.transactionId', op: 'eq', value: transactionId }, { field: 'data.kind', op: 'eq', value: 'split' }] } }, { limit: 1000 })) os.records.delete(d.id, 'system');
    const people = [...new Set([...shares.map((s) => s.party), input.payer].filter((p) => p !== 'me'))];
    const record: SplitRecord = { ...input, shares };
    // Your share (MODEL layer 2): what you paid for is your part; a bill someone else paid is nothing of yours until you pay them back.
    const share = input.payer === 'me' ? (shares.find((s) => s.party === 'me')?.amount ?? 0) : 0;
    os.records.update(transactionId, { data: { split: record, share, personIds: [...new Set([...(tx.data.personIds ?? []), ...people])] } });
    const base = { reason, date: tx.data.date, kind: 'split' as const, transactionId, groupId: input.groupId ?? undefined, currency: tx.data.currency };
    if (input.payer === 'me') {
      for (const s of shares) {
        if (s.party === 'me' || s.amount <= 0) continue;
        made.push(os.records.create<DebtData>({ object: 'debt', status: 'open', data: { ...base, personId: s.party, direction: 'they_owe', amount: s.amount } }).id);
      }
    } else {
      const mine = shares.find((s) => s.party === 'me');
      if (mine && mine.amount > 0) made.push(os.records.create<DebtData>({ object: 'debt', status: 'open', data: { ...base, personId: input.payer, direction: 'i_owe', amount: mine.amount } }).id);
    }
  });
  return made;
}

/** Remove a transaction's split (Undo of applySplit when there was none before). */
export function clearSplit(os: LifeOSContext, transactionId: string): void {
  os.db.transaction(() => {
    for (const d of os.records.query<DebtData>('debt', { filter: { and: [{ field: 'data.transactionId', op: 'eq', value: transactionId }, { field: 'data.kind', op: 'eq', value: 'split' }] } }, { limit: 1000 })) os.records.delete(d.id, 'system');
    os.records.update(transactionId, { data: { split: undefined, share: undefined } });
  });
}

const signed = (d: DebtData) => (d.direction === 'they_owe' ? d.amount : -d.amount);

/** + they owe me, − I owe them. Rounded to paise. */
export function balanceWith(os: LifeOSContext, personId: string, groupId?: string): number {
  // Debts (loans, Turf's shares, splits made before Bill) and Bills (Splitwise's way).
  return paise(openDebts(os, { personId, groupId }).reduce((a, d) => a + signed(d.data), 0) + billBalanceWith(os, personId, groupId)) / 100;
}

/** Everyone with a non-zero balance, biggest first. */
export function balances(os: LifeOSContext, groupId?: string): Array<{ personId: string; amount: number }> {
  const by = new Map<string, number>();
  for (const d of openDebts(os, { groupId })) by.set(d.data.personId, (by.get(d.data.personId) ?? 0) + signed(d.data));
  for (const d of billBalances(billsOf(os, groupId ? { groupId } : {})).debts) {
    if (d.to === 'me' && d.from !== 'me') by.set(d.from, (by.get(d.from) ?? 0) + d.amount);
    if (d.from === 'me' && d.to !== 'me') by.set(d.to, (by.get(d.to) ?? 0) - d.amount);
  }
  return [...by.entries()]
    .map(([personId, a]) => ({ personId, amount: paise(a) / 100 }))
    .filter((b) => b.amount !== 0)
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
}

/**
 * Settle up with a person (optionally within a group): a payment for the
 * whole balance is filed, and every open debt between us is marked settled.
 * Returns what Undo needs.
 */
export function settleUp(os: LifeOSContext, personId: string, opts: { groupId?: string; date?: string } = {}): { paymentId: string | null; settled: string[]; payback: string | null; billId?: string | null } {
  const open = openDebts(os, { personId, groupId: opts.groupId });
  const bal = paise(open.reduce((a, d) => a + signed(d.data), 0)) / 100;
  const fromBills = billBalanceWith(os, personId, opts.groupId);
  let paymentId: string | null = null;
  let billId: string | null = null;
  const settled: string[] = [];
  // The money that actually moved (MODEL layer 2, Your share): theirs in, or yours out, for the balance.
  const tx = bal !== 0 ? settlingPayment(os, personId, bal) : null;
  os.db.transaction(() => {
    // What Bills say is owed is settled by a payback Bill, so it shows with the others.
    if (fromBills !== 0) billId = makePayment(os, fromBills > 0 ? personId : 'me', fromBills > 0 ? 'me' : personId, Math.abs(fromBills), { date: opts.date ?? today(), groupId: opts.groupId }).id;
    if (bal !== 0) {
      paymentId = os.records.create<DebtData>({ object: 'debt', status: 'settled', data: { personId, direction: bal > 0 ? 'i_owe' : 'they_owe', amount: Math.abs(bal), reason: 'Settled up', date: opts.date ?? today(), kind: 'payment', groupId: opts.groupId, transactionId: tx ?? undefined } }).id;
      if (tx) {
        os.links.link(tx, paymentId, 'settles', {}, 'system');
        // Their money back is a payback, not income; your money to them stays your spend.
        if (bal > 0) os.records.update(tx, { data: { share: 0 } });
      }
    }
    for (const d of open) {
      os.records.setStatus(d.id, 'settled');
      settled.push(d.id);
    }
  });
  return { paymentId, settled, payback: bal > 0 ? tx : null, billId };
}

/**
 * The payment that settles a balance: from them (they owed you) or to them (you
 * owed), the balance's amount, in the last 45 days, linked to them, not already
 * a payback or a refund. The newest.
 */
export function settlingPayment(os: LifeOSContext, personId: string, balance: number): string | null {
  const kind = balance > 0 ? 'income' : 'expense';
  const since = new Date(Date.now() - 45 * 86_400_000).toISOString().slice(0, 10);
  const ids = new Set(os.links.forEntity(personId).filter((l) => l.other.object === 'transaction').map((l) => l.other.id));
  const hits = [...ids]
    .map((id) => os.records.get<{ amount: number; kind: string; date: string; share?: number; refund?: boolean }>(id))
    .filter((t): t is NonNullable<typeof t> => !!t && t.data.kind === kind && Math.abs(t.data.amount - Math.abs(balance)) < 0.5 && t.data.date >= since && t.data.share == null && !t.data.refund)
    .filter((t) => !os.links.forEntity(t.id, 'settles').length)
    .sort((a, b) => b.data.date.localeCompare(a.data.date));
  return hits[0]?.id ?? null;
}

export function undoSettle(os: LifeOSContext, s: { paymentId: string | null; settled: string[]; payback?: string | null; billId?: string | null }): void {
  os.db.transaction(() => {
    for (const id of s.settled) os.records.setStatus(id, 'open');
    if (s.paymentId) os.records.delete(s.paymentId);
    if (s.payback && os.records.get(s.payback)) os.records.update(s.payback, { data: { share: undefined } });
    if (s.billId) os.records.delete(s.billId);
  });
}

/**
 * What you shared with someone over a period (the kit's donut, "Shared with
 * Priya · this month"): across the split payments they are part of, each
 * party's share added up, you first, then them, then the rest.
 */
export function sharedWith(os: LifeOSContext, personId: string, from: string, to: string): { total: number; shares: Array<{ party: Party; amount: number }> } {
  const by = new Map<Party, number>();
  let total = 0;
  const txs = os.records.query<{ amount: number; date: string; split?: SplitRecord }>('transaction', { filter: { and: [{ field: 'data.date', op: 'gte', value: from }, { field: 'data.date', op: 'lte', value: to }] } }, { limit: 20000 });
  for (const t of txs) {
    const s = t.data.split;
    if (!s?.shares?.some((x) => x.party === personId)) continue;
    total += t.data.amount;
    for (const x of s.shares) by.set(x.party, (by.get(x.party) ?? 0) + x.amount);
  }
  const rank = (p: Party) => (p === 'me' ? 0 : p === personId ? 1 : 2);
  const shares = [...by.entries()].map(([party, amount]) => ({ party, amount: paise(amount) / 100 })).sort((a, b) => rank(a.party) - rank(b.party) || b.amount - a.amount);
  return { total: paise(total) / 100, shares };
}

/**
 * Once, on first start with Your share (14 Nov): splits saved before it get
 * their share (your part when you paid, 0 when someone else did). Returns how
 * many were folded.
 */
export function foldSplitShares(os: LifeOSContext): number {
  if (os.settings.get<boolean>('finance.sharesFolded', false)) return 0;
  let n = 0;
  os.db.transaction(() => {
    for (const t of os.records.query<{ split?: SplitRecord; share?: number }>('transaction', {}, { limit: 50_000 })) {
      const s = t.data.split;
      if (!s?.shares || typeof t.data.share === 'number') continue;
      os.records.update(t.id, { data: { share: s.payer === 'me' ? (s.shares.find((x) => x.party === 'me')?.amount ?? 0) : 0 } }, 'system');
      n++;
    }
    os.settings.set('finance.sharesFolded', true);
  });
  return n;
}
