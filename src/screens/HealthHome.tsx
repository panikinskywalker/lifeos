import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { format } from 'date-fns';
import { METRICS, formatMetric, metricSeries, type MetricId } from '@core/dashboard/metrics';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import type { IconName } from '@ui/icons';
import { Button, DeltaChip, IconBox, MiniBars, RowItem, RowList, Screen, Section, Sparkline, Text } from '@ui/kit';
import { Pressable } from 'react-native';

const SECTIONS: Array<{ id: MetricId; icon: IconName; line: string }> = [
  { id: 'steps', icon: 'shoe', line: 'today' },
  { id: 'sleep', icon: 'moon', line: 'last night' },
  { id: 'resting_hr', icon: 'heart', line: 'today' },
  { id: 'heart_rate', icon: 'activity', line: 'today, average' },
  { id: 'weight', icon: 'scale', line: 'latest' },
];

/**
 * Health (M4.2c): one section per thing you track — steps, sleep, heart,
 * weight — each with today's value, the week against the week before, and
 * a tap into its full chart; then workouts. Fed by Health Connect.
 */
export function HealthHome() {
  const t = useTheme();
  const os = useOS();
  const router = useRouter();
  const week = useLive((o) => Object.fromEntries(SECTIONS.map((s) => [s.id, { day: metricSeries(o, s.id, 'day'), week: metricSeries(o, s.id, 'week'), month: metricSeries(o, s.id, 'month') }])), []);
  const workouts = useLive((o) => (o.registry.objects.has('workout') ? o.records.query<{ kind: string; durationMin: number; date: string }>('workout', { sort: [{ field: 'data.date', dir: 'desc' }] }, { limit: 6 }) : []), []);
  const anyData = SECTIONS.some((s) => week[s.id]!.month.daysWithData > 0);
  return (
    <Screen title="Health" subtitle="From Health Connect" onBack={() => router.back()}>
      <View style={{ gap: 14 }}>
        {!anyData ? (
          <View style={{ backgroundColor: t.c.bg.container, borderRadius: 24, padding: 16, gap: 10 }}>
            <Text variant="rowTitle">Nothing from Health Connect yet</Text>
            <Text variant="caption" color="secondary">Turn on Health Connect in Data sources, and make sure Samsung Health (or your watch’s app) shares its data with Health Connect.</Text>
            <Button title="Data sources" size="sm" icon="signal" onPress={() => router.push('/settings/sources' as never)} />
          </View>
        ) : null}
        {SECTIONS.map((s) => {
          const d = week[s.id]!;
          const def = METRICS[s.id];
          const has = d.month.daysWithData > 0;
          const shown = s.id === 'weight' ? d.month.value : d.day.value;
          return (
            <Pressable key={s.id} accessibilityRole="button" onPress={() => router.push(`/metric/${s.id}` as never)} style={({ pressed }) => ({ backgroundColor: t.c.bg.container, borderRadius: 24, padding: 16, gap: 10, opacity: pressed ? 0.85 : 1 })}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <IconBox icon={s.icon} tint={s.id === 'sleep' ? 'memory' : 'health'} size={32} />
                <Text variant="rowTitle" style={{ flex: 1 }}>{def.label}</Text>
                <Text variant="caption" color="secondary">{s.line}</Text>
              </View>
              {has ? (
                <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 16 }}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text variant="stat">{shown != null ? formatMetric(s.id, shown, os.format.currency) : '—'}</Text>
                    <DeltaChip change={d.week.change} better={def.better} vs={def.agg === 'sum' ? 'this week vs last' : 'weekly average vs last'} />
                  </View>
                  <View style={{ width: '45%' }}>
                    {s.id === 'weight' ? (
                      <Sparkline values={d.month.buckets.filter((b) => b.value != null).map((b) => b.value!)} color={t.tints.health.ink} height={44} accessibilityLabel="Weight, last 30 days" />
                    ) : (
                      <MiniBars values={d.day.buckets.map((b) => b.value)} color={s.id === 'sleep' ? t.tints.memory.ink : t.tints.health.ink} accessibilityLabel={`${def.label}, last 7 days`} />
                    )}
                  </View>
                </View>
              ) : (
                <Text variant="caption" color="secondary">No {def.label.toLowerCase()} yet{s.id === 'sleep' ? ' — in Samsung Health, share Sleep with Health Connect' : ''}.</Text>
              )}
            </Pressable>
          );
        })}
        <Section title="Workouts" action="All" onAction={() => router.push('/entity/workout' as never)}>
          {workouts.length ? (
            <RowList>
              {workouts.map((w) => (
                <RowItem key={w.id} icon="activity" tint="health" title={w.title} subtitle={format(new Date(`${w.data.date}T12:00:00`), 'EEE d MMM')} value={`${w.data.durationMin} min`} onPress={() => router.push(`/entity/workout/${w.id}` as never)} />
              ))}
            </RowList>
          ) : (
            <Text variant="caption" color="secondary">No workouts yet — they come in from Health Connect, or add one.</Text>
          )}
        </Section>
      </View>
    </Screen>
  );
}
