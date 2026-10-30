import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { Button, Icon, Text } from '@ui/kit';
import { useTheme } from '@ui/theme/ThemeProvider';
import { blocks } from '@ui/theme/tokens';

/**
 * People's parts (NR-People-Parts): the face in four sizes with the lime
 * ring, stacked faces, the last-spoke and balance chips, the call trio, the
 * action pills, the keep-in-touch nudge, the empty states and G1 (no photo:
 * their colour, initials bottom-left, first name on top). Sizes and colours
 * are the artboard's; every People screen draws from here.
 */

/** Face colours, from the artboards (blocks plus the People pages' own: salmon, coral, periwinkle, pistachio, sand). */
export const FACE_COLORS = [blocks.pink, blocks.mint, blocks.lilac, blocks.sky, blocks.yellow, '#FFB1A1', '#FF8A6A', '#9FB8F7', '#DCEFC8', '#F2D7A0'];
const INK = '#0B0B0D';
const GROUND = '#0B0B0D';

/** A person's colour: fixed per record id. */
export function faceColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return FACE_COLORS[h % FACE_COLORS.length]!;
}

/** "Priya Sharma" → "PS", "Mom" → "M". */
export function initials(name: string, max = 2): string {
  const words = name.trim().split(/\s+/).filter((w) => /\p{L}|\p{N}/u.test(w));
  return words.slice(0, max).map((w) => w.match(/\p{L}|\p{N}/u)![0]!.toUpperCase()).join('') || '?';
}

export type FaceSize = 24 | 32 | 36 | 40 | 56;
/** Initial type per size (56: 20/26 · 40: 14/18 · 36: 13/17 · 32: 12/16 · 24: 9/12), 700, ground ink. */
const FACE_TYPE: Record<FaceSize, { fontSize: number; lineHeight: number }> = { 56: { fontSize: 20, lineHeight: 26 }, 40: { fontSize: 14, lineHeight: 18 }, 36: { fontSize: 13, lineHeight: 17 }, 32: { fontSize: 12, lineHeight: 16 }, 24: { fontSize: 9, lineHeight: 12 } };

/**
 * A face: their photo, or their initial on their colour. `due` draws the lime
 * ring (2px of ground, then 2px of lime) outside the face, so neighbours keep
 * their place; `ground` is what the ring's gap shows (the card it sits on).
 */
export function Face({ id, name, photo, size = 40, due, ground = GROUND, style }: { id: string; name: string; photo?: string | null; size?: FaceSize; due?: boolean; ground?: string; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const face = (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: faceColor(id), alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      {photo ? (
        <Image source={{ uri: photo }} style={{ width: size, height: size }} contentFit="cover" accessibilityIgnoresInvertColors />
      ) : (
        <Text style={{ ...FACE_TYPE[size], fontWeight: '700', color: INK }}>{initials(name, 1)}</Text>
      )}
    </View>
  );
  if (!due) return <View style={style}>{face}</View>;
  return (
    <View style={[{ margin: -4, padding: 2, borderRadius: size / 2 + 4, borderWidth: 2, borderColor: t.c.accent.mustard, backgroundColor: ground }, style]}>{face}</View>
  );
}

/** Stacked faces (a group): 24 overlapping by 6, or 32 by 8, each ringed in the ground. */
export function FaceStack({ people, size = 24, ground = GROUND, max = 4 }: { people: Array<{ id: string; name: string; photo?: string | null }>; size?: 24 | 32; ground?: string; max?: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {people.slice(0, max).map((p, i) => (
        <View key={p.id} style={{ marginLeft: i ? (size === 24 ? -6 : -8) : 0, borderRadius: size / 2 + 2, borderWidth: 2, borderColor: ground }}>
          <Face id={p.id} name={p.name} photo={p.photo} size={size} />
        </View>
      ))}
    </View>
  );
}

/** A 28-high chip: quiet, lime (due / owes you), coral (overdue) or white (you owe). */
export function Chip28({ label, tone = 'quiet' }: { label: string; tone?: 'quiet' | 'lime' | 'coral' | 'white' }) {
  const t = useTheme();
  const bg = { quiet: t.c.bg.dim, lime: 'rgba(215,245,92,0.16)', coral: 'rgba(255,92,71,0.18)', white: '#F5F5F7' }[tone];
  const fg = { quiet: t.c.fg.secondary, lime: blocks.lime, coral: '#FF8A7A', white: INK }[tone];
  return (
    <View style={{ height: 28, paddingHorizontal: 11, borderRadius: 999, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start' }}>
      <Text numberOfLines={1} style={{ fontSize: 12, lineHeight: 16, fontWeight: '600', color: fg }}>{label}</Text>
    </View>
  );
}

/** "today" · "3 d" · "2 mo" · "5 mo ago" style: whole days → a short span. */
export function shortSpan(days: number | null): string {
  if (days == null) return 'never';
  if (days <= 0) return 'today';
  if (days < 60) return `${days} d`;
  if (days < 365) return `${Math.round(days / 30)} mo`;
  return `${Math.round(days / 365)} y`;
}

/** Last spoke: quiet; lime when due today; coral when overdue ("12 d overdue"). */
export function LastSpokeChip({ days, overdueBy }: { days: number | null; overdueBy?: number | null }) {
  if (overdueBy != null && overdueBy > 0) return <Chip28 label={`${overdueBy} d overdue`} tone="coral" />;
  if (overdueBy === 0) return <Chip28 label="due today" tone="lime" />;
  return <Chip28 label={shortSpan(days)} />;
}

/** Balance: in is lime ("owes you ₹1,620"), out is white ("you owe ₹400"), else "settled". */
export function BalanceChip({ amount, format }: { amount: number; format: (n: number) => string }) {
  if (amount > 0) return <Chip28 label={`owes you ${format(amount)}`} tone="lime" />;
  if (amount < 0) return <Chip28 label={`you owe ${format(-amount)}`} tone="white" />;
  return <Chip28 label="settled" />;
}

/** Call · Message · Log contact as raised discs (44 on cards, 40 in rows). */
export function CallTrio({ size = 44, onCall, onMessage, onLog }: { size?: 40 | 44; onCall?: () => void; onMessage?: () => void; onLog: () => void }) {
  const t = useTheme();
  const disc = (icon: string, label: string, onPress?: () => void) =>
    onPress ? (
      <Pressable key={label} onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => ({ width: size, height: size, borderRadius: size / 2, backgroundColor: pressed ? t.c.bg.pressed : t.c.bg.tileRaised, alignItems: 'center', justifyContent: 'center' })}>
        <Icon name={icon} size={18} color={t.c.fg.primary} />
      </Pressable>
    ) : null;
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>{[disc('phone', 'Call', onCall), disc('comment', 'Message', onMessage), disc('check', 'Log contact', onLog)]}</View>;
}

/** An action pill on the profile sheet: 40 high, white 10 %, 14/600. */
export function ActionPill({ label, icon, onPress }: { label: string; icon: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingLeft: 12, paddingRight: 14, borderRadius: 999, backgroundColor: pressed ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.10)' })}>
      <Icon name={icon} size={16} color="#F5F5F7" />
      <Text style={{ fontSize: 14, lineHeight: 18, fontWeight: '600', color: '#F5F5F7' }}>{label}</Text>
    </Pressable>
  );
}

/** Keep-in-touch nudge: raised card 24, a coral disc, the line, Call (lime) and Log contact. */
export function KeepInTouchNudge({ title, meta, onCall, onLog }: { title: string; meta?: string; onCall?: () => void; onLog: () => void }) {
  const t = useTheme();
  return (
    <View style={{ padding: 16, borderRadius: 24, backgroundColor: t.c.bg.tileRaised, gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,92,71,0.18)', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="phone" size={18} color="#FF8A7A" />
        </View>
        <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ fontSize: 16, lineHeight: 21, fontWeight: '600', color: t.c.fg.primary }}>{title}</Text>
          {meta ? <Text numberOfLines={1} style={{ fontSize: 13, lineHeight: 17, color: t.c.fg.secondary }}>{meta}</Text> : null}
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {onCall ? <Button title="Call" icon="phone" size="sm" onPress={onCall} style={{ flex: 1 }} /> : null}
        <Button title="Log contact" icon="check" size="sm" variant="secondary" onPress={onLog} style={{ flex: 1 }} />
      </View>
    </View>
  );
}

