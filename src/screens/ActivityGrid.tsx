import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import type { TrackerSummary } from '@core/activity/trackers';
import { useTheme } from '@ui/theme/ThemeProvider';
import type { TintKey } from '@ui/theme/tokens';
import { Icon, IconBox, Text } from '@ui/kit';

const GAP = 4;
const MIN_CELL = 15;

/**
 * Days as a GitHub-style grid that fills its width edge to edge: as many
 * whole weeks as fit (newest on the right), a column per week, Monday on
 * top. Done days in the tracker's colour, others a faint shade of it.
 */
export function ActivityGrid({ days, color, accessibilityLabel }: { days: TrackerSummary['days']; color: string; accessibilityLabel?: string }) {
  const [w, setW] = useState(0);
  const weeksAvail = Math.floor(days.length / 7);
  const cols = w ? Math.max(1, Math.min(weeksAvail, Math.floor((w + GAP) / (MIN_CELL + GAP)))) : 0;
  const cell = cols ? (w - (cols - 1) * GAP) / cols : 0;
  const shown = cols ? days.slice(days.length - cols * 7) : [];
  const h = cell * 7 + GAP * 6;
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ height: w ? h : 7 * (MIN_CELL + GAP) }} accessibilityRole="image" accessibilityLabel={accessibilityLabel}>
      {w > 0 ? (
        <Svg width={w} height={h}>
          {shown.map((d, i) => {
            const col = Math.floor(i / 7);
            const row = i % 7;
            if (d.value == null) return null;
            return <Rect key={d.day} x={col * (cell + GAP)} y={row * (cell + GAP)} width={cell} height={cell} rx={cell * 0.28} fill={color} opacity={d.value ? 1 : 0.16} />;
          })}
        </Svg>
      ) : null}
    </View>
  );
}

/** One tracker: its icon and name, today's tick, the grid, and this week / streak. */
export function ActivityRow({ s, onPress }: { s: TrackerSummary; onPress?: () => void }) {
  const t = useTheme();
  const tint = (t.tints[s.tracker.tint as TintKey] ? s.tracker.tint : 'tasks') as TintKey;
  const ink = t.tints[tint].ink;
  const today = s.days.filter((d) => d.value != null).at(-1)?.value === 1;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${s.tracker.name}: ${today ? 'done today, ' : ''}${s.thisWeek} days this week, ${s.streak} day streak`} onPress={onPress} style={({ pressed }) => ({ gap: 12, opacity: pressed ? 0.85 : 1 })}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <IconBox icon={s.tracker.icon} tint={tint} size={32} />
        <Text variant="rowTitle" style={{ flex: 1 }} numberOfLines={1}>
          {s.tracker.name}
        </Text>
        <View style={{ width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: today ? ink : t.tints[tint].fill }}>
          <Icon name="check" size={16} color={today ? t.c.bg.ground : ink} />
        </View>
      </View>
      <ActivityGrid days={s.days} color={ink} accessibilityLabel={`${s.tracker.name}, last weeks`} />
      <Text variant="caption" color="secondary">
        {s.thisWeek} this week · {s.thisMonth} this month{s.streak > 1 ? ` · ${s.streak}-day streak` : ''}
      </Text>
    </Pressable>
  );
}
