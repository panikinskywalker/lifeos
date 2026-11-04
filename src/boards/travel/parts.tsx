import React, { useId, useState } from 'react';
import { Platform, Pressable, View, type DimensionValue, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import Svg, { Circle, Defs, Line, LinearGradient, Pattern, RadialGradient, Rect, Stop } from 'react-native-svg';
import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import { useTheme } from '@ui/theme/ThemeProvider';
import { blocks, gradients } from '@ui/theme/tokens';
import { Icon, IconButton, Text, type IconName } from '@ui/kit';
import { daysToStart, TRIP_STATUSES, tripDays, tripPhase, type Booking, type TripData } from '@modules/travel';

/**
 * Travel's parts, measured from the NR-Travel-* artboards: the trip's dates
 * and countdown, the gradient-and-grain photo, pills on a photo, faces, the
 * section head, row cards and the small note.
 */

export const INK = '#0B0B0D';
export const WHITE = '#F5F5F7';
const ON_PHOTO = 'rgba(255,255,255,0.8)';
const GLASS = 'rgba(22,22,26,0.62)';
const GLASS_EDGE = 'rgba(255,255,255,0.10)';
export const YELLOW_SOFT = 'rgba(246,226,127,0.16)';
/** The artboards' Playfair Display is not installed: the nearest serif each platform has. */
const SERIF = Platform.select({ ios: 'Georgia', android: 'serif', default: "'Playfair Display', Georgia, serif" });

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const pad = (n: number) => String(n).padStart(2, '0');

type Dates = Pick<TripData, 'startDate' | 'endDate'>;

const isoParts = (iso: string) => {
  const d = new Date(`${iso}T12:00:00`);
  return { day: d.getDate(), m: d.getMonth(), w: d.getDay(), year: d.getFullYear() };
};

/** "Sat 14 Nov". */
export const dayLabel = (iso: string) => {
  const p = isoParts(iso);
  return `${WEEKDAYS[p.w]} ${p.day} ${MONTHS[p.m]}`;
};
/** "Saturday". */
export const weekdayLong = (at: number) => WEEKDAYS_LONG[new Date(at).getDay()]!;
/** "Thu". */
export const weekdayShort = (at: number) => WEEKDAYS[new Date(at).getDay()]!;
/** "NOVEMBER" for a month's section. */
export const monthOf = (iso: string) => MONTHS_LONG[isoParts(iso).m]!;
/** "28 Oct". */
export const shortDay = (at: number) => {
  const d = new Date(at);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
};
/** "28 Oct", from a day. */
export const shortIso = (iso: string) => {
  const p = isoParts(iso);
  return `${p.day} ${MONTHS[p.m]}`;
};
/** "07:10". */
export const timeOf = (at: number) => {
  const d = new Date(at);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
/** "Sat 14 Nov", from a time. */
export const dayOf = (at: number) => {
  const d = new Date(at);
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
};

/** "14 – 16 Nov", "28 Dec – 2 Jan", "Sat 14 Nov" for one day; "No dates yet". */
export function datesLabel(d: Dates): string {
  if (!d.startDate) return 'No dates yet';
  if (!d.endDate || d.endDate === d.startDate) return dayLabel(d.startDate);
  const a = isoParts(d.startDate);
  const b = isoParts(d.endDate);
  return a.m === b.m && a.year === b.year ? `${a.day} – ${b.day} ${MONTHS[b.m]}` : `${a.day} ${MONTHS[a.m]} – ${b.day} ${MONTHS[b.m]}`;
}

/** "14/11 – 16/11". */
export function slashDates(d: Dates): string {
  if (!d.startDate) return 'No dates yet';
  const s = (iso: string) => `${iso.slice(8)}/${iso.slice(5, 7)}`;
  return d.endDate && d.endDate !== d.startDate ? `${s(d.startDate)} – ${s(d.endDate)}` : s(d.startDate);
}

/** "November 14 – 16", the hero's. */
export function longDates(d: Dates): string {
  if (!d.startDate) return 'No dates yet';
  const a = isoParts(d.startDate);
  if (!d.endDate || d.endDate === d.startDate) return `${MONTHS_LONG[a.m]} ${a.day}`;
  const b = isoParts(d.endDate);
  return a.m === b.m ? `${MONTHS_LONG[a.m]} ${a.day} – ${b.day}` : `${MONTHS[a.m]} ${a.day} – ${MONTHS[b.m]} ${b.day}`;
}

/** "in 11 d", "tomorrow", "day 2 of 4", "back 3 d ago"; null undated. */
export function whenShort(d: Dates, now = Date.now()): string | null {
  const phase = tripPhase(d, now);
  const until = daysToStart(d, now);
  if (phase === 'undated' || until == null) return null;
  if (phase === 'upcoming') return until === 1 ? 'tomorrow' : `in ${until} d`;
  if (phase === 'away') {
    const days = tripDays(d);
    return days ? `day ${1 - until} of ${days}` : 'away now';
  }
  const end = daysToStart({ startDate: d.endDate ?? d.startDate }, now)!;
  return end === -1 ? 'back yesterday' : `back ${-end} d ago`;
}

export const statusLabel = (status: string | null | undefined) => TRIP_STATUSES.find((s) => s.value === status)?.label ?? null;
export const purposeLabel = (p: string | undefined) => (p ? p.replace(/^\w/, (c) => c.toUpperCase()) : null);
export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export interface Companion {
  id: string;
  name: string;
  photo: string | null;
  data: { relationship?: string; city?: string };
}

/** Who you are going with: the trip's Travelling with Field and *person* Links, once each. */
export function companions(os: LifeOSContext, trip: ObjectRecord<TripData>): Companion[] {
  const ids = new Set(trip.data.personIds ?? []);
  for (const r of os.links.forEntity(trip.id, 'person')) if (r.other.object === 'person') ids.add(r.other.id);
  const out: Companion[] = [];
  for (const id of ids) {
    const p = os.records.get<{ relationship?: string; city?: string; photo?: { uri?: string } }>(id);
    if (p) out.push({ id: p.id, name: p.title, photo: p.data.photo?.uri ?? null, data: p.data });
  }
  return out;
}

/** "with Priya, Sneha" or "with Priya, Sneha +2"; null alone. */
export function withLine(people: Companion[]): string | null {
  if (!people.length) return null;
  const names = people.slice(0, 2).map((p) => firstName(p.name)).join(', ');
  return `with ${names}${people.length > 2 ? ` +${people.length - 2}` : ''}`;
}

/** "flight and stay booked", "stay booked", or null with nothing booked. */
export function bookedWords(bookings: Booking[]): string | null {
  const flight = bookings.some((b) => b.kind === 'flight');
  const stay = bookings.some((b) => b.kind === 'stay');
  return flight && stay ? 'flight and stay booked' : flight ? 'flight booked' : stay ? 'stay booked' : null;
}

/** "2 flights, 1 stay". */
export function bookingCount(bookings: Booking[]): string | null {
  const f = bookings.filter((b) => b.kind === 'flight').length;
  const s = bookings.filter((b) => b.kind === 'stay').length;
  return [f ? plural(f, 'flight') : null, s ? plural(s, 'stay') : null].filter(Boolean).join(', ') || null;
}

/** The artboards' airline discs; any other airline is its flight code on a raised disc. */
const AIRLINE_COLOR: Record<string, string> = { '6E': '#3F2A8C', IX: '#E8452F' };
export function airlineBadge(flightNo: string | null | undefined): { code: string; color: string | null } | null {
  const code = flightNo?.trim().slice(0, 2).toUpperCase();
  return code ? { code, color: AIRLINE_COLOR[code] ?? null } : null;
}

/* ------------------------------------------------------------------ */
/* The photo                                                            */
/* ------------------------------------------------------------------ */

/** A fixed scatter of specks, tiled over the photo: the artboards' grain. */
const GRAIN = (() => {
  let h = 2166136261;
  const rnd = () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0), (h % 1000) / 1000);
  return Array.from({ length: 120 }, (_, i) => ({ x: Math.floor(rnd() * 64), y: Math.floor(rnd() * 64), c: i % 2 ? '#FFFFFF' : '#000000', o: 0.08 + rnd() * 0.14 }));
})();

