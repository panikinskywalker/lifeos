import React, { type ReactNode } from 'react';
import { Pressable, ScrollView, TextInput, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { format } from 'date-fns';
import type { Fact } from '@core/repo/factRepo';
import { useTheme } from '@ui/theme/ThemeProvider';
import { blocks, darkTints, fontForWeight, gradients, monoFonts } from '@ui/theme/tokens';
import { Icon, Text } from '@ui/kit';
import { bodyLine, kindLabel, noteAt, type FaceData, type Note } from './read';

/**
 * Journal's parts (NR-Journal-*, v3 Noir): the kind colours, faces and record
 * discs, the top bar, section heads, row cards, the note and fact rows and the
 * bars. Sizes and colours are the artboards'.
 */

/** Journal's colour from Browse: the dot beside its name. */
export const JOURNAL_DOT = gradients.memory[0];
export const JOURNAL_COLOR = darkTints.memory.ink;
export const KINDS: Record<string, { color: string; icon: string }> = {
  journal: { color: JOURNAL_COLOR, icon: 'notebook' },
  idea: { color: blocks.yellow, icon: 'bulb' },
  meeting: { color: blocks.sky, icon: 'people' },
  reference: { color: blocks.mint, icon: 'library' },
  recipe: { color: darkTints.travel.ink, icon: 'food' },
  book: { color: blocks.pink, icon: 'book' },
};
export const kindLook = (kind?: string) => KINDS[kind ?? ''] ?? { color: JOURNAL_COLOR, icon: 'notebook' };

const FACES = [blocks.pink, blocks.mint, blocks.lilac, blocks.sky, blocks.yellow, '#FFB1A1', darkTints.travel.ink, '#9FB8F7', '#8AD3DD', '#F2D7A0'];
/** A person's colour: fixed per record id. */
export function faceColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return FACES[h % FACES.length]!;
}
const initial = (name: string) => name.trim().match(/\p{L}|\p{N}/u)?.[0]?.toUpperCase() ?? '?';

const LOOKS: Record<string, { color: string; icon: string }> = {
  place: { color: blocks.yellow, icon: 'location' },
  project: { color: blocks.lilac, icon: 'folder' },
  note: { color: JOURNAL_COLOR, icon: 'notebook' },
  trip: { color: darkTints.travel.ink, icon: 'plane' },
  org: { color: blocks.pink, icon: 'briefcase' },
  event: { color: blocks.lilac, icon: 'calendar' },
  transaction: { color: blocks.orange, icon: 'receipt' },
  task: { color: blocks.sky, icon: 'check' },
  group: { color: blocks.mint, icon: 'people' },
};
/** Each Object's ring colour and icon on a Link. */
export const lookOf = (object: string) => LOOKS[object] ?? { color: blocks.yellow, icon: 'file' };
/** The colour under a mention of this record. */
export const inkOf = (object: string, id: string) => (object === 'person' ? faceColor(id) : lookOf(object).color);

/** Their photo, or their initial on their colour. `guess` draws the dashed coral ring. */
export function Face({ id, name, photo, size = 40, guess }: { id: string; name: string; photo?: string | null; size?: number; guess?: boolean }) {
  const t = useTheme();
  const font = size >= 40 ? 14 : size >= 32 ? 12 : size >= 26 ? 10 : 9;
  return (
    <View style={{ width: size, height: size }}>
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: faceColor(id), alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {photo ? <Image source={{ uri: photo }} style={{ width: size, height: size }} contentFit="cover" /> : <Text style={{ fontSize: font, lineHeight: font + 4, fontWeight: '700', color: t.c.fg.onAccent }}>{initial(name)}</Text>}
      </View>
      {guess ? <View pointerEvents="none" style={{ position: 'absolute', top: -4, left: -4, right: -4, bottom: -4, borderRadius: size / 2 + 4, borderWidth: 2, borderStyle: 'dashed', borderColor: t.c.alert.coralText }} /> : null}
    </View>
  );
}

