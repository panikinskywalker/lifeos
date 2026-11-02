import React from 'react';
import { View } from 'react-native';
import type { MetricCompare as Compare } from '@core/dashboard/metrics';
import { useTheme } from '../theme/ThemeProvider';
import { DeltaChip, Text } from '../kit';

/**
 * This week vs last, vs your usual (R6; docs/MODEL.md layer 2, *Body*):
 * three rows on one card, the change coloured by whether higher is better
 * for this metric. Used by the Metric screen and Health's metric pages.
 */
export function MetricCompareCard({ c, format, title }: { c: Compare; format: (v: number) => string; title?: string }) {
  const t = useTheme();
  const per = c.def.agg === 'last' ? 'latest reading' : c.def.id === 'sleep' ? 'a night, on average' : 'a day, on average';
  const usualHint = c.usual != null ? `median of ${c.usualWeeks} weeks` : 'needs two weeks of data';
  if (c.thisWeek == null && c.lastWeek == null) return null;
  return (
    <View style={{ backgroundColor: t.c.bg.container, borderRadius: 24, padding: 16, gap: 12 }} accessibilityLabel={title ?? `${c.def.label}: this week, last week and your usual`}>
      {title ? (
        <Text variant="labelMicro" color="secondary" style={{ textTransform: 'uppercase' }}>
          {title}
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="rowTitle">This week</Text>
          <Text variant="caption" color="secondary">{per}</Text>
          <DeltaChip change={c.vsLast} better={c.def.better} vs="vs last week" />
          <DeltaChip change={c.vsUsual} better={c.def.better} vs="vs your usual" />
        </View>
        <Value v={c.thisWeek} format={format} />
      </View>
      <Row label="Last week" v={c.lastWeek} format={format} />
      <Row label="Your usual" hint={usualHint} v={c.usual} format={format} />
    </View>
  );
}

function Value({ v, format }: { v: number | null; format: (v: number) => string }) {
  return (
    <Text variant="rowTitle" style={{ fontVariant: ['tabular-nums'] }} color={v == null ? 'secondary' : undefined}>
      {v != null ? format(v) : 'none'}
    </Text>
  );
}

function Row({ label, hint, v, format }: { label: string; hint?: string; v: number | null; format: (v: number) => string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View style={{ flex: 1, gap: 1 }}>
        <Text variant="body">{label}</Text>
        {hint ? <Text variant="caption" color="secondary">{hint}</Text> : null}
      </View>
      <Value v={v} format={format} />
    </View>
  );
}
