import React from 'react';
import { Linking, Pressable, ScrollView, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { useRouter } from 'expo-router';
import type { ObjectRecord } from '@core/domain/types';
import { payWord, stopMark, type StopData, type TravelEvent, type TripData } from '@modules/travel';
import { C, tripRoutes, useMoneyUnit } from './shell';
import { JP_SERIF, MONO } from './kit';

/**
 * The booking screens' small pieces (JP-Bookings, JP-Booking, JP-Day): money
 * in the ₹ / local unit, inline icons, tiles, chips, rows, buttons, a stop's
 * mark, the copilot's chips and the platform board. A leaf: it imports no
 * screen file, so the screens can share it without an import cycle.
 */

/** The line's colours on Noir (JP-Parts), as Plan draws them. */
const STOP_HEX: Record<string, string> = { green: '#5FD08A', teal: '#4CC9D4', indigo: '#8C9DFF', persimmon: '#FF9A4D', wood: '#C99A6E', plum: '#E08BC8', crimson: '#FF6B7A', gold: '#F2C94C', sky: '#6CC6FF', slate: '#95A1B2' };
export const stopColor = (s: Pick<ObjectRecord<StopData>, 'data'>) => STOP_HEX[s.data.color ?? 'slate'] ?? STOP_HEX.slate!;

/* ------------------------------------------------------------------ */
/* Money                                                               */
/* ------------------------------------------------------------------ */

const SYM: Record<string, string> = { JPY: '¥', INR: '₹', USD: 'US$', EUR: '€', GBP: '£' };
/** "¥61,339", "₹52,463": whole amounts in the booking's currency. */
export const amount = (n: number, cur = 'INR') => `${SYM[cur] ?? `${cur} `}${Math.round(n).toLocaleString(cur === 'INR' ? 'en-IN' : 'en-US')}`;
/** "≈ ₹21,180" from another currency, at the trip's rate. */
export const approxInr = (n: number, cur: string, rate?: number) => (cur === 'INR' ? null : rate ? `≈ ${amount(n * rate, 'INR')}` : null);
export const bookingRoute = (id: string) => ({ pathname: '/module/[id]/[page]', params: { id: 'travel', page: 'booking', event: id } });
export const bookingsRoute = (tripId: string) => ({ pathname: '/module/[id]/[page]', params: { id: 'travel', page: 'bookings', trip: tripId } });

/**
 * Money on the trip screens, in the unit the ₹ / local switch says: `fmt` is
 * the amount in that unit, `alt` the other one ("≈ ₹10,941" or "¥18,150").
 * Amounts in a currency the trip has no rate for stay as they are.
 */
export function useAmt(trip: ObjectRecord<TripData> | null | undefined) {
  const u = useMoneyUnit();
  const local = trip?.data.localCurrency && trip.data.localCurrency !== 'INR' ? trip.data.localCurrency : null;
  const rate = trip?.data.fxRate;
  const toInr = (n: number, cur = 'INR') => (cur === 'INR' ? n : rate && cur === local ? n * rate : null);
  const showLocal = u === 'local' && !!local && !!rate;
  const fmt = (n: number, cur = 'INR') => {
    const inr = toInr(n, cur);
    if (inr == null) return amount(n, cur);
    return showLocal ? amount(inr / rate!, local!) : amount(inr, 'INR');
  };
  const alt = (n: number, cur = 'INR') => {
    const inr = toInr(n, cur);
    if (inr == null || !local || !rate) return null;
    if (showLocal) return cur === 'INR' ? amount(n, 'INR') : `≈ ${amount(inr, 'INR')}`;
    return cur === 'INR' ? `≈ ${amount(inr / rate, local)}` : amount(n, cur);
  };
  return { fmt, alt, toInr, local, rate, showLocal };
}

/* ------------------------------------------------------------------ */
/* Icons (inline, lucide-drawn as the artboards are)                   */
/* ------------------------------------------------------------------ */

export type Shape = string | { c: [number, number, number] } | { r: [number, number, number, number, number] };
export const P: Record<string, Shape[]> = {
  back: ['m12 19-7-7 7-7', 'M19 12H5'],
  next: ['M5 12h14', 'm12 5 7 7-7 7'],
  chevron: ['m9 18 6-6-6-6'],
  train: ['M8 3.1V7a4 4 0 0 0 8 0V3.1', 'm9 15-1-1', 'm15 15 1-1', 'M9 19c-2.8 0-5-2.2-5-5v-4a8 8 0 0 1 16 0v4c0 2.8-2.2 5-5 5Z', 'm8 19-2 3', 'm16 19 2 3'],
  bus: ['M8 6v6', 'M15 6v6', 'M2 12h19.6', 'M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3', { c: [7, 18, 2] }, 'M9 18h5', { c: [16, 18, 2] }],
  plane: ['M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z'],
  home: ['m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z'],
  bed: ['M2 4v16', 'M2 8h18a2 2 0 0 1 2 2v10', 'M2 17h20', 'M6 8v9'],
  ticket: ['M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z', 'M13 5v2', 'M13 17v2', 'M13 11v2'],
  pin: ['M20 10c0 4.99-5.23 9.81-7.35 11.5a1 1 0 0 1-1.3 0C9.23 19.81 4 14.99 4 10a8 8 0 0 1 16 0Z', { c: [12, 10, 3] }],
  pin2: ['M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z', { c: [12, 10, 2.5] }],
  utensils: ['M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2', 'M7 2v20', 'M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7'],
  yen: ['M12 9.5V21', 'm6 3 6 7 6-7', 'M6 15h12', 'M6 11h12'],
  coins: [{ c: [8, 8, 6] }, 'M18.09 10.37A6 6 0 1 1 10.34 18', 'M7 6h1v4', 'm16.71 13.88.7.71-2.82 2.82'],
  user: [{ c: [12, 8, 4] }, 'M4 21a8 8 0 0 1 16 0'],
  card: [{ r: [2, 5, 20, 14, 2] }, 'M2 10h20'],
  bank: ['M3 21h18', 'M5 21V10', 'M19 21V10', 'M9 21V10', 'M15 21V10', 'm2 10 10-6 10 6'],
  calendar: [{ r: [3, 4, 18, 18, 2] }, 'M16 2v4', 'M8 2v4', 'M3 10h18'],
  xCircle: [{ c: [12, 12, 9] }, 'm15 9-6 6', 'm9 9 6 6'],
  clock: [{ c: [12, 12, 9] }, 'M12 7v5l3 2'],
  info: [{ c: [12, 12, 9] }, 'M12 11v5', 'M12 8h.01'],
  lock: [{ r: [4, 11, 16, 10, 2] }, 'M8 11V7a4 4 0 0 1 8 0v4'],
  link: ['M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1', 'M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1'],
  file: ['M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z', 'M14 3v5h5'],
  plus: ['M5 12h14', 'M12 5v14'],
  mail: [{ r: [2, 4, 20, 16, 2] }, 'm22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7'],
  sparkle: ['M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z'],
  burst: ['M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6'],
  pencil: ['M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z'],
  edit: ['M12 20h9', 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z'],
  external: ['M15 3h6v6', 'M10 14 21 3', 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3'],
  eyeOff: ['M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49', 'M14.084 14.158a3 3 0 0 1-4.242-4.242', 'M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143', 'm2 2 20 20'],
  check: ['M20 6 9 17l-5-5'],
  alert: [{ c: [12, 12, 10] }, 'M12 8v4', 'M12 16h.01'],
  x: ['M18 6 6 18', 'm6 6 12 12'],
  leaf: ['M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z', 'M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12'],
  bag: ['M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z', 'M3 6h18', 'M16 10a4 4 0 0 1-8 0'],
  star: ['M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z'],
  waves: ['M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1', 'M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1', 'M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1'],
};

/** An inline SVG icon from `P`. */
export function Ico({ p, size = 16, color = C.white, sw = 2 }: { p: Shape[]; size?: number; color?: string; sw?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      {p.map((s, i) => (typeof s === 'string' ? <Path key={i} d={s} /> : 'c' in s ? <Circle key={i} cx={s.c[0]} cy={s.c[1]} r={s.c[2]} /> : <Rect key={i} x={s.r[0]} y={s.r[1]} width={s.r[2]} height={s.r[3]} rx={s.r[4]} />))}
    </Svg>
  );
}

/** The icon a way of travelling gets. */
export const modeIcon = (mode?: string) => (/fl(y|ight)|plane|air/i.test(mode ?? '') ? P.plane! : /bus|coach/i.test(mode ?? '') && !/train|rail/i.test(mode ?? '') ? P.bus! : P.train!);

/* ------------------------------------------------------------------ */
/* Small pieces                                                        */
/* ------------------------------------------------------------------ */

export const T: Record<'caps' | 'title' | 'rowTitle' | 'sub' | 'mono', TextStyle> = {
  caps: { color: C.low, fontSize: 11, lineHeight: 14, letterSpacing: 0.9, fontVariant: ['tabular-nums'], fontFamily: 'PlusJakartaSans_600SemiBold' },
  title: { color: C.white, fontSize: 17, lineHeight: 22, letterSpacing: -0.2, fontVariant: ['tabular-nums'], fontFamily: 'PlusJakartaSans_600SemiBold' },
  rowTitle: { color: C.white, fontSize: 16, lineHeight: 21, letterSpacing: -0.2, fontVariant: ['tabular-nums'], fontFamily: 'PlusJakartaSans_600SemiBold' },
  sub: { color: C.mid, fontSize: 13, lineHeight: 17, fontVariant: ['tabular-nums'], fontFamily: 'PlusJakartaSans_500Medium' },
  mono: { color: C.mid, fontSize: 10, letterSpacing: 0.9, fontVariant: ['tabular-nums'], fontFamily: MONO },
};

/** The artboards' tile: #1A1A1E, 28 round, 16 in. */
export function Tile({ children, style, onPress, label, r = 28, pad = 16, gap = 10 }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; label?: string; r?: number; pad?: number; gap?: number }) {
  const base: ViewStyle = { flexDirection: 'column', gap, minWidth: 0, padding: pad, backgroundColor: C.tile, borderRadius: r, overflow: 'hidden' };
  if (!onPress) return <View style={[base, style]}>{children}</View>;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [base, style, { opacity: pressed ? 0.85 : 1 }]}>
      {children}
    </Pressable>
  );
}

