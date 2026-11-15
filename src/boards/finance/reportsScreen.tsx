import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { format } from 'date-fns';
import type { LifeOSContext } from '@core/registry/context';
import { useLive } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Card, Chip, ColumnChart, EmptyState, Icon, IconButton, LineChart, ProgressBar, RowItem, RowList, Screen, Section, Segmented, StackedBar, StatTile, Text } from '@ui/kit';
import { blocks } from '@ui/theme/tokens';
import { categoryOf } from '@modules/finance/types';
import { monthReport, netWorthSeries, subscriptionRunRate } from '@modules/finance/reports';
import { netWorth } from '@modules/finance/lib';
import { NoSubscriptions } from './screens';
import { KIND_WORD } from './parts';

type Tab = 'month' | 'subs' | 'worth';

/** One minus sign everywhere (−, not -). */
const signed = (ctx: LifeOSContext, n: number) => `${n < 0 ? '−' : ''}${ctx.format.currency(Math.abs(n))}`;

/** "₹1.2L", "₹48k", "₹900": axis labels. */
const short = (n: number) => {
  const a = Math.abs(n);
  const s = n < 0 ? '−' : '';
  if (a >= 1e7) return `${s}₹${(a / 1e7).toFixed(1)}Cr`;
  if (a >= 1e5) return `${s}₹${(a / 1e5).toFixed(1)}L`;
  if (a >= 1e3) return `${s}₹${Math.round(a / 1e3)}k`;
  return `${s}₹${Math.round(a)}`;
};

/** Money › Reports (M2): Month view, Subscriptions run-rate, Net worth over time. */
export function ReportsScreen({ ctx, params }: { ctx: LifeOSContext; params: Record<string, string> }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>((params.tab as Tab) || 'month');
  return (
    <Screen title="Reports" subtitle="Money" onBack={() => (router.canGoBack() ? router.back() : router.replace('/module/finance' as never))}>
      <Segmented value={tab} onChange={setTab} options={[{ value: 'month', label: 'Month' }, { value: 'subs', label: 'Subscriptions' }, { value: 'worth', label: 'Net worth' }]} />
      {tab === 'month' ? <MonthView ctx={ctx} start={Number(params.month) || 0} /> : tab === 'subs' ? <SubsView ctx={ctx} /> : <WorthView ctx={ctx} />}
    </Screen>
  );
}

function MonthView({ ctx, start = 0 }: { ctx: LifeOSContext; start?: number }) {
  const t = useTheme();
  const router = useRouter();
  const [offset, setOffset] = useState(Math.min(0, start));
  const r = useLive((o) => monthReport(o, offset), [offset]);
  const todayIdx = offset === 0 ? new Date().getDate() - 1 : undefined;
  const colors = r.byCategory.map((_, i) => t.c.chart[i % t.c.chart.length]!);
  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <IconButton icon="chevron-left" accessibilityLabel="Previous month" filled onPress={() => setOffset(offset - 1)} />
        <Text variant="heading" style={{ flex: 1, textAlign: 'center' }}>
          {r.month.label}
        </Text>
        <IconButton icon="chevron-right" accessibilityLabel="Next month" filled disabled={offset >= 0} onPress={() => setOffset(offset + 1)} />
      </View>
      {/* Direction A: what came in and what went, then how this month compares, in words. */}
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <FlowTile icon="download" disc={blocks.lime} value={ctx.format.currency(r.income)} label="Came in" />
        <FlowTile icon="arrow-up" disc={blocks.lilac} value={ctx.format.currency(r.spend)} label="Spent, your share" />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16, paddingHorizontal: 18, borderRadius: 24, backgroundColor: r.net >= 0 ? blocks.sky : '#FF8A7A' }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontSize: 18, lineHeight: 23, fontWeight: '700', color: '#0B0B0D' }}>{r.vsLast == null ? `${signed(ctx, r.net)} left over` : `${Math.round(Math.abs(r.vsLast) * 100)}% ${r.vsLast > 0 ? 'more' : 'less'} than last month`}</Text>
          <Text style={{ fontSize: 13, lineHeight: 17, color: 'rgba(11,11,13,0.68)' }}>{r.vsLast == null ? 'Nothing last month to compare' : `${signed(ctx, r.net)} left over`}</Text>
        </View>
      </View>
      {r.spend > 0 ? (
        <>
          <Card title="By day" icon="calendar" tint="finance">
            <ColumnChart labels={r.daily.map((d) => String(Number(d.date.slice(8))))} series={[{ label: 'Spend', color: t.c.chart[0], values: r.daily.map((d) => d.total) }]} highlight={todayIdx} labelEvery={5} formatY={short} accessibilityLabel={`Daily spend in ${r.month.label}`} />
          </Card>
          <Section title="Where it went" meta={`${r.byCategory.length} categories`}>
            <Card>
              <StackedBar parts={r.byCategory.map((c, i) => ({ label: categoryOf(c.category).label, value: c.total, color: colors[i]!, display: `${Math.round(c.share * 100)}%` }))} />
            </Card>
            <RowList>
              {r.byCategory.map((c, i) => (
                <RowItem key={c.category} icon="receipt" tint="finance" title={categoryOf(c.category).label} subtitle={`${c.count} transaction${c.count === 1 ? '' : 's'} · ${Math.round(c.share * 100)}%`} value={ctx.format.currency(c.total)} strong onPress={() => router.push('/entity/transaction')} trailing={<View style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, backgroundColor: colors[i] }} />} />
              ))}
            </RowList>
          </Section>
        </>
      ) : (
        <EmptyState icon="receipt" tint="finance" line={`No spending logged in ${r.month.label}.`} bare />
      )}
    </>
  );
}