/** Faces overlapping, each cut out of the ground behind it. */
export function FaceStack({ people, size = 22, ground, max = 4 }: { people: FaceData[]; size?: number; ground: string; max?: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {people.slice(0, max).map((p, i) => (
        <View key={p.id} style={{ marginLeft: i ? -8 : -2, marginVertical: -2, borderRadius: size / 2 + 2, borderWidth: 2, borderColor: ground }}>
          <Face id={p.id} name={p.name} photo={p.photo} size={size} />
        </View>
      ))}
    </View>
  );
}

/** A linked record: a person's face, anything else its icon in a ring of its colour. */
export function RecordDisc({ id, object, title, photo, size = 32, guess }: { id: string; object: string; title: string; photo?: string | null; size?: number; guess?: boolean }) {
  const t = useTheme();
  if (object === 'person') return <Face id={id} name={title} photo={photo} size={size} guess={guess} />;
  const look = lookOf(object);
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: t.c.bg.tileRaised, borderWidth: 1.5, borderColor: look.color, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={look.icon} size={Math.round(size * 0.47)} color={look.color} />
    </View>
  );
}

/** The top bar: back (or close), a 13/400 caption with Journal's dot if asked, the 22/700 title, then actions. */
export function TopBar({ caption, title, dot, onBack, backIcon = 'chevron-left', backLabel = 'Back', right }: { caption?: string; title: string; dot?: boolean; onBack?: () => void; backIcon?: string; backLabel?: string; right?: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      {onBack ? <RoundButton icon={backIcon} label={backLabel} onPress={onBack} /> : null}
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        {caption ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {dot ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: JOURNAL_DOT }} /> : null}
            <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 13, lineHeight: 17, color: t.c.fg.secondary, fontVariant: ['tabular-nums'] }}>{caption}</Text>
          </View>
        ) : null}
        <Text numberOfLines={1} accessibilityRole="header" style={{ fontSize: 22, lineHeight: 25, fontWeight: '700', letterSpacing: -0.5, color: t.c.fg.primary }}>{title}</Text>
      </View>
      {right ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>{right}</View> : null}
    </View>
  );
}

/** A round action: raised by default, `lime` for the primary one. */
export function RoundButton({ icon, label, onPress, lime, size = 44, iconSize = 18, color }: { icon: string; label: string; onPress?: () => void; lime?: boolean; size?: number; iconSize?: number; color?: string }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} hitSlop={Math.max(0, (44 - size) / 2)} onPress={onPress} style={({ pressed }) => ({ width: size, height: size, borderRadius: size / 2, backgroundColor: lime ? t.c.accent.mustard : t.c.bg.tileRaised, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}>
      <Icon name={icon} size={iconSize} color={color ?? (lime ? t.c.fg.onAccent : t.c.fg.primary)} />
    </Pressable>
  );
}

/** A pill button: lime (primary) or raised, 46 tall by default. */
export function PillButton({ title, icon, onPress, primary, height = 46, disabled, style }: { title: string; icon?: string; onPress?: () => void; primary?: boolean; height?: number; disabled?: boolean; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [{ height, paddingHorizontal: 20, borderRadius: 999, backgroundColor: primary ? t.c.accent.mustard : t.c.bg.tileRaised, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: disabled ? 0.45 : pressed ? 0.85 : 1 }, style]}>
      {icon ? <Icon name={icon} size={16} color={primary ? t.c.fg.onAccent : t.c.accent.mustard} /> : null}
      <Text numberOfLines={1} style={{ fontSize: 15, lineHeight: 20, fontWeight: primary ? '700' : '600', color: primary ? t.c.fg.onAccent : t.c.fg.primary }}>{title}</Text>
    </Pressable>
  );
}

