import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { LifeOSContext } from '@core/registry/context';
import type { ObjectRecord } from '@core/domain/types';
import { useLive } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Card, Chip, IconButton, Row, Screen, SectionHeader, Stat, Text, Button } from '@ui/components/primitives';
import { Bars, ProgressBar, StackedBar } from '@ui/components/charts';
import { RecordRow } from '@ui/components/RecordRow';
import { accountBalance, targetStatuses, dailySpend, incomeInRange, monthRange, netWorth, spendByCategory, spendInRange } from '@modules/finance/lib';
import { categoryOf, type AccountData } from '@modules/finance/types';
import { palette } from '@ui/theme/tokens';

const FINANCE_COLOR = palette.green;

/** Finance module home — the "Summary" page for money. */
export function FinanceHome({ ctx }: { ctx: LifeOSContext; params: Record<string, string> }) {
  const router = useRouter();
  const t = useTheme();
  const [offset, setOffset] = useState(0);
  const m = monthRange(offset);
  const data = useLive(
    (os) => ({
      spent: spendInRange(os, m.start, m.end),
      income: incomeInRange(os, m.start, m.end),
      byCat: spendByCategory(os, m.start, m.end),
      days: dailySpend(os, m.start, m.end),
      nw: netWorth(os),
      targets: targetStatuses(os),
      recent: os.records.query('transaction', { sort: [{ field: 'data.date', dir: 'desc' }, { field: 'createdAt', dir: 'desc' }] }, { limit: 8 }),
      count: os.records.count('transaction'),
    }),
    [m.start],
  );
  return (
    <Screen title="Finance" right={<IconButton icon="plus" bg color={FINANCE_COLOR} onPress={() => router.push('/entity/transaction/new')} />}>
      <View style={{ gap: 16 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          <Chip label="Spend" icon="chart.pie" color={FINANCE_COLOR} onPress={() => router.push('/spend' as never)} />
          <Chip label="Transactions" icon="arrow.up.arrow.down" color={FINANCE_COLOR} onPress={() => router.push('/entity/transaction')} />
          <Chip label="Accounts" icon="creditcard" color={FINANCE_COLOR} onPress={() => router.push('/entity/account')} />
          <Chip label="Subscriptions" icon="repeat" color={FINANCE_COLOR} onPress={() => router.push('/entity/subscription')} />
        </ScrollView>

        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <IconButton icon="chevron.left" onPress={() => setOffset((o) => o - 1)} />
            <Text variant="headline">{m.label}</Text>
            <IconButton icon="chevron.right" onPress={() => setOffset((o) => Math.min(0, o + 1))} color={offset === 0 ? t.colors.textTertiary : undefined} />
          </View>
          <View style={{ flexDirection: 'row', gap: 16, marginTop: 8 }}>
            <View style={{ flex: 1 }}>
              <Stat value={ctx.format.currency(data.spent)} label="Spent" small color={t.colors.danger} />
            </View>
            <View style={{ flex: 1 }}>
              <Stat value={ctx.format.currency(data.income)} label="Income" small color={t.colors.success} />
            </View>
          </View>
          <View style={{ marginTop: 12 }}>
            <Bars data={data.days.map((d, i) => ({ label: (i + 1) % 5 === 0 || i === 0 ? String(i + 1) : '', value: d.total, highlight: offset === 0 && i + 1 === new Date().getDate() }))} height={100} color={FINANCE_COLOR} />
          </View>
        </Card>

        {data.byCat.length ? (
          <View>
            <SectionHeader title="By category" icon="chart.pie" color={FINANCE_COLOR} />
            <Card padded={false}>
              <View style={{ padding: 16, paddingBottom: 8 }}>
                <StackedBar parts={data.byCat.map((c) => ({ value: c.total, color: t.paletteColor(categoryOf(c.category).color) ?? FINANCE_COLOR }))} />
              </View>
              {data.byCat.map((c, i) => {
                const cat = categoryOf(c.category);
                return (
                  <Row key={c.category} title={cat.label} subtitle={`${c.count} transaction${c.count === 1 ? '' : 's'}`} icon={cat.icon} iconColor={t.paletteColor(cat.color)} value={ctx.format.currency(c.total)} last={i === data.byCat.length - 1} onPress={() => router.push({ pathname: '/spend', params: { category: c.category, period: offset === 0 ? 'month' : 'last_month' } } as never)} />
                );
              })}
            </Card>
          </View>
        ) : null}

        <View>
          <SectionHeader title="Accounts" icon="creditcard" color={FINANCE_COLOR} action="All" onAction={() => router.push('/entity/account')} />
          <Card padded={false}>
            <View style={{ padding: 16, paddingBottom: 8 }}>
              <Stat value={ctx.format.currency(data.nw.total)} label="Net worth" small />
            </View>
            {data.nw.accounts.length === 0 ? (
              <View style={{ padding: 16, paddingTop: 0 }}>
                <Button title="Add an account" variant="secondary" color={FINANCE_COLOR} onPress={() => router.push('/entity/account/new')} />
              </View>
            ) : (
              data.nw.accounts.map(({ account, balance }, i) => (
                <Row key={account.id} title={account.title} subtitle={account.data.institution ?? account.data.kind} icon="creditcard" iconColor={FINANCE_COLOR} value={ctx.format.currency(balance, account.data.currency)} valueColor={balance < 0 ? t.colors.danger : undefined} last={i === data.nw.accounts.length - 1} onPress={() => router.push(`/entity/account/${account.id}`)} />
              ))
            )}
          </Card>
        </View>

        {data.targets.length ? (
          <View>
            <SectionHeader title="Targets" icon="chart.pie" color={FINANCE_COLOR} action="Edit" onAction={() => router.push('/settings/categories' as never)} />
            <Card style={{ gap: 10 }}>
              {data.targets.map((s) => (
                <View key={s.category} style={{ gap: 4 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text variant="subhead">{categoryOf(s.category).label}</Text>
                    <Text variant="subhead" color={s.remaining < 0 ? t.colors.danger : 'secondary'}>
                      {s.remaining >= 0 ? `${ctx.format.currency(s.remaining)} left` : `${ctx.format.currency(-s.remaining)} over`}
                    </Text>
                  </View>
                  <ProgressBar progress={s.progress} color={t.paletteColor(categoryOf(s.category).color) ?? FINANCE_COLOR} />
                </View>
              ))}
            </Card>
          </View>
        ) : null}

        <View>
          <SectionHeader title="Recent" icon="clock" color={FINANCE_COLOR} action={`All ${data.count}`} onAction={() => router.push('/entity/transaction')} />
          <Card padded={false}>
            {data.recent.length === 0 ? (
              <View style={{ padding: 16 }}>
                <Text color="tertiary">Add your first transaction — or ask the assistant: "spent 450 on lunch".</Text>
              </View>
            ) : (
              data.recent.map((e: ObjectRecord, i) => <RecordRow key={e.id} entity={e} last={i === data.recent.length - 1} />)
            )}
          </Card>
        </View>
      </View>
    </Screen>
  );
}

/* ------------------------------------------------------------------ */
/* Detail sections contributed to the generic entity page               */
/* ------------------------------------------------------------------ */

export function AccountSection({ entity, ctx }: { entity: ObjectRecord<any>; ctx: LifeOSContext }) {
  const router = useRouter();
  const t = useTheme();
  const balance = useLive((os) => accountBalance(os, entity as ObjectRecord<AccountData>), [entity.id, entity.version]);
  const txns = useLive((os) => os.records.query('transaction', { filter: { or: [{ field: 'data.accountId', op: 'eq', value: entity.id }, { field: 'data.toAccountId', op: 'eq', value: entity.id }] }, sort: [{ field: 'data.date', dir: 'desc' }] }, { limit: 10 }), [entity.id]);
  const a = entity as ObjectRecord<AccountData>;
  return (
    <View style={{ gap: 16 }}>
      <Card>
        <Stat value={ctx.format.currency(balance, a.data.currency)} label="Current balance" color={balance < 0 ? t.colors.danger : undefined} />
        {a.data.kind === 'credit' && a.data.creditLimit ? (
          <View style={{ marginTop: 10, gap: 4 }}>
            <ProgressBar progress={-balance / a.data.creditLimit} color={FINANCE_COLOR} />
            <Text variant="caption" color="secondary">
              {ctx.format.currency(-balance)} of {ctx.format.currency(a.data.creditLimit)} limit used
            </Text>
          </View>
        ) : null}
      </Card>
      <View>
        <SectionHeader title="Transactions" icon="arrow.up.arrow.down" color={FINANCE_COLOR} action="Add" onAction={() => router.push({ pathname: '/entity/[type]/new', params: { type: 'transaction', accountId: entity.id } })} />
        <Card padded={false}>
          {txns.length === 0 ? <Text color="tertiary" style={{ padding: 16 }}>No transactions on this account.</Text> : txns.map((e, i) => <RecordRow key={e.id} entity={e} last={i === txns.length - 1} />)}
        </Card>
      </View>
    </View>
  );
}


