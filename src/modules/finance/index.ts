import type { ModuleManifest } from '@core/registry/types';
import { accountType, investmentType, subscriptionType, transactionType, FINANCE_COLOR, CATEGORIES, debtType } from './types';
import { applyCategories, foldBudgetsIntoTargets, trackCategoryField } from './categories';
import { foldInstitutions, postDueSubscriptions } from './lib';
import { financeAiTools } from './aiTools';
import { financeBrain } from './brain';
import { financeParsers } from './filing/parser';
import { financeSources } from './sources';
import { financeFilingTools } from './filing/tools';
import { linkMissingPayees, tidyPayeeNames } from './filing/payee';
import { sortOldMoneyIn } from './filing/moneyIn';
import { spotSubscriptions } from './filing/recurring';
import { learnCategory, payeeOf } from './filing/rules';
import { foldSplitShares } from './split';
import { bus } from '@core/events/bus';
import { settleFromPayment } from './settleUpi';

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
        return { line: `Logged ${tx.title}`, output: { id: tx.id, title: tx.title, amount: Number(cfg.amount) }, undo: { id: tx.id } };
      },
      outputs: ['id', 'title', 'amount'],
      undo: (u, os) => os.records.delete((u as { id: string }).id, 'automation'),
    },
  ],
  templates: [
    {
      id: 'finance.bigSpend', name: 'Big spend flag',
      description: 'An expense over ₹10,000 is tagged #review, with a reminder to look at it tomorrow.',
      trigger: { id: 'core.entity.created', config: { entityType: 'transaction' } },
      conditions: [{ field: 'data.kind', op: 'eq', value: 'expense' }, { field: 'data.amount', op: 'gt', value: 10000 }],
      steps: [
        { action: 'core.addTag', config: { tag: 'review' } },
        { action: 'core.createReminder', config: { title: 'Review: {{title}} (₹{{data.amount}})', inDays: 1 } },
      ],
    },
    {
      id: 'finance.subscriptionPosted', name: 'Subscription auto-post',
      description: 'When Finance posts a due subscription bill on its own, it is tagged #subscription and you are told what went out.',
      trigger: { id: 'core.entity.created', config: { entityType: 'transaction' } },
      conditions: [{ field: 'data.note', op: 'eq', value: 'Auto-posted subscription' }],
      steps: [
        { action: 'core.addTag', config: { tag: 'subscription' } },
        { action: 'core.notify', config: { title: '{{data.merchant}} renewed', body: '₹{{data.amount}} posted for {{data.date}}' } },
      ],
    },
  ],
  aiTools: financeAiTools,
  filing: { parsers: financeParsers },
  sources: financeSources,
  filingTools: financeFilingTools,
  brain: financeBrain,
  onStart: async (os) => {
    // Your own categories join the built-in list in every category picker.
    for (const def of [transactionType, subscriptionType]) trackCategoryField(def.fields.find((f) => f.key === 'category'));
    applyCategories(os);
    // R1: Budget records became monthly targets on their categories; a bank name becomes an Organisation. Both fold once.
    foldBudgetsIntoTargets(os);
    foldInstitutions(os);
    // Your share (14 Nov): splits saved before it count your part from now on. Once.
    foldSplitShares(os);
    // Payee names an older parser left with a reference number: cleaned and merged, once (15 Nov).
    if (!os.settings.get<boolean>('finance.payeeTidyV1', false)) {
      tidyPayeeNames(os);
      os.settings.set('finance.payeeTidyV1', true);
    }
    // Money in filed before Counting money (15 Nov): friends' money is money back, a shop's is a refund. Once.
    if (!os.settings.get<boolean>('finance.moneyInV1', false)) {
      sortOldMoneyIn(os);
      os.settings.set('finance.moneyInV1', true);
    }
    // A fund redemption filed before 15 Nov took money out of the bank: it arrives there. Once.
    if (!os.settings.get<boolean>('finance.redemptionsV1', false)) {
      for (const r of os.records.query<{ accountId?: string; toAccountId?: string; rawText?: string }>('transaction', { filter: { and: [{ field: 'data.kind', op: 'eq', value: 'investment' }] } }, { limit: 100_000 })) {
        if (r.data.accountId && !r.data.toAccountId && /\bredeem(?:ed|ption)?\b/i.test(r.data.rawText ?? '')) os.records.update(r.id, { data: { accountId: undefined, toAccountId: r.data.accountId } }, 'system');
      }
      os.settings.set('finance.redemptionsV1', true);
    }
    // Payments filed before subscriptions were spotted get looked at once (phase D).
    if (!os.settings.get<boolean>('finance.spottedV1', false)) {
      spotSubscriptions(os);
      os.settings.set('finance.spottedV1', true);
    }
    // Money from someone you have a balance with (or to someone you owe) settles it, the moment the payment is tied to them.
    bus.on('relation.added', ({ relation }) => {
      if (relation.kind === 'person' || relation.kind === 'payee') settleFromPayment(os, relation.fromId);
    });
    // You recategorised a payment: that payee keeps the category next time (SMS, notifications, mail).
    bus.on('entity.updated', ({ entity, previous, actor }) => {
      if (actor !== 'user' || entity.object !== 'transaction') return;
      const d = entity.data as { category?: string; merchant?: string };
      if (!d.category || d.category === (previous.data as { category?: string }).category) return;
      const others = learnCategory(os, d.merchant, d.category, entity.id);
      const payee = payeeOf(os, entity.id)?.title ?? d.merchant;
      if (others.length && payee) bus.emit('category.learned', { entityId: entity.id, category: d.category, payee, others });
    });
    // Once: payments filed before payees existed join their payee (v2: links to the payer put back after edits).
    if (!os.settings.get<boolean>('payees.backfilledV2', false)) {
      linkMissingPayees(os);
      os.settings.set('payees.backfilled', true);
      os.settings.set('payees.backfilledV2', true);
    }
    // Post due subscription bills daily (and on every app start).
    os.scheduler.registerHandler('finance.subscriptions', (_j, o) => void postDueSubscriptions(o));
    if (!os.scheduler.get('finance.subscriptions')) os.scheduler.schedule({ id: 'finance.subscriptions', kind: 'finance.subscriptions', at: Date.now(), rrule: 'FREQ=DAILY;INTERVAL=1' });
  },
};

export * from './types';
export * from './lib';
export * from './categories';
export { financeBrain, unusualSpends } from './brain';
