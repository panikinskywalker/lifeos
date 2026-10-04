import { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { format } from 'date-fns';
import { METRICS, dailyRange, formatMetric, metricSeries, screenTopApps, type MetricId, type Period } from '@core/dashboard/metrics';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Button, ColumnChart, DeltaChip, EmptyState, HeatMap, RowItem, RowList, Screen, Section, Segmented, Stat, Text } from '@ui/kit';

const PERIOD_WORD: Record<Period, string> = { day: 'yesterday', week: 'the week before', month: 'the 30 days before', year: 'the year before' };
const TINT = { steps: 'health', sleep: 'memory', screen: 'tasks', spend: 'finance', resting_hr: 'health', heart_rate: 'health', weight: 'health' } as const;

/**
 * One metric full screen (M4.3): day / week / month / year, the change vs
 * the previous period, the chart, and the records underneath.
 */
export default function MetricScreen() {
  const { id: raw } = useLocalSearchParams<{ id: string }>();
  const id = (raw in METRICS ? raw : 'steps') as MetricId;
  const def = METRICS[id];
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const [period, setPeriod] = useState<Period>('week');
  const s = useLive((o) => metricSeries(o, id, period), [id, period]);
  const yearDays = useLive((o) => (period === 'year' ? dailyRange(o, id) : []), [id, period]);
  const apps = useLive((o) => (id === 'screen' ? screenTopApps(o, period, Date.now(), 8) : []), [id, period]);
  const txs = useLive(
    (o) =>
      id === 'spend' && o.registry.objects.has('transaction')
        ? o.records.query<{ amount: number; merchant?: string; category?: string; date: string; kind: string }>('transaction', { filter: { and: [{ field: 'data.kind', op: 'eq', value: 'expense' }, { field: 'data.date', op: 'gte', value: s.from }, { field: 'data.date', op: 'lte', value: s.to }] }, sort: [{ field: 'data.date', dir: 'desc' }] }, { limit: 60 })
        : [],
    [id, s.from, s.to],
  );
  const fmt = (v: number) => formatMetric(id, v, os.format.currency);
  const tint = t.tints[TINT[id]];
  const has = s.daysWithData > 0 || s.buckets.some((b) => b.value != null);
  const agg = def.agg === 'sum' ? 'Total' : def.agg === 'avg' ? (period === 'day' ? '' : 'Average per day') : 'Latest';

  return (
    <Screen title={def.label} subtitle={period === 'day' ? format(new Date(), 'EEEE d MMM') : `${format(new Date(`${s.from}T12:00:00`), 'd MMM')} – ${format(new Date(`${s.to}T12:00:00`), 'd MMM')}`} onBack={() => router.back()}>
      <View style={{ gap: 16 }}>
        <Segmented<Period> options={[{ value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }, { value: 'year', label: 'Year' }]} value={period} onChange={setPeriod} />
        {!has ? (
          <EmptyState icon="chart" line={`No ${def.label.toLowerCase()} for this period yet.`} action={def.source === 'money' ? 'Turn on Bank SMS' : def.source === 'usage' ? 'Turn on Screen time' : 'Turn on Health Connect'} onAction={() => router.push('/settings/sources' as never)} />
        ) : (
          <>
            <View style={{ gap: 6 }}>
              {agg ? <Text variant="labelMicro" color="secondary" style={{ textTransform: 'uppercase' }}>{agg}</Text> : null}
              <Stat value={s.value != null ? fmt(s.value) : '—'} size="hero" />
              <DeltaChip change={s.change} better={def.better} vs={`vs ${PERIOD_WORD[period]}${s.prev != null ? ` (${fmt(s.prev)})` : ''}`} />
            </View>
            <ColumnChart
              series={[{ label: def.label, color: tint.ink, values: s.buckets.map((b) => b.value ?? 0) }]}
              labels={s.buckets.map((b) => b.label)}
              highlight={s.buckets.length - 1}
              labelEvery={period === 'month' ? 5 : 1}
              height={180}
              formatY={(n) => (id === 'spend' || id === 'steps' ? (n >= 1000 ? `${Math.round(n / 1000)}k` : String(Math.round(n))) : n.toFixed(def.decimals ? 1 : 0))}
              accessibilityLabel={`${def.label} by ${period === 'year' ? 'month' : 'day'}`}
            />
            {yearDays.length ? (
              <Section title="Every day this year">
                <HeatMap days={yearDays} color={tint.ink} accessibilityLabel={`${def.label} per day, last 12 months`} />
              </Section>
            ) : null}
          </>
        )}
        {apps.length ? (
          <Section title="Apps">
            <RowList>
              {apps.map((a) => (
                <RowItem key={a.package} icon="signal" tint="tasks" title={a.label} value={formatMetric('screen', a.ms / 3_600_000, os.format.currency)} chevron={false} />
              ))}
            </RowList>
          </Section>
        ) : null}
        {txs.length ? (
          <Section title="Transactions">
            <RowList>
              {txs.map((x) => (
                <RowItem key={x.id} icon="rupee" tint="finance" title={x.data.merchant ?? x.title} subtitle={`${format(new Date(`${x.data.date}T12:00:00`), 'd MMM')}${x.data.category ? ` · ${x.data.category}` : ''}`} value={os.format.currency(x.data.amount)} onPress={() => router.push(`/entity/transaction/${x.id}` as never)} />
              ))}
            </RowList>
          </Section>
        ) : null}
        {has && id !== 'spend' && id !== 'screen' ? (
          <Section title="By day">
            <RowList>
              {[...s.buckets].reverse().filter((b) => b.value != null).slice(0, 31).map((b) => (
                <RowItem key={b.key} title={period === 'year' ? format(new Date(`${b.key}-15T12:00:00`), 'MMMM yyyy') : format(new Date(`${b.key}T12:00:00`), 'EEE d MMM')} value={fmt(b.value!)} chevron={false} />
              ))}
            </RowList>
          </Section>
        ) : null}
        {def.source !== 'money' ? (
          <Button title="Data sources" icon="signal" variant="secondary" size="sm" onPress={() => router.push('/settings/sources' as never)} />
        ) : null}
      </View>
    </Screen>
  );
}

