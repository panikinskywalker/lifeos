import React, { useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';
import { useTheme } from '../theme/ThemeProvider';
import { Text } from './Text';
import { niceGrid, niceMax } from './chartScale';

export { niceGrid, niceMax };

function useWidth(): [number, (e: LayoutChangeEvent) => void] {
  const [w, setW] = useState(0);
  return [w, (e) => setW(Math.round(e.nativeEvent.layout.width))];
}

/** Stitch sparkline: 2px line, round joins, a dot on the latest value. */
export function Sparkline({ values, height = 32, color, accessibilityLabel }: { values: number[]; height?: number; color?: string; accessibilityLabel?: string }) {
  const t = useTheme();
  const [w, onLayout] = useWidth();
  const c = color ?? t.c.ok.sageText;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pts = values.map((v, i) => [values.length < 2 ? w : (i / (values.length - 1)) * (w - 4) + 2, max === min ? height / 2 : height - 3 - ((v - min) / (max - min)) * (height - 6)] as const);
  return (
    <View onLayout={onLayout} style={{ height }} accessibilityRole="image" accessibilityLabel={accessibilityLabel}>
      {w > 0 && values.length ? (
        <Svg width={w} height={height}>
          <Path d={pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('')} stroke={c} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <Circle cx={pts[pts.length - 1]![0]} cy={pts[pts.length - 1]![1]} r={3} fill={c} />
        </Svg>
      ) : null}
    </View>
  );
}

export interface ChartSeries {
  label: string;
  color: string;
  values: number[];
  dashed?: boolean;
}

/**
 * Stitch line chart: dotted horizontal gridlines, y labels on the right,
 * x labels under, 2px series with a dot on each point. Sits on a nested slab.
 */
export function LineChart({ series, labels, height = 140, formatY = (n) => String(Math.round(n)), minZero = false, accessibilityLabel }: { series: ChartSeries[]; labels: string[]; height?: number; formatY?: (n: number) => string; minZero?: boolean; accessibilityLabel?: string }) {
  const t = useTheme();
  const [w, onLayout] = useWidth();
  const all = series.flatMap((s) => s.values);
  const lo = minZero ? Math.min(0, ...all) : Math.min(...all);
  const grid = niceGrid(Math.max(...all), lo);
  const bottom = grid[0]!;
  const top = grid[3]!;
  const axisW = 44;
  const plotW = Math.max(0, w - axisW);
  const y = (v: number) => 8 + (1 - (v - bottom) / (top - bottom || 1)) * (height - 16);
  const x = (i: number, n: number) => (n < 2 ? plotW / 2 : 6 + (i / (n - 1)) * (plotW - 12));
  return (
    <View style={{ backgroundColor: t.c.bg.tileRaised, borderRadius: t.radius.card, padding: 12, gap: 6 }} accessibilityRole="image" accessibilityLabel={accessibilityLabel}>
      <View onLayout={onLayout} style={{ height }}>
        {w > 0 ? (
          <Svg width={w} height={height}>
            {grid.map((g) => (
              <Line key={g} x1={0} x2={plotW} y1={y(g)} y2={y(g)} stroke={t.c.rail} strokeWidth={1} strokeDasharray="3,3" />
            ))}
            {series.map((s) => (
              <React.Fragment key={s.label}>
                <Path d={s.values.map((v, i) => `${i ? 'L' : 'M'}${x(i, s.values.length).toFixed(1)} ${y(v).toFixed(1)}`).join('')} stroke={s.color} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" strokeDasharray={s.dashed ? '5,3' : undefined} />
                {s.values.map((v, i) => (
                  <Circle key={i} cx={x(i, s.values.length)} cy={y(v)} r={i === s.values.length - 1 ? 3.5 : 2.5} fill={s.color} />
                ))}
              </React.Fragment>
            ))}
          </Svg>
        ) : null}
        {w > 0
          ? grid.map((g) => (
              <Text key={g} variant="labelMicro" color="tertiary" style={{ position: 'absolute', right: 0, top: y(g) - 7, width: axisW - 4, textAlign: 'right' }} numberOfLines={1}>
                {formatY(g)}
              </Text>
            ))
          : null}
      </View>
      <AxisLabels labels={labels} at={(i) => x(i, labels.length)} width={plotW} highlight={labels.length - 1} />
    </View>
  );
}

/**
 * Stitch column chart: one column per label, stacked when several series,
 * rounded tops, dotted gridlines, y labels on the right. `highlight` darkens
 * one column's label (today).
 */
export function ColumnChart({ series, labels, height = 140, formatY = (n) => String(Math.round(n)), highlight, labelEvery = 1, accessibilityLabel }: { series: ChartSeries[]; labels: string[]; height?: number; formatY?: (n: number) => string; highlight?: number; labelEvery?: number; accessibilityLabel?: string }) {
  const t = useTheme();
  const [w, onLayout] = useWidth();
  const n = labels.length;
  const totals = labels.map((_, i) => series.reduce((a, s) => a + Math.max(0, s.values[i] ?? 0), 0));
  const grid = niceGrid(Math.max(...totals, 0));
  const top = grid[3]!;
  const axisW = 44;
  const plotW = Math.max(0, w - axisW);
  const slot = n ? plotW / n : 0;
  const barW = Math.max(2, Math.min(22, slot * 0.62));
  const y = (v: number) => 8 + (1 - v / top) * (height - 16);
  return (
    <View style={{ backgroundColor: t.c.bg.tileRaised, borderRadius: t.radius.card, padding: 12, gap: 6 }} accessibilityRole="image" accessibilityLabel={accessibilityLabel}>
      <View onLayout={onLayout} style={{ height }}>
        {w > 0 ? (
          <Svg width={w} height={height}>
            {grid.map((g) => (
              <Line key={g} x1={0} x2={plotW} y1={y(g)} y2={y(g)} stroke={t.c.rail} strokeWidth={1} strokeDasharray="3,3" />
            ))}
            {labels.map((_, i) => {
              let base = 0;
              return series.map((s) => {
                const v = Math.max(0, s.values[i] ?? 0);
                if (!v) return null;
                const y0 = y(base + v);
                const h = Math.max(1.5, y(base) - y0 - (base > 0 ? 2 : 0));
                base += v;
                return <Rect key={`${s.label}-${i}`} x={i * slot + (slot - barW) / 2} y={y0} width={barW} height={h} rx={Math.min(4, barW / 2)} fill={s.color} />;
              });
            })}
          </Svg>
        ) : null}
        {w > 0
          ? grid.map((g) => (
              <Text key={g} variant="labelMicro" color="tertiary" style={{ position: 'absolute', right: 0, top: y(g) - 7, width: axisW - 4, textAlign: 'right' }} numberOfLines={1}>
                {formatY(g)}
              </Text>
            ))
          : null}
      </View>
      <AxisLabels labels={labels.map((l, i) => (i === highlight || (i % labelEvery === 0 && (highlight == null || Math.abs(i - highlight) > labelEvery / 2)) ? l : ''))} at={(i) => i * slot + slot / 2} width={plotW} highlight={highlight} />
    </View>
  );
}

/** X labels centred under their points, never squeezed into a narrow column. */
function AxisLabels({ labels, at, width, highlight }: { labels: string[]; at: (i: number) => number; width: number; highlight?: number }) {
  return (
    <View style={{ height: 14, width }}>
      {width > 0
        ? labels.map((l, i) =>
            l ? (
              <Text key={i} variant="labelMicro" color={i === highlight ? 'primary' : 'secondary'} numberOfLines={1} style={{ position: 'absolute', left: at(i) - 20, width: 40, textAlign: 'center' }}>
                {l}
              </Text>
            ) : null,
          )
        : null}
    </View>
  );
}

/** Legend for charts: dot · label, wrapping. */
export function ChartLegend({ items }: { items: Array<{ label: string; color: string }> }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 6 }}>
      {items.map((it) => (
        <View key={it.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: it.color }} />
          <Text variant="label" color="secondary">
            {it.label}
          </Text>
        </View>
      ))}
    </View>
  );
}