/** A card's title and its quiet line, with something on the right. */
export function CardHead({ title, sub, right }: { title: string; sub?: string | null; right?: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minWidth: 0 }}>
      <View style={{ flexDirection: 'column', flexGrow: 1, flexShrink: 1, gap: 1, minWidth: 0 }}>
        <Text style={T.title} numberOfLines={1}>{title}</Text>
        {sub ? <Text style={T.sub} numberOfLines={1}>{sub}</Text> : null}
      </View>
      {right}
    </View>
  );
}

type Tone = 'raised' | 'lime' | 'yellow' | 'coral' | 'amber' | 'dashed' | 'outline';
const TONES: Record<Tone, [string, string]> = {
  raised: [C.raised, C.mid],
  lime: ['rgba(215,245,92,0.16)', C.lime],
  yellow: ['rgba(246,226,127,0.16)', '#F6E27F'],
  coral: ['rgba(255,92,71,0.18)', '#FF8A7A'],
  amber: ['rgba(255,181,71,0.16)', '#FFB547'],
  dashed: ['transparent', '#F6E27F'],
  outline: ['transparent', C.low],
};

/** A chip: 24 high (22 small, 28 for a button), its tone's soft fill and colour. */
export function Chip({ label, tone = 'raised', icon, h = 24, onPress, a11y }: { label: string; tone?: Tone; icon?: Shape[]; h?: number; onPress?: () => void; a11y?: string }) {
  const [bg, fg] = TONES[tone];
  const body = (
    <View style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 0, gap: 5, height: h, paddingHorizontal: h >= 26 ? 11 : 9, backgroundColor: bg, borderRadius: 999, borderWidth: tone === 'dashed' || tone === 'outline' ? 1 : 0, borderStyle: 'dashed', borderColor: fg }}>
      {icon ? <Ico p={icon} size={13} color={fg} /> : null}
      <Text style={{ color: fg, fontSize: h <= 22 ? 11 : 12, lineHeight: 16, fontVariant: ['tabular-nums'], fontFamily: 'PlusJakartaSans_600SemiBold' }} numberOfLines={1}>{label}</Text>
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={a11y ?? label} onPress={onPress} hitSlop={6} style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}>
      {body}
    </Pressable>
  );
}

