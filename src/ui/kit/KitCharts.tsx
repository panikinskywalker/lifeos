import React, { useState } from 'react';
import { Pressable, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, RadialGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { useTheme } from '../theme/ThemeProvider';
import { blocks, fonts, instrument, monoFonts } from '../theme/tokens';
import { Icon } from '../icons';
import { Text } from './Text';
import { ActionSheet } from './ActionSheet';
import { dialTicks, donutDashes, dotColumns, halfTicks, hourLevels } from './layout';

/**
 * The rest of the v3 Noir chart kit (NR-KitCharts, NR-KitInstruments; built
 * 14 Nov from the artboards' own measurements): donut, dial, arc ticks, hour
 * ticks, columns in tracks, ruler, the dot-matrix face and the instrument card.
 * Each draws its card as the kit does; widths follow the space they are given.
 */

const INK = '#0B0B0D'; // everything on a colour block is black

function useWidth(initial: number): [number, (e: LayoutChangeEvent) => void] {
  const [w, setW] = useState(initial);
  return [w, (e) => setW(Math.round(e.nativeEvent.layout.width))];
}

function CardTitle({ title, sub }: { title?: string; sub?: string }) {
  if (!title && !sub) return null;
  return (
    <View>
      {title ? <Text numberOfLines={1} style={{ fontSize: 15, lineHeight: 19, fontWeight: '600' }}>{title}</Text> : null}
      {sub ? <Text numberOfLines={1} color="secondary" style={{ fontSize: 13, lineHeight: 17, fontWeight: '500' }}>{sub}</Text> : null}
    </View>
  );
}

/** A colour block's caps label and its dark period pill ("ANALYTICS" · "This week"). */
function BlockHead({ label, period, onPeriod }: { label: string; period?: string; onPeriod?: () => void }) {
  const chip = period ? (
    <>
      <Icon name="chevron-down" size={13} color="#F5F5F7" />
      <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: '600', color: '#F5F5F7' }}>{period}</Text>
    </>
  ) : null;
  const chipStyle = { marginLeft: 'auto' as const, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 5, height: 28, paddingHorizontal: 11, borderRadius: 999, backgroundColor: INK };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Text style={{ fontSize: 11, lineHeight: 14, fontWeight: '600', letterSpacing: 0.9, color: INK }}>{label.toUpperCase()}</Text>
      {period && onPeriod ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`${period}, pick another period`} hitSlop={10} onPress={onPeriod} style={({ pressed }) => [chipStyle, { opacity: pressed ? 0.8 : 1 }]}>
          {chip}
        </Pressable>
      ) : period ? (
        <View style={chipStyle}>{chip}</View>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Donut · four or fewer: the % live in the list, never on the ring.    */
/* ------------------------------------------------------------------ */

export function Donut({ parts, centre, title, sub }: { parts: Array<{ label: string; value: number; color: string }>; centre: string; title?: string; sub?: string }) {
  const t = useTheme();
  const shown = parts.slice(0, 4);
  const dashes = donutDashes(shown.map((p) => p.value));
  const sum = shown.reduce((a, p) => a + Math.max(0, p.value), 0) || 1;
  return (
    <View style={{ padding: 18, borderRadius: 28, backgroundColor: t.c.bg.tile, gap: 12 }}>
      <CardTitle title={title} sub={sub} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <View style={{ width: 110, height: 110 }}>
          <Svg width={110} height={110}>
            <Circle cx={55} cy={55} r={48} fill="none" stroke={t.c.ringTrack} strokeWidth={14} />
            {dashes.map((d, i) => (d.length ? <Circle key={i} cx={55} cy={55} r={48} fill="none" stroke={shown[i]!.color} strokeWidth={14} strokeLinecap="round" strokeDasharray={`${d.length} ${d.circ - d.length}`} strokeDashoffset={d.offset} transform="rotate(-90 55 55)" /> : null))}
          </Svg>
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 18, lineHeight: 18, fontWeight: '700', letterSpacing: -1.5, fontVariant: ['tabular-nums'] }}>{centre}</Text>
          </View>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          {shown.map((p) => (
            <View key={p.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, height: 26 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: p.color }} />
              <Text numberOfLines={1} style={{ flex: 1, fontSize: 14, lineHeight: 18, fontWeight: '600' }}>{p.label}</Text>
              <Text style={{ fontSize: 14, lineHeight: 18, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{Math.round((Math.max(0, p.value) / sum) * 100)}%</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Dial · a score: 48 ticks over 270°, lit in lime by the score.        */
/* ------------------------------------------------------------------ */

export function Dial({ score, value, caption = 'OF 100', title, sub, pills, note }: { score: number; value: string; caption?: string; title?: string; sub?: string; pills?: Array<{ label: string; tone: 'good' | 'late' }>; note?: string }) {
  const t = useTheme();
  return (
    <View style={{ padding: 18, borderRadius: 28, backgroundColor: t.c.bg.tile, flexDirection: 'row', alignItems: 'center', gap: 18 }}>
      <View style={{ width: 120, height: 120 }}>
        <Svg width={120} height={120}>
          {dialTicks(score).map((k, i) => (
            <Line key={i} x1={k.x1} y1={k.y1} x2={k.x2} y2={k.y2} stroke={k.lit ? t.c.accent.mustard : t.c.fg.primary} opacity={k.lit ? 1 : 0.22} strokeWidth={2.5} strokeLinecap="round" />
          ))}
        </Svg>
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: 2 }}>
          <Text style={{ fontSize: 28, lineHeight: 29, fontWeight: '700', letterSpacing: -1.5, fontVariant: ['tabular-nums'] }}>{value}</Text>
          <Text color="tertiary" style={{ fontSize: 11, lineHeight: 14, fontWeight: '600', letterSpacing: 0.9 }}>{caption}</Text>
        </View>
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 10 }}>
        <CardTitle title={title} sub={sub} />
        {pills?.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {pills.map((p) => (
              <View key={p.label} style={{ height: 28, paddingHorizontal: 11, borderRadius: 999, justifyContent: 'center', backgroundColor: p.tone === 'good' ? t.c.accent.mustardSoft : t.c.alert.coralFill }}>
                <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: '600', color: p.tone === 'good' ? t.c.accent.mustard : t.c.alert.coralText }}>{p.label}</Text>
              </View>
            ))}
          </View>
        ) : null}
        {note ? <Text color="tertiary" style={{ fontSize: 13, lineHeight: 17 }}>{note}</Text> : null}
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Arc ticks · a share: the striped half gauge on a colour block.       */
/* ------------------------------------------------------------------ */