export interface Glow {
  /** Centre across the photo, 0 to 1. */
  x: number;
  y: number;
  r: number;
  color: string;
  opacity?: number;
}

const SUN = 'rgb(255,230,190)';
const SAND = '#F2D7A0';
const AMBER = '#F7B26A';
/** Where the glows sit on each of the artboards' photos. */
export const CARD_GLOWS: Glow[] = [{ x: 0.7, y: 100, r: 64, color: SUN, opacity: 0.9 }, { x: 0.2, y: 230, r: 120, color: SAND, opacity: 0.45 }];
export const THUMB_GLOWS: Glow[] = [{ x: 0.72, y: 74, r: 54, color: SUN, opacity: 0.9 }];
export const HERO_GLOWS: Glow[] = [{ x: 0.5, y: 228, r: 84, color: SUN, opacity: 0.95 }, { x: 0.28, y: 480, r: 150, color: SAND, opacity: 0.5 }, { x: 0.88, y: 430, r: 130, color: AMBER, opacity: 0.45 }];

/**
 * The trip's photo: its cover, else the Travel gradient with a soft sun, grain
 * and a shade at the foot (or `fade`: melting into the ground, on the Trip page).
 */
export function TripPhoto({ uri, glows, shadeFrom = 0.3, shade = 0.5, fade, style }: { uri?: string | null; glows: Glow[]; shadeFrom?: number; shade?: number; fade?: number; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const id = `tp${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const [size, setSize] = useState({ w: 0, h: 0 });
  const { w, h } = size;
  return (
    <View pointerEvents="none" onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })} style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden', backgroundColor: gradients.travel[1] }, style]}>
      {uri ? <Image source={{ uri }} style={{ position: 'absolute', width: '100%', height: '100%' }} contentFit="cover" accessibilityIgnoresInvertColors /> : null}
      {w ? (
        <Svg width={w} height={h}>
          <Defs>
            <LinearGradient id={`${id}b`} x1="0.33" y1="0" x2="0.67" y2="1">
              <Stop offset="0" stopColor={gradients.travel[0]} />
              <Stop offset="1" stopColor={gradients.travel[1]} />
            </LinearGradient>
            {glows.map((g, i) => (
              <RadialGradient key={i} id={`${id}g${i}`} cx="50%" cy="50%" r="50%">
                <Stop offset="0" stopColor={g.color} stopOpacity={1} />
                <Stop offset="0.4" stopColor={g.color} stopOpacity={0.5} />
                <Stop offset="1" stopColor={g.color} stopOpacity={0} />
              </RadialGradient>
            ))}
            <LinearGradient id={`${id}s`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset={String(shadeFrom)} stopColor="#000" stopOpacity={0} />
              <Stop offset="1" stopColor="#000" stopOpacity={shade} />
            </LinearGradient>
            {fade ? (
              <LinearGradient id={`${id}f`} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={t.c.bg.ground} stopOpacity={0} />
                <Stop offset="1" stopColor={t.c.bg.ground} stopOpacity={1} />
              </LinearGradient>
            ) : null}
            <Pattern id={`${id}n`} patternUnits="userSpaceOnUse" x="0" y="0" width="64" height="64">
              {GRAIN.map((s, i) => (
                <Rect key={i} x={s.x} y={s.y} width="1" height="1" fill={s.c} opacity={s.o} />
              ))}
            </Pattern>
          </Defs>
          {uri ? null : (
            <>
              <Rect x="0" y="0" width={w} height={h} fill={`url(#${id}b)`} />
              {glows.map((g, i) => (
                <Circle key={i} cx={g.x * w} cy={g.y} r={g.r} fill={`url(#${id}g${i})`} opacity={g.opacity ?? 1} />
              ))}
              <Rect x="0" y="0" width={w} height={h} fill={`url(#${id}n)`} />
            </>
          )}
          {fade ? <Rect x="0" y={h - fade} width={w} height={fade} fill={`url(#${id}f)`} /> : <Rect x="0" y="0" width={w} height={h} fill={`url(#${id}s)`} />}
        </Svg>
      ) : null}
    </View>
  );
}

