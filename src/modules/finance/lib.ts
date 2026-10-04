import type { LifeOSContext } from '@core/registry/context';
import type { ObjectRecord } from '@core/domain/types';
import { nextOccurrence } from '@core/automation/recurrence';
import type { AccountData, BudgetData, SubscriptionData, TransactionData } from './types';

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function monthRange(offset = 0, now: number | Date = Date.now()): { start: string; end: string; label: string } {
  const d = new Date(now);
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return { start: iso(start), end: iso(end), label: start.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) };
}

export function periodRange(period: BudgetData['period'], at: number | Date = Date.now()): { start: string; end: string } {
  const now = new Date(at);
  if (period === 'weekly') {
    const s = new Date(now);
    s.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    const e = new Date(s);
    e.setDate(s.getDate() + 6);
    return { start: iso(s), end: iso(e) };
  }
  if (period === 'yearly') return { start: `${now.getFullYear()}-01-01`, end: `${now.getFullYear()}-12-31` };
  return monthRange(0, now);
}

/** Signed balance: opening + income − expense ± transfers. Credit cards show what you owe as negative. */
export function accountBalance(os: LifeOSContext, account: ObjectRecord<AccountData>): number {
  const inc = os.records.aggregate('transaction', { filter: { and: [{ field: 'data.accountId', op: 'eq', value: account.id }, { field: 'data.kind', op: 'eq', value: 'income' }] } }, { sum: ['data.amount'] })['sum_data.amount'];
  const exp = os.records.aggregate('transaction', { filter: { and: [{ field: 'data.accountId', op: 'eq', value: account.id }, { field: 'data.kind', op: 'eq', value: 'expense' }] } }, { sum: ['data.amount'] })['sum_data.amount'];
  const out = os.records.aggregate('transaction', { filter: { and: [{ field: 'data.accountId', op: 'eq', value: account.id }, { field: 'data.kind', op: 'eq', value: 'transfer' }] } }, { sum: ['data.amount'] })['sum_data.amount'];
  const inn = os.records.aggregate('transaction', { filter: { and: [{ field: 'data.toAccountId', op: 'eq', value: account.id }, { field: 'data.kind', op: 'eq', value: 'transfer' }] } }, { sum: ['data.amount'] })['sum_data.amount'];
  return (account.data.openingBalance ?? 0) + inc - exp - out + inn;
}

export function netWorth(os: LifeOSContext): { total: number; assets: number; liabilities: number; accounts: Array<{ account: ObjectRecord<AccountData>; balance: number }> } {
  const accounts = os.records.query<AccountData>('account');
  const rows = accounts.map((a) => ({ account: a, balance: accountBalance(os, a) }));
  let assets = 0;
  let liabilities = 0;
  for (const r of rows) {
    if (r.account.data.includeInNetWorth === false) continue;
    if (r.balance >= 0) assets += r.balance;
    else liabilities += -r.balance;
  }
  return { total: assets - liabilities, assets, liabilities, accounts: rows };
}

export function spendInRange(os: LifeOSContext, start: string, end: string, category?: string): number {
  const and = [{ field: 'data.kind', op: 'eq' as const, value: 'expense' }, { field: 'data.date', op: 'gte' as const, value: start }, { field: 'data.date', op: 'lte' as const, value: end }];
  if (category) and.push({ field: 'data.category', op: 'eq', value: category });
  return os.records.aggregate('transaction', { filter: { and } }, { sum: ['data.amount'] })['sum_data.amount'];
}

export function incomeInRange(os: LifeOSContext, start: string, end: string): number {
  return os.records.aggregate('transaction', { filter: { and: [{ field: 'data.kind', op: 'eq', value: 'income' }, { field: 'data.date', op: 'gte', value: start }, { field: 'data.date', op: 'lte', value: end }] } }, { sum: ['data.amount'] })['sum_data.amount'];
}

export function spendByCategory(os: LifeOSContext, start: string, end: string) {
  return os.records.groupBy('transaction', { filter: { and: [{ field: 'data.kind', op: 'eq', value: 'expense' }, { field: 'data.date', op: 'gte', value: start }, { field: 'data.date', op: 'lte', value: end }] } }, 'data.category', { sum: ['data.amount'] }).map((g) => ({ category: g.key ?? 'other', total: g.values['sum_data.amount'], count: g.values.count }));
}

export function dailySpend(os: LifeOSContext, start: string, end: string): Array<{ date: string; total: number }> {
  const rows = os.records.groupBy('transaction', { filter: { and: [{ field: 'data.kind', op: 'eq', value: 'expense' }, { field: 'data.date', op: 'gte', value: start }, { field: 'data.date', op: 'lte', value: end }] } }, 'data.date', { sum: ['data.amount'] });
  const map = new Map(rows.map((r) => [r.key, r.values['sum_data.amount']]));
  const out: Array<{ date: string; total: number }> = [];
  const d = new Date(start);
  const e = new Date(end);
  while (d <= e) {
    const k = iso(d);
    out.push({ date: k, total: map.get(k) ?? 0 });
    d.setDate(d.getDate() + 1);
  }
  return out;
}

export function budgetStatus(os: LifeOSContext, budget: ObjectRecord<BudgetData>, now: number | Date = Date.now()) {
  const { start, end } = periodRange(budget.data.period, now);
  const spent = spendInRange(os, start, end, budget.data.category);
  return { spent, limit: budget.data.amount, progress: budget.data.amount ? spent / budget.data.amount : 0, remaining: budget.data.amount - spent };
}

/**
 * Auto-post (on by default per subscription): for each active subscription
 * whose billing date has passed, file the expense and mark its renewal cycle
 * done — which rolls the cycle and writes the next billing date back. With
 * auto-post off nothing happens: the renewal stays due in Upkeep until the
 * user marks it paid.
 */
export function postDueSubscriptions(os: LifeOSContext, today = iso(new Date())): number {
  const subs = os.records.query<SubscriptionData>('subscription', { filter: { and: [{ field: 'status', op: 'eq', value: 'active' }, { field: 'data.nextBillingAt', op: 'lte', value: today }] } });
  let n = 0;
  for (const s of subs) {
    if (s.data.autoPost === false) continue;
    const renewal = os.cycles.forEntity(s.id).find((c) => c.template === 'subscription.renewal');
    let next = s.data.nextBillingAt;
    let guard = 0;
    while (next <= today && guard++ < 24) {
      const tx = os.records.create<TransactionData>({ object: 'transaction', data: { amount: s.data.amount, kind: 'expense', category: s.data.category || 'subscriptions', accountId: s.data.accountId, merchant: s.data.name, date: next, currency: s.data.currency, note: 'Auto-posted subscription' } }, 'automation');
      os.links.link(tx.id, s.id, 'subscription', {}, 'automation');
      n++;
      if (renewal) {
        os.cycles.markDone(renewal.id, { at: new Date(`${next}T09:00:00`).getTime(), cost: s.data.amount, note: 'Auto-posted' }, 'automation');
        const due = os.cycles.get(renewal.id)?.nextDueAt;
        next = due != null ? iso(new Date(due)) : iso(new Date(nextOccurrence(s.data.rrule, new Date(next).getTime(), new Date(next).getTime())));
      } else {
        next = iso(new Date(nextOccurrence(s.data.rrule, new Date(next).getTime(), new Date(next).getTime())));
      }
    }
    if (os.records.get<SubscriptionData>(s.id)?.data.nextBillingAt !== next) os.records.update(s.id, { data: { nextBillingAt: next } }, 'automation');
  }
  return n;
}

