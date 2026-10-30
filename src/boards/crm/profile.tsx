import { useId, useState, type ReactNode } from 'react';
import { Linking, Pressable, ScrollView, View, type LayoutChangeEvent } from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, Line, LinearGradient, Rect, Stop } from 'react-native-svg';
import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import type { RecordControls } from '@core/registry/types';
import { useLive } from '@ui/hooks';
import { Icon, Text, useToast } from '@ui/kit';
import { ThemeProvider } from '@ui/theme/ThemeProvider';
import { blocks, monoFonts } from '@ui/theme/tokens';
import { birthdayParts, cadenceLabel, daysSince, listItems, type GroupData, type PersonData } from '@modules/crm';
import { balanceWith, settleUp, undoSettle, type DebtData } from '@modules/finance/split';
import { Face, FaceStack, faceColor, initials, KeepInTouchNudge, shortSpan } from './parts';
import { birthdayIn, GiftIdeasSlot, weekdayDay, WishCard } from './birthday';

/**
 * Person · Profile (NR-People-Profile, its states in NR-People-ProfileStates):
 * the photo edge to edge (or, with no photo, their colour and initial), a
 * semi-opaque sheet with the name, three stats and the action pills, then
 * Links one hop out, Facts, Likes with the gift-ideas slot, Money, Photos,
 * the last note, Details, Tags, Groups, Cycles and the Timeline. The page is
 * Noir in both themes: it sits on a photo, like a colour block. The states
 * (no photo, no phone, overdue, birthday today, never spoken, vendor, owes
 * you / you owe, plays football) come out of the data. Sizes and colours are
 * the artboard's. The page parts below are shared with the Group page.
 */

export const INK = '#F5F5F7';
export const INK2 = 'rgba(245,245,247,0.62)';
export const INK3 = 'rgba(245,245,247,0.42)';
export const HAIR = 'rgba(255,255,255,0.08)';
export const RAISED = '#26262B';
export const TILE = '#1A1A1E';
export const GROUND = '#0B0B0D';
/** The sheet (rgba 22,22,26 at 62 % on the ground), solid, for rings that cut the timeline rail. */
export const SHEET_SOLID = '#121216';
export const LIME = blocks.lime;
const LIME_SOFT = 'rgba(215,245,92,0.16)';
const CORAL = '#FF8A7A';
const CORAL_SOFT = 'rgba(255,92,71,0.18)';
const MONO = monoFonts[700];
const DAY = 86_400_000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Option colour names (Field options, relationships you add) → the Noir swatch. */
const SWATCH: Record<string, string> = { red: CORAL, orange: blocks.orange, pink: blocks.pink, blue: blocks.sky, indigo: '#9FB8F7', teal: '#8AD3DD', cyan: '#8AD3DD', gray: INK3, purple: blocks.lilac, yellow: blocks.yellow, green: blocks.mint, mint: blocks.mint, brown: '#F2D7A0' };
export const swatch = (c: string | null | undefined, fallback: string = blocks.lilac) => (c ? SWATCH[c] ?? (c.startsWith('#') ? c : fallback) : fallback);

/** Each Object's ring colour and icon in Links and the timeline. */
const OBJECT_LOOK: Record<string, { color: string; icon: string }> = {
  org: { color: blocks.pink, icon: 'briefcase' },
  place: { color: LIME, icon: 'map' },
  event: { color: blocks.lilac, icon: 'calendar' },
  trip: { color: '#FF8A6A', icon: 'plane' },
  transaction: { color: blocks.orange, icon: 'receipt' },
  debt: { color: blocks.orange, icon: 'cash' },
  note: { color: '#B48CF2', icon: 'notebook' },
  task: { color: blocks.sky, icon: 'check' },
  group: { color: blocks.mint, icon: 'people' },
  game: { color: blocks.sky, icon: 'activity' },
  appearance: { color: blocks.sky, icon: 'target' },
  player: { color: blocks.sky, icon: 'activity' },
};
export const lookFor = (object: string) => OBJECT_LOOK[object] ?? { color: blocks.yellow, icon: 'doc' };

/** The link word a person-side reader expects ("with", "paid") for a Link kind. */
const WORD: Record<string, string> = { person: 'with', payee: 'paid', member: 'in', player: 'played', vendor: 'vendor for', captain: 'captain', 'fronted by': 'fronted' };

const firstOf = (title: string) => title.trim().split(/\s+/)[0] ?? title;
const dayMonth = (t: number) => {
  const d = new Date(t);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
};
const isoTime = (iso: string | undefined) => (iso ? Date.parse(iso.length === 10 ? `${iso}T12:00:00` : iso) : NaN);

/* ------------------------------------------------------------------ */
/* Page parts (shared with the Group page)                             */
/* ------------------------------------------------------------------ */

/** The page is Noir in both themes; it also covers the record screen's bottom padding. */
export function NoirPage({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const pad = insets.bottom + 32;
  return (
    <ThemeProvider override="dark">
      <View style={{ backgroundColor: GROUND, marginBottom: -pad, paddingBottom: pad }}>{children}</View>
    </ThemeProvider>
  );
}

export function Hairline() {
  return <View style={{ height: 1, backgroundColor: HAIR }} />;
}

export function SectionHead({ title, meta, onPress }: { title: string; meta?: string; onPress?: () => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingTop: 4 }}>
      <Text accessibilityRole="header" style={{ flexShrink: 1, fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: -0.2, color: INK }}>{title}</Text>
      {meta ? (
        <Pressable onPress={onPress} disabled={!onPress} hitSlop={10} accessibilityRole={onPress ? 'button' : undefined}>
          <Text style={{ fontSize: 13, lineHeight: 17, fontWeight: '600', color: INK2 }}>{meta}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** A 36 raised disc with an icon. */
export function Disc({ icon, size = 36, color = INK, bg = RAISED }: { icon: string; size?: number; color?: string; bg?: string }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={icon} size={18} color={color} />
    </View>
  );
}

/** A row: leading (a disc by default), title and sub, trailing (a chevron when it opens something). */
export function Row({ icon, lead, title, sub, trailing, onPress, minHeight = 44 }: { icon?: string; lead?: ReactNode; title: string; sub?: string | null; trailing?: ReactNode; onPress?: () => void; minHeight?: number }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight }} accessibilityRole={onPress ? 'button' : undefined} accessibilityLabel={sub ? `${title}, ${sub}` : title}>
      {lead ?? (icon ? <Disc icon={icon} /> : null)}
      <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontSize: 16, lineHeight: 21, fontWeight: '600', color: INK }}>{title}</Text>
        {sub ? <Text numberOfLines={1} style={{ fontSize: 13, lineHeight: 17, color: INK2 }}>{sub}</Text> : null}
      </View>
      {trailing !== undefined ? trailing : onPress ? <Icon name="chevron-right" size={18} color={INK2} /> : null}
    </Pressable>
  );
}

/** Rows with hairlines between. */
export function Rows({ children }: { children: ReactNode[] }) {
  const items = children.filter(Boolean);
  return (
    <View style={{ gap: 8 }}>
      {items.map((c, i) => (
        <View key={i} style={{ gap: 8 }}>
          {i ? <Hairline /> : null}
          {c}
        </View>
      ))}
    </View>
  );
}