/** The destination on a photo: serif capitals. */
export function SerifName({ children, size, center }: { children: string; size: number; center?: boolean }) {
  return (
    <Text accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.4} style={{ fontFamily: SERIF, fontSize: size, lineHeight: Math.round(size * 1.08), fontWeight: '600', letterSpacing: size > 60 ? 2 : 1, textTransform: 'uppercase', color: WHITE, textAlign: center ? 'center' : 'left' }}>
      {children}
    </Text>
  );
}

/** A pill on a photo: glass, a hairline edge, 30 tall with an icon, 28 without. */
export function GlassPill({ icon, iconColor = WHITE, label, color = WHITE }: { icon?: IconName; iconColor?: string; label: string; color?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: icon ? 30 : 28, paddingHorizontal: icon ? 10 : 11, borderRadius: 999, backgroundColor: GLASS, borderWidth: 1, borderColor: GLASS_EDGE }}>
      {icon ? <Icon name={icon} size={14} color={iconColor} /> : null}
      <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: icon ? '700' : '600', color, fontVariant: ['tabular-nums'] }}>{label}</Text>
    </View>
  );
}

export const onPhoto: Record<'caps' | 'line', TextStyle> = { caps: { fontSize: 11, lineHeight: 14, fontWeight: '600', letterSpacing: 0.9, color: ON_PHOTO }, line: { fontSize: 13, lineHeight: 17, fontWeight: '500', color: ON_PHOTO, fontVariant: ['tabular-nums'] } };

