import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, Rect, Path, Line, Text as SvgText } from 'react-native-svg';
import { useTheme } from '../theme/ThemeProvider';
import { Text } from './primitives';

/** Apple-Activity-style ring. progress 0..1 (can exceed 1 and it caps visually). */
export function ProgressRing({ progress, size = 64, stroke = 8, color, track, children }: { progress: number; size?: number; stroke?: number; color?: string; track?: string; children?: React.ReactNode }) {
  const t = useTheme();
  const c = color ?? t.colors.tint;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, progress));
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={track ?? c + '26'} strokeWidth={stroke} fill="none" />
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={c} strokeWidth={stroke} fill="none" strokeDasharray={`${circ} ${circ}`} strokeDashoffset={circ * (1 - p)} strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </Svg>
      {children}
    </View>
  );
}

export interface BarDatum {
  label: string;
  value: number;
  color?: string;
  highlight?: boolean;
}

/** Compact bar chart with optional baseline labels — used for spend by month/day. */
export function Bars({ data, height = 90, color, showLabels = true, labelEvery = 1, formatValue, width: fixedWidth }: { data: BarDatum[]; height?: number; color?: string; showLabels?: boolean; labelEvery?: number; formatValue?: (n: number) => string; width?: number }) {
  const t = useTheme();
  const [w, setW] = React.useState(fixedWidth ?? 0);
  const c = color ?? t.colors.tint;
  const max = Math.max(1, ...data.map((d) => Math.abs(d.value)));
  const labelH = showLabels ? 16 : 0;
  const chartH = height - labelH;
  const gap = 4;
  const bw = data.length ? Math.max(2, (w - gap * (data.length - 1)) / data.length) : 0;
  return (
    <View style={{ height, width: fixedWidth }} onLayout={(e) => !fixedWidth && setW(e.nativeEvent.layout.width)}>
      {w > 0 ? (
        <Svg width={w} height={height}>
          <Line x1={0} x2={w} y1={chartH} y2={chartH} stroke={t.colors.separator} strokeWidth={1} />
          {data.map((d, i) => {
            const h = Math.max(2, (Math.abs(d.value) / max) * (chartH - 4));
            const x = i * (bw + gap);
            return (
              <React.Fragment key={i}>
                <Rect x={x} y={chartH - h} width={bw} height={h} rx={Math.min(3, bw / 2)} fill={d.color ?? (d.highlight ? c : c + (d.value === 0 ? '30' : '99'))} />
                {showLabels && i % labelEvery === 0 ? (
                  <SvgText x={x + bw / 2} y={height - 3} fontSize={10} fill={t.colors.textSecondary as string} textAnchor="middle">
                    {d.label}
                  </SvgText>
                ) : null}
              </React.Fragment>
            );
          })}
        </Svg>
      ) : null}
      {formatValue && data.length ? (
        <Text variant="caption2" color="secondary" style={{ position: 'absolute', right: 0, top: 0 }}>
          {formatValue(max)}
        </Text>
      ) : null}
    </View>
  );
}

/** Small line sparkline. */
export function Sparkline({ values, height = 40, color, width: fixedWidth, fill = true }: { values: number[]; height?: number; color?: string; width?: number; fill?: boolean }) {
  const t = useTheme();
  const [w, setW] = React.useState(fixedWidth ?? 0);
  const c = color ?? t.colors.tint;
  if (!values.length) return <View style={{ height }} />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => [values.length === 1 ? w / 2 : (i / (values.length - 1)) * w, height - 3 - ((v - min) / range) * (height - 6)] as const);
  const d = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${d} L${w},${height} L0,${height} Z`;
  return (
    <View style={{ height, width: fixedWidth }} onLayout={(e) => !fixedWidth && setW(e.nativeEvent.layout.width)}>
      {w > 0 ? (
        <Svg width={w} height={height}>
          {fill ? <Path d={area} fill={c + '22'} /> : null}
          <Path d={d} stroke={c} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
          <Circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r={3} fill={c} />
        </Svg>
      ) : null}
    </View>
  );
}

/** Horizontal progress bar (budgets, goals, habits). */
export function ProgressBar({ progress, color, height = 8, track }: { progress: number; color?: string; height?: number; track?: string }) {
  const t = useTheme();
  const c = color ?? t.colors.tint;
  const over = progress > 1;
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: track ?? c + '26', overflow: 'hidden' }}>
      <View style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%`, height: '100%', backgroundColor: over ? t.colors.danger : c, borderRadius: height / 2 }} />
    </View>
  );
}

/** Stacked horizontal breakdown (spend by category). */
export function StackedBar({ parts, height = 14 }: { parts: Array<{ value: number; color: string }>; height?: number }) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  return (
    <View style={{ height, borderRadius: height / 2, overflow: 'hidden', flexDirection: 'row', gap: 2 }}>
      {parts.map((p, i) => (
        <View key={i} style={{ flex: p.value / total, backgroundColor: p.color, minWidth: p.value > 0 ? 3 : 0 }} />
      ))}
    </View>
  );
}

/** 7×N habit heat grid. */
export function HeatGrid({ cells, color, columns = 7, size = 14, gap = 3 }: { cells: Array<{ level: number; key: string }>; color?: string; columns?: number; size?: number; gap?: number }) {
  const t = useTheme();
  const c = color ?? t.colors.tint;
  const rows = Math.ceil(cells.length / columns);
  const w = columns * (size + gap) - gap;
  const h = rows * (size + gap) - gap;
  return (
    <Svg width={w} height={h}>
      {cells.map((cell, i) => {
        const col = i % columns;
        const row = Math.floor(i / columns);
        const alpha = cell.level <= 0 ? '22' : cell.level < 0.5 ? '66' : cell.level < 1 ? 'AA' : 'FF';
        return <Rect key={cell.key} x={col * (size + gap)} y={row * (size + gap)} width={size} height={size} rx={3} fill={c + alpha} />;
      })}
    </Svg>
  );
}
