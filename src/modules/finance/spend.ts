import type { LifeOSContext } from '@core/registry/context';
import type { ObjectRecord } from '@core/domain/types';
import type { TransactionData } from './types';
import { incomeOf, spentOf } from '@core/dashboard/money';

/**
 * The Spend screen's query (M4.2c): a period, what to count (spending,
 * income, investments, everything), filters (categories, accounts, words)
 * and a sort — with totals, the previous period for comparison, and a
 * by-category breakdown. Pure, so it's tested.
 */

export type SpendPeriod = 'month' | 'last_month' | '3_months' | 'year' | 'all';
export type SpendKind = 'spending' | 'income' | 'investments' | 'all';
export type SpendSort = 'newest' | 'oldest' | 'largest' | 'smallest';

export interface SpendQuery {
  period: SpendPeriod;
  kind: SpendKind;
  categories?: string[];
  accountIds?: string[];
  search?: string;
  sort?: SpendSort;
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function periodRange(p: SpendPeriod, now = new Date()): { from: string | null; to: string; prevFrom: string | null; prevTo: string | null; label: string } {
  const y = now.getFullYear();
  const m = now.getMonth();
  const to = iso(now);
  switch (p) {
    case 'month':
      return { from: iso(new Date(y, m, 1)), to, prevFrom: iso(new Date(y, m - 1, 1)), prevTo: iso(new Date(y, m - 1, Math.min(now.getDate(), new Date(y, m, 0).getDate()))), label: now.toLocaleDateString('en-IN', { month: 'long' }) };
    case 'last_month':
      return { from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)), prevFrom: iso(new Date(y, m - 2, 1)), prevTo: iso(new Date(y, m - 1, 0)), label: new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long' }) };
    case '3_months':
      return { from: iso(new Date(y, m - 2, 1)), to, prevFrom: iso(new Date(y, m - 5, 1)), prevTo: iso(new Date(y, m - 2, 0)), label: 'Last 3 months' };
    case 'year':
      return { from: iso(new Date(y, 0, 1)), to, prevFrom: iso(new Date(y - 1, 0, 1)), prevTo: iso(new Date(y - 1, m, now.getDate())), label: String(y) };
    case 'all':
      return { from: null, to, prevFrom: null, prevTo: null, label: 'All time' };
  }
}

// Spending includes refunds (they take their amount off); income leaves them out (MODEL layer 2, Your share).
const matchesKind = (t: TransactionData & { refund?: boolean }, k: SpendKind) =>
  k === 'all' ? true : k === 'spending' ? t.kind === 'expense' || (t.kind === 'income' && !!t.refund) : k === 'income' ? t.kind === 'income' && !t.refund : t.kind === 'investment' || t.category === 'investment';
/** What one transaction adds to the total: your share of spending, what came in, the amount invested, or for everything, in less out. */
const valueOf = (t: TransactionData, k: SpendKind) => (k === 'spending' ? spentOf(t) : k === 'income' ? incomeOf(t) : k === 'investments' ? t.amount : incomeOf(t) - spentOf(t));

export interface SpendResult {
  items: Array<ObjectRecord<TransactionData>>;
  total: number;
  count: number;
  prevTotal: number | null;
  change: number | null;
  byCategory: Array<{ category: string; total: number; count: number; share: number }>;
  accounts: Array<{ id: string; title: string; total: number }>;
  label: string;
}

