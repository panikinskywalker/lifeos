import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import type { LifeOSContext } from '@core/registry/context';
import { METRICS, compareMetric, formatMetric, isoDay, metricSeries, screenTopApps, type MetricId } from '@core/dashboard/metrics';
import { usageDays } from '@core/sources/deviceData';
import { latestMeasurement, sleepNights, workoutsIn, type MeasurementData } from '@modules/health';
import { useLive } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { MetricCompareCard } from '@ui/components/MetricCompare';
import { Button, ColumnChart, EmptyState, IconButton, LineChart, RowItem, RowList, Screen, Section, Stat, Text } from '@ui/kit';
import { clock, dayWords, pageFor, sourceWords, type PageDef, type PageKey } from './parts';

/**
 * One page per metric (R6; a first pass from the kit until the
 * NR-Health-Metric artboards, docs/design/HEALTH-BRIEF.md screen 2): the
 * headline number, this week vs last and vs your usual, the last 30 days,
 * then what only this metric has (sleep's nights, screen time's apps,
 * weight's readings, steps' best day and walks). The full chart (day to
 * year, the heat map) is the Metric screen.
 */

const DAY = 86_400_000;

function usePage(page: PageDef) {
  return useLive((os) => {
    const now = Date.now();
    const today = isoDay(now);
    const from30 = isoDay(now - 29 * DAY);
    const id = page.metric;
    const month = metricSeries(os, id, 'month', now);
    const day = metricSeries(os, id, 'day', now);
    const latest = id === 'weight' ? latestMeasurement(os, 'weight') : null;
    const out = {
      now,
      month,
      head: id === 'weight' ? (latest ? { v: latest.data.value, on: latest.data.date } : null) : day.value != null ? { v: day.value, on: today } : null,
      cmp: compareMetric(os, id, now),
      also: page.also ? { cmp: compareMetric(os, page.also, now), month: metricSeries(os, page.also, 'month', now), day: metricSeries(os, page.also, 'day', now).value } : null,
      nights: page.key === 'sleep' ? sleepNights(os, isoDay(now - 13 * DAY), today) : [],
      apps: page.key === 'screen' ? screenTopApps(os, 'week', now, 8) : [],
      usageToday: page.key === 'screen' ? usageDays(os, today, today)[0] ?? null : null,
      readings: page.key === 'weight' && os.registry.objects.has('measurement') ? os.records.query<MeasurementData>('measurement', { filter: { and: [{ field: 'data.metric', op: 'eq', value: 'weight' }] }, sort: [{ field: 'data.date', dir: 'desc' }, { field: 'createdAt', dir: 'desc' }] }, { limit: 20 }) : [],
      walks: page.key === 'steps' ? workoutsIn(os, 7, now).workouts.filter((w) => w.kind === 'walk' || w.kind === 'run') : [],
      best: page.key === 'steps' ? month.buckets.reduce<{ key: string; value: number } | null>((b, x) => (x.value != null && (!b || x.value > b.value) ? { key: x.key, value: x.value } : b), null) : null,
      from30,
    };
    return out;
  }, [page.key]);
}

