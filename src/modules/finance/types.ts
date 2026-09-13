import { z } from 'zod';
import type { EntityTypeDef, FieldOption } from '@core/domain/types';
import { palette } from '@ui/theme/tokens';

export const FINANCE_COLOR = palette.green;

export const CATEGORIES: Array<FieldOption & { icon: string }> = [
  { value: 'food', label: 'Food & Drink', color: palette.orange, icon: 'fork.knife' },
  { value: 'groceries', label: 'Groceries', color: palette.green, icon: 'cart' },
  { value: 'transport', label: 'Transport', color: palette.blue, icon: 'bus' },
  { value: 'housing', label: 'Housing & Rent', color: palette.brown, icon: 'house' },
  { value: 'utilities', label: 'Utilities', color: palette.teal, icon: 'bolt' },
  { value: 'shopping', label: 'Shopping', color: palette.pink, icon: 'bag' },
  { value: 'entertainment', label: 'Entertainment', color: palette.purple, icon: 'film' },
  { value: 'health', label: 'Health', color: palette.red, icon: 'heart' },
  { value: 'travel', label: 'Travel', color: palette.cyan, icon: 'airplane' },
  { value: 'education', label: 'Education', color: palette.indigo, icon: 'graduationcap' },
  { value: 'subscriptions', label: 'Subscriptions', color: palette.mint, icon: 'repeat' },
  { value: 'gifts', label: 'Gifts', color: palette.yellow, icon: 'gift' },
  { value: 'investment', label: 'Investment', color: palette.green, icon: 'chart.line' },
  { value: 'salary', label: 'Salary', color: palette.green, icon: 'banknote' },
  { value: 'freelance', label: 'Freelance', color: palette.teal, icon: 'briefcase' },
  { value: 'fees', label: 'Fees & Charges', color: palette.gray, icon: 'building.columns' },
  { value: 'transfer', label: 'Transfer', color: palette.gray, icon: 'arrow.left.arrow.right' },
  { value: 'other', label: 'Other', color: palette.gray, icon: 'ellipsis' },
];
export const categoryOf = (v: string | undefined) => CATEGORIES.find((c) => c.value === v) ?? CATEGORIES[CATEGORIES.length - 1];

const currencyField = { key: 'currency', label: 'Currency', type: 'select' as const, options: ['INR', 'USD', 'EUR', 'GBP', 'JPY', 'AED', 'SGD'].map((c) => ({ value: c, label: c })), section: 'Details' };

export interface AccountData {
  kind: 'bank' | 'cash' | 'credit' | 'investment' | 'wallet' | 'loan';
  currency?: string;
  openingBalance: number;
  institution?: string;
  last4?: string;
  creditLimit?: number;
  includeInNetWorth?: boolean;
  color?: string;
}