export function ArcTicks({ share, value, label, period, legend, color = blocks.yellow }: { share: number; value: string; label: string; period?: string; legend?: Array<{ label: string; dim?: boolean }>; color?: string }) {
  return (
    <View style={{ padding: 16, borderRadius: 28, backgroundColor: color, gap: 10 }}>
      <BlockHead label={label} period={period} />
      <View style={{ width: 240, height: 126, alignSelf: 'center' }}>
        <Svg width={240} height={126} style={{ overflow: 'visible' }}>
          {halfTicks(share).map((k, i) => (
            <Line key={i} x1={k.x1} y1={k.y1} x2={k.x2} y2={k.y2} stroke={k.lit ? INK : 'rgba(11,11,13,0.22)'} strokeWidth={3} strokeLinecap="round" />
          ))}
        </Svg>
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center' }}>
          <Text style={{ fontSize: 40, lineHeight: 41, fontWeight: '700', letterSpacing: -1.5, color: INK, fontVariant: ['tabular-nums'] }}>{value}</Text>
        </View>
      </View>
      {legend?.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {legend.map((l) => (
            <View key={l.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 30, paddingLeft: 9, paddingRight: 12, borderRadius: 999, backgroundColor: 'rgba(11,11,13,0.14)' }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: l.dim ? 'rgba(11,11,13,0.35)' : INK }} />
              <Text style={{ fontSize: 13, lineHeight: 17, fontWeight: '600', color: INK }}>{l.label}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Hour ticks · when: 24 ticks, quiet or one of three lime heights.     */
/* ------------------------------------------------------------------ */

const HOUR_TOP = [36, 26.5, 17, 7.5];
const HOUR_LABELS = ['12 am', '6 am', '12 pm', '6 pm', '12 am'];

export function HourTicks({ values, title, sub }: { values: number[]; title?: string; sub?: string }) {
  const t = useTheme();
  const [w, onLayout] = useWidth(314);
  const levels = hourLevels(values);
  const step = (w - 13) / 23;
  return (
    <View style={{ padding: 18, borderRadius: 28, backgroundColor: t.c.bg.tile, gap: 12 }}>
      <CardTitle title={title} sub={sub} />
      <View onLayout={onLayout}>
        <Svg width={w} height={60} style={{ overflow: 'visible' }}>
          {levels.map((l, i) => (
            <Line key={i} x1={6.5 + i * step} x2={6.5 + i * step} y1={HOUR_TOP[l]} y2={42} stroke={l ? t.c.accent.mustard : t.c.fg.primary} strokeWidth={2.5} strokeLinecap="round" opacity={l ? 1 : 0.22} />
          ))}
          {HOUR_LABELS.map((s, i) => (
            <SvgText key={i} x={(w * i) / 4} y={59} textAnchor={i === 0 ? 'start' : i === 4 ? 'end' : 'middle'} fontSize={10} fontFamily={fonts[600]} fontWeight="600" fill={t.c.fg.tertiary}>{s}</SvgText>
          ))}
        </Svg>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Columns in tracks: the orange chart, as is.                          */
/* ------------------------------------------------------------------ */

export function TrackColumns({ values, labels, today, value, label, period, axis, color = blocks.orange, periods, onPeriod }: { values: number[]; labels: string[]; today?: number; value: string; label: string; period?: string; axis?: (n: number) => string; color?: string; /** The periods the chip offers; picking one calls onPeriod. */ periods?: string[]; onPeriod?: (p: string) => void }) {
  const [picking, setPicking] = useState(false);
  const [w, onLayout] = useWidth(318);
  const max = Math.max(1, ...values);
  // Four grid labels up to a round top, as the kit's 0 · 2k · 4k · 6k.
  const top = (() => {
    const raw = max / 3;
    const mag = 10 ** Math.floor(Math.log10(raw));
    const nice = [1, 2, 2.5, 5, 10].find((m) => m * mag >= raw)! * mag;
    return nice * 3;
  })();
  const n = Math.max(1, values.length);
  const gap = 7.9;
  const colW = (w - 26 - gap * (n - 1)) / n;
  const fmt = axis ?? ((x: number) => (x >= 1000 ? `${Math.round(x / 100) / 10}k`.replace('.0k', 'k') : String(Math.round(x))));
  return (
    <View style={{ padding: 16, borderRadius: 28, backgroundColor: color, gap: 10 }}>
      <BlockHead label={label} period={period} onPeriod={periods && onPeriod ? () => setPicking(true) : undefined} />
      <Text style={{ fontSize: 38, lineHeight: 39, fontWeight: '700', letterSpacing: -1.5, color: INK, fontVariant: ['tabular-nums'] }}>{value}</Text>
      <View onLayout={onLayout}>
        <Svg width={w} height={170} style={{ overflow: 'visible' }}>
          {[0, 1, 2, 3].map((i) => (
            <SvgText key={i} x={0} y={154 - i * 50} fontSize={10} fontFamily={fonts[600]} fontWeight="600" fill="rgba(11,11,13,0.62)">{fmt((top / 3) * i)}</SvgText>
          ))}
          {values.map((v, i) => {
            const x = 26 + i * (colW + gap);
            const h = Math.max(0, Math.min(150, (v / top) * 150));
            return (
              <React.Fragment key={i}>
                <Rect x={x} y={0} width={colW} height={150} rx={10} fill="rgba(11,11,13,0.18)" />
                {h > 0 ? <Rect x={x} y={150 - h} width={colW} height={h} rx={Math.min(10, h / 2)} fill={i === today ? '#F5F5F7' : INK} /> : null}
                <SvgText x={x + colW / 2} y={168} textAnchor="middle" fontSize={10} fontFamily={fonts[600]} fontWeight="600" fill="rgba(11,11,13,0.62)" opacity={0.8}>{labels[i] ?? ''}</SvgText>
              </React.Fragment>
            );
          })}
        </Svg>
      </View>
      {periods && onPeriod ? <ActionSheet visible={picking} onClose={() => setPicking(false)} title="Period" actions={periods.map((p) => ({ label: p === period ? `${p} ✓` : p, onPress: () => onPeriod(p) }))} /> : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Numerals: the dot-matrix face, for times, dates, scores, counts.     */
/* ------------------------------------------------------------------ */

export function DotNumber({ text, pitch = 4.5, color, accessibilityLabel }: { text: string; pitch?: number; color?: string; accessibilityLabel?: string }) {
  const t = useTheme();
  const cols = dotColumns(text);
  const r = pitch / 3;
  const c = color ?? t.c.fg.primary;
  return (
    <Svg width={Math.max(0, cols.length * pitch - (pitch - 2 * r))} height={7 * pitch - (pitch - 2 * r)} accessibilityLabel={accessibilityLabel ?? text}>
      {cols.flatMap((col, x) => col.map((on, y) => <Circle key={`${x}-${y}`} cx={x * pitch + r} cy={y * pitch + r} r={r} fill={c} opacity={on ? 1 : 0.1} />))}
    </Svg>
  );
}

/* ------------------------------------------------------------------ */
/* Ruler · a reading in its range: dot-matrix number, ticks, a marker.  */
/* ------------------------------------------------------------------ */

export function Ruler({ reading, min, max, normal, display, title, sub, delta, note, from = '#3BA35E', to = '#145A66' }: { reading: number; min: number; max: number; normal: [number, number]; display: string; title?: string; sub?: string; delta?: string; note?: string; from?: string; to?: string }) {
  const t = useTheme();
  const [size, setSize] = useState({ w: 350, h: 220 });
  const [w, onLayout] = useWidth(318);
  const pos = (v: number) => Math.max(0, Math.min(1, (v - min) / (max - min || 1)));
  const lo = Math.round(pos(normal[0]) * 40);
  const hi = Math.round(pos(normal[1]) * 40);
  const mark = pos(reading) * w;
  return (
    <View onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })} style={{ borderRadius: 28, overflow: 'hidden', padding: 16, gap: 10 }}>
      <Svg width={size.w} height={size.h} style={{ position: 'absolute', top: 0, left: 0 }}>
        <Defs>
          <LinearGradient id="rulerBg" x1="0" y1="0" x2="0.34" y2="1">
            <Stop offset="0" stopColor={from} />
            <Stop offset="1" stopColor={to} />
          </LinearGradient>
          <RadialGradient id="rulerGlow" cx="0.3" cy="0.05" r="0.6">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.22} />
            <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={size.w} height={size.h} fill="url(#rulerBg)" />
        <Rect x={0} y={0} width={size.w} height={size.h} fill="url(#rulerGlow)" />
      </Svg>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <CardTitle title={title} sub={sub} />
        </View>
        {delta ? <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: '600', color: 'rgba(255,255,255,0.7)' }}>{delta}</Text> : null}
      </View>
      <View style={{ alignItems: 'center', paddingTop: 10, paddingBottom: 4 }}>
        <DotNumber text={display} pitch={9} color="#F5F5F7" />
      </View>
      <View onLayout={onLayout}>
        <Svg width={w} height={34}>
          {Array.from({ length: 41 }, (_, i) => {
            const major = i % 5 === 0;
            const inRange = i >= lo && i <= hi;
            const x = (w * i) / 40;
            return <Line key={i} x1={x} x2={x} y1={major ? 4 : 7} y2={major ? 18 : 15} stroke={inRange ? t.c.accent.mustard : '#F5F5F7'} strokeWidth={1.5} opacity={inRange ? 1 : major ? 0.6 : 0.28} strokeLinecap="round" />;
          })}
          <Path d={`M${mark - 5} 28 L${mark + 5} 28 L${mark} 22 Z`} fill={t.c.accent.mustard} />
        </Svg>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: -2 }}>
        {['Low', 'Normal', 'High'].map((s) => (
          <Text key={s} style={{ fontSize: 11, lineHeight: 14, fontWeight: '600', color: 'rgba(245,245,247,0.42)' }}>{s}</Text>
        ))}
      </View>
      {note ? <Text style={{ fontSize: 13, lineHeight: 17, fontWeight: '600', color: 'rgba(255,255,255,0.8)' }}>{note}</Text> : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* NR-KitInstruments: a charcoal card watching something, all in dots.   */
/* ------------------------------------------------------------------ */

const Mono = ({ children, size = 10, color, weight = 500 }: { children: React.ReactNode; size?: number; color?: string; weight?: 500 | 700 }) => (
  <Text style={{ fontFamily: monoFonts[weight], fontSize: size, lineHeight: Math.round(size * 1.3), letterSpacing: size >= 18 ? 1.1 : 0.6, textTransform: 'uppercase', color, fontVariant: ['tabular-nums'] }}>{children}</Text>
);

export function InstrumentCard({ number, title, value, caption, status, line, footer }: { number?: string; title: string; value: string; caption?: string; status?: string; line?: number[]; footer?: { label: string; value: string; good?: boolean } }) {
  const t = useTheme();
  const [w, onLayout] = useWidth(264);
  const pts = line && line.length > 1 ? line : null;
  const lo = pts ? Math.min(...pts) : 0;
  const hi = pts ? Math.max(...pts) : 1;
  const xy = (v: number, i: number) => ({ x: (w * i) / ((pts?.length ?? 2) - 1), y: 62 - ((v - lo) / (hi - lo || 1)) * 54 });
  const peak = pts ? pts.indexOf(hi) : -1;
  return (
    <View style={{ borderRadius: 22, backgroundColor: instrument.card, padding: 18, gap: 14 }}>
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'baseline' }}>
        {number ? <Mono color={t.c.fg.tertiary}>{number}</Mono> : null}
        <Mono color={t.c.fg.secondary}>{title}</Mono>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ gap: 6 }}>
          <DotNumber text={value} pitch={6} color="#F5F5F7" />
          {caption ? <Mono color={t.c.fg.tertiary}>{caption}</Mono> : null}
        </View>
        {status ? <Mono size={11} weight={700} color={instrument.signal}>{status}</Mono> : null}
      </View>
      {pts ? (
        <View onLayout={onLayout}>
          <Svg width={w} height={70} style={{ overflow: 'visible' }}>
            <Path d={pts.map((v, i) => `${i ? 'L' : 'M'}${xy(v, i).x.toFixed(1)} ${xy(v, i).y.toFixed(1)}`).join(' ')} fill="none" stroke="#F5F5F7" strokeWidth={2.4} strokeLinecap="round" strokeDasharray="0.1 5" />
            <Circle cx={xy(hi, peak).x} cy={xy(hi, peak).y} r={9} fill={instrument.signal} opacity={0.25} />
            <Circle cx={xy(hi, peak).x} cy={xy(hi, peak).y} r={4} fill={instrument.signal} />
          </Svg>
        </View>
      ) : null}
      {footer ? (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Mono color={t.c.fg.tertiary}>{footer.label}</Mono>
          <Mono size={18} color={footer.good === false ? t.c.alert.coralText : t.c.accent.mustard}>{footer.value}</Mono>
        </View>
      ) : null}
    </View>
  );
}
