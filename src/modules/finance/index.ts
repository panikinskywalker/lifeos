import { z } from 'zod';
import type { ModuleManifest } from '@core/registry/types';
import { accountType, budgetType, subscriptionType, transactionType, FINANCE_COLOR, CATEGORIES } from './types';
import { financeWidgets } from './widgets';
import { AccountSection, BudgetSection, FinanceHome, SubscriptionSection } from './screens';
import { budgetStatus, monthRange, netWorth, postDueSubscriptions, spendByCategory, spendInRange, incomeInRange, monthlySubscriptionCost } from './lib';
import type { BudgetData } from './types';

export const financeModule: ModuleManifest = {
  id: 'finance',
  name: 'Finance',
  version: '1.0.0',
  description: 'Accounts, transactions, budgets and subscriptions — with receipts, trips and people all linked.',
  icon: 'banknote',
  color: FINANCE_COLOR,
  entityTypes: [accountType, transactionType, budgetType, subscriptionType],
  screens: [{ key: 'index', title: 'Finance', component: FinanceHome }],
  widgets: financeWidgets,
  defaultWidgets: [{ type: 'finance.spend', size: 'medium' }, { type: 'finance.networth', size: 'small' }, { type: 'finance.budgets', size: 'small' }],
  quickActions: [
    { id: 'finance.addTransaction', label: 'Transaction', icon: 'arrow.up.arrow.down', route: '/entity/transaction/new', global: true },
    { id: 'finance.addAccount', label: 'Account', icon: 'creditcard', route: '/entity/account/new' },
    { id: 'finance.addSubscription', label: 'Subscription', icon: 'repeat', route: '/entity/subscription/new' },
  ],
  detailSections: [
    { entityType: 'account', key: 'finance.account', title: 'Balance', component: AccountSection, order: 10 },
    { entityType: 'budget', key: 'finance.budget', title: 'Progress', component: BudgetSection, order: 10 },
    { entityType: 'subscription', key: 'finance.subscription', title: 'Billing', component: SubscriptionSection, order: 10 },
  ],
  triggers: [
    {
      id: 'finance.transaction.created', module: 'finance', label: 'Transaction added', event: 'entity.created',
      configFields: [{ key: 'kind', label: 'Kind', type: 'select', options: [{ value: 'expense', label: 'Expense' }, { value: 'income', label: 'Income' }] }],
      toContext: (p) => {
        const e = (p as { entity: { type: string; data: Record<string, unknown> } }).entity;
        if (e.type !== 'transaction') return null;
        return { entity: e as never, vars: { amount: e.data.amount, category: e.data.category, kind: e.data.kind } };
      },
    },
  ],
  actions: [
    {
      id: 'finance.createTransaction', module: 'finance', label: 'Create transaction',
      configFields: [
        { key: 'amount', label: 'Amount', type: 'currency', required: true },
        { key: 'kind', label: 'Kind', type: 'select', defaultValue: 'expense', options: [{ value: 'expense', label: 'Expense' }, { value: 'income', label: 'Income' }] },
        { key: 'category', label: 'Category', type: 'select', options: CATEGORIES.map(({ value, label }) => ({ value, label })) },
        { key: 'merchant', label: 'Merchant', type: 'text' },
        { key: 'accountId', label: 'Account', type: 'relation', relationTo: 'account' },
      ],
      run: async (cfg, ctx, os) => {
        const tx = os.entities.create({ type: 'transaction', data: { amount: Number(cfg.amount), kind: (cfg.kind as string) || 'expense', category: (cfg.category as string) || 'other', merchant: cfg.merchant ? String(cfg.merchant) : undefined, accountId: cfg.accountId ? String(cfg.accountId) : undefined, date: new Date().toISOString().slice(0, 10) } }, 'automation');
        if (ctx.entity) os.relations.link(tx.id, ctx.entity.id, 'related', {}, 'automation');
        return tx.title;
      },
    },
  ],
  aiTools: [
    {
      name: 'finance_summary',
      description: 'Money overview: net worth with balances per account, this month\'s spend & income, spend by category, budget status, monthly subscription cost. Use for any "how am I doing financially" question.',
      input: z.object({ monthOffset: z.number().int().max(0).optional().describe('0 = this month, -1 = last month') }),
      run: async (input, os) => {
        const m = monthRange((input as { monthOffset?: number }).monthOffset ?? 0);
        const nw = netWorth(os);
        return {
          month: m.label,
          netWorth: nw.total,
          accounts: nw.accounts.map((a) => ({ id: a.account.id, name: a.account.title, kind: a.account.data.kind, balance: a.balance, currency: a.account.data.currency })),
          spent: spendInRange(os, m.start, m.end),
          income: incomeInRange(os, m.start, m.end),
          byCategory: spendByCategory(os, m.start, m.end),
          budgets: os.entities.query<BudgetData>('budget').map((b) => ({ id: b.id, category: b.data.category, period: b.data.period, ...budgetStatus(os, b) })),
          monthlySubscriptions: monthlySubscriptionCost(os),
        };
      },
    },
  ],
  onStart: async (os) => {
    // Post due subscription bills daily (and on every app start).
    os.scheduler.registerHandler('finance.subscriptions', (_j, o) => void postDueSubscriptions(o));
    if (!os.scheduler.get('finance.subscriptions')) os.scheduler.schedule({ id: 'finance.subscriptions', kind: 'finance.subscriptions', at: Date.now(), rrule: 'FREQ=DAILY;INTERVAL=1' });
  },
};

export * from './types';
export * from './lib';