export const accountType: EntityTypeDef<AccountData> = {
  type: 'account',
  module: 'finance',
  label: 'Account',
  labelPlural: 'Accounts',
  icon: 'creditcard',
  schema: z.object({
    kind: z.enum(['bank', 'cash', 'credit', 'investment', 'wallet', 'loan']).default('bank'),
    currency: z.string().optional(),
    openingBalance: z.coerce.number().default(0),
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
    { key: 'openingBalance', label: 'Opening balance', type: 'currency', required: true, defaultValue: 0 },
    { key: 'institution', label: 'Institution', type: 'text', summary: true, section: 'Details' },
    { key: 'last4', label: 'Last 4 digits', type: 'text', section: 'Details' },
    currencyField,
    { key: 'creditLimit', label: 'Credit limit', type: 'currency', section: 'Details' },
    { key: 'includeInNetWorth', label: 'Include in net worth', type: 'boolean', defaultValue: true, section: 'Details' },
  ],
  indexed: ['kind'],
  relations: [{ kind: 'account', label: 'Transactions', to: 'transaction', cardinality: 'many' }],
};

export interface TransactionData {
  amount: number;
  kind: 'expense' | 'income' | 'transfer';
  category: string;
  accountId?: string;
  toAccountId?: string;
  merchant?: string;
  date: string;
  note?: string;
  currency?: string;
  tripId?: string;
  personIds?: string[];
  projectId?: string;
}

export const transactionType: EntityTypeDef<TransactionData> = {
  type: 'transaction',
  module: 'finance',
  label: 'Transaction',
  labelPlural: 'Transactions',
  icon: 'arrow.up.arrow.down',
  schema: z.object({
    amount: z.coerce.number().nonnegative(),
    kind: z.enum(['expense', 'income', 'transfer']).default('expense'),
    category: z.string().default('other'),
    accountId: z.string().optional(),
    toAccountId: z.string().optional(),
    merchant: z.string().optional(),
    date: z.string(),
    note: z.string().optional(),
    currency: z.string().optional(),
    tripId: z.string().optional(),
    personIds: z.array(z.string()).optional(),
    projectId: z.string().optional(),
  }),
  fields: [
    { key: 'amount', label: 'Amount', type: 'currency', required: true },
    { key: 'kind', label: 'Kind', type: 'select', required: true, defaultValue: 'expense', options: [{ value: 'expense', label: 'Expense' }, { value: 'income', label: 'Income' }, { value: 'transfer', label: 'Transfer' }] },
    { key: 'merchant', label: 'Merchant / Payee', type: 'text', placeholder: 'Where or who' },
    { key: 'category', label: 'Category', type: 'select', required: true, summary: true, options: CATEGORIES.map(({ value, label, color }) => ({ value, label, color })) },
    { key: 'date', label: 'Date', type: 'date', required: true, defaultValue: () => new Date().toISOString().slice(0, 10) },
    { key: 'accountId', label: 'Account', type: 'relation', relationTo: 'account', relationKind: 'account', summary: true },
    { key: 'toAccountId', label: 'To account (transfers)', type: 'relation', relationTo: 'account', relationKind: 'toAccount', section: 'Links' },
    { key: 'tripId', label: 'Trip', type: 'relation', relationTo: 'trip', relationKind: 'trip', section: 'Links' },
    { key: 'personIds', label: 'People', type: 'relation', relationTo: 'person', relationKind: 'person', section: 'Links', defaultValue: [] },
    { key: 'projectId', label: 'Project', type: 'relation', relationTo: 'project', relationKind: 'project', section: 'Links' },
    { key: 'note', label: 'Note', type: 'longtext', section: 'Details' },
    currencyField,
  ],
  indexed: ['category', 'kind', 'accountId', 'date'],
  occurredAtField: 'date',
  statuses: [{ value: 'cleared', label: 'Cleared' }, { value: 'pending', label: 'Pending' }, { value: 'reimbursable', label: 'Reimbursable', color: palette.orange }, { value: 'reimbursed', label: 'Reimbursed' }],
  computeTitle: (d) => d.merchant?.trim() || categoryOf(d.category).label,
  computeSubtitle: (d) => (d.merchant ? categoryOf(d.category).label : undefined),
  searchText: (d) => [d.note, d.category, d.kind].filter(Boolean).join(' '),
  relations: [
    { kind: 'account', label: 'Account', to: 'account', cardinality: 'one' },
    { kind: 'trip', label: 'Trip', to: 'trip', cardinality: 'one' },
    { kind: 'person', label: 'People', to: 'person', cardinality: 'many' },
    { kind: 'project', label: 'Project', to: 'project', cardinality: 'one' },
  ],
  defaultViews: [
    { name: 'This month', icon: 'calendar', definition: { filter: { and: [{ field: 'data.date', op: 'gte', value: '__MONTH_START__' }] }, sort: [{ field: 'data.date', dir: 'desc' }], groupBy: 'day' } },
    { name: 'Expenses', definition: { filter: { and: [{ field: 'data.kind', op: 'eq', value: 'expense' }] }, sort: [{ field: 'data.date', dir: 'desc' }], groupBy: 'month' } },
    { name: 'Income', definition: { filter: { and: [{ field: 'data.kind', op: 'eq', value: 'income' }] }, sort: [{ field: 'data.date', dir: 'desc' }], groupBy: 'month' } },
    { name: 'Reimbursable', definition: { filter: { and: [{ field: 'status', op: 'eq', value: 'reimbursable' }] } } },
  ],
};

export interface BudgetData {
  category: string;
  amount: number;
  period: 'monthly' | 'weekly' | 'yearly';
  rollover?: boolean;
}

export const budgetType: EntityTypeDef<BudgetData> = {
  type: 'budget',
  module: 'finance',
  label: 'Budget',
  labelPlural: 'Budgets',
  icon: 'chart.pie',
  schema: z.object({ category: z.string(), amount: z.coerce.number().positive(), period: z.enum(['monthly', 'weekly', 'yearly']).default('monthly'), rollover: z.boolean().optional() }),
  fields: [
    { key: 'category', label: 'Category', type: 'select', required: true, summary: true, options: CATEGORIES.filter((c) => !['salary', 'freelance', 'transfer'].includes(c.value)).map(({ value, label, color }) => ({ value, label, color })) },
    { key: 'amount', label: 'Limit', type: 'currency', required: true },
    { key: 'period', label: 'Period', type: 'select', required: true, defaultValue: 'monthly', options: [{ value: 'monthly', label: 'Monthly' }, { value: 'weekly', label: 'Weekly' }, { value: 'yearly', label: 'Yearly' }] },
  ],
  computeTitle: (d) => categoryOf(d.category).label,
  computeSubtitle: (d, { formatCurrency }) => `${formatCurrency(d.amount)} / ${d.period.replace('ly', '')}`,
};

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
}

