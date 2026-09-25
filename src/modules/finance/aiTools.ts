import { z } from 'zod';
import type { AiToolDef } from '@core/registry/types';
import { withExtras } from '@core/ai/cards';
import { budgetStatus, incomeInRange, monthRange, netWorth, spendByCategory, spendInRange } from './lib';
import { monthlySubscriptionCost } from './reports';
import type { BudgetData } from './types';
import { applySplit, balanceWith, balances, clearSplit, settleUp, undoSettle } from './split';

/** Finance tools for the agent (no React Native — unit-tested). */
export const financeAiTools: AiToolDef[] = [
    {
      name: 'split_transaction',
      description: 'Split an expense with people ("that was dinner with Arjun, split it", "split the cab 3 ways, Priya paid"). parts: everyone sharing it, "me" for the user; method equal | exact (₹) | percent | shares with a value each. payer "me" or a personId. Asks the user before saving.',
      input: z.object({ transactionId: z.string(), payer: z.string().default('me'), method: z.enum(['equal', 'exact', 'percent', 'shares']).default('equal'), parts: z.array(z.object({ party: z.string().describe('"me" or a person id'), value: z.number().optional() })).min(1), groupId: z.string().optional() }),
      confirm: true,
      describe: (i: { transactionId: string; payer: string; method: string; parts: Array<{ party: string }> }, os) => {
        const tx = os.entities.get<{ amount: number }>(i.transactionId);
        const names = i.parts.map((p) => (p.party === 'me' ? 'you' : (os.entities.get(p.party)?.title ?? '?'))).filter((n) => n !== 'you');
        return `Split ${tx ? os.format.currency(tx.data.amount) : ''} at ${tx?.title ?? 'this'} ${i.method === 'equal' ? 'equally' : `by ${i.method}`} with ${names.join(', ')} · ${i.payer === 'me' ? 'you paid' : `${os.entities.get(i.payer)?.title ?? 'they'} paid`}`;
      },
      run: async (input, os) => {
        const i = input as { transactionId: string; payer: string; method: 'equal' | 'exact' | 'percent' | 'shares'; parts: Array<{ party: string; value?: number }>; groupId?: string };
        const tx = os.entities.get<{ split?: unknown }>(i.transactionId);
        if (!tx) return { error: 'transaction not found' };
        const prev = tx.data.split as Parameters<typeof applySplit>[2] | undefined;
        const parts = i.parts.some((p) => p.party === 'me') ? i.parts : [{ party: 'me' }, ...i.parts];
        applySplit(os, i.transactionId, { payer: i.payer, method: i.method, parts, groupId: i.groupId });
        const shares = (os.entities.get<{ split: { shares: Array<{ party: string; amount: number }> } }>(i.transactionId)!.data.split.shares);
        const name = (p: string) => (p === 'me' ? 'You' : (os.entities.get(p)?.title ?? p));
        return withExtras(
          { split: shares.map((s) => ({ who: name(s.party), amount: s.amount })), payer: name(i.payer) },
          { undo: () => (prev ? void applySplit(os, i.transactionId, prev) : clearSplit(os, i.transactionId)), card: { kind: 'list', title: `Split · ${tx.title}`, items: shares.map((s) => ({ entityId: s.party === 'me' ? undefined : s.party, type: 'person', title: name(s.party), value: os.format.currency(s.amount) })) } },
        );
      },
    },
    {
      name: 'balances',
      description: 'Who owes whom: the running balance with each person (optionally within a group). + means they owe the user.',
      input: z.object({ personId: z.string().optional(), groupId: z.string().optional() }),
      run: async (input, os) => {
        const i = input as { personId?: string; groupId?: string };
        const list = i.personId ? [{ personId: i.personId, amount: balanceWith(os, i.personId, i.groupId) }] : balances(os, i.groupId);
        const rows = list.map((b) => ({ person: os.entities.get(b.personId)?.title ?? b.personId, personId: b.personId, amount: b.amount, meaning: b.amount > 0 ? 'owes you' : b.amount < 0 ? 'you owe' : 'settled' }));
        return withExtras({ balances: rows }, { card: { kind: 'list', title: 'Balances', items: rows.map((r) => ({ entityId: r.personId, type: 'person', title: `${r.person} ${r.meaning}`, value: os.format.currency(Math.abs(r.amount)) })) } });
      },
    },
    {
      name: 'settle_debt',
      description: 'Settle up with a person ("Priya paid me back", "I paid Arjun"): files a payment for the whole balance and marks everything between you settled. Asks the user first.',
      input: z.object({ personId: z.string(), groupId: z.string().optional() }),
      confirm: true,
      describe: (i: { personId: string; groupId?: string }, os) => {
        const b = balanceWith(os, i.personId, i.groupId);
        const who = os.entities.get(i.personId)?.title ?? 'them';
        return b > 0 ? `${who} paid you ${os.format.currency(b)} — settle everything` : b < 0 ? `You paid ${who} ${os.format.currency(-b)} — settle everything` : `Nothing owed with ${who}`;
      },
      run: async (input, os) => {
        const i = input as { personId: string; groupId?: string };
        const before = balanceWith(os, i.personId, i.groupId);
        const s = settleUp(os, i.personId, { groupId: i.groupId });
        const who = os.entities.get(i.personId)?.title ?? 'them';
        return withExtras({ settled: who, amount: before }, { undo: () => undoSettle(os, s), card: { kind: 'number', label: `Settled with ${who}`, value: os.format.currency(Math.abs(before)), caption: before > 0 ? 'they paid you' : before < 0 ? 'you paid them' : 'nothing was owed' } });
      },
    },
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
];
