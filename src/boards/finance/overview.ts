import type { LifeOSContext } from '@core/registry/context';
import type { ObjectRecord } from '@core/domain/types';
import { isoOf, lastMonths, DAY_MS, type ModuleOverview, type OverviewBlock } from '@core/dashboard/overview';
import { daily } from '@core/dashboard/metrics';
import { targetStatuses, dailySpend, netWorth, spendInRange } from '@modules/finance/lib';
import { monthReport, monthlySubscriptionCost } from '@modules/finance/reports';
import { categoryOf } from '@modules/finance/types';

/** Money at a glance: this month vs usual, where it went, budgets, the last six months, the biggest spends. */
export function financeOverview(os: LifeOSContext, now = Date.now(), opts: { cardOnly?: boolean } = {}): ModuleOverview {
  const money = os.format.currency;
  if (opts.cardOnly) {
    // Today's card: this month, your usual month, the last 7 days, nothing else.
    // One query for four months of daily totals; everything else is arithmetic.
    const months = lastMonths(4, now);
    const byDay = daily(os, 'spend', months[0]!.start, isoOf(now));
    const sum = (from: string, to: string) => [...byDay.entries()].reduce((n, [d, v]) => (d >= from && d <= to ? n + v : n), 0);
    const spent = sum(months[3]!.start, isoOf(now));
    const past = months.slice(0, 3).map((m) => sum(m.start, m.end)).filter((x) => x > 0);
    const usual = past.length ? past.reduce((a, b) => a + b, 0) / past.length : null;
    const week = Array.from({ length: 7 }, (_, i) => byDay.get(isoOf(now - (6 - i) * DAY_MS)) ?? 0);
    return { card: { headline: money(spent), sub: usual ? `this month · usual ${money(usual)}` : 'this month', series: week, seriesFormat: 'money', alert: !!usual && spent > usual }, blocks: [] };
  }
  const r = monthReport(os, 0, new Date(now));
  const months = lastMonths(6, now);
  const byMonth = months.map((m) => spendInRange(os, m.start, m.end));
  const past = byMonth.slice(0, -1).filter((x) => x > 0);
  const usual = past.length ? past.reduce((a, b) => a + b, 0) / past.length : null;
  const week = dailySpend(os, isoOf(now - 6 * DAY_MS), isoOf(now)).map((d) => d.total);
  const subs = os.registry.objects.has('subscription') ? monthlySubscriptionCost(os) : 0;
  const nw = os.registry.objects.has('account') ? netWorth(os) : null;

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
  const targets = targetStatuses(os, now);
  if (targets.length)
    blocks.push({
      kind: 'progress',
      title: 'Targets',
      items: targets.map((s) => ({ label: categoryOf(s.category).label, ratio: s.progress, sub: `${money(s.spent)} of ${money(s.limit)}`, over: s.progress > 1 })),
    });
  const big = os.records.query<{ amount: number; merchant?: string; category?: string; date: string }>('transaction', { filter: { and: [{ field: 'data.kind', op: 'eq', value: 'expense' }, { field: 'data.date', op: 'gte', value: r.month.start }] }, sort: [{ field: 'data.amount', dir: 'desc' }] }, { limit: 5 });
  if (big.length) blocks.push({ kind: 'list', title: 'Biggest this month', items: big.map((t) => ({ title: t.title, sub: `${categoryOf(t.data.category).label} · ${t.data.date.slice(8)}/${t.data.date.slice(5, 7)}`, value: money(t.data.amount), entityId: t.id, type: 'transaction' })), more: { label: 'All transactions', type: 'transaction' } });
  return {
    card: { headline: money(r.spend), sub: usual ? `this month · usual ${money(usual)}` : 'this month', series: week, seriesFormat: 'money', alert: !!usual && r.spend > usual },
    blocks,
  };
}