export function spendQuery(os: LifeOSContext, q: SpendQuery, now = new Date()): SpendResult {
  const r = periodRange(q.period, now);
  const all = os.records.query<TransactionData>('transaction', r.from ? { filter: { and: [{ field: 'data.date', op: 'gte', value: r.prevFrom ?? r.from }, { field: 'data.date', op: 'lte', value: r.to }] } } : {}, { limit: 20000 });
  const words = (q.search ?? '').trim().toLowerCase();
  const inPeriod = (t: TransactionData, from: string | null, to: string | null) => (!from || t.date >= from) && (!to || t.date <= to);
  const base = (e: ObjectRecord<TransactionData>) =>
    matchesKind(e.data, q.kind) &&
    (!q.accountIds?.length || q.accountIds.includes(e.data.accountId ?? '') || q.accountIds.includes(e.data.toAccountId ?? '')) &&
    (!words || `${e.title} ${e.data.merchant ?? ''} ${e.data.note ?? ''}`.toLowerCase().includes(words));
  const cur = all.filter((e) => base(e) && inPeriod(e.data, r.from, r.to));
  const prev = r.prevFrom ? all.filter((e) => base(e) && inPeriod(e.data, r.prevFrom, r.prevTo)) : null;
  // The category breakdown ignores the category filter (so you can see where the rest went).
  const cats = new Map<string, { total: number; count: number }>();
  for (const e of cur) {
    const c = cats.get(e.data.category ?? 'other') ?? { total: 0, count: 0 };
    c.total += valueOf(e.data, q.kind);
    c.count++;
    cats.set(e.data.category ?? 'other', c);
  }
  const accs = new Map<string, number>();
  for (const e of cur) if (e.data.accountId) accs.set(e.data.accountId, (accs.get(e.data.accountId) ?? 0) + valueOf(e.data, q.kind));
  let items = q.categories?.length ? cur.filter((e) => q.categories!.includes(e.data.category ?? 'other')) : cur;
  const sort = q.sort ?? 'newest';
  items = [...items].sort((a, b) =>
    sort === 'largest' ? b.data.amount - a.data.amount : sort === 'smallest' ? a.data.amount - b.data.amount : sort === 'oldest' ? a.data.date.localeCompare(b.data.date) || a.createdAt - b.createdAt : b.data.date.localeCompare(a.data.date) || b.createdAt - a.createdAt,
  );
  const sum = (xs: Array<ObjectRecord<TransactionData>>) => xs.reduce((s, e) => s + valueOf(e.data, q.kind), 0);
  const total = sum(items);
  const prevItems = prev ? (q.categories?.length ? prev.filter((e) => q.categories!.includes(e.data.category ?? 'other')) : prev) : null;
  const prevTotal = prevItems ? sum(prevItems) : null;
  const catTotal = [...cats.values()].reduce((s, c) => s + c.total, 0) || 1;
  return {
    items,
    total,
    count: items.length,
    prevTotal,
    change: prevTotal ? (total - prevTotal) / prevTotal : null,
    byCategory: [...cats].map(([category, c]) => ({ category, ...c, share: c.total / catTotal })).sort((a, b) => b.total - a.total),
    accounts: [...accs].map(([id, total]) => ({ id, title: os.records.get(id)?.title ?? 'Account', total })).sort((a, b) => b.total - a.total),
    label: r.label,
  };
}

/**
 * When in the day the money went (the kit's hour ticks): each spend's hour from
 * the moment its text, notification or mail arrived; one you typed counts only
 * when it was added on its own day. Spends with no known time are left out.
 */
export function spendByHour(os: LifeOSContext, from: string | null, to: string): number[] {
  const hours = Array(24).fill(0) as number[];
  const and: Array<{ field: string; op: 'eq' | 'gte' | 'lte'; value: string }> = [{ field: 'data.kind', op: 'eq', value: 'expense' }, { field: 'data.date', op: 'lte', value: to }];
  if (from) and.push({ field: 'data.date', op: 'gte', value: from });
  for (const t of os.records.query<TransactionData>('transaction', { filter: { and } }, { limit: 20000 })) {
    const arrived = t.data.sourceRef ? os.db.get<{ at: number }>(`SELECT received_at AS at FROM ingest_queue WHERE id=?`, [t.data.sourceRef])?.at : undefined;
    const typed = new Date(t.createdAt);
    const sameDay = `${typed.getFullYear()}-${String(typed.getMonth() + 1).padStart(2, '0')}-${String(typed.getDate()).padStart(2, '0')}` === t.data.date;
    const at = arrived ?? (sameDay ? t.createdAt : null);
    if (at != null) hours[new Date(at).getHours()]! += spentOf(t.data);
  }
  return hours;
}
