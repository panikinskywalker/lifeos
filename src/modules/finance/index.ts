import type { ModuleManifest } from '@core/registry/types';
import { accountType, budgetType, subscriptionType, transactionType, FINANCE_COLOR, CATEGORIES, debtType } from './types';
import { applyCategories, trackCategoryField } from './categories';
import { postDueSubscriptions } from './lib';
import { financeAiTools } from './aiTools';

export const financeModule: ModuleManifest = {
  id: 'finance',
  name: 'Finance',
  version: '1.0.0',
  description: 'Accounts, transactions, budgets and subscriptions — with receipts, trips and people all linked.',
  icon: 'banknote',
  color: FINANCE_COLOR,
  objects: [accountType, transactionType, budgetType, subscriptionType, debtType],
  triggers: [
    {
      id: 'finance.transaction.created', module: 'finance', label: 'Transaction added', event: 'entity.created',
      configFields: [{ key: 'kind', label: 'Kind', type: 'select', options: [{ value: 'expense', label: 'Expense' }, { value: 'income', label: 'Income' }] }],
      toContext: (p) => {
        const e = (p as { entity: { object: string; data: Record<string, unknown> } }).entity;
        if (e.object !== 'transaction') return null;
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
        const tx = os.records.create({ object: 'transaction', data: { amount: Number(cfg.amount), kind: (cfg.kind as string) || 'expense', category: (cfg.category as string) || 'other', merchant: cfg.merchant ? String(cfg.merchant) : undefined, accountId: cfg.accountId ? String(cfg.accountId) : undefined, date: new Date().toISOString().slice(0, 10) } }, 'automation');
        if (ctx.entity) os.links.link(tx.id, ctx.entity.id, 'related', {}, 'automation');
        return tx.title;
      },
    },
  ],
  aiTools: financeAiTools,
  onStart: async (os) => {
    // Your own categories join the built-in list in every category picker.
    for (const def of [transactionType, budgetType, subscriptionType]) trackCategoryField(def.fields.find((f) => f.key === 'category'));
    applyCategories(os);
    // Post due subscription bills daily (and on every app start).
    os.scheduler.registerHandler('finance.subscriptions', (_j, o) => void postDueSubscriptions(o));
    if (!os.scheduler.get('finance.subscriptions')) os.scheduler.schedule({ id: 'finance.subscriptions', kind: 'finance.subscriptions', at: Date.now(), rrule: 'FREQ=DAILY;INTERVAL=1' });
  },
};

export * from './types';
export * from './lib';
export * from './categories';
