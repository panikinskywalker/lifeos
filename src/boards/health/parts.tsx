import React, { useState } from 'react';
import { Pressable, TextInput, View, type LayoutChangeEvent, type TextStyle } from 'react-native';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';
import type { MetricId } from '@core/dashboard/metrics';
import type { IconName } from '@ui/icons';
import { useTheme } from '@ui/theme/ThemeProvider';
import { fontForWeight, gradients } from '@ui/theme/tokens';
import { Icon, IconBox, IconButton, Text } from '@ui/kit';
import type { Origin } from './data';

/**
 * Health's parts (NR-Health-*): the page list, the top bar with its green
 * dot, section heads, cards and rows, the pills, the Steps bars, the Sleep
 * and Weight line, the row sparkline and the 26-week grid. Lime is Health's
 * highlight in Noir; sleep's bars on the home are lilac.
 */

export type PageKey = 'steps' | 'sleep' | 'heart' | 'weight' | 'screen';

export interface PageDef {
  key: PageKey;
  /** The metric the page is about (heart: resting; average is its second). */
  metric: MetricId;
  also?: MetricId;
  title: string;
  icon: IconName;
  /** What the headline number is. */
  when: string;
  source: 'health' | 'usage';
  /** The empty line, naming what to turn on. */
  empty: string;
  /** Why the change is coloured as it is. */
  better?: string;
  /** The Today tile this page pins, when it has one. */
  tile?: string;
}

export const PAGES: PageDef[] = [
  { key: 'steps', metric: 'steps', title: 'Steps', icon: 'shoe', when: 'today', source: 'health', tile: 'steps', better: 'More steps is better, so up shows in lime', empty: 'No steps yet: let Samsung Health (or your watch’s app) share steps with Health Connect.' },
  { key: 'sleep', metric: 'sleep', title: 'Sleep', icon: 'moon', when: 'last night', source: 'health', tile: 'sleep', empty: 'No sleep yet: in Samsung Health, share Sleep with Health Connect.' },
  { key: 'heart', metric: 'resting_hr', also: 'heart_rate', title: 'Heart rate', icon: 'heart', when: 'resting, today', source: 'health', better: 'A lower resting heart rate is better, so down shows in lime', empty: 'No heart rate yet: a watch that shares heart rate with Health Connect fills this.' },
  { key: 'weight', metric: 'weight', title: 'Weight', icon: 'scale', when: 'latest', source: 'health', empty: 'No weight yet: add a reading, or a smart scale that shares with Health Connect fills it.' },
  { key: 'screen', metric: 'screen', title: 'Screen time', icon: 'signal', when: 'today', source: 'usage', tile: 'screen', better: 'Less screen time is better, so down shows in lime', empty: 'No screen time yet: turn on Screen time (Usage access) in Data sources.' },
];

export const pageFor = (key: string) => PAGES.find((p) => p.key === key) ?? PAGES[0]!;

/** A workout's icon; the set has no bike, dumbbell, yoga or ball, so these are the nearest. */
export const KIND_ICON: Record<string, IconName> = { run: 'activity', walk: 'shoe', cycle: 'wind', strength: 'flame', yoga: 'leaf', swim: 'drop', sport: 'target', other: 'activity' };
export const kindIcon = (kind: string): IconName => KIND_ICON[kind] ?? 'activity';

function useWidth(): [number, (e: LayoutChangeEvent) => void] {
  const [w, setW] = useState(0);
  return [w, (e) => setW(Math.round(e.nativeEvent.layout.width))];
}

/* ------------------------------------------------------------------ */
/* The top bar                                                          */
/* ------------------------------------------------------------------ */