export const subscriptionType: EntityTypeDef<SubscriptionData> = {
  type: 'subscription',
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
  }),
  fields: [
    { key: 'name', label: 'Service', type: 'text', required: true, placeholder: 'Netflix, iCloud, Gym…' },
    { key: 'amount', label: 'Amount', type: 'currency', required: true },
    { key: 'rrule', label: 'Billing cycle', type: 'select', required: true, defaultValue: 'FREQ=MONTHLY;INTERVAL=1', summary: true, options: [
      { value: 'FREQ=WEEKLY;INTERVAL=1', label: 'Weekly' }, { value: 'FREQ=MONTHLY;INTERVAL=1', label: 'Monthly' }, { value: 'FREQ=MONTHLY;INTERVAL=3', label: 'Quarterly' }, { value: 'FREQ=YEARLY;INTERVAL=1', label: 'Yearly' },
    ] },
    { key: 'nextBillingAt', label: 'Next billing date', type: 'date', required: true, defaultValue: () => new Date().toISOString().slice(0, 10) },
    { key: 'category', label: 'Category', type: 'select', defaultValue: 'subscriptions', options: CATEGORIES.map(({ value, label, color }) => ({ value, label, color })) },
    { key: 'accountId', label: 'Paid from', type: 'relation', relationTo: 'account', relationKind: 'account' },
    { key: 'autoPost', label: 'Auto-create transaction when billed', type: 'boolean', defaultValue: true, section: 'Details' },
    { key: 'url', label: 'Manage URL', type: 'text', section: 'Details' },
    currencyField,
  ],
  occurredAtField: 'nextBillingAt',
  statuses: [{ value: 'active', label: 'Active' }, { value: 'paused', label: 'Paused' }, { value: 'cancelled', label: 'Cancelled', color: palette.gray }],
  computeTitle: (d) => d.name,
  computeSubtitle: (d, { formatCurrency }) => `${formatCurrency(d.amount)} · next ${d.nextBillingAt}`,
  relations: [{ kind: 'account', label: 'Account', to: 'account', cardinality: 'one' }],
};