/** Empty states: a 56 raised disc, 17/600 title, 13 line, then the actions. */
export function PeopleEmpty({ icon = 'people', title, line, primary, secondary }: { icon?: string; title: string; line: string; primary?: { label: string; onPress: () => void }; secondary?: { label: string; onPress: () => void } }) {
  const t = useTheme();
  return (
    <View style={{ padding: 18, borderRadius: 28, backgroundColor: t.c.bg.tile, alignItems: 'center', gap: 10 }}>
      <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: t.c.bg.tileRaised, alignItems: 'center', justifyContent: 'center', marginTop: 10 }}>
        <Icon name={icon} size={26} color={t.c.accent.mustard} />
      </View>
      <Text style={{ fontSize: 17, lineHeight: 22, fontWeight: '600', color: t.c.fg.primary, textAlign: 'center' }}>{title}</Text>
      <Text style={{ fontSize: 13, lineHeight: 17, color: t.c.fg.secondary, textAlign: 'center', maxWidth: 270 }}>{line}</Text>
      {primary || secondary ? (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 6, marginBottom: 4 }}>
          {primary ? <Button title={primary.label} size="sm" onPress={primary.onPress} /> : null}
          {secondary ? <Button title={secondary.label} size="sm" variant="secondary" onPress={secondary.onPress} /> : null}
        </View>
      ) : null}
    </View>
  );
}

/** G1 · no photo: their colour, first name on top, initials bottom-left (108 × 128 card; scales by width). */
export function NoPhotoCard({ id, name, width = 108, height = 128 }: { id: string; name: string; width?: number; height?: number }) {
  const k = width / 108;
  return (
    <View style={{ width, height, borderRadius: 20 * k, backgroundColor: faceColor(id), justifyContent: 'space-between', paddingTop: 12 * k, paddingHorizontal: 12 * k, paddingBottom: 10 * k, overflow: 'hidden' }}>
      <Text numberOfLines={1} style={{ fontSize: 12 * k, lineHeight: 15 * k, fontWeight: '600', color: 'rgba(11,11,13,0.62)' }}>{name.trim().split(/\s+/)[0]}</Text>
      <Text style={{ fontSize: 46 * k, lineHeight: 44 * k, fontWeight: '800', letterSpacing: -2 * k, color: INK }}>{initials(name)}</Text>
    </View>
  );
}

/** Section label: 11/600 UPPERCASE +0.9, tertiary. */
export function Label({ children }: { children: string }) {
  const t = useTheme();
  return <Text style={{ fontSize: 11, lineHeight: 14, fontWeight: '600', letterSpacing: 0.9, color: t.c.fg.tertiary }}>{children.toUpperCase()}</Text>;
}