/** Back (or close), an optional green dot and caption, the title, round actions. */
export function Head({ sub, dot, title, onBack, close, right, onTitlePress }: { sub: string; dot?: boolean; title: string; onBack?: () => void; close?: boolean; right?: React.ReactNode; onTitlePress?: () => void }) {
  const body = (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {dot ? <ModuleDot size={8} /> : null}
        <Text variant="caption" color="secondary" numberOfLines={1} style={{ flexShrink: 1, fontVariant: ['tabular-nums'] }}>
          {sub}
        </Text>
      </View>
      <Text variant="title" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} accessibilityRole="header">
        {title}
      </Text>
    </>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      {onBack ? <IconButton icon={close ? 'x' : 'chevron-left'} accessibilityLabel={close ? 'Close' : 'Back'} filled onPress={onBack} /> : null}
      {onTitlePress ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`${title}, ${sub}, data sources`} onPress={onTitlePress} style={{ flex: 1, minWidth: 0, minHeight: 44, gap: 1, justifyContent: 'center' }}>
          {body}
        </Pressable>
      ) : (
        <View style={{ flex: 1, minWidth: 0, gap: 1 }}>{body}</View>
      )}
      {right ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 }}>{right}</View> : null}
    </View>
  );
}

/** Health's colour from Browse. */
export function ModuleDot({ size = 10 }: { size?: number }) {
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: gradients.health[0] }} />;
}

/** A 36-high pill in the top bar (Edit, Save); the slop makes its target 44. */
export function PillAction({ label, onPress, lime, disabled }: { label: string; onPress: () => void; lime?: boolean; disabled?: boolean }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} hitSlop={4} onPress={onPress} style={({ pressed }) => ({ height: 36, paddingHorizontal: lime ? 16 : 14, borderRadius: 18, justifyContent: 'center', backgroundColor: lime ? t.c.accent.mustard : t.c.fg.primary, opacity: disabled ? 0.4 : pressed ? 0.8 : 1 })}>
      <Text style={{ fontSize: 13, lineHeight: 17, fontWeight: '700', color: lime ? t.c.accent.mustardInk : t.c.bg.ground }}>{label}</Text>
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/* Sections, cards, rows                                                */
/* ------------------------------------------------------------------ */

/** 17/600 heading, a caption, a quiet action on the right. */
export function SecHead({ title, sub, action, chevron, onAction }: { title: string; sub?: string; action?: string; chevron?: boolean; onAction?: () => void }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingTop: 6, paddingHorizontal: 4 }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="heading">{title}</Text>
        {sub ? <Text variant="caption" color="secondary">{sub}</Text> : null}
      </View>
      {action ? (
        <Pressable accessibilityRole={onAction ? 'button' : undefined} disabled={!onAction} hitSlop={14} onPress={onAction} style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          <Text color="secondary" style={{ fontSize: 13, lineHeight: 17, fontWeight: '600' }}>{action}</Text>
          {chevron ? <Icon name="chevron-right" size={14} color={t.c.fg.secondary} /> : null}
        </Pressable>
      ) : null}
    </View>
  );
}

/** An 11/600 caps label. */
export const Caps = ({ children, secondary }: { children: React.ReactNode; secondary?: boolean }) => (
  <Text variant="labelCaps" color={secondary ? 'secondary' : 'tertiary'} numberOfLines={1}>{children}</Text>
);

/** The chart and hero card: 28 corners, 18 padding. */
export function Panel({ children, onPress, label, gap = 12 }: { children: React.ReactNode; onPress?: () => void; label?: string; gap?: number }) {
  const t = useTheme();
  const style = { padding: 18, gap, borderRadius: t.radius.tile, backgroundColor: t.c.bg.tile };
  if (!onPress) return <View style={style}>{children}</View>;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [style, { opacity: pressed ? 0.85 : 1 }]}>
      {children}
    </Pressable>
  );
}

/** A row group: 24 corners, hairlines between the rows. */
export function Group({ children, padding = 14 }: { children: React.ReactNode; padding?: number }) {
  const t = useTheme();
  const rows = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={{ padding, borderRadius: t.radius.card, backgroundColor: t.c.bg.tile, gap: 8 }}>
      {rows.map((r, i) => (
        <React.Fragment key={i}>
          {i ? <Hairline /> : null}
          {r}
        </React.Fragment>
      ))}
    </View>
  );
}

export function Hairline() {
  const t = useTheme();
  return <View style={{ height: 1, backgroundColor: t.c.line }} />;
}