/** A 28 chip: quiet (white 7 %), lime soft, coral soft, white (you owe) or lime solid. */
export function Chip({ label, tone = 'quiet' }: { label: string; tone?: 'quiet' | 'lime' | 'coral' | 'white' | 'solid' }) {
  const bg = { quiet: 'rgba(255,255,255,0.07)', lime: LIME_SOFT, coral: CORAL_SOFT, white: INK, solid: LIME }[tone];
  const fg = { quiet: INK2, lime: LIME, coral: CORAL, white: GROUND, solid: GROUND }[tone];
  return (
    <View style={{ height: 28, paddingHorizontal: 11, borderRadius: 999, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <Text numberOfLines={1} style={{ fontSize: 12, lineHeight: 16, fontWeight: '600', color: fg }}>{label}</Text>
    </View>
  );
}

/** A 30 chip with a colour dot (relationship, tags, UPI IDs, works at). */
export function DotChip({ label, dot, onPress }: { label: string; dot: string; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 30, paddingLeft: 9, paddingRight: 12, borderRadius: 999, backgroundColor: RAISED, alignSelf: 'flex-start' }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot }} />
      <Text numberOfLines={1} style={{ fontSize: 13, lineHeight: 17, fontWeight: '600', color: INK }}>{label}</Text>
    </Pressable>
  );
}

/** A 40 pill: raised, or white when selected (Off · Month · 3 months, Equally · By shares). */
export function ChoicePill({ label, selected, onPress, icon }: { label: string; selected?: boolean; onPress: () => void; icon?: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: !!selected }} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: 16, borderRadius: 999, backgroundColor: selected ? INK : pressed ? '#303036' : RAISED })}>
      {icon ? <Icon name={icon} size={16} color={selected ? GROUND : INK} /> : null}
      <Text style={{ fontSize: 14, lineHeight: 18, fontWeight: '600', color: selected ? GROUND : INK }}>{label}</Text>
    </Pressable>
  );
}

/** A full-width 52 (or 44) button: lime, white or raised. */
export function WideButton({ label, icon, onPress, tone = 'lime', height = 52 }: { label: string; icon?: string; onPress: () => void; tone?: 'lime' | 'white' | 'raised'; height?: number }) {
  const bg = { lime: LIME, white: INK, raised: RAISED }[tone];
  const fg = tone === 'raised' ? INK : GROUND;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => ({ height, borderRadius: 999, paddingHorizontal: 22, backgroundColor: bg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: pressed ? 0.85 : 1 })}>
      {icon ? <Icon name={icon} size={18} color={fg} /> : null}
      <Text numberOfLines={1} style={{ fontSize: 15, lineHeight: 20, fontWeight: '700', color: fg }}>{label}</Text>
    </Pressable>
  );
}

/** A raised card inside the sheet (24 radius, 16 padding). */
export function SheetCard({ children, gap = 12, radius = 24 }: { children: ReactNode; gap?: number; radius?: number }) {
  return <View style={{ padding: 16, borderRadius: radius, backgroundColor: RAISED, gap, overflow: 'hidden' }}>{children}</View>;
}

export function CardTitle({ title, line }: { title: string; line?: string }) {
  return (
    <View style={{ gap: 2 }}>
      <Text numberOfLines={1} style={{ fontSize: 16, lineHeight: 21, fontWeight: '600', color: INK }}>{title}</Text>
      {line ? <Text numberOfLines={2} style={{ fontSize: 13, lineHeight: 17, color: INK2 }}>{line}</Text> : null}
    </View>
  );
}

export function Stats({ items }: { items: Array<{ value: string; label: string; tone?: string }> }) {
  return (
    <View style={{ flexDirection: 'row', gap: 14 }}>
      {items.map((s, i) => (
        <View key={s.label + i} style={{ flex: 1, gap: 2, minWidth: 0, paddingVertical: 2, paddingLeft: i ? 14 : 0, borderLeftWidth: i ? 1 : 0, borderLeftColor: 'rgba(255,255,255,0.12)' }}>
          <Text numberOfLines={1} style={{ fontSize: 22, lineHeight: 26, fontWeight: '700', letterSpacing: -0.5, color: s.tone ?? INK }}>{s.value}</Text>
          <Text numberOfLines={1} style={{ fontSize: 12, lineHeight: 16, fontWeight: '500', color: 'rgba(255,255,255,0.6)' }}>{s.label}</Text>
        </View>
      ))}
    </View>
  );
}

/** An action pill on the sheet: 40 high, white 10 %, 14/600. */
export function SheetPill({ label, icon, onPress }: { label: string; icon: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingLeft: 12, paddingRight: 14, borderRadius: 999, backgroundColor: pressed ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.10)' })}>
      <Icon name={icon} size={16} color={INK} />
      <Text style={{ fontSize: 14, lineHeight: 18, fontWeight: '600', color: INK }}>{label}</Text>
    </Pressable>
  );
}