/** The chip on a booking: To pay / Part paid / Paid / Planned / Cancelled. */
export function PayChip({ e, h = 22 }: { e: ObjectRecord<TravelEvent>; h?: number }) {
  const w = payWord(e);
  const tone: Tone = w === 'Paid' || w === 'Confirmed' ? 'lime' : w === 'Part paid' || w === 'Pending' ? 'yellow' : w === 'Planned' ? 'dashed' : w === 'Cancelled' ? 'outline' : 'raised';
  return <Chip label={w} tone={tone} h={h} />;
}

/** A row in a card: the 36 icon disc, a title and its line, something on the right. */
export function Line({ icon, color = C.mid, title, sub, right, onPress, lines = 1, minHeight = 48, lead }: { icon?: Shape[]; color?: string; title: string; sub?: string | null; right?: React.ReactNode; onPress?: () => void; lines?: number; minHeight?: number; lead?: React.ReactNode }) {
  const body = (
    <>
      {lead ?? (icon ? (
        <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', flexShrink: 0, width: 36, height: 36, backgroundColor: C.raised, borderRadius: 18 }}>
          <Ico p={icon} size={16} color={color} />
        </View>
      ) : null)}
      <View style={{ flexDirection: 'column', flexGrow: 1, flexShrink: 1, gap: 1, minWidth: 0 }}>
        <Text style={T.rowTitle} numberOfLines={1}>{title}</Text>
        {sub ? <Text style={T.sub} numberOfLines={lines}>{sub}</Text> : null}
      </View>
      {right}
    </>
  );
  const style: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: 14, minWidth: 0, minHeight };
  if (!onPress) return <View style={style}>{body}</View>;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={({ pressed }) => [style, { opacity: pressed ? 0.75 : 1 }]}>
      {body}
    </Pressable>
  );
}

