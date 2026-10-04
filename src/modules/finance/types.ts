import { z } from 'zod';
import type { ObjectDef, FieldOption } from '@core/domain/types';
import { dateField, nextAnnual, periodFromRRule } from '@core/cycles/schedule';

export const FINANCE_COLOR = 'green';

export const CATEGORIES: Array<FieldOption & { icon: string }> = [
  { value: 'food', label: 'Food & Drink', color: 'orange', icon: 'fork.knife' },
  { value: 'groceries', label: 'Groceries', color: 'green', icon: 'cart' },
  { value: 'transport', label: 'Transport', color: 'blue', icon: 'bus' },
  { value: 'housing', label: 'Housing & Rent', color: 'brown', icon: 'house' },
  { value: 'utilities', label: 'Utilities', color: 'teal', icon: 'bolt' },
  { value: 'shopping', label: 'Shopping', color: 'pink', icon: 'bag' },
  { value: 'entertainment', label: 'Entertainment', color: 'purple', icon: 'film' },
  { value: 'health', label: 'Health', color: 'red', icon: 'heart' },
  { value: 'travel', label: 'Travel', color: 'cyan', icon: 'airplane' },
  { value: 'education', label: 'Education', color: 'indigo', icon: 'graduationcap' },
  { value: 'subscriptions', label: 'Subscriptions', color: 'mint', icon: 'repeat' },
  { value: 'gifts', label: 'Gifts', color: 'yellow', icon: 'gift' },
  { value: 'investment', label: 'Investment', color: 'green', icon: 'chart.line' },
  { value: 'salary', label: 'Salary', color: 'green', icon: 'banknote' },
  { value: 'freelance', label: 'Freelance', color: 'teal', icon: 'briefcase' },
  { value: 'fees', label: 'Fees & Charges', color: 'gray', icon: 'building.columns' },
  { value: 'transfer', label: 'Transfer', color: 'gray', icon: 'arrow.left.arrow.right' },
  { value: 'other', label: 'Other', color: 'gray', icon: 'ellipsis' },
];
export const categoryOf = (v: string | undefined) => CATEGORIES.find((c) => c.value === v) ?? CATEGORIES[CATEGORIES.length - 1];

const currencyField = { key: 'currency', label: 'Currency', type: 'select' as const, options: ['INR', 'USD', 'EUR', 'GBP', 'JPY', 'AED', 'SGD'].map((c) => ({ value: c, label: c })), section: 'Details' };

export interface AccountData {
  kind: 'bank' | 'cash' | 'credit' | 'investment' | 'wallet' | 'loan';
  currency?: string;
  openingBalance: number;
  /** The bank / broker as an Organisation record (R1). `institution` is the old free-text name, folded into it on start. */
  institutionId?: string;
  institution?: string;
  last4?: string;
  creditLimit?: number;
  includeInNetWorth?: boolean;
  color?: string;
}

export const accountType: ObjectDef<AccountData> = {
  id: 'account',
  module: 'finance',
  label: 'Account',
  labelPlural: 'Accounts',
  icon: 'creditcard',
  schema: z.object({
    kind: z.enum(['bank', 'cash', 'credit', 'investment', 'wallet', 'loan']).default('bank'),
    currency: z.string().optional(),
    openingBalance: z.coerce.number().default(0),
    institutionId: z.string().optional(),
    institution: z.string().optional(),
    last4: z.string().max(4).optional(),
    creditLimit: z.coerce.number().optional(),
    includeInNetWorth: z.boolean().default(true),
    color: z.string().optional(),
  }),
  fields: [
    { key: 'kind', label: 'Type', type: 'select', required: true, summary: true, options: [
      { value: 'bank', label: 'Bank' }, { value: 'cash', label: 'Cash' }, { value: 'credit', label: 'Credit card' }, { value: 'investment', label: 'Investment' }, { value: 'wallet', label: 'Wallet / UPI' }, { value: 'loan', label: 'Loan' },
    ] },
    { key: 'openingBalance', label: 'Opening balance', type: 'money', required: true, default: 0 },
    { key: 'institutionId', label: 'Institution', type: 'link', linkTo: 'org', linkWord: 'institution', summary: true, section: 'Details', description: 'The bank, card issuer or broker' },
    { key: 'last4', label: 'Last 4 digits', type: 'text', section: 'Details' },
    currencyField,
    { key: 'creditLimit', label: 'Credit limit', type: 'money', section: 'Details' },
    { key: 'includeInNetWorth', label: 'Include in net worth', type: 'boolean', default: true, section: 'Details' },
  ],
  indexed: ['kind'],
  statuses: [{ value: 'active', label: 'Active' }, { value: 'closed', label: 'Closed', color: 'gray' }],
  links: [{ kind: 'account', label: 'Transactions', to: 'transaction', cardinality: 'many' }, { kind: 'institution', label: 'Institution', to: 'org', cardinality: 'one' }],
};