/** A section's head: 17/600, a 13/400 line under it, and a quiet link on the right. */
export function SectionHead({ title, sub, action, onAction }: { title: string; sub?: string; action?: string; onAction?: () => void }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingTop: 6, paddingHorizontal: 4 }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: -0.2, color: t.c.fg.primary }}>{title}</Text>
        {sub ? <Text numberOfLines={1} style={{ fontSize: 13, lineHeight: 17, color: t.c.fg.secondary }}>{sub}</Text> : null}
      </View>
      {action ? (
        <Pressable accessibilityRole="link" accessibilityLabel={action} hitSlop={14} onPress={onAction} style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          <Text style={{ fontSize: 13, lineHeight: 17, fontWeight: '600', color: t.c.fg.secondary, fontVariant: ['tabular-nums'] }}>{action}</Text>
          <Icon name="chevron-right" size={14} color={t.c.fg.secondary} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** 11/600 UPPERCASE, +0.9. */
export function Label({ children, color, style }: { children: ReactNode; color?: string; style?: StyleProp<TextStyle> }) {
  const t = useTheme();
  return <Text numberOfLines={1} style={[{ fontSize: 11, lineHeight: 14, fontWeight: '600', letterSpacing: 0.9, textTransform: 'uppercase', color: color ?? t.c.fg.secondary }, style]}>{children}</Text>;
}

/** JetBrains Mono 10/700 UPPERCASE: link words and map labels. */
export function Mono({ children, color }: { children: ReactNode; color?: string }) {
  const t = useTheme();
  return <Text style={{ fontFamily: monoFonts[700], fontSize: 10, lineHeight: 12, letterSpacing: 0.5, textTransform: 'uppercase', color: color ?? t.c.fg.secondary }}>{children}</Text>;
}

export function Hairline() {
  const t = useTheme();
  return <View style={{ height: 1, backgroundColor: t.c.line }} />;
}

/** A card of rows with hairlines between. */
export function RowCard({ children }: { children: ReactNode }) {
  const t = useTheme();
  const rows = React.Children.toArray(children);
  return (
    <View style={{ padding: 14, gap: 8, borderRadius: 24, backgroundColor: t.c.bg.tile }}>
      {rows.map((r, i) => (
        <React.Fragment key={i}>
          {i ? <Hairline /> : null}
          {r}
        </React.Fragment>
      ))}
    </View>
  );
}

/** Edge to edge, sideways: the chip rows. */
export function SideScroll({ children, inset }: { children: ReactNode; inset?: number }) {
  const t = useTheme();
  const pad = inset ?? t.layout.gutter;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ marginHorizontal: -pad, flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: pad, gap: 8, alignItems: 'center' }}>
      {children}
    </ScrollView>
  );
}

/** A 40-tall chip: white when selected, with a kind's dot or an icon. */
export function KindPill({ label, color, icon, selected, dashed, onPress }: { label: string; color?: string; icon?: string; selected?: boolean; dashed?: boolean; onPress?: () => void }) {
  const t = useTheme();
  const ink = selected ? t.c.bg.ground : t.c.fg.primary;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: !!selected }} hitSlop={4} onPress={onPress} style={({ pressed }) => ({ height: 40, paddingLeft: color || icon ? 13 : 16, paddingRight: 16, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: dashed ? 'transparent' : selected ? t.c.fg.primary : t.c.bg.tileRaised, borderWidth: dashed ? 1 : 0, borderStyle: dashed ? 'dashed' : 'solid', borderColor: t.c.fg.tertiary, opacity: pressed ? 0.85 : 1 })}>
      {icon ? <Icon name={icon} size={14} color={selected ? ink : color ?? ink} /> : color ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: selected ? ink : color }} /> : null}
      <Text numberOfLines={1} style={{ fontSize: 14, lineHeight: 18, fontWeight: '600', color: ink }}>{label}</Text>
    </Pressable>
  );
}

