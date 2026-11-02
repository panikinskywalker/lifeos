import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { METRICS, formatMetric, metricSeries } from '@core/dashboard/metrics';
import type { TileDef, TileProps } from '@core/registry/types';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { DeltaChip, MiniBars, Stat, Tile } from '@ui/kit';
import { NeedsSource } from '../../screens/NeedsSource';

/** Steps and Sleep on Today: today's number, the change, the last 7 days; opens the Metric. Small; drawn wide when alone on its row. */
function MetricTile({ id, size }: { id: 'steps' | 'sleep'; size: TileProps['size'] }) {
  const router = useRouter();
  const t = useTheme();
  const os = useOS();
  const s = useLive((o) => metricSeries(o, id, 'day'), [id]);
  const look = id === 'steps' ? ({ icon: 'shoe', tint: 'health' } as const) : ({ icon: 'moon', tint: 'memory' } as const);
  const has = s.buckets.some((b) => b.value != null);
  return (
    <Tile size={size === 'small' ? '1x1' : '2x1'} tint={look.tint} icon={look.icon} label={METRICS[id].label} meta={id === 'sleep' ? 'last night' : 'today'} onPress={() => router.push(`/metric/${id}` as never)}>
      {has ? (
        <View style={{ gap: 6 }}>
          <Stat value={s.value != null ? formatMetric(id, s.value, os.format.currency) : '—'} size="count" />
          <DeltaChip change={s.change} better={METRICS[id].better} vs="vs yesterday" />
          <MiniBars values={s.buckets.map((b) => b.value)} color={t.tints[look.tint].ink} accessibilityLabel={`${METRICS[id].label}, last 7 days`} />
        </View>
      ) : (
        <NeedsSource id={id} />
      )}
    </Tile>
  );
}

export const healthTiles: TileDef[] = [
  { type: 'steps', board: 'health', name: 'Steps', description: 'Today and the last 7 days', icon: 'shoe', sizes: ['small', 'medium'], defaultSize: 'small', component: ({ size }) => <MetricTile id="steps" size={size} /> },
  { type: 'sleep', board: 'health', name: 'Sleep', description: 'Last night and the last 7 days', icon: 'moon', sizes: ['small', 'medium'], defaultSize: 'small', component: ({ size }) => <MetricTile id="sleep" size={size} /> },
];
