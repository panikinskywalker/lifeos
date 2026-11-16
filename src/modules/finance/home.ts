import type { LifeOSContext } from '@core/registry/context';
import type { AccountData, InvestmentData, SubscriptionData, TransactionData } from './types';
import { incomeInRange, monthRange, spendByCategory, spendInRange } from './lib';

/**
 * What Money home answers at a glance (docs/MODEL.md layer 5, Money home):
 * the pace against your monthly line, and what is coming up before payday.
 * Pure over the records, so it is tested; the board lays it out.
 */

const pad = (n: number) => String(n).padStart(2, '0');
const isoOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Payday: the day of the month of your latest Salary, next time it comes. */
export function nextPayday(os: LifeOSContext, now = new Date()): string | null {
  const salaries = os.records.query<TransactionData>('transaction', { filter: { and: [{ field: 'data.kind', op: 'eq', value: 'income' }, { field: 'data.category', op: 'eq', value: 'salary' }] } }, { limit: 500 });
  const latest = salaries.map((t) => t.data.date).sort().pop();
  if (!latest) return null;
  const d = new Date(now.getFullYear(), now.getMonth(), Number(latest.slice(8, 10)));
  if (isoOf(d) <= isoOf(now)) d.setMonth(d.getMonth() + 1);
  return isoOf(d);
}

export const LINE_KEY = 'finance.monthlyLine';

/** Your monthly line: the one you set, else your usual month (the average of the last three months with spending). */
export function monthlyLine(os: LifeOSContext, now = new Date()): { amount: number; yours: boolean } | null {
  const set = os.settings.get<number | null>(LINE_KEY, null);
  if (typeof set === 'number' && set > 0) return { amount: set, yours: true };
  const months = [1, 2, 3].map((k) => monthRange(-k, now)).map((r) => spendInRange(os, r.start, r.end)).filter((x) => x > 0);
  return months.length ? { amount: Math.round(months.reduce((a, b) => a + b, 0) / months.length), yours: false } : null;
}

export interface Pace {
  line: number;
  yours: boolean;
  spent: number;
  left: number;
  daysLeft: number;
  /** What a day can take, today included, to stay under the line; 0 once over. */
  perDay: number;
  over: boolean;
}

/** This month against your line: what is left and what a day can take. */
export function pace(os: LifeOSContext, now = new Date()): Pace | null {
  const line = monthlyLine(os, now);
  if (!line) return null;
  const m = monthRange(0, now);
  const spent = spendInRange(os, m.start, isoOf(now));
  const daysLeft = Number(m.end.slice(8, 10)) - now.getDate() + 1;
  const left = Math.round((line.amount - spent) * 100) / 100;
  return { line: line.amount, yours: line.yours, spent, left, daysLeft, perDay: left > 0 ? Math.floor(left / daysLeft) : 0, over: left < 0 };
}

export interface Upcoming {
  key: string;
  kind: 'card' | 'subscription' | 'sip';
  id: string;
  object: 'account' | 'subscription' | 'investment';
  title: string;
  amount: number;
  due: string;
  late: boolean;
  /** A bill you pay (electricity, an EMI) rather than a renewal. */
  bill?: boolean;
  /** Its category (a card bill has none). */
  category?: string;
}