/** A 30-tall chip with a kind's dot. */
export function DotChip({ label, color }: { label: string; color: string }) {
  const t = useTheme();
  return (
    <View style={{ height: 30, paddingLeft: 9, paddingRight: 12, borderRadius: 999, backgroundColor: t.c.bg.tileRaised, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
      <Text numberOfLines={1} style={{ fontSize: 13, lineHeight: 17, fontWeight: '600', color: t.c.fg.primary }}>{label}</Text>
    </View>
  );
}

/** The soft coral "to check" pill; a tap opens To check. */
export function ToCheckPill() {
  const t = useTheme();
  const router = useRouter();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="To check" hitSlop={10} onPress={() => router.push('/check' as never)} style={{ height: 28, paddingHorizontal: 11, borderRadius: 999, backgroundColor: t.c.alert.coralFill, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: '600', color: t.c.alert.coralText }}>to check</Text>
    </Pressable>
  );
}

export function LockLine({ children }: { children: string }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 4 }}>
      <Icon name="lock" size={14} color={t.c.fg.secondary} />
      <Text style={{ flex: 1, fontSize: 13, lineHeight: 17, color: t.c.fg.secondary }}>{children}</Text>
    </View>
  );
}

/** The search field: 48 tall, raised, a hairline; an X clears it. */
export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingLeft: 18, paddingRight: value ? 4 : 18, borderRadius: 16, backgroundColor: t.c.bg.tileRaised, borderWidth: 1, borderColor: t.c.line }}>
      <Icon name="search" size={18} color={t.c.fg.tertiary} />
      <TextInput accessibilityLabel={placeholder} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={t.c.fg.tertiary} autoCorrect={false} returnKeyType="search" style={{ flex: 1, minHeight: 46, fontSize: 16, fontFamily: fontForWeight(500), color: t.c.fg.primary }} />
      {value ? <RoundButton icon="x" label="Clear search" size={40} iconSize={16} color={t.c.fg.secondary} onPress={() => onChange('')} /> : null}
    </View>
  );
}

const DAY = 86_400_000;
/** "today" · "2 d" · "3 mo" · "2 y". */
export function shortAgo(at: number, now = Date.now()): string {
  const days = Math.round((new Date(now).setHours(0, 0, 0, 0) - new Date(at).setHours(0, 0, 0, 0)) / DAY);
  if (days <= 0) return 'today';
  if (days < 60) return `${days} d`;
  if (days < 365) return `${Math.round(days / 30)} mo`;
  return `${Math.round(days / 365)} y`;
}

/** A note in a card: its kind's icon on a disc, title, kind · day · the line under it, how long ago. */
export function NoteRow({ note, now }: { note: Note; now: number }) {
  const t = useTheme();
  const router = useRouter();
  const look = kindLook(note.data.kind);
  const sub = [kindLabel(note.data.kind), format(noteAt(note), 'EEE d MMM'), bodyLine(note, 60)].filter(Boolean).join(' · ');
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${note.title}, ${sub}`} onPress={() => router.push(`/entity/note/${note.id}` as never)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 56, opacity: pressed ? 0.7 : 1 })}>
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: t.c.bg.tileRaised, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={look.icon} size={18} color={look.color} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text numberOfLines={1} style={{ fontSize: 16, lineHeight: 21, fontWeight: '600', color: t.c.fg.primary }}>{note.title}</Text>
        <Text numberOfLines={1} style={{ fontSize: 13, lineHeight: 17, color: t.c.fg.secondary }}>{sub}</Text>
      </View>
      <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: '600', color: t.c.fg.secondary, fontVariant: ['tabular-nums'] }}>{shortAgo(noteAt(note), now)}</Text>
    </Pressable>
  );
}

const SAID: Record<Fact['source'], string> = { talk: 'you said', user: 'you said', notification: 'from a notification', note: 'from a note', correction: 'a correction', dump: 'from a dump', automation: 'from an automation', notion: 'from Notion' };

/** A fact in a card: who it's about, the line, about · where from · when. X forgets; a guess says to check. */
export function FactRow({ fact, about, record, photo, fromNote, guess, onPress, onForget }: { fact: Fact; about: string; record?: { id: string; object: string; title: string }; photo?: string | null; fromNote?: string | null; guess?: boolean; onPress: () => void; onForget: () => void }) {
  const t = useTheme();
  const text = fact.text.replace(/\[\[|\]\]/g, '');
  const sub = guess ? [about, 'guessed'] : fromNote ? [about, `from ${fromNote}`] : [about, SAID[fact.source], format(fact.statedAt, 'd MMM')];
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${text}, ${sub.join(', ')}`} accessibilityHint="Opens its options" onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 56, opacity: pressed ? 0.7 : guess ? 0.85 : 1 })}>
      {record ? (
        <RecordDisc id={record.id} object={record.object} title={record.title} photo={photo} size={40} />
      ) : about === 'About you' ? (
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: t.c.bg.tileRaised, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="user" size={18} color={JOURNAL_COLOR} />
        </View>
      ) : (
        <Face id={about} name={about} size={40} />
      )}
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text numberOfLines={2} style={{ fontSize: 16, lineHeight: 21, fontWeight: '600', color: t.c.fg.primary }}>{text}</Text>
        <Text numberOfLines={1} style={{ fontSize: 13, lineHeight: 17, color: t.c.fg.secondary }}>{sub.join(' · ')}</Text>
      </View>
      {guess ? <ToCheckPill /> : <RoundButton icon="x" label={`Forget this fact: ${text}`} size={40} iconSize={16} color={t.c.fg.secondary} onPress={onForget} />}
    </Pressable>
  );
}

