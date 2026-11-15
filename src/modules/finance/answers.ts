import { parseAmount } from '@core/ai/parser';
import type { ReplyCard } from '@core/ai/cards';
import type { LifeOSContext } from '@core/registry/context';
import type { ObjectRecord } from '@core/domain/types';
import { customCategories } from './categories';
import { incomeInRange, monthRange, netWorth, spendInRange } from './lib';
import { subscriptionRunRate } from './reports';
import { spendQuery, type SpendKind, type SpendPeriod } from './spend';
import { comingUp, nextPayday } from './home';

export { nextPayday };
import { CATEGORIES, type InvestmentData, type TransactionData } from './types';

/**
 * Everyday money questions, answered on the phone (docs/MODEL.md layer 5): code
 * reads the question and works out the figure. Nothing leaves the phone. What it
 * doesn't recognise returns null and goes to the model.
 */

export type MoneyQuestion =
  | { kind: 'where' | 'income' | 'biggest'; period: SpendPeriod }
  | { kind: 'spent'; period: SpendPeriod; about: string | null }
  | { kind: 'twice' | 'bills' | 'subscriptions' | 'worth' | 'balances' | 'portfolio' }
  | { kind: 'afford'; amount: number | null };

const periodOf = (q: string): SpendPeriod =>
  /\blast month\b|\bprevious month\b/.test(q) ? 'last_month' : /\b(?:3|three) months\b|\bquarter\b/.test(q) ? '3_months' : /\b(?:this|the) year\b/.test(q) ? 'year' : /\bever\b|\ball time\b|\bin total\b/.test(q) ? 'all' : 'month';

/** "on food last month" → "food"; "at swiggy" → "swiggy". */
function aboutOf(q: string): string | null {
  const m = /\b(?:on|at|for|to)\s+(?:my\s+|the\s+)?(.+)$/.exec(q.replace(/[?.!]+$/, ''));
  if (!m) return null;
  const about = m[1]!.replace(/\b(?:this|last|previous|the)\s+(?:month|year|quarter)\b|\b(?:3|three) months\b|\bin total\b|\bso far\b|\bever\b/g, '').trim();
  return about && !/^(?:average|me|it)$/.test(about) ? about : null;
}

export function readMoneyQuestion(question: string): MoneyQuestion | null {
  const q = question.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!q || q.length > 200) return null;
  if (/\b(?:charged|billed|debited|paid|deducted)\b.*\b(?:twice|double|two times)\b|\bdouble[- ](?:charge|payment)|\bduplicate (?:charge|payment|transaction)/.test(q)) return { kind: 'twice' };
  if (/\bafford\b/.test(q)) return { kind: 'afford', amount: parseAmount(q) };
  if (/\bbills?\b.*\b(?:due|coming|upcoming|before|next|left|pay)\b|\b(?:due|left)\b.*\b(?:before|until|till)\s+(?:pay ?day|salary)\b|\bupcoming (?:bills?|payments?)\b/.test(q)) return { kind: 'bills' };
  if (/\bsubscriptions?\b/.test(q)) return { kind: 'subscriptions' };
  if (/\bnet ?worth\b|\bhow much (?:money )?(?:do i have|am i worth)\b/.test(q)) return { kind: 'worth' };
  if (/\b(?:my|account|accounts|bank)\s+balances?\b|\bin my (?:bank|accounts?)\b/.test(q)) return { kind: 'balances' };
  if (/\b(?:investments?|portfolio|sips?|mutual funds?|holdings?)\b/.test(q)) return { kind: 'portfolio' };
  if (/\b(?:biggest|largest|highest)\b.*\b(?:spends?|expenses?|payments?|purchases?)\b/.test(q)) return { kind: 'biggest', period: periodOf(q) };
  if (/\bwhere\b.*\bmoney\b|\bwhere\b.*\bwent\b|\bwhat did i spend\b(?! on )|\bspending (?:summary|breakdown)\b|\bspend(?:ing)? by category\b/.test(q)) return { kind: 'where', period: periodOf(q) };
  if (/\b(?:how much|what)\b.*\b(?:earn|earned|income|salary|came in|come in)\b|\bhow much\b.*\b(?:did i|have i) (?:get|got|receive|received)\b/.test(q)) return { kind: 'income', period: periodOf(q) };
  if (/\bhow much\b.*\b(?:spen[dt]|paid|pay)\b|\bwhat did i spend on\b/.test(q)) return { kind: 'spent', period: periodOf(q), about: aboutOf(q) };
  return null;
}