export type TransactionSource = 'sms' | 'notification' | 'mail' | 'dump' | 'manual' | 'cycle';

export interface TransactionData {
  amount: number;
  /** expense / income / transfer, and `investment` for a buy, sell or SIP (R1): out of spend, into net worth. */
  kind: 'expense' | 'income' | 'transfer' | 'investment';
  category: string;
  accountId?: string;
  toAccountId?: string;
  /** Who was paid or paid you: an Organisation or a Person. `merchant` keeps the name as the bank wrote it. */
  payeeId?: string;
  investmentId?: string;
  merchant?: string;
  date: string;
  note?: string;
  currency?: string;
  originalAmount?: number;
  originalCurrency?: string;
  fxRate?: number;
  tripId?: string;
  personIds?: string[];
  projectId?: string;
  /** Where it came from, the source's own id, and the raw text (cleared 60 days after filing). */
  source?: TransactionSource;
  sourceRef?: string;
  rawText?: string;
}

export const transactionType: ObjectDef<TransactionData> = {
  id: 'transaction',
  module: 'finance',
  label: 'Transaction',
  labelPlural: 'Transactions',
  icon: 'arrow.up.arrow.down',
  schema: z.object({
    amount: z.coerce.number().nonnegative(),
    kind: z.enum(['expense', 'income', 'transfer', 'investment']).default('expense'),
    category: z.string().default('other'),
    accountId: z.string().optional(),
    toAccountId: z.string().optional(),
    payeeId: z.string().optional(),
    investmentId: z.string().optional(),
    merchant: z.string().optional(),
    date: z.string(),
    note: z.string().optional(),
    currency: z.string().optional(),
    /** Spent in another currency: what the message said, and the rate used to get `amount` in rupees. */
    originalAmount: z.coerce.number().optional(),
    originalCurrency: z.string().optional(),
    fxRate: z.coerce.number().optional(),
    tripId: z.string().optional(),
    personIds: z.array(z.string()).optional(),
    projectId: z.string().optional(),
    /** Split details (split.ts SplitRecord); debts are filed separately. */
    split: z.any().optional(),
    source: z.enum(['sms', 'notification', 'mail', 'dump', 'manual', 'cycle']).optional(),
    sourceRef: z.string().optional(),
    rawText: z.string().optional(),
  }),
  fields: [
    { key: 'amount', label: 'Amount', type: 'money', required: true },
    { key: 'kind', label: 'Kind', type: 'select', required: true, default: 'expense', options: [{ value: 'expense', label: 'Spent' }, { value: 'income', label: 'Received' }, { value: 'transfer', label: 'Transfer' }, { value: 'investment', label: 'Investment' }] },
    { key: 'payeeId', label: 'Paid to / from', type: 'link', linkTo: ['org', 'person'], linkWord: 'payee', summary: true },
    { key: 'merchant', label: 'Merchant (as the bank wrote it)', type: 'text', placeholder: 'Where or who', section: 'Details' },
    { key: 'category', label: 'Category', type: 'select', required: true, summary: true, options: CATEGORIES.map(({ value, label, color }) => ({ value, label, color })) },
    { key: 'date', label: 'Date', type: 'date', required: true, default: () => new Date().toISOString().slice(0, 10) },
    { key: 'accountId', label: 'Account', type: 'link', linkTo: 'account', linkWord: 'account', summary: true },
    { key: 'toAccountId', label: 'To account (transfers)', type: 'link', linkTo: 'account', linkWord: 'toAccount', section: 'Links' },
    { key: 'tripId', label: 'Trip', type: 'link', linkTo: 'trip', linkWord: 'trip', section: 'Links' },
    { key: 'personIds', label: 'People', type: 'link', linkTo: 'person', linkWord: 'person', section: 'Links', default: [] },
    { key: 'projectId', label: 'Project', type: 'link', linkTo: 'project', linkWord: 'project', section: 'Links' },
    { key: 'investmentId', label: 'Investment', type: 'link', linkTo: 'investment', linkWord: 'investment', section: 'Links' },
    { key: 'note', label: 'Note', type: 'longtext', section: 'Details' },
    currencyField,
    { key: 'source', label: 'Source', type: 'select', section: 'Source', options: [{ value: 'sms', label: 'SMS' }, { value: 'notification', label: 'Notification' }, { value: 'mail', label: 'Mail' }, { value: 'dump', label: 'Dump' }, { value: 'manual', label: 'Typed' }, { value: 'cycle', label: 'Cycle' }] },
    { key: 'rawText', label: 'Original text', type: 'longtext', section: 'Source', description: 'Kept 60 days after filing' },
  ],
  indexed: ['category', 'kind', 'accountId', 'date', 'payeeId', 'investmentId'],
  occurredAtField: 'date',
  statuses: [{ value: 'cleared', label: 'Cleared' }, { value: 'pending', label: 'Pending' }, { value: 'reimbursable', label: 'Reimbursable', color: 'orange' }, { value: 'reimbursed', label: 'Reimbursed' }],
  computeTitle: (d) => d.merchant?.trim() || categoryOf(d.category).label,
  computeSubtitle: (d) => (d.merchant ? categoryOf(d.category).label : undefined),
  searchText: (d) => [d.note, d.category, d.kind].filter(Boolean).join(' '),
  links: [
    { kind: 'account', label: 'Account', to: 'account', cardinality: 'one' },
    { kind: 'trip', label: 'Trip', to: 'trip', cardinality: 'one' },
    { kind: 'person', label: 'People', to: 'person', cardinality: 'many' },
    { kind: 'payee', label: 'Paid to / from', to: ['person', 'org'], cardinality: 'one' },
    { kind: 'project', label: 'Project', to: 'project', cardinality: 'one' },
    { kind: 'investment', label: 'Investment', to: 'investment', cardinality: 'one' },
  ],
  defaultViews: [
    { name: 'This month', icon: 'calendar', definition: { filter: { and: [{ field: 'data.date', op: 'gte', value: '__MONTH_START__' }] }, sort: [{ field: 'data.date', dir: 'desc' }], groupBy: 'day' } },
    { name: 'Expenses', definition: { filter: { and: [{ field: 'data.kind', op: 'eq', value: 'expense' }] }, sort: [{ field: 'data.date', dir: 'desc' }], groupBy: 'month' } },
    { name: 'Income', definition: { filter: { and: [{ field: 'data.kind', op: 'eq', value: 'income' }] }, sort: [{ field: 'data.date', dir: 'desc' }], groupBy: 'month' } },
    { name: 'Reimbursable', definition: { filter: { and: [{ field: 'status', op: 'eq', value: 'reimbursable' }] } } },
  ],
};

