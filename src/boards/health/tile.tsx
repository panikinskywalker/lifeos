import React from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Rect } from 'react-native-svg';
import { compareMetric, formatMetric, metricSeries } from '@core/dashboard/metrics';
import type { TileDef, TileProps } from '@core/registry/types';
import { healthToday } from '@modules/health';
import { useLive } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Icon, Text } from '@ui/kit';
import { ModuleDot, Pill, changeTone } from './parts';

/**
 * Steps and Sleep on Today (NR-Health-Tile). Small: the number and the other
 * metric's line, opening that metric's page. Wide: the same with the week's
 * bars and the change, opening the Health & Fitness home. With nothing yet,
 * the small and the wide name the permission and open Data sources.
 */

const signed = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '');

function WeekBars({ values }: { values: Array<number | null> }) {
  const t = useTheme();
  const max = Math.max(...values.map((v) => v ?? 0), 1);
  return (
    <Svg width={118} height={44} style={{ flexShrink: 0 }}>
      {values.map((v, i) => {
        const h = v == null ? 3 : Math.max(3, (v / max) * 42);
        return <Rect key={i} x={i * 17.67} y={44 - h} width={12} height={h} rx={v == null ? 1.5 : 4} fill={v == null ? t.c.line : i === values.length - 1 ? t.c.accent.mustard : `${t.c.fg.primary}1A`} />;
      })}
    </Svg>
  );
}

function MetricTile({ id, size }: { id: 'steps' | 'sleep'; size: TileProps['size'] }) {
  const router = useRouter();
  const t = useTheme();
  const wide = size !== 'small';
  const d = useLive((os) => {
    const now = Date.now();
    const today = healthToday(os, now);
    const week = metricSeries(os, id, 'day', now);
    const fmt = (m: 'steps' | 'sleep', v: number) => formatMetric(m, v, os.format.currency);
    return {
      value: id === 'steps' ? (today.steps != null ? fmt('steps', today.steps) : null) : today.sleep != null ? fmt('sleep', today.sleep) : null,
      other: id === 'steps' ? (today.sleep != null ? `slept ${fmt('sleep', today.sleep)}` : null) : today.steps != null ? `${fmt('steps', today.steps)} steps` : null,
      bars: week.buckets.map((b) => b.value),
      has: week.buckets.some((b) => b.value != null),
      change: compareMetric(os, id, now).vsLast,
    };
  }, [id]);

  const shape = wide ? { minHeight: 167 } : { flex: 1, aspectRatio: 1 };
  const head = (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Text color="secondary" style={{ fontSize: 11, lineHeight: 14, fontWeight: '600', letterSpacing: 0.9 }}>{wide ? 'HEALTH & FITNESS' : 'HEALTH'}</Text>
      <ModuleDot />
    </View>
  );

  if (!d.has) {
    return (
      <Pressable accessibilityRole="button" accessibilityLabel="Health, needs Health Connect, data sources" onPress={() => router.push('/settings/sources' as never)} style={({ pressed }) => [{ padding: 16, borderRadius: 24, backgroundColor: t.c.bg.tile, borderWidth: 1, borderStyle: 'dashed', borderColor: `${t.c.fg.primary}52`, justifyContent: 'space-between', opacity: pressed ? 0.9 : 1 }, shape]}>
        {head}
        <Text style={{ fontSize: 17, lineHeight: 22, fontWeight: '700', letterSpacing: -0.2 }}>Needs Health Connect</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text color={t.c.accent.mustard} style={{ fontSize: 12, lineHeight: 15, fontWeight: '600' }}>Data sources</Text>
          <Icon name="chevron-right" size={13} color={t.c.accent.mustard} />
        </View>
      </Pressable>
    );
  }

  const unit = id === 'steps' ? 'steps' : '';
  const word = id === 'steps' ? 'steps today' : 'last night';
  const big = { fontSize: 30, lineHeight: 32, fontWeight: '700' as const, letterSpacing: -0.5, fontVariant: ['tabular-nums' as const] };
  const otherIcon = id === 'steps' ? 'moon' : 'shoe';
  const otherColor = id === 'steps' ? t.tints.tasks.ink : t.c.accent.mustard;
  const pct = d.change != null ? `${signed(d.change)}${Math.abs(Math.round(d.change * 100))}% this week` : null;
  const value = d.value ?? 'Not yet';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[`Health, ${value}${d.value && unit ? ` ${unit}` : ''}`, d.other, pct].filter(Boolean).join(', ')}
      onPress={() => router.push((wide ? '/module/health' : `/module/health/${id}`) as never)}
      style={({ pressed }) => [{ padding: 16, borderRadius: 24, backgroundColor: t.c.bg.tile, justifyContent: 'space-between', opacity: pressed ? 0.9 : 1 }, shape]}
    >
      {head}
      {wide ? (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={[big, { flexShrink: 1 }]}>{d.value && unit ? `${d.value} ${unit}` : value}</Text>
            <WeekBars values={d.bars} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {d.other ? <Icon name={otherIcon} size={14} color={otherColor} /> : null}
              {d.other ? <Text color="secondary" numberOfLines={1} style={{ flexShrink: 1, fontSize: 13, lineHeight: 17, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{d.other}</Text> : null}
            </View>
            {pct ? <Pill small label={pct} tone={changeTone(d.change, 'up')} /> : null}
          </View>
        </>
      ) : (
        <>
          <View style={{ gap: 2 }}>
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={big}>{value}</Text>
            <Text color="secondary" style={{ fontSize: 13, lineHeight: 17, fontWeight: '600' }}>{word}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 15 }}>
            {d.other ? <Icon name={otherIcon} size={13} color={otherColor} style={{ flexShrink: 0 }} /> : null}
            {d.other ? <Text color="secondary" numberOfLines={1} style={{ flexShrink: 1, fontSize: 12, lineHeight: 15, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{d.other}</Text> : null}
          </View>
        </>
      )}
    </Pressable>
  );
}

export const healthTiles: TileDef[] = [
  { type: 'steps', board: 'health', name: 'Steps', description: 'Today and the last 7 days', icon: 'shoe', sizes: ['small', 'medium'], defaultSize: 'small', component: ({ size }) => <MetricTile id="steps" size={size} /> },
  { type: 'sleep', board: 'health', name: 'Sleep', description: 'Last night and the last 7 days', icon: 'moon', sizes: ['small', 'medium'], defaultSize: 'small', component: ({ size }) => <MetricTile id="sleep" size={size} /> },
];
