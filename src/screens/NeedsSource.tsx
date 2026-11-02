import React from 'react';
import { Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { METRICS, type MetricId } from '@core/dashboard/metrics';
import { Text } from '@ui/kit';

const SOURCE_NAME = { health: 'Health Connect', usage: 'Screen time', money: 'Bank SMS' } as const;

/** A Today tile with no data for its metric names the source to turn on (never a fake zero). */
export function NeedsSource({ id }: { id: MetricId }) {
  const router = useRouter();
  const src = METRICS[id].source;
  return (
    <Pressable accessibilityRole="button" onPress={() => router.push('/settings/sources' as never)} style={{ gap: 4 }}>
      <Text variant="caption" color="secondary">No {METRICS[id].label.toLowerCase()} yet.</Text>
      <Text variant="label" color="primary">Turn on {SOURCE_NAME[src]} ›</Text>
    </Pressable>
  );
}