/** A 40 disc holding an icon in its colour. */
export function Disc({ icon, color, size = 40 }: { icon: IconName | (string & {}); color?: string; size?: number }) {
  const t = useTheme();
  return <IconBox icon={icon} size={size} color={color ?? t.c.fg.primary} background={t.c.bg.tileRaised} />;
}

/** Lead, title over a line, whatever goes right. */
export function Row({ lead, title, sub, subColor, right, minHeight = 48, onPress, onLongPress, label }: { lead?: React.ReactNode; title: string; sub?: React.ReactNode; subColor?: string; right?: React.ReactNode; minHeight?: number; onPress?: () => void; onLongPress?: () => void; label?: string }) {
  const body = (
    <>
      {lead}
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text variant="rowTitle" numberOfLines={1} style={{ fontVariant: ['tabular-nums'] }}>{title}</Text>
        {typeof sub === 'string' ? (
          <Text variant="caption" color={subColor ?? 'secondary'} numberOfLines={1} style={{ fontVariant: ['tabular-nums'] }}>{sub}</Text>
        ) : (
          sub
        )}
      </View>
      {right}
    </>
  );
  const style = { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 14, minHeight };
  if (!onPress && !onLongPress) return <View style={style}>{body}</View>;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label ?? (typeof sub === 'string' ? `${title}, ${sub}` : title)} onPress={onPress} onLongPress={onLongPress} style={({ pressed }) => [style, { opacity: pressed ? 0.75 : 1 }]}>
      {body}
    </Pressable>
  );
}

/** A row's number on the right. */
export const RowValue = ({ children }: { children: React.ReactNode }) => (
  <Text style={{ fontSize: 16, lineHeight: 21, fontWeight: '700', fontVariant: ['tabular-nums'], flexShrink: 0 }} numberOfLines={1}>{children}</Text>
);

/** Label, a 22/700 number (and a small unit), a small line. */
export function StatCell({ label, value, unit, sub, dim }: { label: string; value: string; unit?: string | null; sub?: string; dim?: boolean }) {
  return (
    <View style={{ flex: 1, gap: 4, minWidth: 0 }}>
      <Caps>{label}</Caps>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
        <Text variant="metric" color={dim ? 'secondary' : 'primary'} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ flexShrink: 1 }}>{value}</Text>
        {unit ? <Text variant="caption" color="secondary">{unit}</Text> : null}
      </View>
      {sub ? <Text color="secondary" style={{ fontSize: 12, lineHeight: 16, fontWeight: '500' }} numberOfLines={1}>{sub}</Text> : null}
    </View>
  );
}

/** Three stats across, in a card (or bare, in a panel). */
export function StatRow({ children, bare }: { children: React.ReactNode; bare?: boolean }) {
  const t = useTheme();
  return <View style={[{ flexDirection: 'row', gap: 12 }, bare ? null : { padding: 16, borderRadius: t.radius.card, backgroundColor: t.c.bg.tile }]}>{children}</View>;
}

export type Tone = 'good' | 'bad' | 'neutral';

/** A change: lime when it is good for this metric, coral when not, grey when neither. */
export function changeTone(change: number | null, better: 'up' | 'down' | 'none'): Tone {
  if (!change || better === 'none') return 'neutral';
  return (better === 'up') === change > 0 ? 'good' : 'bad';
}

export const toneInk = (t: ReturnType<typeof useTheme>, tone: Tone) => (tone === 'good' ? t.c.accent.mustard : tone === 'bad' ? t.c.alert.coralText : t.c.fg.secondary);

/** A 28-high pill (24 small). */
export function Pill({ label, tone = 'neutral', small, style }: { label: string; tone?: Tone; small?: boolean; style?: object }) {
  const t = useTheme();
  const bg = tone === 'good' ? t.c.accent.mustardSoft : tone === 'bad' ? t.c.alert.coralFill : t.c.bg.tileRaised;
  const fg = tone === 'good' ? t.c.accent.mustard : tone === 'bad' ? t.c.alert.coralText : small ? t.c.fg.secondary : t.c.fg.primary;
  return (
    <View style={[{ height: small ? 24 : 28, paddingHorizontal: small ? 9 : 11, borderRadius: 999, backgroundColor: bg, justifyContent: 'center', flexShrink: 0 }, style]}>
      <Text variant="labelMicro" color={fg} numberOfLines={1} style={{ fontVariant: ['tabular-nums'] }}>{label}</Text>
    </View>
  );
}