type Answer = { answer: string; card?: ReplyCard };
const shortDay = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
/** "in November", "over the last 3 months", "in 2026". */
const during = (label: string) => (label === 'All time' ? 'in all' : label.startsWith('Last') ? `over the ${label.toLowerCase()}` : `in ${label}`);
const isoOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function categoryLabel(os: LifeOSContext, value: string): string {
  return customCategories(os).find((c) => c.value === value)?.label ?? CATEGORIES.find((c) => c.value === value)?.label ?? 'Other';
}

/** "food" → the category it names, by its label's words ("rent" is Housing & Rent). */
export function categoryNamed(os: LifeOSContext, words: string): string | null {
  const all = [...CATEGORIES.map((c) => ({ value: c.value, label: c.label })), ...customCategories(os).map((c) => ({ value: c.value, label: c.label }))];
  const w = words.toLowerCase();
  return all.find((c) => c.label.toLowerCase() === w || c.label.toLowerCase().split(/[^a-z]+/).includes(w))?.value ?? null;
}

const paymentsCard = (os: LifeOSContext, title: string, items: Array<ObjectRecord<TransactionData>>): ReplyCard => ({
  kind: 'list',
  title,
  items: items.slice(0, 10).map((t) => ({ entityId: t.id, type: 'transaction', title: `${t.data.merchant ?? t.title} · ${shortDay(t.data.date)}`, value: os.format.currency(t.data.amount) })),
});

/** Against the period before: "₹2,000 less than the same days last month". */
function versus(os: LifeOSContext, total: number, prev: number | null, period: SpendPeriod): string {
  if (!prev || period === 'all') return '';
  const was = period === 'month' ? 'the same days last month' : period === 'last_month' ? 'the month before' : 'the period before';
  const diff = total - prev;
  return diff === 0 ? ` That is the same as ${was}.` : ` That is ${os.format.currency(Math.abs(diff))} ${diff > 0 ? 'more' : 'less'} than ${was}.`;
}

function where(os: LifeOSContext, period: SpendPeriod, now: Date): Answer {
  const r = spendQuery(os, { period, kind: 'spending' }, now);
  if (!r.count) return { answer: `Nothing is filed as spent ${during(r.label)}.` };
  const top = r.byCategory.slice(0, 2).map((c) => `${categoryLabel(os, c.category)} (${os.format.currency(c.total)})`);
  return {
    answer: `You spent ${os.format.currency(r.total)} across ${r.count} payment${r.count === 1 ? '' : 's'} ${during(r.label)}.${versus(os, r.total, r.prevTotal, period)} Most went on ${top.join(', then ')}.`,
    card: { kind: 'chart', title: `Where it went · ${r.label}`, bars: r.byCategory.slice(0, 8).map((c) => ({ label: categoryLabel(os, c.category), value: c.total, display: os.format.currency(c.total) })) },
  };
}

function spent(os: LifeOSContext, period: SpendPeriod, about: string | null, now: Date): Answer {
  const category = about ? categoryNamed(os, about) : null;
  const r = spendQuery(os, { period, kind: 'spending', categories: category ? [category] : undefined, search: about && !category ? about : undefined, sort: 'newest' }, now);
  const what = category ? ` on ${categoryLabel(os, category)}` : about ? ` at ${about.charAt(0).toUpperCase()}${about.slice(1)}` : '';
  if (!r.count) return { answer: `Nothing is filed as spent${what} ${during(r.label)}.` };
  return {
    answer: `${os.format.currency(r.total)}${what} ${during(r.label)}, across ${r.count} payment${r.count === 1 ? '' : 's'}.${versus(os, r.total, r.prevTotal, period)}`,
    card: paymentsCard(os, `The payments behind it${r.count > 10 ? ` · latest 10 of ${r.count}` : ''}`, r.items),
  };
}

function listed(os: LifeOSContext, kind: SpendKind, period: SpendPeriod, sort: 'newest' | 'largest', now: Date): Answer {
  const r = spendQuery(os, { period, kind, sort }, now);
  if (!r.count) return { answer: `Nothing is filed ${during(r.label)}.` };
  if (kind === 'income') return { answer: `${os.format.currency(r.total)} came in ${during(r.label).replace(/^in /, 'during ')}.${versus(os, r.total, r.prevTotal, period)}`, card: paymentsCard(os, 'What came in', r.items) };
  const top = r.items[0]!;
  return { answer: `The biggest ${during(r.label)}: ${top.data.merchant ?? top.title}, ${os.format.currency(top.data.amount)} on ${shortDay(top.data.date)}.`, card: paymentsCard(os, 'Biggest spends', r.items.slice(0, 5)) };
}

