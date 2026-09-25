import type { LifeOSContext } from '@core/registry/context';
import type { Entity } from '@core/domain/types';
import { periodFromRRule } from '@core/cycles/schedule';
import type { AccountData, SubscriptionData, TransactionData } from './types';
import { dailySpend, incomeInRange, spendByCategory, spendInRange } from './lib';

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** First and last day of the month `offset` months from `now`. */
export function monthOf(offset: number, now = new Date()): { start: string; end: string; label: string; short: string } {
  const s = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const e = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
  return { start: iso(s), end: iso(e), label: s.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }), short: s.toLocaleDateString('en-IN', { month: 'short' }) };
}

export interface MonthReport {
  month: ReturnType<typeof monthOf>;
  spend: number;
  income: number;
  net: number;
  /** Spend change vs the month before, as a fraction (0.12 = 12 % more); null without last month's spend. */
  vsLast: number | null;
  byCategory: Array<{ category: string; total: number; count: number; share: number }>;
  daily: Array<{ date: string; total: number }>;
}

export function monthReport(os: LifeOSContext, offset = 0, now = new Date()): MonthReport {
  const month = monthOf(offset, now);
  const prev = monthOf(offset - 1, now);
  const spend = spendInRange(os, month.start, month.end);
  const income = incomeInRange(os, month.start, month.end);
  const last = spendInRange(os, prev.start, prev.end);
  const byCategory = spendByCategory(os, month.start, month.end)
    .map((c) => ({ ...c, share: spend ? c.total / spend : 0 }))
    .sort((a, b) => b.total - a.total);
  return { month, spend, income, net: income - spend, vsLast: last ? (spend - last) / last : null, byCategory, daily: dailySpend(os, month.start, month.end) };
}

/** Average days in a month / weeks in a month, for run-rates. */
const DAYS_PER_MONTH = 365.25 / 12;
const WEEKS_PER_MONTH = DAYS_PER_MONTH / 7;

export function perMonth(amount: number, rrule: string): number {
  const p = periodFromRRule(rrule) ?? { everyN: 1, everyUnit: 'month' as const };
  const perPeriod = { day: DAYS_PER_MONTH, week: WEEKS_PER_MONTH, month: 1, year: 1 / 12 }[p.everyUnit];
  return (amount * perPeriod) / p.everyN;
}

export interface RunRate {
  rows: Array<{ sub: Entity<SubscriptionData>; perMonth: number; perYear: number }>;
  monthly: number;
  yearly: number;
}

/** Active subscriptions by what they cost per month (Jio every 84 days → ₹399 × 30.44 / 84). */
export function subscriptionRunRate(os: LifeOSContext): RunRate {
  const subs = os.entities.query<SubscriptionData>('subscription', { filter: { and: [{ field: 'status', op: 'eq', value: 'active' }] } }, { limit: 1000 });
  const rows = subs.map((sub) => {
    const m = perMonth(sub.data.amount, sub.data.rrule);
    return { sub, perMonth: m, perYear: m * 12 };
  }).sort((a, b) => b.perMonth - a.perMonth);
  const monthly = rows.reduce((a, r) => a + r.perMonth, 0);
  return { rows, monthly, yearly: monthly * 12 };
}

/**
 * Net worth at the end of each of the last `months` months (oldest first),
 * rebuilt from opening balances and dated transactions. Accounts left out of
 * net worth are skipped.
 */
export function netWorthSeries(os: LifeOSContext, months = 12, now = new Date()): Array<{ label: string; end: string; total: number }> {
  const accounts = os.entities.query<AccountData>('account', {}, { limit: 1000 }).filter((a) => a.data.includeInNetWorth !== false);
  const ids = new Set(accounts.map((a) => a.id));
  const opening = accounts.reduce((a, x) => a + (x.data.openingBalance ?? 0), 0);
  const txs = os.entities.query<TransactionData>('transaction', {}, { limit: 100000 });
  const effect = (t: Entity<TransactionData>) => {
    const d = t.data;
    let v = 0;
    if (d.accountId && ids.has(d.accountId)) v += d.kind === 'income' ? d.amount : -d.amount;
    if (d.kind === 'transfer' && d.toAccountId && ids.has(d.toAccountId)) v += d.amount;
    return v;
  };
  const out: Array<{ label: string; end: string; total: number }> = [];
  for (let i = months - 1; i >= 0; i--) {
    const m = monthOf(-i, now);
    const total = opening + txs.filter((t) => t.data.date <= m.end).reduce((a, t) => a + effect(t), 0);
    out.push({ label: m.short, end: m.end, total: Math.round(total * 100) / 100 });
  }
  return out;
}

/** What active subscriptions cost per month, from each one's billing cycle. */
export function monthlySubscriptionCost(os: LifeOSContext): number {
  return subscriptionRunRate(os).monthly;
}