export function MetricPage({ ctx, page: key }: { ctx: LifeOSContext; page: PageKey }) {
  const page = pageFor(key);
  const router = useRouter();
  const t = useTheme();
  const d = usePage(page);
  const fmt = (id: MetricId) => (v: number) => formatMetric(id, v, ctx.format.currency);
  const f = fmt(page.metric);
  const tint = t.tints[page.tint].ink;
  const has = d.month.daysWithData > 0 || d.head != null;
  const header = {
    title: page.title,
    subtitle: sourceWords(page.source),
    onBack: () => (router.canGoBack() ? router.back() : router.replace('/module/health/index' as never)),
    right: <IconButton icon="chart" accessibilityLabel="Full chart" onPress={() => router.push(`/metric/${page.metric}` as never)} />,
  };

  if (!has) {
    return (
      <Screen {...header}>
        <EmptyState icon={page.icon} tint="health" line={page.empty} action={page.key === 'weight' ? 'Log weight' : 'Data sources'} onAction={() => router.push((page.key === 'weight' ? '/entity/measurement/new?metric=weight' : '/settings/sources') as never)} />
      </Screen>
    );
  }

  const chart = d.month.buckets;
  const weightPts = chart.filter((b) => b.value != null);
  return (
    <Screen {...header} contentStyle={{ gap: 14 }}>
      <View style={{ gap: 4 }}>
        <Text variant="labelMicro" color="secondary" style={{ textTransform: 'uppercase' }}>
          {page.key === 'weight' && d.head ? `latest · ${dayWords(d.head.on)}` : page.when}
        </Text>
        <Stat value={d.head ? f(d.head.v) : 'not yet'} size="hero" />
        {d.also?.day != null ? <Text variant="caption" color="secondary">average {fmt(page.also!)(d.also.day)} today</Text> : null}
      </View>

      <MetricCompareCard c={d.cmp} format={f} title={page.also ? 'Resting' : undefined} />
      {d.also ? <MetricCompareCard c={d.also.cmp} format={fmt(page.also!)} title="Average through the day" /> : null}

      <Section title="Last 30 days" action="Full chart" onAction={() => router.push(`/metric/${page.metric}` as never)}>
        {page.key === 'weight' ? (
          weightPts.length > 1 ? (
            <LineChart series={[{ label: 'Weight', color: tint, values: weightPts.map((b) => b.value!) }]} labels={weightPts.map((b) => b.label)} height={160} formatY={(n) => n.toFixed(1)} accessibilityLabel="Weight, last 30 days" />
          ) : (
            <Text variant="caption" color="secondary" style={{ paddingHorizontal: 4 }}>One reading this month; the line starts with the second.</Text>
          )
        ) : (
          <ColumnChart
            series={[{ label: page.title, color: tint, values: chart.map((b) => b.value ?? 0) }]}
            labels={chart.map((b) => b.label)}
            highlight={chart.length - 1}
            labelEvery={5}
            height={160}
            formatY={(n) => (page.metric === 'steps' ? (n >= 1000 ? `${Math.round(n / 1000)}k` : String(Math.round(n))) : n.toFixed(METRICS[page.metric].decimals ? 1 : 0))}
            accessibilityLabel={`${page.title} by day, last 30 days`}
          />
        )}
      </Section>

      {page.key === 'steps' ? (
        <>
          {d.best ? (
            <RowList>
              <RowItem icon="shoe" tint="health" title="Best day this month" subtitle={dayWords(d.best.key)} value={f(d.best.value)} chevron={false} />
            </RowList>
          ) : null}
          {d.walks.length ? (
            <Section title="Walks and runs this week">
              <RowList>
                {d.walks.map((w) => (
                  <RowItem key={w.id} icon="activity" tint="health" title={w.title} subtitle={dayWords(w.date)} value={`${w.minutes} min${w.km ? ` · ${w.km} km` : ''}`} onPress={() => router.push(`/entity/workout/${w.id}` as never)} />
                ))}
              </RowList>
            </Section>
          ) : null}
        </>
      ) : null}

      {page.key === 'sleep' && d.nights.length ? (
        <Section title="Nights">
          <RowList>
            {d.nights.map((n) => (
              <RowItem key={n.id} icon="moon" tint="memory" title={dayWords(n.day)} subtitle={n.asleep && n.awake ? `${clock(n.asleep)} to ${clock(n.awake)}` : null} value={f(n.hours)} onPress={() => router.push(`/entity/measurement/${n.id}` as never)} />
            ))}
          </RowList>
        </Section>
      ) : null}

      {page.key === 'heart' ? (
        <Section title="By day">
          <RowList>
            {[...chart].reverse().filter((b) => b.value != null || d.also?.month.buckets.find((x) => x.key === b.key)?.value != null).slice(0, 14).map((b) => {
              const avg = d.also?.month.buckets.find((x) => x.key === b.key)?.value;
              return <RowItem key={b.key} icon="heart" tint="health" title={dayWords(b.key)} subtitle={avg != null ? `average ${fmt('heart_rate')(avg)}` : null} value={b.value != null ? `resting ${f(b.value)}` : null} chevron={false} />;
            })}
          </RowList>
        </Section>
      ) : null}

      {page.key === 'weight' ? (
        <Section title="Readings" action="Log weight" onAction={() => router.push('/entity/measurement/new?metric=weight' as never)}>
          <RowList>
            {d.readings.map((r) => (
              <RowItem key={r.id} icon="scale" tint="health" title={dayWords(r.data.date)} subtitle={r.data.source === 'health_connect' ? 'Health Connect' : 'you'} value={f(r.data.value)} onPress={() => router.push(`/entity/measurement/${r.id}` as never)} />
            ))}
          </RowList>
        </Section>
      ) : null}

      {page.key === 'screen' ? (
        <>
          {d.usageToday && (d.usageToday.pickups || d.usageToday.firstUse) ? (
            <RowList>
              {d.usageToday.pickups ? <RowItem icon="signal" tint="tasks" title="Pickups today" value={String(d.usageToday.pickups)} chevron={false} /> : null}
              {d.usageToday.firstUse ? <RowItem icon="signal" tint="tasks" title="First and last use" value={`${clock(d.usageToday.firstUse)} to ${d.usageToday.lastUse ? clock(d.usageToday.lastUse) : 'now'}`} chevron={false} /> : null}
            </RowList>
          ) : null}
          {d.apps.length ? (
            <Section title="Apps this week">
              <RowList>
                {d.apps.map((a) => (
                  <RowItem key={a.package} icon="signal" tint="tasks" title={a.label} value={formatMetric('screen', a.ms / 3_600_000, ctx.format.currency)} chevron={false} />
                ))}
              </RowList>
            </Section>
          ) : null}
        </>
      ) : null}

      <Button title="Data sources" icon="signal" variant="secondary" size="sm" onPress={() => router.push('/settings/sources' as never)} />
      <View style={{ height: 8 }} />
    </Screen>
  );
}

/** A board screen for each page (keys are the page keys: /module/health/steps …). */
export const pageScreen = (key: PageKey) => {
  const Screen_ = ({ ctx }: { ctx: LifeOSContext; params: Record<string, string> }) => <MetricPage ctx={ctx} page={key} />;
  Screen_.displayName = `HealthPage_${key}`;
  return Screen_;
};