function FlowTile({ icon, disc, value, label }: { icon: string; disc: string; value: string; label: string }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, minWidth: 0, padding: 16, borderRadius: 24, backgroundColor: t.c.bg.tile, gap: 14 }}>
      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: disc, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={16} color="#0B0B0D" />
      </View>
      <View style={{ gap: 2 }}>
        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ fontSize: 22, lineHeight: 26, fontWeight: '700', letterSpacing: -0.6, fontVariant: ['tabular-nums'] }}>{value}</Text>
        <Text color="secondary" style={{ fontSize: 13, lineHeight: 17 }}>{label}</Text>
      </View>
    </View>
  );
}

function SubsView({ ctx }: { ctx: LifeOSContext }) {
  const t = useTheme();
  const router = useRouter();
  const r = useLive((o) => subscriptionRunRate(o), []);
  if (!r.rows.length) return <NoSubscriptions />;
  const top = r.rows[0]!.perMonth;
  return (
    <>
      <StatTile size="2x1" tint="finance" icon="repeat" label="Subscriptions run-rate" value={`${ctx.format.currency(r.monthly)} / mo`} caption={`${ctx.format.currency(r.yearly)} a year · ${r.rows.length} active`} />
      <Section title="By monthly cost" meta={`${r.rows.length}`}>
        <RowList>
          {r.rows.map(({ sub, perMonth, perYear }) => (
            <View key={sub.id} style={{ gap: 6 }}>
              <RowItem icon="repeat" tint="finance" title={sub.data.name} subtitle={`${ctx.format.currency(sub.data.amount)} ${describeBilling(sub.data.rrule)} · next ${format(new Date(`${sub.data.nextBillingAt}T00:00:00`), 'd MMM')}`} value={ctx.format.currency(perMonth)} meta={`${ctx.format.currency(perYear)}/yr`} strong onPress={() => router.push(`/entity/subscription/${sub.id}`)} />
              <ProgressBar value={perMonth / top} color={t.c.accent.gold} height={4} style={{ marginHorizontal: 12 }} accessibilityLabel={`${Math.round((perMonth / r.monthly) * 100)}% of the run-rate`} />
            </View>
          ))}
        </RowList>
      </Section>
    </>
  );
}

const describeBilling = (rrule: string) => {
  const n = Number(/INTERVAL=(\d+)/.exec(rrule)?.[1] ?? 1);
  const f = /FREQ=(\w+)/.exec(rrule)?.[1];
  const unit = { DAILY: 'day', WEEKLY: 'week', MONTHLY: 'month', YEARLY: 'year' }[f ?? 'MONTHLY'] ?? 'month';
  return n === 1 ? `a ${unit}` : `every ${n} ${unit}s`;
};

function WorthView({ ctx }: { ctx: LifeOSContext }) {
  const t = useTheme();
  const router = useRouter();
  const [months, setMonths] = useState(12);
  const series = useLive((o) => netWorthSeries(o, months), [months]);
  const now = useLive((o) => netWorth(o), []);
  const first = series[0]?.total ?? 0;
  const last = series[series.length - 1]?.total ?? 0;
  const delta = last - first;
  return (
    <>
      <StatTile size="2x1" tint="health" icon="trend" label="Net worth" value={signed(ctx, now.total)} caption={`${delta >= 0 ? '+' : '−'}${ctx.format.currency(Math.abs(delta))} over ${series.length > 1 ? `${series.length - 1} month${series.length === 2 ? '' : 's'}` : 'this month'} · ${ctx.format.currency(now.assets)} assets, ${ctx.format.currency(now.liabilities)} owed`} tone={delta >= 0 ? 'ok' : 'alert'} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {[6, 12, 24].map((m) => (
          <Chip key={m} label={`${m} months`} tone={months === m ? 'accent' : 'neutral'} onPress={() => setMonths(m)} />
        ))}
      </View>
      <Card title="Over time" icon="chart" tint="health">
        <LineChart labels={series.map((p, i) => (months > 12 && i % 3 !== 0 && i !== series.length - 1 ? '' : p.label))} series={[{ label: 'Net worth', color: t.tints.health.ink, values: series.map((p) => p.total) }]} formatY={short} accessibilityLabel={`Net worth over ${months} months`} />
      </Card>
      <Section title="Accounts" meta={`${now.accounts.length}`}>
        <RowList>
          {now.accounts.map(({ account, balance }) => (
            <RowItem key={account.id} icon="card" tint="finance" title={account.title} subtitle={account.data.includeInNetWorth === false ? 'Not counted in net worth' : KIND_WORD[account.data.kind]} value={signed(ctx, balance)} valueTone={balance < 0 ? 'alert' : 'default'} strong onPress={() => router.push(`/entity/account/${account.id}`)} />
          ))}
        </RowList>
      </Section>
    </>
  );
}