export const INSTRUMENTS: FieldOption[] = [
  { value: 'mutual_fund', label: 'Mutual fund' }, { value: 'stock', label: 'Stock' }, { value: 'fd', label: 'Fixed deposit' }, { value: 'rd', label: 'Recurring deposit' },
  { value: 'ppf', label: 'PPF' }, { value: 'epf', label: 'EPF' }, { value: 'nps', label: 'NPS' }, { value: 'gold', label: 'Gold' }, { value: 'crypto', label: 'Crypto' }, { value: 'other', label: 'Other' },
];

export interface InvestmentData {
  instrument: 'mutual_fund' | 'stock' | 'fd' | 'rd' | 'ppf' | 'epf' | 'nps' | 'gold' | 'crypto' | 'other';
  accountId?: string;
  units?: number;
  avgCost?: number;
  /** Total put in (buys minus sells), kept current by investment transactions. */
  invested: number;
  /** Latest known value; a meter, so growth charts come from its readings. */
  currentValue?: number;
  currency?: string;
  maturesOn?: string;
  /** Monthly SIP amount, if any — drives the SIP cycle. */
  sip?: number;
  sipDay?: number;
  /** Fund / scheme / folio / ISIN as the registrar writes it, for matching confirmations. */
  code?: string;
  notes?: string;
}