/** Noir's segmented control at the artboards' 40 high; `optional` lets the selected one be tapped off. */
export function Seg<T extends string>({ options, value, onChange, label, optional }: { options: Array<{ value: T; label: string }>; value: T | undefined; onChange: (v: T | undefined) => void; label: string; optional?: boolean }) {
  const t = useTheme();
  return (
    <View accessibilityRole="tablist" accessibilityLabel={label} style={{ flexDirection: 'row', gap: 4, padding: 4, borderRadius: 999, backgroundColor: t.c.bg.tileRaised }}>
      {options.map((o) => {
        const sel = o.value === value;
        return (
          <Pressable key={o.value} accessibilityRole="tab" accessibilityState={{ selected: sel }} aria-selected={sel} hitSlop={4} onPress={() => onChange(sel && optional ? undefined : o.value)} style={{ flex: 1, height: 40, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: sel ? t.c.fg.primary : 'transparent' }}>
            <Text variant="label" color={sel ? t.c.bg.ground : 'secondary'} numberOfLines={1}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** The small print with its icon. */
export function Note({ icon, children }: { icon: IconName; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingHorizontal: 4 }}>
      <Icon name={icon} size={16} color={t.c.fg.secondary} style={{ marginTop: 1 }} />
      <Text variant="caption" color="secondary" style={{ flex: 1, lineHeight: 18 }}>{children}</Text>
    </View>
  );
}

/** A full-width secondary pill (46 high) with a lime icon. */
export function WideButton({ title, icon, onPress }: { title: string; icon?: IconName; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={({ pressed }) => ({ height: 46, borderRadius: 999, backgroundColor: t.c.bg.tileRaised, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: pressed ? 0.8 : 1 })}>
      {icon ? <Icon name={icon} size={17} color={t.c.accent.mustard} /> : null}
      <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: '600' }}>{title}</Text>
    </Pressable>
  );
}

/** A metric with nothing yet (NR-Health-Empty, one metric missing). */
export function MissingCard({ page, action, onAction }: { page: PageDef; action?: string; onAction?: () => void }) {
  const t = useTheme();
  return (
    <View style={{ padding: 16, borderRadius: t.radius.card, backgroundColor: t.c.bg.tile, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Disc icon={page.icon} size={32} color={page.key === 'sleep' ? t.tints.tasks.ink : t.c.accent.mustard} />
        <Text variant="rowTitle" style={{ flex: 1 }}>{page.title}</Text>
        <Text variant="caption" color="secondary">{page.when}</Text>
      </View>
      <Text variant="caption" color="secondary" style={{ lineHeight: 18 }}>{page.empty}</Text>
      {action && onAction ? <WideButton title={action} onPress={onAction} /> : null}
    </View>
  );
}

/** Where a reading came from: Health Connect's phone, a Dump's brain, you. */
export function originIcon(t: ReturnType<typeof useTheme>, o: Origin): { icon: IconName; color: string } {
  if (o.kind === 'source') return { icon: 'phone', color: gradients.health[0] };
  if (o.kind === 'dump') return { icon: 'brain', color: t.c.accent.mustard };
  return { icon: 'user', color: t.c.fg.primary };
}

/* ------------------------------------------------------------------ */
/* Charts                                                               */
/* ------------------------------------------------------------------ */

const AXIS: TextStyle = { fontSize: 10, lineHeight: 13, fontWeight: '600' };

/**
 * Columns with a label under each: the home's week (rounder, wider) and the
 * Steps chart (31 thin ones, a dashed average, a pill over the best). `lit`
 * is the column in full colour; days with no data are a low stub, not zero.
 */
export function Bars({ values, labels, height = 130, lit, litColor, barColor, average, pill, dot, labelSize = 10, label }: { values: Array<number | null>; labels: string[]; height?: number; lit: number; litColor?: string; barColor?: string; average?: number | null; pill?: string | null; dot?: boolean; labelSize?: number; label: string }) {
  const t = useTheme();
  const [w, onLayout] = useWidth();
  const n = values.length;
  const base = height - 20;
  const gap = n > 14 ? (w / n) * 0.32 : 10;
  const barW = n ? (w - gap * (n - 1)) / n : 0;
  const rx = Math.max(3, Math.min(10, barW * 0.28));
  const max = Math.max(...values.map((v) => v ?? 0), average ?? 0, 1);
  const hOf = (v: number) => Math.max(3, (v / max) * (base - 5));
  const lime = litColor ?? t.c.accent.mustard;
  const quiet = barColor ?? `${t.c.fg.primary}1A`;
  const litLeft = lit * (barW + gap);
  const litV = values[lit];
  const avgY = average != null ? base - hOf(average) : null;
  return (
    <View onLayout={onLayout} accessibilityRole="image" accessibilityLabel={label} style={{ height, marginTop: pill ? 26 : 0 }}>
      {w > 0 ? (
        <>
          <Svg width={w} height={height}>
            {values.map((v, i) => {
              const h = v == null ? 3 : hOf(v);
              return <Rect key={i} x={i * (barW + gap)} y={base - h} width={barW} height={h} rx={v == null ? 1.5 : rx} fill={v == null ? t.c.line : i === lit ? lime : quiet} />;
            })}
            {avgY != null ? <Line x1={0} x2={w} y1={avgY} y2={avgY} stroke={t.c.fg.tertiary} strokeWidth={1} strokeDasharray="3 3" /> : null}
            {dot && litV != null ? <Circle cx={litLeft + barW / 2} cy={base - hOf(litV) + 10} r={3} fill={t.c.bg.ground} /> : null}
          </Svg>
          {labels.map((l, i) =>
            l ? (
              <Text key={i} color={i === lit && n <= 14 ? 'primary' : 'tertiary'} style={[AXIS, { fontSize: labelSize, position: 'absolute', top: height - 15, left: i * (barW + gap) + barW / 2 - 15, width: 30, textAlign: 'center' }]} numberOfLines={1}>
                {l}
              </Text>
            ) : null,
          )}
          {pill && litV != null ? (
            <View pointerEvents="none" style={[{ position: 'absolute', top: base - hOf(litV) - 28, height: 24, paddingHorizontal: 12, borderRadius: 12, backgroundColor: t.c.fg.primary, justifyContent: 'center' }, litLeft > w / 2 ? { right: w - litLeft - barW } : { left: litLeft }]}>
              <Text variant="labelMicro" color={t.c.bg.ground} numberOfLines={1} style={{ fontWeight: '700', fontVariant: ['tabular-nums'] }}>{pill}</Text>
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

/** A smooth path through the points, skipping gaps. */
function smooth(pts: Array<[number, number]>) {
  return pts.map(([x, y], i) => {
    if (!i) return `M${x.toFixed(1)} ${y.toFixed(1)}`;
    const [px, py] = pts[i - 1]!;
    const mid = (px + x) / 2;
    return `C${mid.toFixed(1)} ${py.toFixed(1)} ${mid.toFixed(1)} ${y.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');
}

/**
 * Three gridlines labelled on the left, an optional dashed line for the
 * period before, the line with a dot on each reading and a big dot on the
 * last. `fit` runs the x axis from the first reading to the last.
 */
export function Lines({ values, before, color, xLabels, formatY, pill, halo, fit, label }: { values: Array<number | null>; before?: Array<number | null>; color: string; xLabels: Array<{ at: number; text: string; lit?: boolean }>; formatY: (n: number) => string; pill?: string | null; halo?: boolean; fit?: boolean; label: string }) {
  const t = useTheme();
  const [w, onLayout] = useWidth();
  const height = 130;
  const left = 28;
  const known = values.flatMap((v, i) => (v == null ? [] : [i]));
  const first = fit ? known[0] ?? 0 : 0;
  const last = fit ? known[known.length - 1] ?? 0 : values.length - 1;
  const all = [...values, ...(before ?? [])].filter((v): v is number => v != null);
  const lo = Math.floor(Math.min(...all));
  const step = Math.max(1, Math.ceil((Math.max(...all) - lo) / 2));
  const y = (v: number) => 108 - ((v - lo) / (2 * step)) * 102;
  const x = (i: number) => (last > first ? left + ((i - first) / (last - first)) * (w - left) : w);
  const line = known.map((i) => [x(i), y(values[i]!)] as [number, number]);
  const dashed = (before ?? []).flatMap((v, i) => (v == null ? [] : [[x(i), y(v)] as [number, number]]));
  const end = line[line.length - 1];
  const showDots = line.length <= 14;
  return (
    <View onLayout={onLayout} accessibilityRole="image" accessibilityLabel={label} style={{ height }}>
      {w > 0 && all.length ? (
        <>
          <Svg width={w} height={height}>
            {[0, 1, 2].map((k) => <Line key={k} x1={left} x2={w} y1={y(lo + k * step)} y2={y(lo + k * step)} stroke={t.c.line} strokeWidth={1} />)}
            {dashed.length > 1 ? <Path d={smooth(dashed)} fill="none" stroke={t.c.fg.tertiary} strokeWidth={1.5} strokeDasharray="3 4" /> : null}
            {line.length > 1 ? <Path d={smooth(line)} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" /> : null}
            {showDots ? line.slice(0, -1).map(([cx, cy], i) => <Circle key={i} cx={cx} cy={cy} r={3.5} fill={t.c.bg.tile} stroke={color} strokeWidth={2} />) : null}
            {end && halo ? <Circle cx={end[0]} cy={end[1]} r={11} fill={color} opacity={0.2} /> : null}
            {end ? <Circle cx={end[0]} cy={end[1]} r={5} fill={color} /> : null}
          </Svg>
          {[0, 1, 2].map((k) => (
            <Text key={k} color="tertiary" style={[AXIS, { position: 'absolute', left: 0, width: left - 2, top: y(lo + k * step) - 6 }]} numberOfLines={1}>{formatY(lo + k * step)}</Text>
          ))}
          {xLabels.map((l, i) => {
            const at = x(l.at);
            const edge = at >= w - 1 ? { right: 0 } : at <= left + 1 ? { left } : { left: at - 25, width: 50, textAlign: 'center' as const };
            return <Text key={i} color={l.lit ? 'primary' : 'tertiary'} style={[AXIS, { position: 'absolute', top: height - 13 }, edge]} numberOfLines={1}>{l.text}</Text>;
          })}
          {pill ? (
            <View pointerEvents="none" style={{ position: 'absolute', right: 0, top: 16, height: 24, paddingHorizontal: 11, borderRadius: 12, backgroundColor: t.c.fg.primary, justifyContent: 'center' }}>
              <Text variant="labelMicro" color={t.c.bg.ground} style={{ fontWeight: '700', fontVariant: ['tabular-nums'] }}>{pill}</Text>
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

/** A row's 64 × 32 line with a dot on the latest value. */
export function Spark({ values, color, dotColor }: { values: number[]; color: string; dotColor?: string }) {
  if (values.length < 2) return <View style={{ width: 64 }} />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pts = values.map((v, i) => [4 + (i / (values.length - 1)) * 56, max === min ? 16 : 26 - ((v - min) / (max - min)) * 20] as [number, number]);
  const end = pts[pts.length - 1]!;
  return (
    <Svg width={64} height={32} style={{ flexShrink: 0 }}>
      <Path d={smooth(pts)} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Circle cx={end[0]} cy={end[1]} r={4} fill={dotColor ?? color} />
    </Svg>
  );
}

/** The 26-week grid: columns are weeks, four steps from "none" to the top of your days. */
export function YearGrid({ cells, label }: { cells: Array<number | null>; label: string }) {
  const t = useTheme();
  const [w, onLayout] = useWidth();
  const known = cells.filter((v): v is number => v != null).sort((a, b) => a - b);
  const third = known[Math.floor(known.length / 3)] ?? 0;
  const two = known[Math.floor((known.length * 2) / 3)] ?? 0;
  const pitch = (w + 3) / 26;
  const size = pitch - 3;
  return (
    <View onLayout={onLayout} accessibilityRole="image" accessibilityLabel={label} style={{ height: w ? pitch * 7 - 3 : 81 }}>
      {w > 0 ? (
        <Svg width={w} height={pitch * 7 - 3}>
          {cells.map((v, i) => {
            const on = v != null && v > 0;
            return <Rect key={i} x={Math.floor(i / 7) * pitch} y={(i % 7) * pitch} width={size} height={size} rx={2.7} fill={on ? t.c.accent.mustard : t.c.fg.primary} opacity={!on ? 0.1 : v! < third ? 0.35 : v! < two ? 0.6 : 1} />;
          })}
        </Svg>
      ) : null}
    </View>
  );
}

/** Less to More, and how far the grid runs. */
export function GridLegend({ range }: { range: string }) {
  const t = useTheme();
  const swatch = (bg: string, opacity = 1) => <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: bg, opacity }} />;
  const words = { fontSize: 12, lineHeight: 16, fontWeight: '500' as const };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Text color="secondary" style={words}>Less</Text>
      {swatch(t.c.fg.primary, 0.1)}
      {swatch(t.c.accent.mustard, 0.35)}
      {swatch(t.c.accent.mustard, 0.6)}
      {swatch(t.c.accent.mustard)}
      <Text color="secondary" style={[words, { flex: 1 }]}>More</Text>
      <Text color="secondary" style={[words, { fontVariant: ['tabular-nums'] }]}>{range}</Text>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Form pieces                                                          */
/* ------------------------------------------------------------------ */

/** A form's caps label over its control. */
export function Labelled({ label, children, gap = 8 }: { label: string; children: React.ReactNode; gap?: number }) {
  return (
    <View style={{ gap, minWidth: 0 }}>
      <View style={{ paddingHorizontal: 4 }}>
        <Caps secondary>{label}</Caps>
      </View>
      {children}
    </View>
  );
}

const INPUT: TextStyle = { fontSize: 16, lineHeight: 21, fontFamily: fontForWeight(500) };

/** Noir input: 56 high, radius 20, a hairline at rest, white on focus; a unit on the right. */
export function Box({ value, onChange, placeholder, unit, numeric, multiline, label, leading, height = 56, radius = 20 }: { value: string; onChange: (s: string) => void; placeholder?: string; unit?: string; numeric?: boolean; multiline?: boolean; label: string; leading?: IconName; height?: number; radius?: number }) {
  const t = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ flexDirection: 'row', alignItems: multiline ? 'flex-start' : 'center', gap: 10, minHeight: multiline ? 104 : height, paddingHorizontal: unit ? 16 : 18, paddingVertical: multiline ? 16 : 0, borderRadius: radius, backgroundColor: t.c.bg.tile, borderWidth: focused ? 1.5 : 1, borderColor: focused ? t.c.fg.primary : t.c.line }}>
      {leading ? <Icon name={leading} size={18} color={t.c.fg.tertiary} /> : null}
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={t.c.fg.tertiary}
        selectionColor={t.c.accent.mustard}
        cursorColor={t.c.accent.mustard}
        keyboardType={numeric ? 'decimal-pad' : 'default'}
        multiline={multiline}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[INPUT, { flex: 1, minWidth: 0, color: t.c.fg.primary, padding: 0, ...(multiline ? { lineHeight: 22, textAlignVertical: 'top' as const } : { fontVariant: ['tabular-nums' as const] }) }]}
      />
      {unit ? <Text color="secondary" style={{ fontSize: 14, fontWeight: '500' }}>{unit}</Text> : null}
    </View>
  );
}