/* ------------------------------------------------------------------ */
/* Pills, faces, rows                                                   */
/* ------------------------------------------------------------------ */

export type ChipTone = 'lime' | 'soft' | 'quiet' | 'yellow';

/** A 28-tall chip: lime, soft lime, quiet or soft yellow. */
export function Chip28({ label, tone = 'quiet' }: { label: string; tone?: ChipTone }) {
  const t = useTheme();
  const c = { lime: { bg: t.c.accent.mustard, fg: t.c.fg.onAccent }, soft: { bg: t.c.accent.mustardSoft, fg: t.c.accent.gold }, quiet: { bg: t.c.bg.dim, fg: t.c.fg.secondary }, yellow: { bg: YELLOW_SOFT, fg: blocks.yellow } }[tone];
  return (
    <View style={{ height: 28, paddingHorizontal: 11, borderRadius: 999, backgroundColor: c.bg, justifyContent: 'center', flexShrink: 0 }}>
      <Text numberOfLines={1} style={{ fontSize: 12, lineHeight: 16, fontWeight: '600', color: c.fg, fontVariant: ['tabular-nums'] }}>{label}</Text>
    </View>
  );
}

/** A 40-tall action pill: lime, white or raised. */
export function PillButton({ title, icon, tone = 'raised', onPress }: { title: string; icon?: IconName; tone?: 'lime' | 'white' | 'raised'; onPress: () => void }) {
  const t = useTheme();
  const c = { lime: { bg: t.c.accent.mustard, fg: t.c.fg.onAccent }, white: { bg: t.c.fg.primary, fg: t.c.bg.ground }, raised: { bg: t.c.bg.tileRaised, fg: t.c.fg.primary } }[tone];
  return (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={2} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: 16, borderRadius: 999, backgroundColor: c.bg, opacity: pressed ? 0.8 : 1, flexShrink: 0 })}>
      {icon ? <Icon name={icon} size={14} color={c.fg} /> : null}
      <Text style={{ fontSize: 14, lineHeight: 18, fontWeight: '600', color: c.fg }}>{title}</Text>
    </Pressable>
  );
}

