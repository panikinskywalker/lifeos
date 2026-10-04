import { z } from 'zod';
import type { AiToolDef } from '@core/registry/types';
import { withExtras } from '@core/ai/cards';
import { targetStatuses, incomeInRange, monthRange, netWorth, spendByCategory, spendInRange } from './lib';
import { monthlySubscriptionCost, netWorthSeries, subscriptionRunRate } from './reports';
import { spendQuery, type SpendKind, type SpendPeriod } from './spend';
import type { InvestmentData } from './types';
import { applySplit, balanceWith, balances, clearSplit, settleUp, undoSettle } from './split';

/** Finance tools for the agent (no React Native — unit-tested). */
export const financeAiTools: AiToolDef[] = [
    {
      name: 'split_transaction',
      description: 'Split an expense with people ("that was dinner with Arjun, split it", "split the cab 3 ways, Priya paid"). parts: everyone sharing it, "me" for the user; method equal | exact (₹) | percent | shares with a value each. payer "me" or a personId. Asks the user before saving.',
      input: z.object({ transactionId: z.string(), payer: z.string().default('me'), method: z.enum(['equal', 'exact', 'percent', 'shares']).default('equal'), parts: z.array(z.object({ party: z.string().describe('"me" or a person id'), value: z.number().optional() })).min(1), groupId: z.string().optional() }),
      confirm: true,
      describe: (i: { transactionId: string; payer: string; method: string; parts: Array<{ party: string }> }, os) => {
        const tx = os.records.get<{ amount: number }>(i.transactionId);
        const names = i.parts.map((p) => (p.party === 'me' ? 'you' : (os.records.get(p.party)?.title ?? '?'))).filter((n) => n !== 'you');
        return `Split ${tx ? os.format.currency(tx.data.amount) : ''} at ${tx?.title ?? 'this'} ${i.method === 'equal' ? 'equally' : `by ${i.method}`} with ${names.join(', ')} · ${i.payer === 'me' ? 'you paid' : `${os.records.get(i.payer)?.title ?? 'they'} paid`}`;
      },
      run: async (input, os) => {
        const i = input as { transactionId: string; payer: string; method: 'equal' | 'exact' | 'percent' | 'shares'; parts: Array<{ party: string; value?: number }>; groupId?: string };
        const tx = os.records.get<{ split?: unknown }>(i.transactionId);
        if (!tx) return { error: 'transaction not found' };
        const prev = tx.data.split as Parameters<typeof applySplit>[2] | undefined;
        const parts = i.parts.some((p) => p.party === 'me') ? i.parts : [{ party: 'me' }, ...i.parts];
        applySplit(os, i.transactionId, { payer: i.payer, method: i.method, parts, groupId: i.groupId });
        const shares = (os.records.get<{ split: { shares: Array<{ party: string; amount: number }> } }>(i.transactionId)!.data.split.shares);
        const name = (p: string) => (p === 'me' ? 'You' : (os.records.get(p)?.title ?? p));
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
        const rows = list.map((b) => ({ person: os.records.get(b.personId)?.title ?? b.personId, personId: b.personId, amount: b.amount, meaning: b.amount > 0 ? 'owes you' : b.amount < 0 ? 'you owe' : 'settled' }));
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
        const who = os.records.get(i.personId)?.title ?? 'them';
        return b > 0 ? `${who} paid you ${os.format.currency(b)} — settle everything` : b < 0 ? `You paid ${who} ${os.format.currency(-b)} — settle everything` : `Nothing owed with ${who}`;
      },
      run: async (input, os) => {
        const i = input as { personId: string; groupId?: string };
        const before = balanceWith(os, i.personId, i.groupId);
        const s = settleUp(os, i.personId, { groupId: i.groupId });
        const who = os.records.get(i.personId)?.title ?? 'them';
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
          targets: targetStatuses(os).map((s) => ({ category: s.category, monthly: s.limit, spent: s.spent, remaining: s.remaining, progress: s.progress })),
          monthlySubscriptions: monthlySubscriptionCost(os),
        };
      },
    },
    {
      name: 'spend',
      description: 'Spend (or income, or investments) for a period — this month, last month, 3 months, this year, all — total, change vs the previous period, by category, by account, the transactions; optional categories / search filter.',
      input: z.object({
        period: z.enum(['month', 'last_month', '3_months', 'year', 'all']).default('month'),
        kind: z.enum(['spending', 'income', 'investments', 'all']).default('spending'),
        categories: z.array(z.string()).optional(),
        search: z.string().optional().describe('merchant or note contains'),
        limit: z.number().int().min(1).max(50).optional().describe('how many transactions to list (default 10)'),
      }),
      run: async (input, os) => {
        const i = input as { period: SpendPeriod; kind: SpendKind; categories?: string[]; search?: string; limit?: number };
        const r = spendQuery(os, { period: i.period, kind: i.kind, categories: i.categories, search: i.search, sort: 'newest' });
        return withExtras(
          {
            period: r.label,
            total: r.total,
            previous: r.prevTotal,
            change: r.change,
            byCategory: r.byCategory.map((c) => ({ category: c.category, total: c.total, share: Math.round(c.share * 100) })),
            byAccount: r.accounts.map((a) => ({ account: a.title, total: a.total })),
            transactions: r.items.slice(0, i.limit ?? 10).map((t) => ({ id: t.id, title: t.title, amount: t.data.amount, kind: t.data.kind, category: t.data.category, date: t.data.date })),
          },
          { card: { kind: 'number', label: `${i.kind === 'spending' ? 'Spent' : i.kind === 'income' ? 'Received' : i.kind === 'investments' ? 'Invested' : 'Moved'} · ${r.label}`, value: os.format.currency(r.total) } },
        );
      },
    },
    {
      name: 'subscriptions_run_rate',
      description: 'Every active subscription converted to per month and per year, with the total run-rate and what is due next.',
      input: z.object({}),
      run: async (_i, os) => {
        const rr = subscriptionRunRate(os);
        return { monthly: rr.monthly, yearly: rr.yearly, subscriptions: rr.rows.map((r) => ({ id: r.sub.id, name: r.sub.title, perMonth: Math.round(r.perMonth), nextBillingAt: (r.sub.data as { nextBillingAt?: string }).nextBillingAt })) };
      },
    },
    {
      name: 'net_worth',
      description: 'Net worth now (accounts, investments at their latest value, liabilities) and at the end of each of the last N months.',
      input: z.object({ months: z.number().int().min(1).max(36).optional() }),
      run: async (input, os) => {
        const nw = netWorth(os);
        return {
          total: nw.total,
          assets: nw.assets,
          investments: nw.investments,
          liabilities: nw.liabilities,
          series: netWorthSeries(os, (input as { months?: number }).months ?? 12).map((p) => ({ month: p.label, total: p.total })),
        };
      },
    },
    {
      name: 'portfolio',
      description: 'Investments: what was put in and what each is worth now, by instrument (mutual fund, stock, FD…); SIPs due and maturities coming up.',
      input: z.object({}),
      run: async (_i, os) => {
        if (!os.registry.objects.has('investment')) return { investments: [] };
        const all = os.records.query<InvestmentData>('investment', { filter: { and: [{ field: 'status', op: 'neq', value: 'sold' }] } }, { limit: 500 });
        const rows = all.map((i) => ({ id: i.id, name: i.title, instrument: i.data.instrument, invested: i.data.invested, currentValue: i.data.currentValue ?? null, gain: i.data.currentValue != null ? Math.round(i.data.currentValue - i.data.invested) : null, sip: i.data.sip ?? null, maturesOn: i.data.maturesOn ?? null }));
        const by: Record<string, { invested: number; value: number }> = {};
        for (const r of rows) {
          const b = (by[r.instrument] ??= { invested: 0, value: 0 });
          b.invested += r.invested;
          b.value += r.currentValue ?? r.invested;
        }
        const soon = Date.now() + 45 * 86_400_000;
        return {
          invested: rows.reduce((n, r) => n + r.invested, 0),
          value: rows.reduce((n, r) => n + (r.currentValue ?? r.invested), 0),
          byInstrument: by,
          investments: rows,
          sips: rows.filter((r) => r.sip).map((r) => ({ name: r.name, perMonth: r.sip })),
          maturing: rows.filter((r) => r.maturesOn && Date.parse(r.maturesOn) <= soon).map((r) => ({ name: r.name, on: r.maturesOn })),
        };
      },
    },
];
