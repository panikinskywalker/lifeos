import type { LifeOSContext } from '@core/registry/context';
import type { ObjectRecord } from '@core/domain/types';
import { nextOccurrence } from '@core/automation/recurrence';
import type { AccountData, InvestmentData, SubscriptionData, TransactionData } from './types';
import { categoryTargets } from './categories';
import { incomeSql, MONEY_KINDS_SQL, spentSql } from '@core/dashboard/money';

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

/**
 * Signed balance (docs/MODEL.md, Balances follow the bank): opening + money in
 * − money out. In is income, transfers in and redemptions (an investment into
 * the account); out is spending, transfers out and buys. Credit cards show what
 * you owe as negative. When the bank has stated the balance (a text, or Set
 * balance), that is the start instead, and only payments after it are added:
 * dated after its day, or that day and heard after it.
 */
export function accountBalance(os: LifeOSContext, account: ObjectRecord<AccountData>): number {
  const d = account.data;
  const known = typeof d.knownBalance === 'number' && d.knownOn ? { on: d.knownOn, at: d.knownAt ?? 0 } : null;
  const j = (k: string) => `json_extract(r.data,'$.${k}')`;
  const heard = `COALESCE((SELECT q.received_at FROM ingest_queue q WHERE q.id = ${j('sourceRef')}), r.created_at)`;
  const after = known ? `AND (${j('date')} > ? OR (${j('date')} = ? AND ${heard} > ?))` : '';
  const row = os.db.get<{ i: number | null; o: number | null }>(
    `SELECT SUM(CASE WHEN ${j('accountId')}=? AND ${j('kind')}='income' THEN ${j('amount')} WHEN ${j('toAccountId')}=? AND ${j('kind')} IN ('transfer','investment') THEN ${j('amount')} ELSE 0 END) AS i,
            SUM(CASE WHEN ${j('accountId')}=? AND ${j('kind')} IN ('expense','transfer','investment') THEN ${j('amount')} ELSE 0 END) AS o
       FROM records r WHERE r.object='transaction' AND r.deleted_at IS NULL ${after}`,
    [account.id, account.id, account.id, ...(known ? [known.on, known.on, known.at] : [])],
  );
  const start = known ? d.knownBalance! : (d.openingBalance ?? 0);
  return start + (row?.i ?? 0) - (row?.o ?? 0);
}

/** A card's uses as pills ("Shopping, Forex" → ["Shopping", "Forex"]). */
export const cardUses = (useFor?: string): string[] => (useFor ?? '').split(',').map((u) => u.trim()).filter(Boolean);

/** You told it what the bank shows: that is the balance from now on (Set balance, Reconcile). */
export function setBalance(os: LifeOSContext, accountId: string, balance: number, now = Date.now()): { knownBalance?: number; knownOn?: string; knownAt?: number } {
  const a = os.records.get<AccountData>(accountId);
  const before = { knownBalance: a?.data.knownBalance, knownOn: a?.data.knownOn, knownAt: a?.data.knownAt };
  const dt = new Date(now);
  const day = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  os.records.update(accountId, { data: { knownBalance: balance, knownOn: day, knownAt: now } }, 'user');
  return before;
}

/** An account's money in and out by month, oldest first (its page's columns): in is income and transfers in; out is spending, transfers and buys. Full amounts, as the bank sees them. */
export function accountFlows(os: LifeOSContext, accountId: string, months = 6, now: number | Date = Date.now()): Array<{ month: string; label: string; in: number; out: number }> {
  const ranges = Array.from({ length: months }, (_, i) => monthRange(i - months + 1, now));
  const j = (k: string) => `json_extract(data,'$.${k}')`;
  const rows = os.db.all<{ m: string; i: number; o: number }>(
    `SELECT substr(${j('date')},1,7) AS m,
       SUM(CASE WHEN (${j('accountId')}=? AND ${j('kind')}='income') OR (${j('toAccountId')}=? AND ${j('kind')} IN ('transfer','investment')) THEN ${j('amount')} ELSE 0 END) AS i,
       SUM(CASE WHEN ${j('accountId')}=? AND ${j('kind')} IN ('expense','transfer','investment') THEN ${j('amount')} ELSE 0 END) AS o
     FROM records WHERE object='transaction' AND deleted_at IS NULL AND ${j('date')} BETWEEN ? AND ? GROUP BY m`,
    [accountId, accountId, accountId, ranges[0]!.start, ranges[ranges.length - 1]!.end],
  );
  const by = new Map(rows.map((r) => [r.m, r]));
  return ranges.map((r) => ({ month: r.start.slice(0, 7), label: r.label.split(' ')[0]!.slice(0, 3), in: by.get(r.start.slice(0, 7))?.i ?? 0, out: by.get(r.start.slice(0, 7))?.o ?? 0 }));
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

/** Your share of spending in a range (MODEL layer 2): expenses at your share, less refunds. */
const MONEY_ROWS = `FROM records WHERE object='transaction' AND deleted_at IS NULL AND ${MONEY_KINDS_SQL()} AND json_extract(data,'$.date') BETWEEN ? AND ?`;

export function spendInRange(os: LifeOSContext, start: string, end: string, category?: string): number {
  const row = os.db.get<{ s: number | null }>(`SELECT SUM(${spentSql()}) AS s ${MONEY_ROWS}${category ? ` AND json_extract(data,'$.category')=?` : ''}`, category ? [start, end, category] : [start, end]);
  return Math.max(0, row?.s ?? 0);
}

/** What came in: income at your share, leaving out refunds and paybacks. */
export function incomeInRange(os: LifeOSContext, start: string, end: string): number {
  return os.db.get<{ s: number | null }>(`SELECT SUM(${incomeSql()}) AS s ${MONEY_ROWS}`, [start, end])?.s ?? 0;
}

export function spendByCategory(os: LifeOSContext, start: string, end: string) {
  return os.db
    .all<{ category: string | null; total: number; count: number }>(`SELECT json_extract(data,'$.category') AS category, SUM(${spentSql()}) AS total, SUM(json_extract(data,'$.kind')='expense') AS count ${MONEY_ROWS} GROUP BY category`, [start, end])
    .filter((g) => g.count > 0 && g.total > 0)
    .map((g) => ({ category: g.category ?? 'other', total: g.total, count: g.count }));
}

export function dailySpend(os: LifeOSContext, start: string, end: string): Array<{ date: string; total: number }> {
  const rows = os.db.all<{ day: string; total: number }>(`SELECT json_extract(data,'$.date') AS day, SUM(${spentSql()}) AS total ${MONEY_ROWS} GROUP BY day`, [start, end]);
  const map = new Map(rows.map((r) => [r.day, Math.max(0, r.total)]));
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