export const Divider = () => <View style={{ flexShrink: 0, height: 1, backgroundColor: C.line }} />;

/** Rows with hairlines between them. */
export function Lines({ children }: { children: React.ReactNode }) {
  const kids = React.Children.toArray(children).filter(Boolean);
  return (
    <>
      {kids.map((k, i) => (
        <React.Fragment key={i}>
          {i ? <Divider /> : null}
          {k}
        </React.Fragment>
      ))}
    </>
  );
}

/** A wide pill button: lime (the main one), raised or outlined. */
export function Btn({ title, icon, tone = 'lime', onPress, h = 52, size = 16, flex = true }: { title: string; icon?: Shape[]; tone?: 'lime' | 'raised' | 'outline'; onPress: () => void; h?: number; size?: number; flex?: boolean }) {
  const fg = tone === 'lime' ? C.ink : C.white;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', ...(flex ? { flexGrow: 1, flexShrink: 1, flexBasis: 0 } : {}), gap: 8, height: h, minWidth: 0, paddingHorizontal: h >= 50 ? 18 : 12, backgroundColor: tone === 'lime' ? C.lime : tone === 'raised' ? C.raised : 'transparent', borderWidth: tone === 'outline' ? 1.5 : 0, borderColor: 'rgba(245,245,247,0.28)', borderRadius: 999, transform: [{ scale: pressed ? 0.97 : 1 }] })}>
      {icon ? <Ico p={icon} size={h >= 50 ? 17 : 16} color={tone === 'lime' ? C.ink : C.lime} /> : null}
      <Text style={{ flexShrink: 1, color: fg, fontSize: size, lineHeight: 20, fontFamily: 'PlusJakartaSans_600SemiBold' }} numberOfLines={1}>{title}</Text>
    </Pressable>
  );
}

/** A round 52 button with a lime icon. */
export function RoundIcon({ icon, label, onPress, size = 52 }: { icon: Shape[]; label: string; onPress: () => void; size?: number }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => ({ justifyContent: 'center', alignItems: 'center', flexShrink: 0, width: size, height: size, backgroundColor: C.raised, borderRadius: size / 2, transform: [{ scale: pressed ? 0.95 : 1 }] })}>
      <Ico p={icon} size={size >= 50 ? 21 : 16} color={size >= 50 ? C.lime : C.white} />
    </Pressable>
  );
}

/** A stop's round mark: its kanji in mincho (Japan) or its letter, on its colour. */
export function StopMark({ stop, look, size = 44, ring }: { stop: Pick<ObjectRecord<StopData>, 'title' | 'data'>; look?: string; size?: number; ring?: boolean }) {
  const c = stopColor(stop);
  const serif = look === 'japan' && !!stop.data.localName;
  return (
    <View style={{ justifyContent: 'center', alignItems: 'center', flexShrink: 0, width: size, height: size, backgroundColor: ring ? 'transparent' : c, borderWidth: ring ? 2 : 0, borderColor: c, borderRadius: size / 2 }}>
      <Text style={{ color: ring ? c : C.ink, fontSize: Math.round(size * (serif ? (ring ? 0.41 : 0.45) : 0.4)), lineHeight: Math.round(size * 0.6), fontFamily: serif ? JP_SERIF : 'PlusJakartaSans_800ExtraBold', fontWeight: serif ? '800' : undefined }}>{stopMark(stop, look)}</Text>
    </View>
  );
}

