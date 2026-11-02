import React from 'react';
import { Pressable, View } from 'react-native';
import { METRICS, type MetricId } from '@core/dashboard/metrics';
import type { IconName } from '@ui/icons';
import { useTheme } from '@ui/theme/ThemeProvider';
import { DeltaChip, IconBox, MiniBars, Sparkline, Text } from '@ui/kit';

/**
 * Health's parts, a first pass from the kit (NR-KitComponents cards,
 * NR-KitCharts minibars and sparkline) until the NR-Health-Parts artboard:
 * the page list, the metric card and the small "from" line. Lime is the
 * Health disc in Noir; sleep is lavender, screen time lilac.
 */

export type PageKey = 'steps' | 'sleep' | 'heart' | 'weight' | 'screen';

export interface PageDef {
  key: PageKey;
  /** The metric the page is about (heart: resting; average is its second). */
  metric: MetricId;
  also?: MetricId;
  title: string;
  icon: IconName;
  tint: 'health' | 'memory' | 'tasks';
  /** What the headline number is. */
  when: string;
  source: 'health' | 'usage';
  /** The empty line, naming what to turn on. */
  empty: string;
}

export const PAGES: PageDef[] = [
  { key: 'steps', metric: 'steps', title: 'Steps', icon: 'shoe', tint: 'health', when: 'today', source: 'health', empty: 'No steps yet. Turn on Health Connect, and let Samsung Health (or your watch’s app) share steps with it.' },
  { key: 'sleep', metric: 'sleep', title: 'Sleep', icon: 'moon', tint: 'memory', when: 'last night', source: 'health', empty: 'No sleep yet. In Samsung Health, share Sleep with Health Connect.' },
  { key: 'heart', metric: 'resting_hr', also: 'heart_rate', title: 'Heart rate', icon: 'heart', tint: 'health', when: 'resting, today', source: 'health', empty: 'No heart rate yet. A watch that shares heart rate with Health Connect fills this.' },
  { key: 'weight', metric: 'weight', title: 'Weight', icon: 'scale', tint: 'health', when: 'latest', source: 'health', empty: 'No weight yet. Log one, or a smart scale that shares with Health Connect fills it.' },
  { key: 'screen', metric: 'screen', title: 'Screen time', icon: 'signal', tint: 'tasks', when: 'today', source: 'usage', empty: 'No screen time yet. Turn on Screen time (Usage access) in Data sources.' },
];

export const pageFor = (key: string) => PAGES.find((p) => p.key === key) ?? PAGES[0]!;
export const sourceWords = (s: PageDef['source']) => (s === 'usage' ? 'From Usage access' : 'From Health Connect');

/** One metric on the Health home: icon, name, the headline number, the change vs last week, a week of bars (weight: a month's line). */
export function MetricCard({ page, value, sub, change, bars, line, onPress }: { page: PageDef; value: string | null; sub?: string | null; change: number | null; bars: Array<number | null>; line?: number[]; onPress: () => void }) {
  const t = useTheme();
  const tint = t.tints[page.tint];
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${page.title}${value ? `, ${value}` : ''}`} onPress={onPress} style={({ pressed }) => ({ backgroundColor: t.c.bg.container, borderRadius: 24, padding: 16, gap: 10, opacity: pressed ? 0.85 : 1 })}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <IconBox icon={page.icon} tint={page.tint} size={32} />
        <Text variant="rowTitle" style={{ flex: 1 }}>{page.title}</Text>
        <Text variant="caption" color="secondary">{page.when}</Text>
      </View>
      {value ? (
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 16 }}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text variant="stat">{value}</Text>
            {sub ? <Text variant="caption" color="secondary">{sub}</Text> : null}
            <DeltaChip change={change} better={METRICS[page.metric].better} vs="vs last week" />
          </View>
          <View style={{ width: '42%' }}>
            {line ? (line.length > 1 ? <Sparkline values={line} color={tint.ink} height={44} accessibilityLabel={`${page.title}, last 30 days`} /> : null) : <MiniBars values={bars} color={tint.ink} accessibilityLabel={`${page.title}, last 7 days`} />}
          </View>
        </View>
      ) : (
        <Text variant="caption" color="secondary">{page.empty}</Text>
      )}
    </Pressable>
  );
}

/** "11:40 pm" from ms. */
export const clock = (ms: number) => new Date(ms).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }).toLowerCase();
/** "Mon 2 Nov" from an ISO day. */
export const dayWords = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
/** "4h 10m" · "45m" from minutes. */
export const hoursMinutes = (min: number) => {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h ? `${h}h${m ? ` ${m}m` : ''}` : `${m}m`;
};
