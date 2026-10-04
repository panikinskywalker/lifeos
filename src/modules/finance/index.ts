import type { ModuleManifest } from '@core/registry/types';
import { accountType, investmentType, subscriptionType, transactionType, FINANCE_COLOR, CATEGORIES, debtType } from './types';
import { applyCategories, foldBudgetsIntoTargets, trackCategoryField } from './categories';
import { foldInstitutions, postDueSubscriptions } from './lib';
import { financeAiTools } from './aiTools';

export const financeModule: ModuleManifest = {
  id: 'finance',
  name: 'Finance',
  version: '1.0.0',
  description: 'Accounts, transactions, budgets and subscriptions — with receipts, trips and people all linked.',
  icon: 'banknote',
  color: FINANCE_COLOR,
  objects: [accountType, transactionType, subscriptionType, debtType, investmentType],
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
        { key: 'amount', label: 'Amount', type: 'money', required: true },
        { key: 'kind', label: 'Kind', type: 'select', default: 'expense', options: [{ value: 'expense', label: 'Expense' }, { value: 'income', label: 'Income' }] },
        { key: 'category', label: 'Category', type: 'select', options: CATEGORIES.map(({ value, label }) => ({ value, label })) },
        { key: 'merchant', label: 'Merchant', type: 'text' },
        { key: 'accountId', label: 'Account', type: 'link', linkTo: 'account' },
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
    for (const def of [transactionType, subscriptionType]) trackCategoryField(def.fields.find((f) => f.key === 'category'));
    applyCategories(os);
    // R1: Budget records became monthly targets on their categories; a bank name becomes an Organisation. Both fold once.
    foldBudgetsIntoTargets(os);
    foldInstitutions(os);
    // Post due subscription bills daily (and on every app start).
    os.scheduler.registerHandler('finance.subscriptions', (_j, o) => void postDueSubscriptions(o));
    if (!os.scheduler.get('finance.subscriptions')) os.scheduler.schedule({ id: 'finance.subscriptions', kind: 'finance.subscriptions', at: Date.now(), rrule: 'FREQ=DAILY;INTERVAL=1' });
  },
};

export * from './types';
export * from './lib';
export * from './categories';
