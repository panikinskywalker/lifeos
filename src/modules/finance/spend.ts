import type { LifeOSContext } from '@core/registry/context';
import type { Entity } from '@core/domain/types';
import type { TransactionData } from './types';

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

const matchesKind = (t: TransactionData, k: SpendKind) =>
  k === 'all' ? true : k === 'spending' ? t.kind === 'expense' : k === 'income' ? t.kind === 'income' : t.category === 'investment';

export interface SpendResult {
  items: Array<Entity<TransactionData>>;
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
  const all = os.entities.query<TransactionData>('transaction', r.from ? { filter: { and: [{ field: 'data.date', op: 'gte', value: r.prevFrom ?? r.from }, { field: 'data.date', op: 'lte', value: r.to }] } } : {}, { limit: 20000 });
  const words = (q.search ?? '').trim().toLowerCase();
  const inPeriod = (t: TransactionData, from: string | null, to: string | null) => (!from || t.date >= from) && (!to || t.date <= to);
  const base = (e: Entity<TransactionData>) =>
    matchesKind(e.data, q.kind) &&
    (!q.accountIds?.length || q.accountIds.includes(e.data.accountId ?? '') || q.accountIds.includes(e.data.toAccountId ?? '')) &&
    (!words || `${e.title} ${e.data.merchant ?? ''} ${e.data.note ?? ''}`.toLowerCase().includes(words));
  const cur = all.filter((e) => base(e) && inPeriod(e.data, r.from, r.to));
  const prev = r.prevFrom ? all.filter((e) => base(e) && inPeriod(e.data, r.prevFrom, r.prevTo)) : null;
  // The category breakdown ignores the category filter (so you can see where the rest went).
  const cats = new Map<string, { total: number; count: number }>();
  for (const e of cur) {
    const c = cats.get(e.data.category ?? 'other') ?? { total: 0, count: 0 };
    c.total += e.data.amount;
    c.count++;
    cats.set(e.data.category ?? 'other', c);
  }
  const accs = new Map<string, number>();
  for (const e of cur) if (e.data.accountId) accs.set(e.data.accountId, (accs.get(e.data.accountId) ?? 0) + e.data.amount);
  let items = q.categories?.length ? cur.filter((e) => q.categories!.includes(e.data.category ?? 'other')) : cur;
  const sort = q.sort ?? 'newest';
  items = [...items].sort((a, b) =>
    sort === 'largest' ? b.data.amount - a.data.amount : sort === 'smallest' ? a.data.amount - b.data.amount : sort === 'oldest' ? a.data.date.localeCompare(b.data.date) || a.createdAt - b.createdAt : b.data.date.localeCompare(a.data.date) || b.createdAt - a.createdAt,
  );
  const sum = (xs: Array<Entity<TransactionData>>) => xs.reduce((s, e) => s + e.data.amount, 0);
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
    accounts: [...accs].map(([id, total]) => ({ id, title: os.entities.get(id)?.title ?? 'Account', total })).sort((a, b) => b.total - a.total),
    label: r.label,
  };
}