/** "Ask the copilot" and its chips (horizontal, under the header). */
export function AskRow({ tripId, asks, bare }: { tripId: string; asks: string[]; bare?: boolean }) {
  const router = useRouter();
  if (!asks.length) return null;
  return (
    <View style={{ flexDirection: 'column', gap: 8, minWidth: 0 }}>
      {bare ? null : <Text style={T.caps}>ASK THE COPILOT</Text>}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ flexDirection: 'row', gap: 6, paddingHorizontal: 20 }}>
        {asks.map((a) => (
          <Pressable key={a} accessibilityRole="button" accessibilityLabel={`Ask: ${a}`} onPress={() => router.push(tripRoutes.copilot(tripId, a))} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', flexShrink: 0, gap: 6, height: 38, paddingHorizontal: 14, backgroundColor: C.raised, borderRadius: 999, opacity: pressed ? 0.8 : 1 })}>
            <Ico p={P.sparkle!} size={13} color={C.lime} />
            <Text style={{ color: C.white, fontSize: 13, fontFamily: 'PlusJakartaSans_600SemiBold' }}>{a}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* The platform board (square LEDs, as JP-Bookings draws it)           */
/* ------------------------------------------------------------------ */

// 5 x 7 glyphs, rows top to bottom, '1' lit.
const G: Record<string, string> = {
  '0': '01110100011001110101110011000101110', '1': '00100011000010000100001000010001110', '2': '01110100010000100010001000100011111', '3': '11111000100010000010000011000101110',
  '4': '00010001100101010010111110001000010', '5': '11111100001111000001000011000101110', '6': '00110010001000011110100011000101110', '7': '11111000010001000100010000100001000',
  '8': '01110100011000101110100011000101110', '9': '01110100011000101111000010001001100', A: '01110100011000111111100011000110001', B: '11110100011000111110100011000111110',
  C: '01110100011000010000100001000101110', D: '11100100101000110001100011001011100', E: '11111100001000011110100001000011111', F: '11111100001000011110100001000010000',
  G: '01110100011000010111100011000101111', H: '10001100011000111111100011000110001', I: '01110001000010000100001000010001110', J: '00111000100001000010000101001001100',
  K: '10001100101010011000101001001010001', L: '10000100001000010000100001000011111', M: '10001110111010110101100011000110001', N: '10001100011100110101100111000110001',
  O: '01110100011000110001100011000101110', P: '11110100011000111110100001000010000', Q: '01110100011000110001101011001001101', R: '11110100011000111110101001001010001',
  S: '01111100001000001110000010000111110', T: '11111001000010000100001000010000100', U: '10001100011000110001100011000101110', V: '10001100011000110001100010101000100',
  W: '10001100011000110101101011010101010', X: '10001100010101000100010101000110001', Y: '10001100011000101010001000010000100', Z: '11111000010001000100010001000011111',
  ':': '00000011000110000000011000110000000', '.': '00000000000000000000000000110001100', '-': '00000000000000011111000000000000000', '/': '00001000100001000100010000100010000',
};

/** Text on the platform board: square dots 5.2 at 6.6, unlit ones faint, every column drawn. */
export function LedBoard({ text, color = C.white, max = 8 }: { text: string; color?: string; max?: number }) {
  const chars = text.toUpperCase().slice(0, max).split('');
  const pitch = 6.6;
  const s = 5.2;
  const w = chars.length * 6 * pitch - (pitch - s);
  const h = 7 * pitch - (pitch - s);
  const dots: React.ReactNode[] = [];
  chars.forEach((ch, i) => {
    const g = G[ch] ?? '';
    for (let x = 0; x < 6; x++) {
      for (let y = 0; y < 7; y++) {
        const on = x < 5 && g[y * 5 + x] === '1';
        dots.push(<Rect key={`${i}-${x}-${y}`} x={(i * 6 + x) * pitch} y={y * pitch} width={s} height={s} rx={1} fill={color} opacity={on ? 1 : 0.13} />);
      }
    }
  });
  return (
    <View accessible accessibilityLabel={text}>
      <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        {dots}
      </Svg>
    </View>
  );
}


/** "2026-12-18" from a time. */
export const dayOfAt = (at?: number) => {
  if (!at) return undefined;
  const x = new Date(at);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};

/** Open a link the app can't show itself. */
export const openUrl = (url?: string) => (url ? Linking.openURL(url).catch(() => undefined) : undefined);
