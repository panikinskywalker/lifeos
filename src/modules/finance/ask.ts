import type { LifeOSContext } from '@core/registry/context';
import type { ObjectRecord } from '@core/domain/types';
import type { ReplyCard } from '@core/ai/cards';
import { incomeOf, spentOf } from '@core/dashboard/money';
import { incomeInRange, monthRange, spendInRange } from './lib';
import { spendQuery, type SpendPeriod } from './spend';
import { comingUp, type Upcoming } from './home';
import { answerMoney, categoryNamed, chargedTwice, readMoneyQuestion } from './answers';
import { categoryOf, type SubscriptionData, type TransactionData } from './types';

/**
 * Ask Money (docs/MODEL.md, Ask Money, built 15 Nov): every figure is a money
 * query the phone works out, with the payments behind it. On-phone answers and
 * a model's answers take the same shape: a sentence, one block, its query.
 */

export type Measure = 'spent' | 'came_in' | 'bills';
export type Split = 'day' | 'week' | 'month' | 'category' | 'payee';
export type BlockKind = 'number' | 'bars' | 'line' | 'calendar' | 'list';
export const BLOCKS: BlockKind[] = ['number', 'bars', 'line', 'calendar', 'list'];
export const PERIODS: SpendPeriod[] = ['month', 'last_month', '3_months', 'year', 'all'];

export interface MoneyQuery {
  measure: Measure;
  period: SpendPeriod;
  by?: Split;
  /** Only these categories. */
  only?: string[];
  /** Only payments to (or from) a payee whose name has these words. */
  payee?: string;
  /** Leave out these categories ("leave out rent"). */
  leaveOut?: string[];
  sort?: 'newest' | 'largest';
}

export interface Figures {
  total: number;
  /** "November", "Last 3 months". */
  label: string;
  /** The same days of the period before, when there is one. */
  before: number | null;
  groups: Array<{ key: string; label: string; value: number }>;
  /** The payments behind the total; they add up to it. */
  rows: Array<ObjectRecord<TransactionData>>;
  /** For bills: what is due. */
  bills: Upcoming[];
}