/** Payday: the day of the month of your latest Salary (null until there is one). */
function spendable(os: LifeOSContext): number {
  return netWorth(os).accounts.filter((a) => ['bank', 'cash', 'wallet'].includes(a.account.data.kind)).reduce((n, a) => n + a.balance, 0);
}

function bills(os: LifeOSContext, now: Date): Answer {
  // One list with Money home's Coming up: card bills, renewals and SIPs before payday.
  const { payday, items } = comingUp(os, now);
  const total = items.reduce((n, s) => n + s.amount, 0);
  const have = spendable(os);
  const when = payday ? `before payday (${shortDay(payday)})` : 'by the end of the month, since no salary is filed yet to say when payday is';
  const parts = [
    items.length ? `${items.length} bill${items.length === 1 ? '' : 's'} due ${when}: ${os.format.currency(total)}.` : `Nothing is due ${when}.`,
    `You have ${os.format.currency(have)} in bank, cash and wallets, so about ${os.format.currency(have - total)} is left after ${items.length > 1 ? 'them' : items.length ? 'it' : 'that'}, before your everyday spending.`,
  ];
  return {
    answer: parts.join(' '),
    card: items.length ? { kind: 'list', title: 'Due', items: items.map((s) => ({ entityId: s.id, type: s.object, title: `${s.title} · ${s.late ? 'late' : shortDay(s.due)}`, value: os.format.currency(s.amount) })) } : undefined,
  };
}

/** Same payee, same amount, a day apart at most, ₹100 or more, in the last 90 days. */
export function chargedTwice(os: LifeOSContext, now = new Date()): Array<Array<ObjectRecord<TransactionData>>> {
  const since = isoOf(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 90));
  const out = os.records.query<TransactionData>('transaction', { filter: { and: [{ field: 'data.kind', op: 'eq', value: 'expense' }, { field: 'data.date', op: 'gte', value: since }] } }, { limit: 5000 });
  const groups = new Map<string, Array<ObjectRecord<TransactionData>>>();
  for (const t of out) {
    if (t.data.amount < 100) continue;
    const key = `${(t.data.merchant ?? t.title).toLowerCase()}|${t.data.amount}`;
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  const DAY = 86_400_000;
  const near = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) <= DAY;
  return [...groups.values()].map((g) => g.sort((a, b) => a.data.date.localeCompare(b.data.date))).filter((g) => g.some((t, i) => i > 0 && near(g[i - 1]!.data.date, t.data.date)));
}

function twice(os: LifeOSContext, now: Date): Answer {
  const found = chargedTwice(os, now);
  if (!found.length) return { answer: 'Nothing looks charged twice in the last 90 days.' };
  const first = found[0]![0]!;
  return {
    answer: `${found.length === 1 ? 'One thing looks' : `${found.length} things look`} charged twice: ${first.data.merchant ?? first.title}, ${os.format.currency(first.data.amount)}${found.length > 1 ? ', and more below' : ''}. They could be two real purchases, so check them against your statement.`,
    card: paymentsCard(os, 'Possibly charged twice', found.flat()),
  };
}

function afford(os: LifeOSContext, amount: number | null, now: Date): Answer {
  const months = [1, 2, 3].map((k) => monthRange(-k, now)).map((m) => ({ inn: incomeInRange(os, m.start, m.end), out: spendInRange(os, m.start, m.end) })).filter((m) => m.inn || m.out);
  const have = spendable(os);
  const ask = amount ? '' : ' Tell me what it costs and I will compare.';
  if (!months.some((m) => m.inn)) return { answer: `You have ${os.format.currency(have)} in bank, cash and wallets. No income is filed for the last 3 months, so I can't say what is left in a normal month.${ask}` };
  const inn = months.reduce((n, m) => n + m.inn, 0) / months.length;
  const out = months.reduce((n, m) => n + m.out, 0) / months.length;
  const left = inn - out;
  const weeks = amount && left > 0 ? Math.max(1, Math.round((amount / left) * 4.3)) : 0;
  const share = !amount ? '' : weeks ? ` ${os.format.currency(amount)} is about ${weeks} week${weeks > 1 ? 's' : ''} of that.` : ` At that rate nothing is left over, so ${os.format.currency(amount)} would come out of savings.`;
  return { answer: `On your last ${months.length} month${months.length === 1 ? '' : 's'}: ${os.format.currency(Math.round(inn))} comes in and ${os.format.currency(Math.round(out))} goes out, so about ${os.format.currency(Math.round(left))} is left each month.${share} You have ${os.format.currency(have)} in bank, cash and wallets now.${ask}` };
}