/** Investment (R1): one holding — a fund, a stock, an FD — with what went in, what it is worth now, and its SIP / maturity cycles. */
export const investmentType: ObjectDef<InvestmentData> = {
  id: 'investment',
  module: 'finance',
  label: 'Investment',
  labelPlural: 'Investments',
  icon: 'chart.line',
  schema: z.object({
    instrument: z.enum(['mutual_fund', 'stock', 'fd', 'rd', 'ppf', 'epf', 'nps', 'gold', 'crypto', 'other']).default('mutual_fund'),
    accountId: z.string().optional(),
    units: z.coerce.number().optional(),
    avgCost: z.coerce.number().optional(),
    invested: z.coerce.number().default(0),
    currentValue: z.coerce.number().optional(),
    currency: z.string().optional(),
    maturesOn: z.string().optional(),
    sip: z.coerce.number().optional(),
    sipDay: z.coerce.number().int().min(1).max(28).optional(),
    code: z.string().optional(),
    notes: z.string().optional(),
  }),
  fields: [
    { key: 'instrument', label: 'Instrument', type: 'select', required: true, summary: true, default: 'mutual_fund', options: INSTRUMENTS },
    { key: 'invested', label: 'Invested', type: 'money', required: true, default: 0, summary: true },
    { key: 'currentValue', label: 'Current value', type: 'meter', unit: '₹', summary: true },
    { key: 'units', label: 'Units', type: 'number', section: 'Details' },
    { key: 'avgCost', label: 'Average cost', type: 'money', section: 'Details' },
    { key: 'accountId', label: 'Held in', type: 'link', linkTo: 'account', linkWord: 'account', section: 'Details' },
    { key: 'sip', label: 'SIP per month', type: 'money', section: 'SIP' },
    { key: 'sipDay', label: 'SIP day of month', type: 'number', section: 'SIP' },
    { key: 'maturesOn', label: 'Matures on', type: 'date', section: 'Details' },
    { key: 'code', label: 'Scheme / folio / ISIN', type: 'text', section: 'Details' },
    currencyField,
    { key: 'notes', label: 'Notes', type: 'longtext', section: 'Details' },
  ],
  indexed: ['instrument', 'accountId'],
  statuses: [{ value: 'active', label: 'Active' }, { value: 'matured', label: 'Matured', color: 'gray' }, { value: 'sold', label: 'Sold', color: 'gray' }],
  meters: [{ meter: 'value', field: 'currentValue', label: 'Current value', unit: '₹' }],
  computeSubtitle: (d, { formatCurrency }) => {
    const parts = [formatCurrency(d.invested, d.currency) + ' in'];
    if (d.currentValue != null) parts.push(`now ${formatCurrency(d.currentValue, d.currency)}`);
    return parts.join(' · ');
  },
  searchText: (d) => [d.code, d.notes, d.instrument].filter(Boolean).join(' '),
  cycleActiveStatuses: ['active'],
  cycleFields: { 'investment.maturity': { nextDueAt: 'maturesOn' } },
  cycleTemplates: (d) => {
    const out: ReturnType<NonNullable<ObjectDef<InvestmentData>['cycleTemplates']>> = [];
    if (d.sip && d.sip > 0) out.push({ template: 'investment.sip', name: 'SIP', kind: 'interval', everyN: 1, everyUnit: 'month', nextDueAt: nextSipAt(d.sipDay), leadDays: 2, costEstimate: d.sip, currency: d.currency ?? null });
    if (dateField(d.maturesOn)) out.push({ template: 'investment.maturity', name: 'Matures', kind: 'fixed', nextDueAt: dateField(d.maturesOn), leadDays: 14 });
    return out;
  },
  links: [{ kind: 'account', label: 'Held in', to: 'account', cardinality: 'one' }, { kind: 'investment', label: 'Transactions', to: 'transaction', cardinality: 'many' }],
};

function nextSipAt(day = 1, now = new Date()): number {
  const d = new Date(now.getFullYear(), now.getMonth(), Math.min(Math.max(day, 1), 28), 9);
  if (d.getTime() <= now.getTime()) d.setMonth(d.getMonth() + 1);
  return d.getTime();
}

export interface SubscriptionData {
  name: string;
  amount: number;
  rrule: string;
  nextBillingAt: string;
  category: string;
  accountId?: string;
  autoPost?: boolean;
  url?: string;
  currency?: string;
  /** Every price it has had, oldest first; the renewal appends when the amount changes. */
  priceHistory?: Array<{ amount: number; from: string }>;
}

