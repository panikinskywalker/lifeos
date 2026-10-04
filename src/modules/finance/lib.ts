import type { LifeOSContext } from '@core/registry/context';
import type { ObjectRecord } from '@core/domain/types';
import { nextOccurrence } from '@core/automation/recurrence';
import type { AccountData, InvestmentData, SubscriptionData, TransactionData } from './types';
import { categoryTargets } from './categories';

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function monthRange(offset = 0, now: number | Date = Date.now()): { start: string; end: string; label: string } {
  const d = new Date(now);
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return { start: iso(start), end: iso(end), label: start.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) };
}

export function periodRange(period: 'monthly' | 'weekly' | 'yearly', at: number | Date = Date.now()): { start: string; end: string } {
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
  // A buy or SIP leaves the account it was paid from (R1: kind 'investment'); the money shows up again as the holding's value.
  const inv = os.records.aggregate('transaction', { filter: { and: [{ field: 'data.accountId', op: 'eq', value: account.id }, { field: 'data.kind', op: 'eq', value: 'investment' }] } }, { sum: ['data.amount'] })['sum_data.amount'];
  return (account.data.openingBalance ?? 0) + inc - exp - out + inn - inv;
}

export function netWorth(os: LifeOSContext): { total: number; assets: number; liabilities: number; investments: number; accounts: Array<{ account: ObjectRecord<AccountData>; balance: number }>; holdings: Array<{ investment: ObjectRecord<InvestmentData>; value: number }> } {
  const accounts = os.records.query<AccountData>('account');
  const rows = accounts.map((a) => ({ account: a, balance: accountBalance(os, a) }));
  let assets = 0;
  let liabilities = 0;
  for (const r of rows) {
    if (r.account.data.includeInNetWorth === false) continue;
    if (r.balance >= 0) assets += r.balance;
    else liabilities += -r.balance;
  }
  // R1: holdings count at their latest known value (else what was put in).
  const holdings = os.registry.objects.has('investment')
    ? os.records.query<InvestmentData>('investment', { filter: { and: [{ field: 'status', op: 'neq', value: 'sold' }] } }).map((i) => ({ investment: i, value: i.data.currentValue ?? i.data.invested ?? 0 }))
    : [];
  const investments = holdings.reduce((n, h) => n + h.value, 0);
  return { total: assets + investments - liabilities, assets, liabilities, investments, accounts: rows, holdings };
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

/** This month's spend in a category against its target (R1: targets live on categories, see categories.ts). */
export function targetStatus(os: LifeOSContext, category: string, now: number | Date = Date.now()) {
  const limit = categoryTargets(os)[category] ?? 0;
  const { start, end } = monthRange(0, now);
  const spent = spendInRange(os, start, end, category);
  return { category, spent, limit, progress: limit ? spent / limit : 0, remaining: limit - spent };
}

/** Every category with a target, this month. */
export function targetStatuses(os: LifeOSContext, now: number | Date = Date.now()) {
  return Object.keys(categoryTargets(os)).map((c) => targetStatus(os, c, now));
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

/**
 * R1: an account's institution is an Organisation (kind 'bank'). Accounts made
 * before that carry the bank as free text; fold each into a record and link
 * it, once. Returns how many accounts were linked.
 */
export function foldInstitutions(os: LifeOSContext): number {
  if (!os.registry.objects.has('org')) return 0;
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  let n = 0;
  for (const a of os.records.query<AccountData>('account', {}, { limit: 500 })) {
    const name = a.data.institution?.trim();
    if (!name || a.data.institutionId) continue;
    const orgs = os.records.query<{ kind: string }>('org', {}, { limit: 2000 });
    const hit = orgs.find((o) => norm(o.title) === norm(name)) ?? orgs.find((o) => norm(o.title).startsWith(norm(name)) || norm(name).startsWith(norm(o.title)));
    const org = hit ?? os.records.create({ object: 'org', title: name, data: { kind: 'bank' } }, 'system');
    if (hit && hit.data.kind !== 'bank' && hit.data.kind === 'other') os.records.update(hit.id, { data: { kind: 'bank' } }, 'system');
    os.records.update<AccountData>(a.id, { data: { institutionId: org.id } as Partial<AccountData> }, 'system');
    n++;
  }
  return n;
}
