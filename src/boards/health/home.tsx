import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import type { LifeOSContext } from '@core/registry/context';
import { compareMetric, formatMetric, isoDay, metricSeries } from '@core/dashboard/metrics';
import { latestMeasurement, workoutsIn } from '@modules/health';
import { useLive } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { EmptyState, IconButton, RowItem, RowList, Screen, Section, Text } from '@ui/kit';
import { ToCheckBell } from '../../screens/ToCheckBell';
import { MetricCard, PAGES, dayWords, hoursMinutes } from './parts';

/**
 * The Health home (the board's index; a first pass from the kit until the
 * NR-Health-Home artboard, docs/design/HEALTH-BRIEF.md screen 1): one card
 * per metric, each opening its own page (steps, sleep, heart rate, weight,
 * screen time), then this month's workouts.
 */
export function HealthHome({ ctx }: { ctx: LifeOSContext; params: Record<string, string> }) {
  const router = useRouter();
  const t = useTheme();
  const fmtCur = ctx.format.currency;

  const d = useLive((os) => {
    const now = Date.now();
    const cards = PAGES.map((p) => {
      const day = metricSeries(os, p.metric, 'day', now);
      const c = compareMetric(os, p.metric, now);
      if (p.metric === 'weight') {
        const m = latestMeasurement(os, 'weight');
        const month = metricSeries(os, 'weight', 'month', now);
        return { p, value: m ? formatMetric('weight', m.data.value, fmtCur) : null, sub: m ? dayWords(m.data.date) : null, change: c.vsLast, bars: [], line: month.buckets.filter((b) => b.value != null).map((b) => b.value!) };
      }
      const has = day.buckets.some((b) => b.value != null);
      // Sleep counts for the day you woke; a day without its own reading shows the 7-day bars only.
      const value = day.value != null ? formatMetric(p.metric, day.value, fmtCur) : has ? 'not yet' : null;
      const avg = p.also ? metricSeries(os, p.also, 'day', now).value : null;
      return { p, value, sub: avg != null ? `average ${formatMetric(p.also!, avg, fmtCur)}` : null, change: c.vsLast, bars: day.buckets.map((b) => b.value), line: undefined };
    });
    return { now, cards, workouts: workoutsIn(os, 30, now), any: cards.some((c) => c.value) || os.records.count('workout') > 0 };
  }, []);

  const right = (
    <>
      <ToCheckBell />
      <IconButton icon="plus" filled={t.tints.health.ink} color={t.c.fg.onAccent} accessibilityLabel="New workout" onPress={() => router.push('/entity/workout/new' as never)} />
    </>
  );
  const header = { title: 'Health', subtitle: dayWords(isoDay(d.now)), right, onBack: () => (router.canGoBack() ? router.back() : router.replace('/browse' as never)) };

  if (!d.any) {
    return (
      <Screen {...header}>
        <EmptyState icon="heart" tint="health" title="Nothing from your body yet" line="Turn on Health Connect and Screen time in Data sources, and make sure Samsung Health (or your watch’s app) shares with Health Connect. Or log a weight or a workout by hand." action="Data sources" onAction={() => router.push('/settings/sources' as never)} />
      </Screen>
    );
  }

  const w = d.workouts;
  return (
    <Screen {...header} contentStyle={{ gap: 14 }}>
      {d.cards.map((c) => (
        <MetricCard key={c.p.key} page={c.p} value={c.value} sub={c.sub} change={c.change} bars={c.bars} line={c.line} onPress={() => router.push(`/module/health/${c.p.key}` as never)} />
      ))}
      <Section title="Workouts" meta={w.count ? `${w.count} in 30 days · ${hoursMinutes(w.minutes)}` : undefined} action="All" onAction={() => router.push('/entity/workout' as never)}>
        {w.count ? (
          <RowList>
            {w.workouts.slice(0, 6).map((x) => (
              <RowItem key={x.id} icon="activity" tint="health" title={x.title} subtitle={dayWords(x.date)} value={`${x.minutes} min${x.km ? ` · ${x.km} km` : ''}`} onPress={() => router.push(`/entity/workout/${x.id}` as never)} />
            ))}
          </RowList>
        ) : (
          <Text variant="caption" color="secondary" style={{ paddingHorizontal: 4 }}>No workouts in the last 30 days. They come in from Health Connect, or add one with +.</Text>
        )}
      </Section>
      <View style={{ height: 8 }} />
    </Screen>
  );
}