const pad = (n: number) => String(n).padStart(2, '0');
const isoOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const day = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00`);
const shortDay = (iso: string) => day(iso).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
const labelOf = (c: string) => categoryOf(c).label;
const payeeOf = (t: ObjectRecord<TransactionData>) => t.title || t.data.merchant || '';

/** Work a money query out on the phone. */
export function runQuery(os: LifeOSContext, q: MoneyQuery, now = new Date()): Figures {
  if (q.measure === 'bills') {
    const c = comingUp(os, now);
    return { total: c.items.reduce((n, i) => n + i.amount, 0), label: c.payday ? 'Before payday' : 'This month', before: null, groups: c.items.map((i) => ({ key: i.key, label: i.title, value: i.amount })), rows: [], bills: c.items };
  }
  const kind = q.measure === 'came_in' ? 'income' : 'spending';
  const r = spendQuery(os, { period: q.period, kind, categories: q.only?.length ? q.only : undefined, search: q.payee || undefined, sort: q.sort ?? 'newest' }, now);
  const leave = new Set(q.leaveOut ?? []);
  const value = (t: TransactionData) => (kind === 'income' ? incomeOf(t) : spentOf(t));
  const rows = r.items.filter((t) => !leave.has(t.data.category ?? 'other') && value(t.data) !== 0);
  const total = Math.round(rows.reduce((n, t) => n + value(t.data), 0) * 100) / 100;
  const by = new Map<string, { label: string; value: number }>();
  const add = (key: string, label: string, v: number) => by.set(key, { label, value: (by.get(key)?.value ?? 0) + v });
  for (const t of rows) {
    const d = day(t.data.date);
    const v = value(t.data);
    if (q.by === 'category') add(t.data.category ?? 'other', labelOf(t.data.category ?? 'other'), v);
    else if (q.by === 'payee') add(payeeOf(t).toLowerCase(), payeeOf(t), v);
    else if (q.by === 'day') add(t.data.date.slice(0, 10), String(d.getDate()), v);
    else if (q.by === 'month') add(t.data.date.slice(0, 7), d.toLocaleDateString('en-IN', { month: 'short' }), v);
    else if (q.by === 'week') {
      // Within a month: 1 to 7, 8 to 14, 15 to 21, 22 on (as the design); longer: the week's Monday.
      if (q.period === 'month' || q.period === 'last_month') {
        const w = Math.min(3, Math.floor((d.getDate() - 1) / 7));
        add(`w${w}`, ['1 to 7', '8 to 14', '15 to 21', '22 on'][w]!, v);
      } else {
        const mon = new Date(d);
        mon.setDate(d.getDate() - ((d.getDay() + 6) % 7));
        add(isoOf(mon), mon.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }), v);
      }
    }
  }
  if (q.by === 'week' && (q.period === 'month' || q.period === 'last_month')) {
    const last = q.period === 'month' ? Math.min(3, Math.floor((now.getDate() - 1) / 7)) : 3;
    for (let w = 0; w <= last; w++) if (!by.has(`w${w}`)) by.set(`w${w}`, { label: ['1 to 7', '8 to 14', '15 to 21', '22 on'][w]!, value: 0 });
  }
  const time = q.by === 'day' || q.by === 'week' || q.by === 'month';
  const groups = [...by].map(([key, g]) => ({ key, ...g })).sort((a, b) => (time ? a.key.localeCompare(b.key) : b.value - a.value));
  const before = leave.size ? null : r.prevTotal;
  return { total, label: r.label, before, groups, rows, bills: [] };
}

/** "in November", "over the last 3 months". */
const during = (label: string) => (label === 'All time' ? 'in all' : label.startsWith('Last') ? `over the ${label.toLowerCase()}` : `in ${label}`);
const words = (cats: string[]) => cats.map(labelOf).join(' and ');

/** A sentence for a query's figures, in the phone's own words. */
export function sayQuery(os: LifeOSContext, q: MoneyQuery, f: Figures): string {
  const money = (n: number) => os.format.currency(Math.round(n));
  if (q.measure === 'bills') return f.bills.length ? `${f.bills.length} due ${f.label.toLowerCase()}: ${money(f.total)}.` : `Nothing is due ${f.label.toLowerCase()}.`;
  const what = [q.only?.length ? ` on ${words(q.only)}` : '', q.payee ? ` at ${q.payee}` : ''].join('');
  const leave = q.leaveOut?.length ? `, leaving out ${words(q.leaveOut)}` : '';
  if (!f.rows.length) return `Nothing is filed as ${q.measure === 'came_in' ? 'come in' : 'spent'}${what} ${during(f.label)}${leave}.`;
  const head = q.measure === 'came_in' ? `${money(f.total)} came in ${during(f.label)}${leave}.` : `${money(f.total)} spent${what} ${during(f.label)}${leave}, across ${f.rows.length} payment${f.rows.length === 1 ? '' : 's'}.`;
  const top = q.by === 'category' && f.groups[0] ? ` Most went on ${f.groups[0].label} (${money(f.groups[0].value)}).` : '';
  return head + top;
}

export interface AskBlock {
  kind: BlockKind;
  title: string;
  query: MoneyQuery;
}

export interface AskAnswer {
  text: string;
  /** One block: a live money query, a card from the phone's answers, or the Anything wrong list. */
  block?: AskBlock | { kind: 'card'; card: ReplyCard } | { kind: 'odd' };
  source: 'phone' | 'model';
  /** Payments a model saw (payee, amount, date, category). */
  sent?: number;
}

/** An answer for a query alone (a chip, a kept view opened). */
export function answerQuery(os: LifeOSContext, q: MoneyQuery, kind: BlockKind, title: string, now = new Date()): AskAnswer {
  return { text: sayQuery(os, q, runQuery(os, q, now)), block: { kind, title, query: q }, source: 'phone' };
}

/** Follow-ups worked out on the phone: by week, only the top category, leave out rent, compare. */
/** A name for a query worth keeping: "Weekly spend without rent", "Food & Drink". */
export function titleOf(q: MoneyQuery): string {
  const what = q.only?.length ? words(q.only) : q.payee ? q.payee : q.measure === 'came_in' ? 'Money in' : q.measure === 'bills' ? 'Bills' : 'Spend';
  const by = q.by === 'week' ? 'Weekly ' : q.by === 'day' ? 'Daily ' : q.by === 'month' ? 'Monthly ' : '';
  const name = by ? `${by}${what.charAt(0).toLowerCase()}${what.slice(1)}` : what;
  return `${name}${q.leaveOut?.includes('housing') ? ' without rent' : q.leaveOut?.length ? ` without ${words(q.leaveOut)}` : ''}`;
}

export function chipsFor(q: MoneyQuery, f: Figures): Array<{ label: string; title: string; query: MoneyQuery; kind: BlockKind } | { label: string; compare: MoneyQuery }> {
  if (q.measure === 'bills') return [];
  const out: Array<{ label: string; title: string; query: MoneyQuery; kind: BlockKind } | { label: string; compare: MoneyQuery }> = [];
  const chip = (label: string, query: MoneyQuery, kind: BlockKind) => out.push({ label, title: titleOf(query), query, kind });
  if (q.period === 'month') out.push({ label: `Compare with ${monthRange(-1).label.split(' ')[0]}`, compare: q });
  const top = q.by === 'category' ? f.groups[0] : undefined;
  if (top && !q.only?.length) chip(`Only ${top.label}`, { ...q, only: [top.key], by: undefined }, 'list');
  if (q.by !== 'week') chip('Show it by week', { ...q, by: 'week' }, 'bars');
  const hasRent = f.rows.some((t) => t.data.category === 'housing');
  if (hasRent && !q.leaveOut?.includes('housing')) chip('Leave out rent', { ...q, leaveOut: [...(q.leaveOut ?? []), 'housing'] }, q.by === 'week' || q.by === 'category' ? 'bars' : 'list');
  return out;
}

/** This period against the one before; says so when the payments don't go back that far. */
export function compare(os: LifeOSContext, q: MoneyQuery, now = new Date()): AskAnswer {
  const money = (n: number) => os.format.currency(Math.round(n));
  const first = os.records.query<TransactionData>('transaction', { sort: [{ field: 'data.date', dir: 'asc' }] }, { limit: 1 })[0]?.data.date;
  const prev = monthRange(-1, now);
  // Payments from the first week of last month are enough to compare (2 Oct for October).
  if (!first || first > isoOf(new Date(day(prev.start).getTime() + 6 * DAY))) return { text: first ? `Your payments only go back to ${shortDay(first)}, so there is no ${prev.label.split(' ')[0]} to compare with yet.` : 'Nothing is filed yet to compare.', source: 'phone' };
  const f = runQuery(os, q, now);
  const last = runQuery(os, { ...q, period: 'last_month' }, now);
  const diff = f.before != null ? f.total - f.before : null;
  return {
    text: `${money(f.total)} so far in ${f.label}${diff != null ? `, ${money(Math.abs(diff))} ${diff > 0 ? 'more' : 'less'} than the same days in ${last.label} (${money(f.before!)})` : ''}. ${last.label} came to ${money(last.total)} in all.`,
    block: { kind: 'bars', title: `${f.label} by week`, query: { ...q, by: 'week' } },
    source: 'phone',
  };
}

/* ------------------------------------------------------------------ */
/* Anything wrong                                                       */
/* ------------------------------------------------------------------ */

export const ODD_OK_KEY = 'finance.oddOk';
const DAY = 86_400_000;

export interface Odd {
  twice: Array<{ key: string; txs: Array<ObjectRecord<TransactionData>> }>;
  fees: Array<{ key: string; tx: ObjectRecord<TransactionData> }>;
  prices: Array<{ key: string; sub: ObjectRecord<SubscriptionData>; from: number; to: number; since: string }>;
}

/** Charged twice, a new fee, a price that changed in the last 30 days; less what you said is fine. */
export function oddThings(os: LifeOSContext, now = new Date()): Odd {
  const ok = new Set(os.settings.get<string[]>(ODD_OK_KEY, []));
  const twice = chargedTwice(os, now).map((txs) => ({ key: `twice:${txs.map((t) => t.id).sort().join(',')}`, txs })).filter((x) => !ok.has(x.key));
  const since = isoOf(new Date(now.getTime() - 30 * DAY));
  const fees = os.records
    .query<TransactionData>('transaction', { filter: { and: [{ field: 'data.kind', op: 'eq', value: 'expense' }, { field: 'data.category', op: 'eq', value: 'fees' }, { field: 'data.date', op: 'gte', value: since }] } }, { limit: 500 })
    .filter((t) => {
      const name = payeeOf(t).toLowerCase();
      const from = isoOf(new Date(day(t.data.date).getTime() - 183 * DAY));
      const paidBefore = os.records.query<TransactionData>('transaction', { filter: { and: [{ field: 'data.kind', op: 'eq', value: 'expense' }, { field: 'data.date', op: 'gte', value: from }, { field: 'data.date', op: 'lt', value: t.data.date }] } }, { limit: 5000 }).some((x) => payeeOf(x).toLowerCase() === name);
      return !paidBefore;
    })
    .map((tx) => ({ key: `fee:${tx.id}`, tx }))
    .filter((x) => !ok.has(x.key));
  const prices = (os.registry.objects.has('subscription') ? os.records.query<SubscriptionData>('subscription', { filter: { and: [{ field: 'status', op: 'eq', value: 'active' }] } }, { limit: 1000 }) : []).flatMap((sub) => {
    const h = sub.data.priceHistory ?? [];
    const last = h[h.length - 1];
    const prev = h[h.length - 2];
    if (!last || !prev || last.from < since) return [];
    const key = `price:${sub.id}:${last.from}`;
    return ok.has(key) ? [] : [{ key, sub, from: prev.amount, to: last.amount, since: last.from }];
  });
  // A bill that crept up over the year: 10% or more above what it was 12 months ago (or when first seen this year).
  const yearAgo = isoOf(new Date(now.getTime() - 365 * DAY));
  const crept = (os.registry.objects.has('subscription') ? os.records.query<SubscriptionData>('subscription', { filter: { and: [{ field: 'status', op: 'eq', value: 'active' }] } }, { limit: 1000 }) : []).flatMap((sub) => {
    if (prices.some((p) => p.sub.id === sub.id)) return [];
    const h = [...(sub.data.priceHistory ?? [])].sort((a, b) => a.from.localeCompare(b.from));
    const cur = h[h.length - 1];
    const base = [...h].reverse().find((x) => x.from <= yearAgo) ?? h.find((x) => x.from > yearAgo);
    if (!cur || !base || cur === base || cur.amount < base.amount * 1.1) return [];
    const key = `crept:${sub.id}:${base.from}:${cur.amount}`;
    return ok.has(key) ? [] : [{ key, sub, from: base.amount, to: cur.amount, since: base.from }];
  });
  return { twice, fees, prices: [...prices, ...crept] };
}

/** Card and loan interest charged this calendar year (fees that say interest or finance charges). */
export function interestThisYear(os: LifeOSContext, now = new Date()): Array<ObjectRecord<TransactionData>> {
  return os.records
    .query<TransactionData>('transaction', { filter: { and: [{ field: 'data.kind', op: 'eq', value: 'expense' }, { field: 'data.date', op: 'gte', value: `${now.getFullYear()}-01-01` }] } }, { limit: 20_000 })
    .filter((t) => /\b(?:interest|finance charges?)\b/i.test(`${t.data.merchant ?? ''} ${t.title} ${t.data.rawText ?? ''}`) && t.data.category === 'fees');
}

export const oddCount = (o: Odd) => o.twice.length + o.fees.length + o.prices.length;

/** Both are real, That is fine, Keep it: not asked about again. */
export function oddFine(os: LifeOSContext, key: string): () => void {
  os.settings.set(ODD_OK_KEY, [...new Set([...os.settings.get<string[]>(ODD_OK_KEY, []), key])]);
  return () => os.settings.set(ODD_OK_KEY, os.settings.get<string[]>(ODD_OK_KEY, []).filter((k) => k !== key));
}

/** One is wrong: the later payment goes (Undo puts it back). */
export function oneIsWrong(os: LifeOSContext, txs: Array<ObjectRecord<TransactionData>>): () => void {
  const later = [...txs].sort((a, b) => a.data.date.localeCompare(b.data.date) || a.createdAt - b.createdAt).pop()!;
  os.records.delete(later.id, 'user');
  return () => os.records.restore(later.id, 'user');
}

/* ------------------------------------------------------------------ */
/* On the phone: the starters and everyday questions                    */
/* ------------------------------------------------------------------ */

/** What is left in a usual month (last 3 months with money in or out). */
export function leftEachMonth(os: LifeOSContext, now = new Date()): number | null {
  const months = [1, 2, 3].map((k) => monthRange(-k, now)).map((m) => ({ inn: incomeInRange(os, m.start, m.end), out: spendInRange(os, m.start, m.end) })).filter((m) => m.inn || m.out);
  if (!months.some((m) => m.inn)) return null;
  return Math.round(months.reduce((n, m) => n + m.inn - m.out, 0) / months.length);
}

export interface Starter {
  question: string;
  line: string;
  icon: string;
  lime?: boolean;
}

/** Start here: five questions, each with a live line, all answered on the phone. */
export function starters(os: LifeOSContext, now = new Date()): Starter[] {
  const money = (n: number) => os.format.currency(Math.round(n));
  const m = monthRange(0, now);
  const spent = spendInRange(os, m.start, isoOf(now));
  const due = comingUp(os, now);
  const odd = oddCount(oddThings(os, now));
  const left = leftEachMonth(os, now);
  return [
    { question: 'Where did my money go this month?', line: `${money(spent)} so far`, icon: 'pie' },
    { question: 'What is due before payday?', line: due.items.length ? `${due.items.length} bill${due.items.length === 1 ? '' : 's'} by ${shortDay(due.until)}` : 'Nothing due yet', icon: 'calendar' },
    { question: 'Did anything look wrong?', line: odd ? `${odd} thing${odd === 1 ? '' : 's'} to check` : 'Nothing looks wrong', icon: 'alert', lime: odd > 0 },
    { question: 'Can I afford something?', line: left != null ? `About ${money(left)} left a month` : 'Needs a month with income', icon: 'card' },
    { question: 'Show me a chart of my spending', line: 'Keep it on Money home', icon: 'chart' },
  ];
}

/** Answer on the phone when it can; null means a model is needed. */
export function askOnPhone(os: LifeOSContext, question: string, now = new Date()): AskAnswer | null {
  const q = question.trim().toLowerCase();
  if (/\b(?:pay|transfer|send|move)\b.*\b(?:bill|money|card|rent|₹|rs\.?|\d)/.test(q) && !/\bhow much\b|\bdid i\b/.test(q)) return { text: 'I can only read your money. Pay it in your bank’s app, and the text it sends will file it here.', source: 'phone' };
  if (/\bshould i\b.*\b(?:buy|sell|invest|redeem)\b|\b(?:good|best) (?:fund|stock|investment)\b/.test(q)) {
    const a = answerMoney(os, { kind: 'portfolio' }, now);
    return { text: 'I do not give investment advice. Here is what you hold.', block: a.card ? { kind: 'card', card: a.card } : undefined, source: 'phone' };
  }
  if (/\b(?:anything|something)\b.*\b(?:wrong|odd|off|strange)\b|\blook(?:s|ed)? wrong\b/.test(q)) {
    const n = oddCount(oddThings(os, now));
    return { text: n ? `${n} thing${n === 1 ? '' : 's'} to check. None is certain, and only you can tell.` : 'Nothing looks wrong: no double charges, new fees or price changes in the last 30 days, and no bill has crept up this year.', block: n ? { kind: 'odd' } : undefined, source: 'phone' };
  }
  if (/\b(?:chart|graph)\b.*\bspend|\bweekly spend\b/.test(q)) {
    const query: MoneyQuery = { measure: 'spent', period: 'month', by: 'week' };
    return answerQuery(os, query, 'bars', 'Weekly spend', now);
  }
  // "What's an APR, and what has mine cost me?": the word, then this year's interest.
  if (/\bapr\b|\binterest\b.*\b(?:cost|paid|pay|charged|card)\b|\bhow much interest\b/.test(q) && !/\binterest (?:earned|credited|income)\b/.test(q)) {
    const txs = interestThisYear(os, now);
    const total = txs.reduce((n, t) => n + t.data.amount, 0);
    const what = 'APR is the yearly interest rate a card or loan charges on what you have not paid back by the due date. Paying the full bill every month means none.';
    const cost = txs.length ? `This year, interest has cost you ${os.format.currency(Math.round(total))} across ${txs.length} charge${txs.length === 1 ? '' : 's'}.` : 'No interest charges filed this year.';
    return { text: `${what} ${cost}`, block: txs.length ? { kind: 'card', card: { kind: 'list', title: 'Interest this year', items: txs.map((t) => ({ entityId: t.id, type: 'transaction', title: t.title, value: os.format.currency(t.data.amount) })) } } : undefined, source: 'phone' };
  }
  // "Am I spending more than I make?": a usual month over the last 3.
  if (/\bspend(?:ing)? more than i (?:make|earn|get)\b|\bliving beyond\b|\bover ?spending\b|\bearn(?:ing)? (?:more|less) than i spend\b/.test(q)) {
    const left = leftEachMonth(os, now);
    const query: MoneyQuery = { measure: 'spent', period: '3_months', by: 'month' };
    if (left == null) return { text: 'No money in is filed for the last 3 months, so I cannot compare yet.', block: { kind: 'bars', title: 'Spent each month', query }, source: 'phone' };
    return { text: left < 0 ? `Yes. Over the last 3 months you spent about ${os.format.currency(-left)} more than came in, in a usual month.` : `No. In a usual month over the last 3, about ${os.format.currency(left)} is left after spending.`, block: { kind: 'bars', title: 'Spent each month', query }, source: 'phone' };
  }
  const mq = readMoneyQuestion(question);
  if (!mq) return null;
  const a = answerMoney(os, mq, now);
  const card = a.card ? { kind: 'card' as const, card: a.card } : undefined;
  switch (mq.kind) {
    case 'where':
      return { text: a.answer, block: { kind: 'bars', title: 'Where it went', query: { measure: 'spent', period: mq.period, by: 'category' } }, source: 'phone' };
    case 'spent': {
      const cat = mq.about ? categoryNamed(os, mq.about) : null;
      const query: MoneyQuery = cat ? { measure: 'spent', period: mq.period, only: [cat] } : mq.about ? { measure: 'spent', period: mq.period, payee: mq.about } : { measure: 'spent', period: mq.period };
      return { text: a.answer, block: { kind: 'list', title: 'The payments behind it', query }, source: 'phone' };
    }
    case 'income':
      return { text: a.answer, block: { kind: 'list', title: 'What came in', query: { measure: 'came_in', period: mq.period } }, source: 'phone' };
    case 'biggest':
      return { text: a.answer, block: { kind: 'list', title: 'Biggest spends', query: { measure: 'spent', period: mq.period, sort: 'largest' } }, source: 'phone' };
    case 'bills':
      return { text: a.answer, block: { kind: 'calendar', title: 'Due before payday', query: { measure: 'bills', period: 'month' } }, source: 'phone' };
    case 'twice':
      return { text: a.answer, block: { kind: 'odd' }, source: 'phone' };
    default:
      return { text: a.answer, block: card, source: 'phone' };
  }
}

/* ------------------------------------------------------------------ */
/* Views you keep                                                       */
/* ------------------------------------------------------------------ */

export const VIEWS_KEY = 'finance.views';

export interface MoneyView {
  id: string;
  title: string;
  kind: BlockKind;
  query: MoneyQuery;
}

export const moneyViews = (os: LifeOSContext) => os.settings.get<MoneyView[]>(VIEWS_KEY, []);

/** Keep: the question for the numbers (its query and block), not the numbers. */
export function keepView(os: LifeOSContext, v: Omit<MoneyView, 'id'>): MoneyView {
  const view = { ...v, id: `v${Date.now().toString(36)}` };
  os.settings.set(VIEWS_KEY, [...moneyViews(os), view]);
  return view;
}

export function dropView(os: LifeOSContext, id: string): () => void {
  const before = moneyViews(os);
  os.settings.set(VIEWS_KEY, before.filter((v) => v.id !== id));
  return () => os.settings.set(VIEWS_KEY, before);
}

/** The Money prompt for typed questions (MODEL: your money manager; every figure from a tool). */
export const ASK_PROMPT = `You are Money, the user's money manager inside LifeOS. Figures come only from tools: call money_query (or another Money tool) for every number, and never do arithmetic yourself. Finish every answer with exactly one money_show call: one or two plain sentences, one block (number, bars, line, calendar or list) and the money query behind it, so the phone can show the payments that add up to it. You only read: never offer to move money, and give no investment advice (if asked, say so and show what they hold). If the payments do not go back far enough to answer, say so. Amounts are rupees unless a currency is given.`;