function subscriptions(os: LifeOSContext): Answer {
  const rr = subscriptionRunRate(os);
  if (!rr.rows.length) return { answer: 'No active subscriptions are filed.' };
  return {
    answer: `${rr.rows.length} active, costing ${os.format.currency(Math.round(rr.monthly))} a month (${os.format.currency(Math.round(rr.yearly))} a year).`,
    card: { kind: 'list', title: 'Subscriptions, a month', items: rr.rows.map((r) => ({ entityId: r.sub.id, type: 'subscription', title: r.sub.title, value: os.format.currency(Math.round(r.perMonth)) })) },
  };
}

function worth(os: LifeOSContext): Answer {
  const n = netWorth(os);
  return { answer: `${os.format.currency(n.total)}: ${os.format.currency(n.assets)} in accounts${n.investments ? ` and ${os.format.currency(n.investments)} in investments` : ''}${n.liabilities ? `, less ${os.format.currency(n.liabilities)} you owe` : ''}.`, card: { kind: 'number', label: 'Net worth', value: os.format.currency(n.total) } };
}

function balances(os: LifeOSContext): Answer {
  const rows = netWorth(os).accounts;
  if (!rows.length) return { answer: 'No accounts are filed yet.' };
  return {
    answer: `${os.format.currency(spendable(os))} in bank, cash and wallets. These are worked out from what is filed, so they can differ from the bank's own figure.`,
    card: { kind: 'list', title: 'Accounts', items: rows.map((a) => ({ entityId: a.account.id, type: 'account', title: a.account.title, value: os.format.currency(a.balance) })) },
  };
}

function portfolio(os: LifeOSContext): Answer {
  const held = os.registry.objects.has('investment') ? os.records.query<InvestmentData>('investment', { filter: { and: [{ field: 'status', op: 'neq', value: 'sold' }] } }, { limit: 500 }) : [];
  if (!held.length) {
    const accounts = netWorth(os).accounts.filter((a) => a.account.data.kind === 'investment');
    if (!accounts.length) return { answer: 'No investments are filed yet.' };
    return {
      answer: `${os.format.currency(accounts.reduce((n, a) => n + a.balance, 0))} in investment accounts. No holdings are filed in them yet, so I can't say how each is doing.`,
      card: { kind: 'list', title: 'Investment accounts', items: accounts.map((a) => ({ entityId: a.account.id, type: 'account', title: a.account.title, value: os.format.currency(a.balance) })) },
    };
  }
  const value = (i: ObjectRecord<InvestmentData>) => i.data.currentValue ?? i.data.invested;
  const put = held.reduce((n, i) => n + i.data.invested, 0);
  const now = held.reduce((n, i) => n + value(i), 0);
  return {
    answer: `${held.length} holding${held.length === 1 ? '' : 's'} worth ${os.format.currency(now)}, on ${os.format.currency(put)} put in. Where no current value is filed, it counts what you put in.`,
    card: { kind: 'list', title: 'Investments', items: held.map((i) => ({ entityId: i.id, type: 'investment', title: i.title, value: os.format.currency(value(i)) })) },
  };
}

export function answerMoney(os: LifeOSContext, q: MoneyQuestion, now = new Date()): Answer {
  switch (q.kind) {
    case 'where':
      return where(os, q.period, now);
    case 'spent':
      return spent(os, q.period, q.about, now);
    case 'income':
      return listed(os, 'income', q.period, 'newest', now);
    case 'biggest':
      return listed(os, 'spending', q.period, 'largest', now);
    case 'bills':
      return bills(os, now);
    case 'twice':
      return twice(os, now);
    case 'afford':
      return afford(os, q.amount, now);
    case 'subscriptions':
      return subscriptions(os);
    case 'worth':
      return worth(os);
    case 'balances':
      return balances(os);
    case 'portfolio':
      return portfolio(os);
  }
}
