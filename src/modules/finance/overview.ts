import type { LifeOSContext } from '@core/registry/context';
import type { Entity } from '@core/domain/types';
import { isoOf, lastMonths, DAY_MS, type ModuleOverview, type OverviewBlock } from '@core/dashboard/overview';
import { budgetStatus, dailySpend, netWorth, spendInRange } from './lib';
import { monthReport, monthlySubscriptionCost } from './reports';
import { categoryOf, type BudgetData } from './types';

/** Money at a glance: this month vs usual, where it went, budgets, the last six months, the biggest spends. */
export function financeOverview(os: LifeOSContext, now = Date.now()): ModuleOverview {
  const money = os.format.currency;
  const r = monthReport(os, 0, new Date(now));
  const months = lastMonths(6, now);
  const byMonth = months.map((m) => spendInRange(os, m.start, m.end));
  const past = byMonth.slice(0, -1).filter((x) => x > 0);
  const usual = past.length ? past.reduce((a, b) => a + b, 0) / past.length : null;
  const week = dailySpend(os, isoOf(now - 6 * DAY_MS), isoOf(now)).map((d) => d.total);
  const subs = os.registry.entityTypes.has('subscription') ? monthlySubscriptionCost(os) : 0;
  const nw = os.registry.entityTypes.has('account') ? netWorth(os) : null;

  const blocks: OverviewBlock[] = [
    {
      kind: 'stats',
      items: [
        { label: 'Spent this month', value: money(r.spend), sub: usual ? `usual ${money(usual)}` : null, tone: usual && r.spend > usual ? 'alert' : undefined },
        { label: 'Came in', value: money(r.income), tone: r.income ? 'ok' : undefined },
        { label: 'Subscriptions', value: `${money(Math.round(subs))}/mo` },
        ...(nw && nw.accounts.length ? [{ label: 'Net worth', value: money(nw.total) }] : []),
      ],
    },
  ];
  if (r.byCategory.length) blocks.push({ kind: 'breakdown', title: 'Where it went this month', parts: r.byCategory.slice(0, 8).map((c) => ({ label: categoryOf(c.category).label, value: c.total, color: categoryOf(c.category).color })), format: 'money' });
  if (byMonth.some((x) => x > 0)) blocks.push({ kind: 'bars', title: 'Spend by month', labels: months.map((m) => m.label), values: byMonth, format: 'money' });
  if (os.registry.entityTypes.has('budget')) {
    const budgets = os.entities.query<BudgetData>('budget', {}, { limit: 50 });
    if (budgets.length)
      blocks.push({
        kind: 'progress',
        title: 'Budgets',
        items: budgets.map((b: Entity<BudgetData>) => {
          const s = budgetStatus(os, b);
          return { label: categoryOf(b.data.category).label, ratio: s.progress, sub: `${money(s.spent)} of ${money(s.limit)}`, entityId: b.id, type: 'budget', over: s.progress > 1 };
        }),
      });
  }
  const big = os.entities.query<{ amount: number; merchant?: string; category?: string; date: string }>('transaction', { filter: { and: [{ field: 'data.kind', op: 'eq', value: 'expense' }, { field: 'data.date', op: 'gte', value: r.month.start }] }, sort: [{ field: 'data.amount', dir: 'desc' }] }, { limit: 5 });
  if (big.length) blocks.push({ kind: 'list', title: 'Biggest this month', items: big.map((t) => ({ title: t.title, sub: `${categoryOf(t.data.category).label} · ${t.data.date.slice(8)}/${t.data.date.slice(5, 7)}`, value: money(t.data.amount), entityId: t.id, type: 'transaction' })), more: { label: 'All transactions', type: 'transaction' } });
  return {
    card: { headline: money(r.spend), sub: usual ? `this month · usual ${money(usual)}` : 'this month', series: week, seriesFormat: 'money', alert: !!usual && r.spend > usual },
    blocks,
  };
}