export const subscriptionType: ObjectDef<SubscriptionData> = {
  id: 'subscription',
  module: 'finance',
  label: 'Subscription',
  labelPlural: 'Subscriptions',
  icon: 'repeat',
  schema: z.object({
    name: z.string().min(1),
    amount: z.coerce.number().nonnegative(),
    rrule: z.string().default('FREQ=MONTHLY;INTERVAL=1'),
    nextBillingAt: z.string(),
    category: z.string().default('subscriptions'),
    accountId: z.string().optional(),
    autoPost: z.boolean().default(true),
    url: z.string().optional(),
    currency: z.string().optional(),
    priceHistory: z.array(z.object({ amount: z.number(), from: z.string() })).optional(),
  }),
  fields: [
    { key: 'name', label: 'Service', type: 'text', required: true, placeholder: 'Netflix, iCloud, Gym…' },
    { key: 'amount', label: 'Amount', type: 'money', required: true },
    { key: 'rrule', label: 'Billing cycle', type: 'select', required: true, default: 'FREQ=MONTHLY;INTERVAL=1', summary: true, options: [
      { value: 'FREQ=WEEKLY;INTERVAL=1', label: 'Weekly' }, { value: 'FREQ=MONTHLY;INTERVAL=1', label: 'Monthly' }, { value: 'FREQ=MONTHLY;INTERVAL=3', label: 'Quarterly' }, { value: 'FREQ=YEARLY;INTERVAL=1', label: 'Yearly' },
    ] },
    { key: 'nextBillingAt', label: 'Next billing date', type: 'date', required: true, default: () => new Date().toISOString().slice(0, 10) },
    { key: 'category', label: 'Category', type: 'select', default: 'subscriptions', options: CATEGORIES.map(({ value, label, color }) => ({ value, label, color })) },
    { key: 'accountId', label: 'Paid from', type: 'link', linkTo: 'account', linkWord: 'account' },
    { key: 'autoPost', label: 'Auto-create transaction when billed', type: 'boolean', default: true, section: 'Details' },
    { key: 'url', label: 'Manage URL', type: 'text', section: 'Details' },
    currencyField,
  ],
  occurredAtField: 'nextBillingAt',
  statuses: [{ value: 'active', label: 'Active' }, { value: 'paused', label: 'Paused' }, { value: 'cancelled', label: 'Cancelled', color: 'gray' }],
  computeTitle: (d) => d.name,
  cycleFields: { 'subscription.renewal': { nextDueAt: 'nextBillingAt' } },
  cycleActiveStatuses: ['active'],
  cycleTemplates: (d) => {
    const p = periodFromRRule(d.rrule) ?? { everyN: 1, everyUnit: 'month' as const };
    return [{ template: 'subscription.renewal', name: 'Renewal', kind: 'fixed', ...p, nextDueAt: dateField(d.nextBillingAt), leadDays: 3, costEstimate: d.amount ?? null, currency: d.currency ?? null }];
  },
  computeSubtitle: (d, { formatCurrency }) => `${formatCurrency(d.amount)} · next ${d.nextBillingAt}`,
  links: [{ kind: 'account', label: 'Account', to: 'account', cardinality: 'one' }],
};

/** Debt (PRODUCT §4): money between me and a person — from a split, a loan, or a payment that settles. */
export const debtType: ObjectDef<{ personId: string; direction: 'they_owe' | 'i_owe'; amount: number; reason?: string; date: string; kind: 'split' | 'loan' | 'payment'; transactionId?: string; groupId?: string; currency?: string }> = {
  id: 'debt',
  module: 'finance',
  label: 'Debt',
  labelPlural: 'Debts',
  icon: 'people',
  schema: z.object({
    personId: z.string().min(1),
    direction: z.enum(['they_owe', 'i_owe']).default('they_owe'),
    amount: z.coerce.number().positive(),
    reason: z.string().optional(),
    date: z.string(),
    kind: z.enum(['split', 'loan', 'payment']).default('loan'),
    transactionId: z.string().optional(),
    groupId: z.string().optional(),
    currency: z.string().optional(),
  }),
  fields: [
    { key: 'personId', label: 'Person', type: 'link', linkTo: 'person', linkWord: 'person', required: true },
    { key: 'direction', label: 'Who owes', type: 'select', required: true, default: 'they_owe', summary: true, options: [{ value: 'they_owe', label: 'They owe me' }, { value: 'i_owe', label: 'I owe them' }] },
    { key: 'amount', label: 'Amount', type: 'money', required: true },
    { key: 'reason', label: 'For', type: 'text', placeholder: 'Dinner, cab, concert tickets…' },
    { key: 'date', label: 'Date', type: 'date', required: true, default: () => new Date().toISOString().slice(0, 10) },
    { key: 'kind', label: 'Kind', type: 'select', default: 'loan', section: 'Details', options: [{ value: 'loan', label: 'Loan / IOU' }, { value: 'split', label: 'Split' }, { value: 'payment', label: 'Payment' }] },
    { key: 'transactionId', label: 'Transaction', type: 'link', linkTo: 'transaction', linkWord: 'transaction', section: 'Details' },
    { key: 'groupId', label: 'Group', type: 'link', linkTo: 'group', linkWord: 'group', section: 'Details' },
  ],
  occurredAtField: 'date',
  computeTitle: (d) => d.reason || (d.kind === 'payment' ? 'Payment' : 'Debt'),
  computeSubtitle: (d, { formatCurrency }) => `${d.direction === 'they_owe' ? 'Owes you' : 'You owe'} ${formatCurrency(d.amount, d.currency)}`,
  statuses: [{ value: 'open', label: 'Open' }, { value: 'settled', label: 'Settled', color: 'gray' }],
};