/** Before payday (or the month's end when no salary says when): card bills, renewals and SIPs, soonest first; a card bill past its day stays, late. */
export function comingUp(os: LifeOSContext, now = new Date()): { until: string; payday: string | null; items: Upcoming[] } {
  const today = isoOf(now);
  const payday = nextPayday(os, now);
  const until = payday ?? isoOf(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  const items: Upcoming[] = [];
  for (const a of os.records.query<AccountData>('account', { filter: { and: [{ field: 'data.kind', op: 'eq', value: 'credit' }] } }, { limit: 100 })) {
    const st = a.data.statement;
    if (st && st.dueOn <= until) items.push({ key: `card:${a.id}`, kind: 'card', id: a.id, object: 'account', title: `${a.title} bill`, amount: st.total, due: st.dueOn, late: st.dueOn < today });
  }
  if (os.registry.objects.has('subscription')) {
    for (const s of os.records.query<SubscriptionData>('subscription', { filter: { and: [{ field: 'status', op: 'eq', value: 'active' }] } }, { limit: 1000 })) {
      const due = s.data.nextBillingAt.slice(0, 10);
      if (due >= today && due <= until) items.push({ key: `sub:${s.id}`, kind: 'subscription', id: s.id, object: 'subscription', title: s.title, amount: s.data.amount, due, late: false, bill: !!s.data.bill, category: s.data.category });
    }
  }
  if (os.registry.objects.has('investment')) {
    for (const i of os.records.query<InvestmentData>('investment', { filter: { and: [{ field: 'status', op: 'eq', value: 'active' }] } }, { limit: 500 })) {
      if (!i.data.sip) continue;
      const d = new Date(now.getFullYear(), now.getMonth(), Math.min(Math.max(i.data.sipDay ?? 1, 1), 28));
      if (isoOf(d) < today) d.setMonth(d.getMonth() + 1);
      const due = isoOf(d);
      if (due <= until) items.push({ key: `sip:${i.id}`, kind: 'sip', id: i.id, object: 'investment', title: `${i.title} SIP`, amount: i.data.sip, due, late: false, category: 'investment' });
    }
  }
  items.sort((a, b) => Number(b.late) - Number(a.late) || a.due.localeCompare(b.due));
  return { until, payday, items };
}

export interface MonthClose {
  /** "October". */
  label: string;
  /** "2026-10". */
  month: string;
  spent: number;
  usual: number | null;
  income: number;
  saved: number;
  /** The three biggest changes by category against the three months before. */
  changes: Array<{ category: string; spent: number; usual: number; delta: number }>;
  newSubs: Array<{ id: string; name: string; amount: number }>;
  prices: Array<{ id: string; name: string; from: number; to: number }>;
}

/** Last month, closed (docs/MODEL.md, phase D, 6): shown on the 1st to the 3rd. */
export function monthClose(os: LifeOSContext, now = new Date()): MonthClose | null {
  if (now.getDate() > 3) return null;
  const m = monthRange(-1, now);
  const spent = spendInRange(os, m.start, m.end);
  const income = incomeInRange(os, m.start, m.end);
  if (!spent && !income) return null;
  const before = [2, 3, 4].map((k) => monthRange(-k, now));
  const prior = before.map((r) => spendInRange(os, r.start, r.end)).filter((x) => x > 0);
  const usualBy = new Map<string, number>();
  for (const r of before) for (const c of spendByCategory(os, r.start, r.end)) usualBy.set(c.category, (usualBy.get(c.category) ?? 0) + c.total / 3);
  const nowBy = new Map(spendByCategory(os, m.start, m.end).map((c) => [c.category, c.total]));
  // No months before to compare with: no changes to show.
  const changes = !prior.length ? [] : [...new Set([...nowBy.keys(), ...usualBy.keys()])]
    .map((category) => ({ category, spent: nowBy.get(category) ?? 0, usual: Math.round(usualBy.get(category) ?? 0), delta: Math.round((nowBy.get(category) ?? 0) - (usualBy.get(category) ?? 0)) }))
    .filter((c) => Math.abs(c.delta) >= 1 && c.category !== 'transfer')
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 3);
  const subs = os.registry.objects.has('subscription') ? os.records.query<SubscriptionData & { bill?: boolean; priceHistory?: Array<{ amount: number; from: string }> }>('subscription', {}, { limit: 1000 }) : [];
  const inMonth = (d: string) => d >= m.start && d <= m.end;
  return {
    label: m.label.split(' ')[0]!,
    month: m.start.slice(0, 7),
    spent,
    usual: prior.length ? Math.round(prior.reduce((a, b) => a + b, 0) / prior.length) : null,
    income,
    saved: Math.round(income - spent),
    changes,
    newSubs: subs.filter((s) => !s.data.bill && inMonth(isoOf(new Date(s.createdAt)))).map((s) => ({ id: s.id, name: s.data.name, amount: s.data.amount })),
    prices: subs.flatMap((s) => {
      const h = s.data.priceHistory ?? [];
      const last = h[h.length - 1];
      return h.length > 1 && last && inMonth(last.from) ? [{ id: s.id, name: s.data.name, from: h[h.length - 2]!.amount, to: last.amount }] : [];
    }),
  };
}
