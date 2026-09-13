import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import type { WidgetDef, WidgetProps } from '@core/registry/types';
import type { Entity } from '@core/domain/types';
import { useLive } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Card, SectionHeader, Stat, Text, Row } from '@ui/components/primitives';
import { Bars, ProgressBar, StackedBar } from '@ui/components/charts';
import { EntityRow } from '@ui/components/EntityRow';
import { budgetStatus, dailySpend, monthRange, netWorth, spendByCategory, spendInRange, monthlySubscriptionCost } from './lib';
import { categoryOf, FINANCE_COLOR, type BudgetData, type SubscriptionData } from './types';

function SpendThisMonth({ size, ctx }: WidgetProps) {
  const t = useTheme();
  const router = useRouter();
  const m = monthRange(0);
  const prev = monthRange(-1);
  const { spent, prevSpent, days, byCat } = useLive((os) => ({ spent: spendInRange(os, m.start, m.end), prevSpent: spendInRange(os, prev.start, prev.end), days: dailySpend(os, m.start, m.end), byCat: spendByCategory(os, m.start, m.end) }), [m.start]);
  const today = new Date().getDate();
  const delta = prevSpent ? ((spent - prevSpent) / prevSpent) * 100 : 0;
  return (
    <Card onPress={() => router.push('/module/finance')}>
      <SectionHeader title="Spending" icon="banknote" color={FINANCE_COLOR} action={m.label} />
      <Stat value={ctx.format.currency(spent)} label="This month" trend={prevSpent ? { value: `${Math.abs(delta).toFixed(0)}% vs last`, up: delta > 0 } : undefined} color={t.colors.text} />
      {size !== 'small' ? (
        <View style={{ marginTop: 12 }}>
          <Bars data={days.map((d, i) => ({ label: i % 7 === 0 ? String(i + 1) : '', value: d.total, highlight: i + 1 === today }))} height={80} color={FINANCE_COLOR} labelEvery={1} />
        </View>
      ) : null}
      {size === 'large' && byCat.length ? (
        <View style={{ marginTop: 12, gap: 8 }}>
          <StackedBar parts={byCat.map((c) => ({ value: c.total, color: categoryOf(c.category).color ?? FINANCE_COLOR }))} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {byCat.slice(0, 4).map((c) => (
              <View key={c.category} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: categoryOf(c.category).color }} />
                <Text variant="caption" color="secondary">
                  {categoryOf(c.category).label} {ctx.format.currency(c.total)}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </Card>
  );
}

function NetWorth({ size, ctx }: WidgetProps) {
  const router = useRouter();
  const t = useTheme();
  const nw = useLive((os) => netWorth(os), []);
  return (
    <Card onPress={() => router.push('/entity/account')}>
      <SectionHeader title="Net worth" icon="chart.line" color={FINANCE_COLOR} action="Accounts" />
      <Stat value={ctx.format.currency(nw.total)} label={`${nw.accounts.length} account${nw.accounts.length === 1 ? '' : 's'}`} />
      {size !== 'small' ? (
        <View style={{ marginTop: 10, gap: 6 }}>
          {nw.accounts.slice(0, size === 'large' ? 8 : 3).map(({ account, balance }) => (
            <View key={account.id} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text variant="subhead" color="secondary" numberOfLines={1} style={{ flex: 1 }}>
                {account.title}
              </Text>
              <Text variant="subhead" color={balance < 0 ? t.colors.danger : undefined} style={{ fontVariant: ['tabular-nums'], fontWeight: '600' }}>
                {ctx.format.currency(balance, account.data.currency)}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

function Budgets({ size, ctx }: WidgetProps) {
  const router = useRouter();
  const t = useTheme();
  const rows = useLive((os) => os.entities.query<BudgetData>('budget').map((b) => ({ b, s: budgetStatus(os, b) })), []);
  const limit = size === 'small' ? 2 : size === 'medium' ? 4 : 8;
  return (
    <Card onPress={() => router.push('/entity/budget')}>
      <SectionHeader title="Budgets" icon="chart.pie" color={FINANCE_COLOR} action="All" />
      {rows.length === 0 ? (
        <Text color="tertiary">Set a budget per category to track it here.</Text>
      ) : (
        <View style={{ gap: 10 }}>
          {rows.slice(0, limit).map(({ b, s }) => (
            <View key={b.id} style={{ gap: 4 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text variant="subhead">{b.title}</Text>
                <Text variant="subhead" color={s.remaining < 0 ? t.colors.danger : 'secondary'} style={{ fontVariant: ['tabular-nums'] }}>
                  {ctx.format.currency(s.spent)} / {ctx.format.currency(s.limit)}
                </Text>
              </View>
              <ProgressBar progress={s.progress} color={categoryOf(b.data.category).color ?? FINANCE_COLOR} />
            </View>
          ))}
        </View>
      )}
    </Card>
  );
}

function Upcoming({ ctx }: WidgetProps) {
  const router = useRouter();
  const subs = useLive((os) => os.entities.query<SubscriptionData>('subscription', { filter: { and: [{ field: 'status', op: 'eq', value: 'active' }] }, sort: [{ field: 'data.nextBillingAt', dir: 'asc' }] }, { limit: 5 }), []);
  const monthly = useLive((os) => monthlySubscriptionCost(os), []);
  return (
    <Card padded={false} onPress={() => router.push('/entity/subscription')}>
      <View style={{ padding: 16, paddingBottom: 8 }}>
        <SectionHeader title="Subscriptions" icon="repeat" color={FINANCE_COLOR} action="All" />
        <Stat value={ctx.format.currency(monthly)} unit="/ month" small />
      </View>
      {subs.map((s, i) => (
        <Row key={s.id} title={s.data.name} subtitle={`Next ${ctx.format.date(s.data.nextBillingAt, 'short')}`} value={ctx.format.currency(s.data.amount, s.data.currency)} last={i === subs.length - 1} onPress={() => router.push(`/entity/subscription/${s.id}`)} />
      ))}
    </Card>
  );
}

function RecentTransactions({ size }: WidgetProps) {
  const router = useRouter();
  const txns = useLive((os) => os.entities.query('transaction', { sort: [{ field: 'data.date', dir: 'desc' }, { field: 'createdAt', dir: 'desc' }] }, { limit: size === 'small' ? 3 : size === 'medium' ? 5 : 10 }), [size]);
  return (
    <Card padded={false}>
      <View style={{ padding: 16, paddingBottom: 4 }}>
        <SectionHeader title="Recent transactions" icon="arrow.up.arrow.down" color={FINANCE_COLOR} action="All" onAction={() => router.push('/entity/transaction')} />
      </View>
      {txns.length === 0 ? (
        <Text color="tertiary" style={{ padding: 16, paddingTop: 0 }}>
          No transactions yet.
        </Text>
      ) : (
        txns.map((e: Entity, i) => <EntityRow key={e.id} entity={e} last={i === txns.length - 1} />)
      )}
    </Card>
  );
}

export const financeWidgets: WidgetDef[] = [
  { type: 'finance.spend', module: 'finance', name: 'Spending this month', icon: 'banknote', sizes: ['small', 'medium', 'large'], defaultSize: 'medium', component: SpendThisMonth, description: 'Total spend with daily bars and category breakdown.' },
  { type: 'finance.networth', module: 'finance', name: 'Net worth', icon: 'chart.line', sizes: ['small', 'medium', 'large'], defaultSize: 'medium', component: NetWorth, description: 'All accounts summed, assets minus liabilities.' },
  { type: 'finance.budgets', module: 'finance', name: 'Budgets', icon: 'chart.pie', sizes: ['small', 'medium', 'large'], defaultSize: 'medium', component: Budgets },
  { type: 'finance.subscriptions', module: 'finance', name: 'Subscriptions', icon: 'repeat', sizes: ['medium', 'large'], defaultSize: 'medium', component: Upcoming },
  { type: 'finance.recent', module: 'finance', name: 'Recent transactions', icon: 'arrow.up.arrow.down', sizes: ['small', 'medium', 'large'], defaultSize: 'medium', component: RecentTransactions },
];