function VFade({ stops, id: name }: { id: string; stops: Array<[number, string, number]> }) {
  const id = `${name}-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <Svg style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} width="100%" height="100%" preserveAspectRatio="none">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          {stops.map(([o, c, a]) => (
            <Stop key={o} offset={o} stopColor={c} stopOpacity={a} />
          ))}
        </LinearGradient>
      </Defs>
      <Rect width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}

/**
 * The hero: a photo edge to edge (or their colour with the big initial, or a
 * gradient), the back disc, the handle and Edit, then the sheet that holds
 * the rest of the page.
 */
export function PageHero({ photo, color, initial, gradient, handle, controls, sheetTop, name, children }: { photo?: string | null; color?: string; initial?: string; gradient?: [string, string]; handle: string; controls?: RecordControls; sheetTop: number; name: string; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const top = insets.top + 16;
  const band = top + 40 + sheetTop + 380;
  const onColour = !photo && !!color;
  return (
    <View>
      <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: band, overflow: 'hidden' }}>
        {photo ? (
          <>
            <Image source={{ uri: photo }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} contentFit="cover" />
            <VFade id="hero-dim" stops={[[0.4, '#000000', 0], [1, '#000000', 0.35]]} />
          </>
        ) : color ? (
          <>
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: color }} />
            <Text style={{ position: 'absolute', left: 18, top: insets.top + 58, fontSize: 176, lineHeight: 176, fontWeight: '800', letterSpacing: -4, color: 'rgba(11,11,13,0.86)' }}>{initial}</Text>
            <VFade id="hero-dim" stops={[[0.45, '#000000', 0], [1, '#000000', 0.22]]} />
          </>
        ) : (
          <VFade id="hero-grad" stops={[[0, (gradient ?? ['#3A2E46', '#1C1626'])[0], 1], [0.55, (gradient ?? ['#3A2E46', '#1C1626'])[1], 1], [1, GROUND, 1]]} />
        )}
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 320 }}>
          <VFade id="hero-ground" stops={[[0, GROUND, 0], [1, GROUND, 1]]} />
        </View>
      </View>
      <View style={{ paddingTop: top, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Pressable onPress={controls?.back} accessibilityRole="button" accessibilityLabel="Back" style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)', backgroundColor: 'rgba(22,22,26,0.5)', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="chevron-left" size={20} color={INK} />
        </Pressable>
        <Pressable onPress={controls?.more} onLongPress={controls?.cover} accessibilityRole="button" accessibilityLabel="More" hitSlop={10}>
          <Text numberOfLines={1} style={{ fontSize: 14, lineHeight: 18, fontWeight: '600', color: onColour ? GROUND : INK }}>{handle}</Text>
        </Pressable>
        <Pressable onPress={controls?.edit} accessibilityRole="button" accessibilityLabel="Edit" style={{ height: 36, paddingHorizontal: 14, borderRadius: 999, backgroundColor: INK, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 13, lineHeight: 17, fontWeight: '700', color: GROUND }}>Edit</Text>
        </Pressable>
      </View>
      <View style={{ marginTop: sheetTop, paddingTop: 22, paddingHorizontal: 20, paddingBottom: 24, gap: 16, borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: 'rgba(22,22,26,0.62)', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.12)' }}>
        <Text accessibilityRole="header" style={{ fontSize: 40, lineHeight: 42, fontWeight: '600', letterSpacing: -1, color: INK }}>{name}</Text>
        {children}
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Timeline (G3)                                                       */
/* ------------------------------------------------------------------ */

export interface TimelineItem {
  id: string;
  at: number;
  title: string;
  sub?: string | null;
  icon: string;
  /** The dense timeline's dot colour. */
  dot?: string;
  onPress?: () => void;
}

/** Today · This week · Earlier in <month> · <month> · <month year>, newest first; the right column is the time, the weekday or the date. */
export function groupTimeline(items: TimelineItem[], now = Date.now()): Array<{ label: string; items: Array<TimelineItem & { right: string; }> }> {
  const today = new Date(now);
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const out: Array<{ label: string; items: Array<TimelineItem & { right: string }> }> = [];
  const time = (t: number) => {
    const d = new Date(t);
    return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  };
  for (const it of [...items].sort((a, b) => b.at - a.at)) {
    if (it.at > now + DAY) continue;
    const d = new Date(it.at);
    let label: string;
    let right: string;
    if (it.at >= start) {
      label = 'Today';
      right = time(it.at);
    } else if (it.at >= start - 6 * DAY) {
      label = 'This week';
      right = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()]!;
    } else {
      const sameMonth = d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
      label = sameMonth ? `Earlier in ${MONTHS_LONG[d.getMonth()]}` : d.getFullYear() === today.getFullYear() ? MONTHS_LONG[d.getMonth()]! : `${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`;
      right = dayMonth(it.at);
    }
    const last = out[out.length - 1];
    if (last && last.label === label) last.items.push({ ...it, right });
    else out.push({ label, items: [{ ...it, right }] });
  }
  return out;
}

function TLLabel({ children, color = INK3 }: { children: string; color?: string }) {
  return <Text style={{ fontSize: 11, lineHeight: 14, fontWeight: '600', letterSpacing: 0.9, color }}>{children.toUpperCase()}</Text>;
}

/** G3: up next (dashed disc), then the groups with a rail; `dense` draws 10 dots instead of 36 discs, one line each. */
export function Timeline({ upNext, items, dense, ring = SHEET_SOLID }: { upNext?: Array<{ title: string; sub: string; icon: string }>; items: TimelineItem[]; dense?: boolean; ring?: string }) {
  const groups = groupTimeline(items);
  return (
    <View style={{ gap: 20 }}>
      {(upNext ?? []).map((u) => (
        <View key={u.title} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 44 }}>
          <View style={{ width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, borderStyle: 'dashed', borderColor: 'rgba(245,245,247,0.32)', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={u.icon} size={16} color={INK2} />
          </View>
          <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
            <TLLabel color={INK2}>Up next</TLLabel>
            <Text numberOfLines={1} style={{ fontSize: 16, lineHeight: 21, fontWeight: '600', color: INK }}>{u.title}</Text>
            <Text numberOfLines={1} style={{ fontSize: 13, lineHeight: 17, color: INK2 }}>{u.sub}</Text>
          </View>
        </View>
      ))}
      {groups.map((g) => (
        <View key={g.label} style={{ gap: 12 }}>
          <View style={{ paddingLeft: 50 }}>
            <TLLabel>{g.label}</TLLabel>
          </View>
          <View style={{ gap: dense ? 14 : 18 }}>
            {g.items.length > 1 ? <View style={{ position: 'absolute', left: 17, top: dense ? 10 : 18, bottom: dense ? 10 : 18, width: 2, borderRadius: 1, backgroundColor: 'rgba(255,255,255,0.10)' }} /> : null}
            {g.items.map((it) => (
              <Pressable key={it.id} onPress={it.onPress} disabled={!it.onPress} style={{ flexDirection: 'row', gap: 14, alignItems: dense ? 'center' : 'flex-start' }}>
                {dense ? (
                  <View style={{ width: 36, height: 20, alignItems: 'center', justifyContent: 'center' }}>
                    <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: ring, alignItems: 'center', justifyContent: 'center' }}>
                      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: it.dot ?? LIME }} />
                    </View>
                  </View>
                ) : (
                  <View style={{ width: 44, height: 44, margin: -4, borderRadius: 22, backgroundColor: ring, alignItems: 'center', justifyContent: 'center' }}>
                    <Disc icon={it.icon} />
                  </View>
                )}
                <View style={{ flex: 1, gap: 2, minWidth: 0, paddingTop: dense ? 0 : 7 }}>
                  <Text numberOfLines={1} style={{ fontSize: 16, lineHeight: 21, fontWeight: '600', color: INK }}>{it.title}</Text>
                  {!dense && it.sub ? <Text numberOfLines={1} style={{ fontSize: 13, lineHeight: 17, color: INK2 }}>{it.sub}</Text> : null}
                </View>
                <Text style={{ fontFamily: MONO, fontSize: 12, lineHeight: 16, color: INK3, paddingTop: dense ? 0 : 10 }}>{it.right}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Links, one hop                                                      */
/* ------------------------------------------------------------------ */

interface LinkRow {
  id: string;
  object: string;
  title: string;
  sub: string | null;
  word: string;
  guessed: boolean;
  photo?: string | null;
}

/** The little map: this record in the middle, what it links to round it (guessed ones dashed with a "?"). */
function LinksMap({ centre, rows, onOpen }: { centre: { id: string; name: string; photo?: string | null }; rows: LinkRow[]; onOpen: () => void }) {
  const [w, setW] = useState(0);
  const h = 170;
  const nodes = rows.slice(0, 10);
  const cx = w / 2;
  const cy = h / 2;
  const rx = Math.max(0, w / 2 - 34);
  const ry = h / 2 - 22;
  const at = (i: number) => {
    const a = (i / Math.max(1, nodes.length)) * Math.PI * 2 - Math.PI / 2;
    return { x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) };
  };
  return (
    <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel="Open Links" onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)} style={{ height: h, borderRadius: 22, backgroundColor: GROUND, overflow: 'hidden' }}>
      {w ? (
        <>
          <Svg width={w} height={h} style={{ position: 'absolute' }}>
            {nodes.map((n, i) => {
              const p = at(i);
              return <Line key={n.id} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke={n.guessed ? 'rgba(255,138,122,0.35)' : 'rgba(255,255,255,0.14)'} strokeWidth={1.5} strokeDasharray={n.guessed ? '3 4' : undefined} />;
            })}
          </Svg>
          {nodes.map((n, i) => {
            const p = at(i);
            const look = lookFor(n.object);
            const ring = n.object === 'person' ? faceColor(n.id) : look.color;
            return (
              <View key={n.id} style={{ position: 'absolute', left: p.x - 16, top: p.y - 16, width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderStyle: n.guessed ? 'dashed' : 'solid', borderColor: n.guessed ? ring : `${ring}88`, backgroundColor: GROUND, alignItems: 'center', justifyContent: 'center' }}>
                {n.object === 'person' ? (
                  <Face id={n.id} name={n.title} photo={n.photo} size={24} />
                ) : (
                  <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: RAISED, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name={look.icon} size={12} color={INK} />
                  </View>
                )}
                {n.guessed ? (
                  <View style={{ position: 'absolute', left: -9, top: -8, width: 18, height: 18, borderRadius: 9, backgroundColor: CORAL, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 11, lineHeight: 14, fontWeight: '800', color: GROUND }}>?</Text>
                  </View>
                ) : null}
              </View>
            );
          })}
          <View style={{ position: 'absolute', left: cx - 25, top: cy - 25, padding: 3, borderRadius: 25, borderWidth: 2, borderColor: LIME, backgroundColor: TILE }}>
            <Face id={centre.id} name={centre.name} photo={centre.photo} size={40} />
          </View>
        </>
      ) : null}
      <View style={{ position: 'absolute', left: 12, bottom: 16 }}>
        <Text style={{ fontFamily: MONO, fontSize: 9, lineHeight: 12, letterSpacing: 0.5, color: INK3 }}>AROUND THIS RECORD · 1 HOP</Text>
      </View>
      <View style={{ position: 'absolute', right: 10, bottom: 10, height: 28, paddingHorizontal: 11, borderRadius: 999, backgroundColor: LIME, justifyContent: 'center' }}>
        <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: '600', color: GROUND }}>Open Links</Text>
      </View>
    </Pressable>
  );
}

function LinksCard({ person, rows, onLink, onOpenAll, onOpen }: { person: ObjectRecord<PersonData>; rows: LinkRow[]; onLink: () => void; onOpenAll: () => void; onOpen: (r: LinkRow) => void }) {
  const words: Array<{ word: string; rows: LinkRow[] }> = [];
  for (const r of rows) {
    const g = words.find((w) => w.word === r.word);
    if (g) g.rows.push(r);
    else words.push({ word: r.word, rows: [r] });
  }
  return (
    <View style={{ padding: 14, borderRadius: 28, backgroundColor: TILE, gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ fontSize: 15, lineHeight: 19, fontWeight: '600', color: INK }}>Links</Text>
          <Text numberOfLines={1} style={{ fontSize: 13, lineHeight: 17, fontWeight: '500', color: INK2 }}>{rows.length ? `${rows.length} · grouped by link word` : `Nothing linked to ${firstOf(person.title)} yet`}</Text>
        </View>
        <Pressable onPress={onLink} accessibilityRole="button" style={({ pressed }) => ({ height: 36, paddingHorizontal: 22, borderRadius: 999, backgroundColor: pressed ? '#303036' : RAISED, flexDirection: 'row', alignItems: 'center', gap: 8 })}>
          <Icon name="link" size={16} color={INK} />
          <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: '700', color: INK }}>Link</Text>
        </Pressable>
      </View>
      {rows.length ? (
        <>
          <LinksMap centre={{ id: person.id, name: person.title, photo: person.data.photo?.uri }} rows={rows} onOpen={onOpenAll} />
          {words.map((g, gi) => (
            <View key={g.word} style={{ gap: 12 }}>
              {gi ? <Hairline /> : null}
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ width: 66, paddingTop: 12 }}>
                  <Text numberOfLines={2} style={{ fontFamily: MONO, fontSize: 9, lineHeight: 12, letterSpacing: 0.5, color: INK3 }}>{g.word.toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  {g.rows.slice(0, 4).map((r) => {
                    const look = lookFor(r.object);
                    return (
                      <Pressable key={r.id} onPress={() => onOpen(r)} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 42, opacity: r.guessed ? 0.8 : 1 }}>
                        {r.object === 'person' ? (
                          <Face id={r.id} name={r.title} photo={r.photo} size={32} />
                        ) : (
                          <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: RAISED, borderWidth: 1.5, borderColor: look.color, alignItems: 'center', justifyContent: 'center' }}>
                            <Icon name={look.icon} size={15} color={INK} />
                          </View>
                        )}
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text numberOfLines={1} style={{ fontSize: 14, lineHeight: 18, fontWeight: '700', color: INK }}>{r.title}</Text>
                          {r.sub ? <Text numberOfLines={1} style={{ fontSize: 13, lineHeight: 17, color: INK3 }}>{r.sub}</Text> : null}
                        </View>
                        {r.guessed ? <Chip label="to check" tone="coral" /> : <Icon name="chevron-right" size={16} color={INK3} />}
                      </Pressable>
                    );
                  })}
                  {g.rows.length > 4 ? (
                    <Pressable onPress={onOpenAll} style={{ minHeight: 32, justifyContent: 'center' }}>
                      <Text style={{ fontSize: 13, lineHeight: 17, fontWeight: '600', color: INK2 }}>{`${g.rows.length - 4} more`}</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            </View>
          ))}
        </>
      ) : (
        <Text style={{ fontSize: 13, lineHeight: 17, color: INK2 }}>Payments, trips and dumps that mention {firstOf(person.title)} will show up here.</Text>
      )}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* The page                                                            */
/* ------------------------------------------------------------------ */

const FACT_FROM: Record<string, string> = { dump: 'From a dump', talk: 'From Talk', note: 'From a note', user: 'You noted', notification: 'From a notification', correction: 'Corrected', automation: 'Automatic' };
const EVENT_ICON: Record<string, string> = { call: 'phone', created: 'plus', updated: 'edit', status: 'check', comment: 'comment', attachment: 'image', reminder: 'bell' };

function relationshipOption(ctx: LifeOSContext, value: string | undefined) {
  if (!value) return null;
  const f = ctx.registry.objects.get('person')?.fields.find((x) => x.key === 'relationship');
  const o = f?.options?.find((x) => x.value === value);
  return { label: o?.label ?? value, color: swatch(o?.color, INK3) };
}

function birthdayLine(iso: string | undefined): string | null {
  const b = birthdayParts(iso);
  if (!b) return null;
  const n = birthdayIn(iso);
  const day = `${b.day} ${MONTHS[b.month - 1]}`;
  if (!b.year) return day;
  return `${day} ${b.year}${n?.age != null ? (n.days === 0 ? ` · ${n.age} today` : ` · turns ${n.age}`) : ''}`;
}

export function PersonPage({ entity, ctx, controls, say }: { entity: ObjectRecord<any>; ctx: LifeOSContext; controls?: RecordControls; say?: ReactNode }) {
  const router = useRouter();
  const toast = useToast();
  const [allTimeline, setAllTimeline] = useState(false);
  const p = entity as ObjectRecord<PersonData>;
  const id = entity.id;
  const first = firstOf(entity.title);
  const vendor = p.data.relationship === 'vendor';

  const view = useLive(
    (os) => {
      const links = os.links.forEntity(id).filter((l) => l.relation.kind !== 'mention');
      const seen = new Set<string>();
      const rows: LinkRow[] = [];
      const linked: ObjectRecord[] = [];
      for (const l of links) {
        if (seen.has(l.other.id)) continue;
        seen.add(l.other.id);
        const r = os.records.get<Record<string, unknown>>(l.other.id);
        if (!r) continue;
        linked.push(r);
        const when = r.occurredAt ? dayMonth(r.occurredAt) : null;
        const amount = r.object === 'transaction' && typeof r.data.amount === 'number' ? os.format.currency(r.data.amount as number) : null;
        rows.push({
          id: r.id,
          object: r.object,
          title: r.title,
          sub: [amount, r.subtitle && r.subtitle !== r.title ? r.subtitle : null, when].filter(Boolean).join(' · ') || os.registry.objects.get(r.object)?.label || null,
          word: WORD[l.relation.kind] ?? l.relation.kind,
          guessed: (l.relation.confidence ?? 1) < 1,
          photo: r.object === 'person' ? ((r.data.photo as { uri?: string } | undefined)?.uri ?? null) : null,
        });
      }
      const facts = os.facts.list({ subjectId: id, limit: 200 });
      const dumpFacts = facts.filter((f) => f.source === 'dump');
      if (dumpFacts.length) {
        const n = new Set(dumpFacts.map((f) => f.sourceRef ?? f.id)).size;
        rows.push({ id: `dumps:${id}`, object: 'note', title: `${n} dump${n === 1 ? '' : 's'}`, sub: `last ${dayMonth(dumpFacts[0]!.statedAt)} · “${dumpFacts[0]!.text}”`, word: 'filed from', guessed: false });
      }
      const photos = os.attachments.forEntity(id).filter((a) => a.kind === 'image' || (a.kind !== 'cover' && (a.mime ?? '').startsWith('image/')));
      const cover = os.attachments.cover(id)?.uri ?? null;
      const hasDebts = os.registry.objects.has('debt');
      const balance = hasDebts ? balanceWith(os, id) : 0;
      const debts = hasDebts ? os.records.query<DebtData>('debt', { filter: { and: [{ field: 'status', op: 'neq', value: 'settled' }, { field: 'data.personId', op: 'eq', value: id }] }, sort: [{ field: 'data.date', dir: 'desc' }] }, { limit: 50 }) : [];
      const everDebts = hasDebts && (debts.length > 0 || os.records.count('debt', { filter: { and: [{ field: 'data.personId', op: 'eq', value: id }] } }) > 0);
      // Groups they're in: a member row, or the record's member list.
      const groupIds = new Set(os.groups.groupsOf(id));
      const groups = os.records.query<GroupData>('group', {}, { limit: 500 }).filter((g) => groupIds.has(g.id) || (g.data.memberIds ?? []).includes(id));
      const groupRows = groups.map((g) => {
        const ms = os.groups.members(g.id).map((m) => m.memberId);
        const ids = ms.length ? ms : g.data.memberIds ?? [];
        const people = ids.map((m) => os.records.get<PersonData>(m)).filter((x): x is ObjectRecord<PersonData> => !!x);
        return { id: g.id, title: g.title, kind: g.data.kind, people: people.map((x) => ({ id: x.id, name: x.title, photo: x.data.photo?.uri ?? null })), count: ids.length + 1 };
      });
      // Jobs (vendors): transactions paid to them or linked to them.
      const txs = new Map<string, ObjectRecord<{ amount: number; date: string }>>();
      if (os.registry.objects.has('transaction')) {
        for (const t of os.records.query<{ amount: number; date: string }>('transaction', { filter: { and: [{ field: 'data.payeeId', op: 'eq', value: id }] } }, { limit: 500 })) txs.set(t.id, t);
        for (const r of linked) if (r.object === 'transaction') txs.set(r.id, r as unknown as ObjectRecord<{ amount: number; date: string }>);
      }
      const jobs = [...txs.values()].sort((a, b) => (b.occurredAt ?? isoTime(b.data.date)) - (a.occurredAt ?? isoTime(a.data.date)));
      // Turf: their player profile and how many games.
      let player: { id: string; games: number; next: number | null } | null = null;
      if (os.registry.objects.has('player')) {
        const pp = os.records.query('player', { filter: { and: [{ field: 'data.personId', op: 'eq', value: id }] } }, { limit: 1 })[0];
        if (pp) {
          const games = os.registry.objects.has('appearance') ? os.records.count('appearance', { filter: { and: [{ field: 'data.personId', op: 'eq', value: id }] } }) : 0;
          const next = os.registry.objects.has('game') ? os.records.query('game', { filter: { and: [{ field: 'occurredAt', op: 'gte', value: Date.now() }] }, sort: [{ field: 'occurredAt', dir: 'asc' }] }, { limit: 1 })[0] : undefined;
          player = { id: pp.id, games, next: next?.occurredAt ?? null };
        }
      }
      const events = os.records.timeline.forEntity(id, 200).filter((e) => e.kind !== 'relation');
      const tags = os.tags.forEntity(id);
      const worksAt = p.data.worksAtId ? os.records.get(p.data.worksAtId)?.title ?? null : null;
      const livesIn = p.data.livesInId ? os.records.get(p.data.livesInId)?.title ?? null : null;
      const cycles = os.cycles.forEntity(id).filter((c) => c.enabled);
      const contact = cycles.find((c) => c.template === 'person.contact');
      const contactStatus = contact ? os.cycles.status(contact) : null;
      return { rows, linked, facts, photos, cover, balance, debts, everDebts, groupRows, jobs, player, events, tags, worksAt, livesIn, contact, contactStatus, shared: seen.size };
    },
    [id, entity.version],
  );

  const photo = p.data.photo?.uri ?? view.cover;
  const ago = daysSince(p.data.lastContactAt);
  const tel = p.data.phone?.replace(/[^+\d]/g, '') || null;
  const upi = listItems(p.data.upi)[0] ?? null;
  const likes = listItems(p.data.likes);
  const bday = birthdayIn(p.data.birthday);
  const bdayToday = bday?.days === 0;
  const overdueBy = view.contactStatus?.state === 'overdue' && view.contactStatus.daysLeft != null ? -view.contactStatus.daysLeft : null;
  const neverSpoken = !p.data.lastContactAt && !vendor;
  const open = (object: string, rid: string) => router.push(`/entity/${object}/${rid}`);
  const edit = () => controls?.edit();
  const fmt = (n: number) => ctx.format.currency(n);

  const logContact = () => {
    const prev = p.data.lastContactAt;
    ctx.records.update<PersonData>(id, { data: { lastContactAt: new Date().toISOString().slice(0, 10) } });
    toast.show({ message: `Logged contact with ${first}`, icon: 'check', undo: () => void ctx.records.update<PersonData>(id, { data: { lastContactAt: prev } }) });
  };
  const settle = () => {
    const amount = Math.abs(view.balance);
    const s = settleUp(ctx, id);
    toast.show({ message: `Settled ${fmt(amount)} with ${first}`, icon: 'check', undo: () => undoSettle(ctx, s) });
  };
  const payUpi = () => {
    if (!upi) return;
    const amount = (-view.balance).toFixed(2);
    void Linking.openURL(`upi://pay?pa=${encodeURIComponent(upi)}&am=${amount}&pn=${encodeURIComponent(entity.title)}&cu=INR`).catch(() => toast.show({ message: 'No UPI app to pay with', icon: 'warning' }));
  };
  const setCadence = (v: string | undefined) => {
    const prev = p.data.contactEvery;
    ctx.records.update<PersonData>(id, { data: { contactEvery: v } });
    toast.show({ message: v ? `Keep in touch: ${cadenceLabel(v)?.toLowerCase()}` : 'Keep in touch off', icon: 'check', undo: () => void ctx.records.update<PersonData>(id, { data: { contactEvery: prev } }) });
  };
  const fromContacts = async () => {
    const list = (await ctx.device?.contacts?.read()) ?? [];
    const c = list.find((x) => x.id === p.data.contactId);
    if (c?.photo) ctx.records.update<PersonData>(id, { data: { photo: { uri: c.photo, name: 'Contact photo' } } });
    else toast.show({ message: `No photo on ${first}’s contact`, icon: 'info' });
  };

  // Stats: last spoke · balance · shared; a vendor's are last job · last paid · jobs.
  const lastJob = view.jobs[0];
  const stats = vendor
    ? [
        { value: lastJob ? dayMonth(lastJob.occurredAt ?? isoTime(lastJob.data.date)) : '—', label: 'last job' },
        { value: lastJob ? fmt(lastJob.data.amount) : '—', label: 'last paid' },
        { value: String(view.jobs.length), label: 'jobs' },
      ]
    : [
        { value: shortSpan(ago), label: 'last spoke', tone: overdueBy != null && overdueBy > 0 ? CORAL : undefined },
        view.balance > 0 ? { value: fmt(view.balance), label: 'owes you' } : view.balance < 0 ? { value: fmt(-view.balance), label: 'you owe' } : { value: view.everDebts ? 'settled' : '—', label: 'money' },
        { value: String(view.shared), label: 'shared' },
      ];

  const pills: Array<{ label: string; icon: string; onPress: () => void }> = [];
  if (tel) pills.push({ label: 'Call', icon: 'phone', onPress: () => void Linking.openURL(`tel:${tel}`) }, { label: 'Message', icon: 'comment', onPress: () => void Linking.openURL(`sms:${tel}`) });
  if (p.data.email) pills.push({ label: 'Mail', icon: 'send', onPress: () => void Linking.openURL(`mailto:${p.data.email}`) });
  if (!vendor) pills.push({ label: 'Log contact', icon: 'check', onPress: logContact }, { label: 'Add IOU', icon: 'cash', onPress: () => router.push('/entity/debt/new') });
  pills.push({ label: 'Add expense', icon: 'receipt', onPress: () => router.push('/entity/transaction/new') });

  // Timeline: Events, linked records and Facts; up next from the Cycles.
  const tl: TimelineItem[] = [
    ...view.events.map((e) => ({
      id: e.id,
      at: e.occurredAt,
      title: e.kind === 'created' ? `Added ${first}` : e.title,
      sub: e.kind === 'call' ? `${e.meta.type === 'outgoing' ? 'Outgoing' : 'Incoming'} · from call log` : e.body ?? (e.kind === 'updated' ? 'Edit' : null),
      icon: EVENT_ICON[e.kind] ?? 'activity',
    })),
    ...view.linked
      .filter((r) => r.occurredAt != null && !['org', 'place', 'group', 'person', 'player'].includes(r.object))
      .map((r) => ({ id: r.id, at: r.occurredAt!, title: r.title, sub: [ctx.registry.objects.get(r.object)?.label, r.subtitle].filter(Boolean).join(' · '), icon: lookFor(r.object).icon, onPress: () => open(r.object, r.id) })),
    ...view.facts.slice(0, 50).map((f) => ({ id: f.id, at: f.statedAt, title: `“${f.text}”`, sub: `Fact · ${(FACT_FROM[f.source] ?? 'noted').toLowerCase()}`, icon: 'bulb' })),
  ];
  const upNext: Array<{ title: string; sub: string; icon: string; at: number }> = [];
  if (bday && bday.days > 0 && bday.days <= 60) upNext.push({ title: bday.age != null ? `Birthday · turns ${bday.age}` : 'Birthday', sub: `${weekdayDay(bday.date)} · in ${bday.days} d`, icon: 'cake', at: bday.date.getTime() });
  if (view.contact?.nextDueAt && view.contactStatus && (view.contactStatus.daysLeft ?? -1) > 0) upNext.push({ title: `Keep in touch with ${first}`, sub: `${weekdayDay(new Date(view.contact.nextDueAt))} · in ${view.contactStatus.daysLeft} d`, icon: 'phone', at: view.contact.nextDueAt });
  upNext.sort((a, b) => a.at - b.at);
  const tlShown = allTimeline ? tl : [...tl].sort((a, b) => b.at - a.at).slice(0, 8);

  const rel = relationshipOption(ctx, p.data.relationship);
  const lastFact = view.facts[0];
  const kitSub = (() => {
    if (vendor) return 'Off for vendors';
    return cadenceLabel(p.data.contactEvery) ?? 'Off';
  })();
  const kitChip = vendor ? null : overdueBy != null && overdueBy > 0 ? <Chip label={`${overdueBy} d overdue`} tone="coral" /> : view.contactStatus?.daysLeft === 0 ? <Chip label="due today" tone="lime" /> : view.contactStatus?.daysLeft != null ? <Chip label={`in ${view.contactStatus.daysLeft} d`} /> : null;
  const words = entity.title.trim().split(/\s+/);
  const name = words.length > 1 ? `${words[0]}\n${words.slice(1).join(' ')}` : entity.title;
  const handle = `@${first.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')}`;

  return (
    <NoirPage>
      <PageHero photo={photo} color={faceColor(id)} initial={initials(entity.title, 1)} handle={handle} controls={controls} sheetTop={photo ? 200 : 170} name={name}>
        <Stats items={stats} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 20 }}>
          {pills.map((x) => (
            <SheetPill key={x.label} {...x} />
          ))}
        </ScrollView>
        {say}

        {bdayToday ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Chip label={bday?.age != null ? `${bday.age} today` : 'Birthday today'} tone="solid" />
              {birthdayParts(p.data.birthday)?.year ? <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 13, lineHeight: 17, color: INK2 }}>{`Born ${birthdayLine(p.data.birthday)!.split(' · ')[0]}`}</Text> : null}
            </View>
            <SheetCard gap={14}>
              <GiftIdeasSlot person={p} card="rgba(255,255,255,0.07)" onEditLikes={edit} />
            </SheetCard>
            <WishCard person={p} ctx={ctx} />
          </>
        ) : null}

        {!photo ? (
          <SheetCard>
            <CardTitle title="No photo yet" line={`Using ${first}’s colour. Pick one${p.data.contactId && ctx.device?.contacts ? ', or take it from contacts' : ''}.`} />
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              <ChoicePill label="Pick a photo" icon="image" onPress={edit} />
              {p.data.contactId && ctx.device?.contacts ? <ChoicePill label="From contacts" icon="people" onPress={() => void fromContacts()} /> : null}
            </View>
          </SheetCard>
        ) : null}

        {!tel ? (
          <SheetCard>
            <CardTitle title="No phone number" line="Add one to call or message from here" />
            <WideButton label="Add phone" icon="phone" tone="raised" height={44} onPress={edit} />
          </SheetCard>
        ) : null}

        {overdueBy != null && overdueBy > 0 && !vendor ? (
          <KeepInTouchNudge title={ago != null ? `${ago} day${ago === 1 ? '' : 's'} since you last spoke` : 'You have not spoken yet'} meta={`You aim for ${(cadenceLabel(p.data.contactEvery) ?? '').toLowerCase()} · ${overdueBy} d overdue`} onCall={tel ? () => void Linking.openURL(`tel:${tel}`) : undefined} onLog={logContact} />
        ) : null}

        {neverSpoken ? (
          <SheetCard>
            <CardTitle
              title={p.data.contactId && Date.now() - entity.createdAt < DAY ? 'Added from contacts today' : `Added ${ctx.format.date(entity.createdAt, 'medium')}`}
              line={[[p.data.role, view.worksAt ?? p.data.company].filter(Boolean).join(' at '), view.shared ? null : 'nothing linked yet'].filter(Boolean).join(' · ') || 'You have not spoken yet'}
            />
            <Text style={{ fontSize: 13, lineHeight: 17, fontWeight: '600', color: INK2, paddingHorizontal: 4 }}>Keep in touch?</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
              <ChoicePill label="Off" selected={!p.data.contactEvery} onPress={() => setCadence(undefined)} />
              <ChoicePill label="Month" selected={p.data.contactEvery === '30'} onPress={() => setCadence('30')} />
              <ChoicePill label="3 months" selected={p.data.contactEvery === '91'} onPress={() => setCadence('91')} />
            </ScrollView>
          </SheetCard>
        ) : null}

        {vendor ? (
          <Rows>
            {[
              <Row key="role" icon="wrench" title={p.data.role || 'Vendor'} sub={['Vendor', view.livesIn ?? p.data.city].filter(Boolean).join(' · ')} />,
              lastJob ? <Row key="job" icon="receipt" title={(lastJob as ObjectRecord).title} sub={weekdayDay(new Date(lastJob.occurredAt ?? isoTime(lastJob.data.date)))} trailing={<Text style={{ fontSize: 16, fontWeight: '700', color: INK }}>{fmt(lastJob.data.amount)}</Text>} onPress={() => open('transaction', lastJob.id)} /> : null,
              <Row key="kit" icon="phone" title="Keep in touch" sub="Off for vendors" />,
            ]}
          </Rows>
        ) : null}

        {view.player ? (
          <Row icon="activity" title="Turf · player profile" sub={[`${view.player.games} game${view.player.games === 1 ? '' : 's'}`, view.player.next ? `next ${weekdayDay(new Date(view.player.next))} ${ctx.format.time(view.player.next)}` : null].filter(Boolean).join(' · ')} onPress={() => open('player', view.player!.id)} />
        ) : null}

        <Hairline />
        <SectionHead title="Links" meta={view.rows.length ? 'All' : undefined} onPress={() => router.push(`/links/${id}`)} />
        <LinksCard
          person={p}
          rows={view.rows}
          onLink={() => controls?.link()}
          onOpenAll={() => router.push(`/links/${id}`)}
          onOpen={(r) => (r.id.startsWith('dumps:') ? router.push('/memory') : open(r.object, r.id))}
        />

        {view.facts.length ? (
          <SheetCard>
            <Text style={{ fontSize: 11, lineHeight: 14, fontWeight: '600', letterSpacing: 0.9, color: INK3 }}>{`FACTS · ${view.facts.length}`}</Text>
            <Text style={{ fontSize: 15, lineHeight: 24, fontWeight: '500', color: INK }}>{view.facts.slice(0, 6).map((f) => `• ${f.text}${f.confidence < 0.7 ? '?' : ''}`).join('\n')}</Text>
            {view.facts.length > 6 ? (
              <Pressable onPress={() => router.push('/memory')} hitSlop={8}>
                <Text style={{ fontSize: 13, lineHeight: 17, fontWeight: '600', color: INK2 }}>{`All ${view.facts.length} in Memory`}</Text>
              </Pressable>
            ) : null}
          </SheetCard>
        ) : null}

        <SheetCard>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <Text style={{ fontSize: 11, lineHeight: 14, fontWeight: '600', letterSpacing: 0.9, color: INK3 }}>{likes.length ? `LIKES · ${likes.length}` : 'LIKES'}</Text>
            <Text style={{ fontSize: 12, lineHeight: 15, fontWeight: '500', color: INK3 }}>Used for gift ideas</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16 }} contentContainerStyle={{ gap: 6, paddingHorizontal: 16 }}>
            {likes.map((l) => (
              <View key={l} style={{ height: 34, paddingHorizontal: 12, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.08)', justifyContent: 'center' }}>
                <Text style={{ fontSize: 13, lineHeight: 17, fontWeight: '600', color: INK }}>{l}</Text>
              </View>
            ))}
            <Pressable onPress={edit} accessibilityRole="button" accessibilityLabel="Add a like" style={{ flexDirection: 'row', alignItems: 'center', gap: 5, height: 34, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(245,245,247,0.28)' }}>
              <Icon name="plus" size={14} color={INK2} />
              <Text style={{ fontSize: 13, lineHeight: 17, fontWeight: '600', color: INK2 }}>Add</Text>
            </Pressable>
          </ScrollView>
          <Hairline />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Disc icon="gift" bg="rgba(215,245,92,0.14)" color={LIME} />
            <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
              <Text numberOfLines={1} style={{ fontSize: 15, lineHeight: 20, fontWeight: '600', color: INK }}>{bday ? `Gift ideas for ${bday.date.getDate()} ${MONTHS[bday.date.getMonth()]}` : 'Gift ideas'}</Text>
              <Text numberOfLines={2} style={{ fontSize: 13, lineHeight: 17, color: INK2 }}>{likes.length ? `Gift ideas from ${first}’s likes arrive with the brain` : 'No likes saved, so no gift ideas'}</Text>
            </View>
          </View>
        </SheetCard>

        {view.debts.length || view.balance !== 0 ? (
          <>
            <Hairline />
            <SectionHead title="Money" />
            <Rows>
              {view.debts.slice(0, 6).map((d) => (
                <Row
                  key={d.id}
                  icon={d.data.kind === 'loan' ? 'cash' : 'receipt'}
                  title={d.data.reason || d.title}
                  sub={`${weekdayDay(new Date(isoTime(d.data.date)))} · ${d.data.direction === 'they_owe' ? `${first}’s share` : 'your share'}`}
                  trailing={<Text style={{ fontSize: 16, fontWeight: '700', color: d.data.direction === 'they_owe' ? LIME : INK }}>{fmt(d.data.amount)}</Text>}
                  onPress={d.data.transactionId ? () => open('transaction', d.data.transactionId!) : () => open('debt', d.id)}
                />
              ))}
            </Rows>
            {view.balance > 0 ? <WideButton label={`Settle ${fmt(view.balance)}`} onPress={settle} /> : null}
            {view.balance < 0 ? (
              upi ? (
                <>
                  <WideButton label={`Pay ${fmt(-view.balance)} · UPI`} icon="send" tone="white" onPress={payUpi} />
                  <WideButton label="Mark as settled" tone="raised" height={44} onPress={settle} />
                </>
              ) : (
                <WideButton label={`Settle ${fmt(-view.balance)}`} tone="white" onPress={settle} />
              )
            ) : null}
          </>
        ) : null}

        {view.photos.length ? (
          <>
            <Hairline />
            <SectionHead title="Photos" meta={String(view.photos.length)} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 20 }}>
              {view.photos.slice(0, 12).map((a) => (
                <Image key={a.id} source={{ uri: a.uri }} style={{ width: 84, height: 84, borderRadius: 16 }} contentFit="cover" accessibilityLabel={a.name} />
              ))}
            </ScrollView>
          </>
        ) : null}

        {lastFact ? (
          <>
            <Hairline />
            <SectionHead title="Last note" />
            <View style={{ padding: 16, borderRadius: 20, backgroundColor: RAISED, gap: 12 }}>
              <Text style={{ fontSize: 16, lineHeight: 23, fontWeight: '500', color: INK }}>{lastFact.text}</Text>
              <Text numberOfLines={1} style={{ fontSize: 13, lineHeight: 17, color: INK2 }}>{`${FACT_FROM[lastFact.source] ?? 'Noted'} · ${dayMonth(lastFact.statedAt)}`}</Text>
            </View>
          </>
        ) : null}

        <Hairline />
        <SectionHead title="Details" meta="Edit" onPress={edit} />
        <Rows>
          {[
            rel ? <Detail key="rel" label="Relationship" body={<DotChip label={rel.label} dot={rel.color} />} /> : null,
            p.data.phone ? (
              <Detail
                key="phone"
                label="Phone"
                value={p.data.phone}
                trailing={
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <RoundButton icon="phone" label={`Call ${first}`} onPress={() => void Linking.openURL(`tel:${tel}`)} />
                    <RoundButton icon="comment" label={`Message ${first}`} onPress={() => void Linking.openURL(`sms:${tel}`)} />
                  </View>
                }
              />
            ) : null,
            p.data.email ? (
              <Detail key="email" label="Email" value={p.data.email} trailing={<RoundButton icon="send" label={`Mail ${first}`} onPress={() => void Linking.openURL(`mailto:${p.data.email}`)} />} />
            ) : null,
            listItems(p.data.upi).length ? (
              <Detail key="upi" label="UPI IDs" body={
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {listItems(p.data.upi).map((u) => (
                    <DotChip key={u} label={u} dot="#9FB8F7" />
                  ))}
                </View>
              } />
            ) : null,
            view.worksAt || p.data.company || p.data.role ? (
              <Detail key="work" label="Works at" body={
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {view.worksAt || p.data.company ? <DotChip label={(view.worksAt ?? p.data.company)!} dot={blocks.orange} onPress={p.data.worksAtId ? () => open('org', p.data.worksAtId!) : undefined} /> : null}
                  {p.data.role ? <Text style={{ fontSize: 14, color: INK2 }}>{p.data.role}</Text> : null}
                </View>
              } />
            ) : null,
            view.livesIn || p.data.city ? (
              <Detail key="home" label="Lives in" body={
                <DotChip label={(view.livesIn ?? p.data.city)!} dot="#FF8A6A" onPress={p.data.livesInId ? () => open('place', p.data.livesInId!) : undefined} />
              } />
            ) : null,
            p.data.birthday ? <Detail key="bday" label="Birthday" value={birthdayLine(p.data.birthday) ?? ''} /> : null,
            <Detail key="kit" label="Keep in touch" value={kitSub} />,
            p.data.notes ? <Detail key="about" label="About" value={p.data.notes} multiline /> : null,
          ]}
        </Rows>

        <Hairline />
        <SectionHead title="Tags" meta={view.tags.length ? 'Edit' : 'Add'} onPress={() => controls?.tags()} />
        {view.tags.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {view.tags.map((tg) => (
              <DotChip key={tg.id} label={tg.name} dot={swatch(tg.color)} onPress={() => router.push(`/tag/${encodeURIComponent(tg.name)}`)} />
            ))}
          </View>
        ) : (
          <Text style={{ fontSize: 13, lineHeight: 17, color: INK2 }}>No tags yet</Text>
        )}

        {view.groupRows.length ? (
          <>
            <Hairline />
            <SectionHead title={`Groups ${first}’s in`} />
            <Rows>
              {view.groupRows.map((g) => (
                <Row key={g.id} lead={<FaceStack people={g.people} size={24} ground={SHEET_SOLID} max={3} />} title={g.title} sub={[g.kind ? g.kind[0]!.toUpperCase() + g.kind.slice(1) : null, `${g.count} people`].filter(Boolean).join(' · ')} onPress={() => open('group', g.id)} />
              ))}
            </Rows>
          </>
        ) : null}

        <Hairline />
        <SectionHead title="Cycles" />
        <Rows>
          {[
            <Row key="kit" icon="phone" title="Keep in touch" sub={kitSub} trailing={kitChip ?? (vendor ? null : <Pressable onPress={edit} hitSlop={8}><Chip label="Set" /></Pressable>)} />,
            bday ? <Row key="bday" icon="cake" title="Birthday" sub={`${bday.date.getDate()} ${MONTHS[bday.date.getMonth()]}${bday.age != null ? (bday.days === 0 ? ` · ${bday.age} today` : ` · turns ${bday.age}`) : ''}`} trailing={<Chip label={bday.days === 0 ? 'today' : `in ${bday.days} d`} tone={bday.days <= 3 ? 'lime' : 'quiet'} />} /> : null,
          ]}
        </Rows>

        {tl.length || upNext.length ? (
          <>
            <Hairline />
            <SectionHead title="Timeline" meta={tl.length > 8 ? (allTimeline ? 'Less' : `All ${tl.length}`) : undefined} onPress={() => setAllTimeline((v) => !v)} />
            <Timeline upNext={upNext.slice(0, 1)} items={tlShown} />
          </>
        ) : null}
      </PageHero>
    </NoirPage>
  );
}

/** A Details row: the label, then the value (or `body` in its place), and an optional trailing node. */
function Detail({ label, value, body, trailing, multiline }: { label: string; value?: string; body?: ReactNode; trailing?: ReactNode; multiline?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52 }}>
      <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
        <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: '500', color: INK3 }}>{label}</Text>
        {value != null ? <Text numberOfLines={multiline ? undefined : 1} style={{ fontSize: 16, lineHeight: 21, fontWeight: '600', color: INK }}>{value}</Text> : body}
      </View>
      {trailing}
    </View>
  );
}

function RoundButton({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 20, backgroundColor: pressed ? '#303036' : RAISED, alignItems: 'center', justifyContent: 'center' })}>
      <Icon name={icon} size={18} color={INK} />
    </Pressable>
  );
}