const FACES = [blocks.pink, blocks.mint, blocks.lilac, blocks.sky, blocks.yellow, '#FF8A6A', '#DCEFC8'];
export function faceColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return FACES[h % FACES.length]!;
}

/** A face: their photo, or their initial on their colour. */
export function Face({ id, name, photo, size = 40, color }: { id: string; name: string; photo?: string | null; size?: number; color?: string }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color ?? faceColor(id), alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      {photo ? <Image source={{ uri: photo }} style={{ width: size, height: size }} contentFit="cover" accessibilityIgnoresInvertColors /> : <Text style={{ fontSize: Math.round(size * 0.36), lineHeight: Math.round(size * 0.46), fontWeight: '700', color: INK }}>{name.trim().charAt(0).toUpperCase()}</Text>}
    </View>
  );
}

/** You and who's going, overlapping, each ringed in the card; "+1" past `max`. */
export function FaceStack({ people, size = 28, max = 3 }: { people: Companion[]; size?: 28 | 32; max?: number }) {
  const t = useTheme();
  const shown = people.slice(0, max - 1);
  const more = people.length - shown.length;
  const overlap = size === 28 ? -7 : -8;
  const ring = (key: string, i: number, child: React.ReactNode) => (
    <View key={key} style={{ marginLeft: i ? overlap : 0, borderRadius: size / 2 + 2, borderWidth: 2, borderColor: t.c.bg.tile }}>
      {child}
    </View>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 0 }}>
      {ring('you', 0, <Face id="you" name="You" size={size} color={t.c.accent.mustard} />)}
      {shown.map((p, i) => ring(p.id, i + 1, <Face id={p.id} name={p.name} photo={p.photo} size={size} />))}
      {more > 0 ? ring('more', shown.length + 1, (
        <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: t.c.bg.tileRaised, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 10, lineHeight: 13, fontWeight: '700', color: t.c.fg.primary }}>+{more}</Text>
        </View>
      )) : null}
    </View>
  );
}

/** A section's head: 17/600, a 13 line under it, an action on the right. */
export function SectionHead({ title, sub, action, chevron, onAction, right }: { title: string; sub?: string | null; action?: string; chevron?: boolean; onAction?: () => void; right?: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingTop: 6, paddingHorizontal: 4 }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="heading" accessibilityRole="header">{title}</Text>
        {sub ? <Text variant="caption" color="secondary" numberOfLines={2}>{sub}</Text> : null}
      </View>
      {right}
      {action && onAction ? (
        <Pressable accessibilityRole="button" accessibilityLabel={action} onPress={onAction} hitSlop={12} style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          <Text style={{ fontSize: 13, lineHeight: 17, fontWeight: '600', color: t.c.fg.secondary }}>{action}</Text>
          {chevron ? <Icon name="chevron-right" size={14} color={t.c.fg.secondary} /> : null}
        </Pressable>
      ) : null}
    </View>
  );
}

/** A small caps heading: "NOVEMBER". */
export function Caps({ children, color, style }: { children: React.ReactNode; color?: string; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return (
    <View style={style}>
      <Text variant="labelCaps" color={color ?? t.c.fg.secondary}>{children}</Text>
    </View>
  );
}

/** A card of rows (24 radius), hairlines between them. */
export function RowCard({ children, pad = 14 }: { children: React.ReactNode; pad?: number }) {
  const t = useTheme();
  const rows = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={{ padding: pad, borderRadius: 24, backgroundColor: t.c.bg.tile, gap: 8, minWidth: 0 }}>
      {rows.map((r, i) => (
        <React.Fragment key={i}>
          {i ? <View style={{ height: 1, backgroundColor: t.c.line }} /> : null}
          {r}
        </React.Fragment>
      ))}
    </View>
  );
}

