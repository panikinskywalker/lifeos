import React from 'react';
import { Pressable, View } from 'react-native';
import type { TrackerSummary } from '@core/activity/trackers';
import { useTheme } from '@ui/theme/ThemeProvider';
import type { TintKey } from '@ui/theme/tokens';
import { HeatMap, Icon, Text } from '@ui/kit';

/** One tracker as a GitHub-style row: name, this week / streak, and the grid of days. */
export function ActivityRow({ s, onPress }: { s: TrackerSummary; onPress?: () => void }) {
  const t = useTheme();
  const tint = (t.tints[s.tracker.tint as TintKey] ? s.tracker.tint : 'tasks') as TintKey;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${s.tracker.name}: ${s.thisWeek} days this week, ${s.streak} day streak`} onPress={onPress} style={({ pressed }) => ({ gap: 8, opacity: pressed ? 0.8 : 1 })}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name={s.tracker.icon} size={16} color={t.tints[tint].ink} />
        <Text variant="label" style={{ flex: 1 }} numberOfLines={1}>{s.tracker.name}</Text>
        <Text variant="caption" color="secondary">
          {s.thisWeek} this week{s.streak > 1 ? ` · ${s.streak}-day streak` : ''}
        </Text>
      </View>
      <HeatMap days={s.days} color={t.tints[tint].ink} accessibilityLabel={`${s.tracker.name}, last ${Math.round(s.days.length / 7)} weeks`} />
    </Pressable>
  );
}