/** Notes written by month: quiet rounded bars, this month lime with its number over it. */
export function MonthBars({ data }: { data: Array<{ label: string; value: number }> }) {
  const t = useTheme();
  const max = Math.max(1, ...data.map((m) => m.value));
  return (
    <View accessibilityRole="image" accessibilityLabel={`Notes written by month: ${data.map((m) => `${m.label} ${m.value}`).join(', ')}`} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-end' }}>
      {data.map((m, i) => {
        const now = i === data.length - 1;
        const h = m.value ? Math.max(now ? 12 : 8, (100 * m.value) / max) : 6;
        return (
          <View key={`${m.label}${i}`} style={{ flex: 1, gap: 8 }}>
            <View style={{ height: 122, justifyContent: 'flex-end', gap: 8 }}>
              {now ? <Text style={{ fontSize: 11, lineHeight: 14, fontWeight: '700', textAlign: 'center', color: t.c.fg.primary, fontVariant: ['tabular-nums'] }}>{m.value}</Text> : null}
              <View style={{ height: h, borderRadius: Math.min(10, h / 2), backgroundColor: now ? t.c.accent.mustard : t.dark ? '#FFFFFF1A' : t.c.bg.dim }} />
            </View>
            <Text style={{ fontSize: 11, lineHeight: 14, fontWeight: '600', textAlign: 'center', color: now ? t.c.fg.primary : t.c.fg.tertiary }}>{m.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

/** The 28-round metrics card: notes, this month, and whatever else goes under them. */
export function MetricsCard({ notes, month, quiet, children }: { notes: number; month: number; quiet?: boolean; children?: ReactNode }) {
  const t = useTheme();
  const number: TextStyle = { fontSize: 36, lineHeight: 40, fontWeight: '700', letterSpacing: -1.5, color: quiet ? t.c.fg.secondary : t.c.fg.primary, fontVariant: ['tabular-nums'] };
  return (
    <View style={{ padding: 18, gap: 14, borderRadius: 28, backgroundColor: t.c.bg.tile }}>
      <View style={{ flexDirection: 'row' }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Label>Notes</Label>
          <Text style={number}>{notes}</Text>
        </View>
        <View style={{ flex: 1, gap: 2, paddingLeft: 14, borderLeftWidth: 1, borderLeftColor: t.c.line }}>
          <Label>This month</Label>
          <Text style={number}>{month}</Text>
        </View>
      </View>
      {children}
    </View>
  );
}