/** A 40 disc in a row: an icon in its colour, or letters. */
export function Disc({ icon, color, letters, fill, size = 40, iconSize = 18 }: { icon?: IconName; color?: string; letters?: string; fill?: string | null; size?: number; iconSize?: number }) {
  const t = useTheme();
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: fill ?? t.c.bg.tileRaised, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      {icon ? <Icon name={icon} size={iconSize} color={color ?? t.c.fg.primary} /> : <Text style={{ fontSize: letters && letters.length > 1 ? 13 : 14, lineHeight: 18, fontWeight: '700', color: color ?? (fill ? WHITE : t.c.fg.primary) }}>{letters}</Text>}
    </View>
  );
}

/** A row: what leads it, 16/600 over 13/400, what trails it; pressable with `onPress`. */
export function Row({ lead, title, sub, trailing, onPress, minHeight = 56, lines = 1 }: { lead?: React.ReactNode; title: string; sub?: string | null; trailing?: React.ReactNode; onPress?: () => void; minHeight?: number; lines?: number }) {
  const body = (
    <>
      {lead}
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text variant="rowTitle" numberOfLines={lines}>{title}</Text>
        {sub ? <Text variant="caption" color="secondary" numberOfLines={1} style={{ fontVariant: ['tabular-nums'] }}>{sub}</Text> : null}
      </View>
      {trailing}
    </>
  );
  const style: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight, minWidth: 0 };
  if (!onPress) return <View style={style}>{body}</View>;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={[title, sub].filter(Boolean).join(', ')} onPress={onPress} style={({ pressed }) => [style, { opacity: pressed ? 0.75 : 1 }]}>
      {body}
    </Pressable>
  );
}

/** The dashed note at the foot of a screen: an icon and a line. */
export function Note({ icon, iconColor, children }: { icon: IconName; iconColor?: string; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 20, borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(245,245,247,0.22)' }}>
      <Icon name={icon} size={16} color={iconColor ?? t.c.fg.secondary} style={{ marginTop: 2 }} />
      <Text style={{ flex: 1, fontSize: 13, lineHeight: 18, fontWeight: '500', color: t.c.fg.secondary }}>{children}</Text>
    </View>
  );
}

/** A dashed rule: native views only dash a whole border. */
export function Dash({ color, width: w = '100%' }: { color: string; width?: DimensionValue }) {
  return (
    <View style={{ height: 2, width: w, flexShrink: 1 }}>
      <Svg width="100%" height={2}>
        <Line x1="0" y1="1" x2="100%" y2="1" stroke={color} strokeWidth={1.5} strokeDasharray="4,4" />
      </Svg>
    </View>
  );
}

/** Label, a stat and its line in a tile: "TRIPS IN 2026 · 6 · 4 done". */
export function StatCard({ label, value, line, quiet }: { label: string; value: string; line?: string | null; quiet?: boolean }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, minWidth: 0, padding: 16, borderRadius: 24, backgroundColor: t.c.bg.tile, gap: 6 }}>
      <Text variant="labelCaps" color="secondary" numberOfLines={1}>{label}</Text>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={{ fontSize: 28, lineHeight: 32, fontWeight: '700', letterSpacing: -0.5, fontVariant: ['tabular-nums'], color: quiet ? t.c.fg.secondary : t.c.fg.primary }}>{value}</Text>
      {line ? <Text numberOfLines={1} style={{ fontSize: 12, lineHeight: 15, fontWeight: '500', color: t.c.fg.secondary }}>{line}</Text> : null}
    </View>
  );
}

/** The round lime Add trip. */
export function AddTrip({ onPress }: { onPress: () => void }) {
  const t = useTheme();
  return <IconButton icon="plus" filled={t.c.accent.mustard} color={t.c.fg.onAccent} accessibilityLabel="Add trip" onPress={onPress} />;
}

/** Routes this board opens. */
export const routes = {
  trip: (id: string) => `/entity/trip/${id}`,
  newTrip: '/entity/trip/new',
  all: '/module/travel/upcoming',
  home: '/module/travel/index',
  pack: (id: string) => ({ pathname: '/module/[id]/[page]', params: { id: 'travel', page: 'pack', trip: id } }),
};
