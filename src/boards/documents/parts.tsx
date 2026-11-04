import React from 'react';
import { format } from 'date-fns';
import { Pressable, View, type ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { daysUntil, inDays } from '@core/dashboard/overview';
import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import { Icon, Text } from '@ui/kit';
import { useTheme } from '@ui/theme/ThemeProvider';
import { blocks, gradients, type Theme } from '@ui/theme/tokens';
import { folders, type DocFile, type DocumentData } from '@modules/documents';
import { kindLabel } from './overview';

/**
 * Documents' parts (NR-Documents-*): each kind's colour and icon, the section
 * label and head, the pills, the 46 action pill, the paper heroes and the rows.
 * Sizes and colours are the artboards'.
 */

export type Doc = ObjectRecord<DocumentData>;

/** Contract / Lease on the artboards: the one kind colour with no token. */
const TEAL = '#6FD3C8';
const INK = '#F5F5F7';
const YELLOW_SOFT = 'rgba(246,226,127,0.16)';

const ICONS: Record<string, string> = { id: 'card', insurance: 'shield', contract: 'pen-line', receipt: 'receipt', ticket: 'plane', medical: 'heart', tax: 'bank', certificate: 'star', other: 'file' };
export const kindIcon = (kind: string | undefined) => ICONS[kind ?? 'other'] ?? 'file';

export function kindColor(kind: string | undefined, t: Theme): string {
  switch (kind) {
    case 'id': return blocks.sky;
    case 'insurance': return blocks.mint;
    case 'contract': return TEAL;
    case 'receipt': return blocks.yellow;
    case 'ticket': return t.tints.travel.ink;
    case 'medical': return blocks.pink;
    case 'tax': return blocks.lilac;
    case 'certificate': return blocks.orange;
    default: return t.c.fg.tertiary;
  }
}

export const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;
export const fileSize = (b: number) => (b >= 1_048_576 ? `${(b / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const dayOf = (iso: string) => new Date(`${iso}T12:00:00`);
/** "15 Nov" this year, "15 Nov 2027" any other. */
export const dayWords = (at: Date | number, now = Date.now()) => format(at, new Date(at).getFullYear() === new Date(now).getFullYear() ? 'd MMM' : 'd MMM yyyy');
export const isoWords = (iso: string, now = Date.now()) => dayWords(dayOf(iso), now);
export const longDay = (iso: string) => format(dayOf(iso), 'd MMM yyyy');

export const folderName = (os: LifeOSContext, f: DocFile) => folders(os).find((x) => x.uri === f.folder)?.name;
/** "Documents / Car": the folder you picked and the subfolder inside it. */
export const fileWhere = (os: LifeOSContext, f: DocFile) => [folderName(os, f), f.path].filter(Boolean).join(' / ');

/** The second line of a row: who issued it and what it is for, else where the file is; "file gone" when it is missing. */
export function docLine(os: LifeOSContext, d: Doc): string {
  if (d.status === 'missing') return `${d.data.issuer ?? kindLabel(d.data.kind)} · file gone`;
  const other = d.data.assetId ?? d.data.personId ?? d.data.tripId;
  const said = [d.data.issuer, other ? os.records.get(other)?.title : null].filter(Boolean).join(' · ');
  return said || (d.data.file ? fileWhere(os, d.data.file) : '') || kindLabel(d.data.kind);
}

/** Tones of a date pill: coral once it has passed, lime inside 30 days, quiet after that. */
export function dueTone(days: number, t: Theme) {
  if (days < 0) return { bg: t.c.alert.coralFill, fg: t.c.alert.coralText };
  if (days <= 30) return { bg: t.c.accent.mustardSoft, fg: t.c.accent.gold };
  return { bg: t.c.bg.tileRaised, fg: t.c.fg.secondary };
}

/** Section label: 11/600, +0.9, capitals. */
export function Caps({ children }: { children: string }) {
  return <Text accessibilityRole="header" color="secondary" style={{ fontSize: 11, lineHeight: 14, fontWeight: '600', letterSpacing: 0.9, paddingHorizontal: 4 }}>{children.toUpperCase()}</Text>;
}

/** A capital label over its content. */
export function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 10 }}>
      <Caps>{title}</Caps>
      {children}
    </View>
  );
}

/** Section head: 17/600, a 13 line, and a link or a count on the right. */
export function Head({ title, sub, action, onAction, meta }: { title: string; sub?: string; action?: string; onAction?: () => void; meta?: string }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingTop: 6, paddingHorizontal: 4 }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text accessibilityRole="header" style={{ fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: -0.2 }}>{title}</Text>
        {sub ? <Text color="secondary" style={{ fontSize: 13, lineHeight: 17 }}>{sub}</Text> : null}
      </View>
      {meta ? <Text color="secondary" style={{ fontSize: 13, lineHeight: 17, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{meta}</Text> : null}
      {action ? (
        <Pressable onPress={onAction} accessibilityRole="button" hitSlop={14} style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          <Text color="secondary" style={{ fontSize: 13, lineHeight: 17, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{action}</Text>
          <Icon name="chevron-right" size={14} color={t.c.fg.secondary} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** A row card: 24 corners on the tile colour. */
export function Card({ children, pad = 14, gap = 8, style }: { children: React.ReactNode; pad?: number; gap?: number; style?: ViewStyle }) {
  const t = useTheme();
  return <View style={[{ padding: pad, gap, borderRadius: 24, backgroundColor: t.c.bg.tile }, style]}>{children}</View>;
}

/** Hairlines between what's in a card. */
export function Lined({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return <>{React.Children.toArray(children).map((c, i) => <React.Fragment key={i}>{i ? <View style={{ height: 1, backgroundColor: t.c.line }} /> : null}{c}</React.Fragment>)}</>;
}

/** The 40 disc in a row. */
export function Disc({ icon, color, bg, size = 40 }: { icon: string; color: string; bg?: string; size?: number }) {
  const t = useTheme();
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg ?? t.c.bg.tileRaised, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <Icon name={icon} size={Math.round(size * 0.45)} color={color} />
    </View>
  );
}

/** A 28 pill: a status, a date, a kind with its dot. */
export function Tag({ label, bg, fg, dot, icon }: { label: string; bg?: string; fg?: string; dot?: string; icon?: string }) {
  const t = useTheme();
  const color = fg ?? t.c.fg.primary;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 28, paddingHorizontal: 11, borderRadius: 999, backgroundColor: bg ?? t.c.bg.tileRaised, flexShrink: 0 }}>
      {dot ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot }} /> : null}
      {icon ? <Icon name={icon} size={13} color={color} /> : null}
      <Text numberOfLines={1} style={{ fontSize: 12, lineHeight: 16, fontWeight: '600', color, fontVariant: ['tabular-nums'] }}>{label}</Text>
    </View>
  );
}

export function StatusTag({ status }: { status: string | null | undefined }) {
  const t = useTheme();
  if (status === 'new') return <Tag label="New" bg={YELLOW_SOFT} fg={t.tints.documents.ink} />;
  if (status === 'missing') return <Tag label="Missing" bg={t.c.alert.coralFill} fg={t.c.alert.coralText} />;
  if (status === 'filed') return <Tag label="Filed" icon="check" fg={t.c.fg.secondary} />;
  return null;
}

/** A row's date: "in 12 d", "expired", "Jan 2030", or a quiet "no expiry". On Home it says more: "expires in 58 d". */
export function ExpiryTag({ iso, long, now = Date.now() }: { iso?: string; long?: boolean; now?: number }) {
  const t = useTheme();
  if (!iso) return <Text color="secondary" style={{ fontSize: 12, lineHeight: 16, fontWeight: '600' }}>no expiry</Text>;
  const days = daysUntil(iso, now);
  const tone = dueTone(days, t);
  const label = long ? `${days < 0 ? 'expired' : 'expires'} ${inDays(days)}` : days < 0 ? 'expired' : days <= 90 ? inDays(days) : format(dayOf(iso), 'MMM yyyy');
  return <Tag label={label} bg={tone.bg} fg={tone.fg} />;
}

/** The 46 action pill (Open, Filed, Add folder, Rescan now, Mark done, Snooze): 15/600, the icon in its own colour. */
export function ActionPill({ title, icon, primary, onPress, disabled, busy, grow }: { title: string; icon?: string; primary?: boolean; onPress?: () => void; disabled?: boolean; busy?: boolean; grow?: boolean }) {
  const t = useTheme();
  const fg = primary ? t.c.accent.mustardInk : disabled ? t.c.fg.secondary : t.c.fg.primary;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={busy ? `${title}, reading` : title} accessibilityState={{ disabled: !!disabled, busy: !!busy }} disabled={disabled} onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 46, paddingHorizontal: 20, borderRadius: 999, backgroundColor: primary ? t.c.accent.mustard : t.c.bg.tileRaised, opacity: pressed ? 0.8 : 1, ...(grow ? { flex: 1 } : null) })}>
      {icon ? <Icon name={icon} size={17} color={primary || disabled ? fg : t.c.accent.gold} /> : null}
      <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: '600', color: fg }}>{title}</Text>
    </Pressable>
  );
}

/** A 40 choice pill (the list's filters, the form's kinds); 44 to the thumb. */
export function ChoicePill({ label, selected, dot, icon, iconColor, onPress }: { label: string; selected?: boolean; dot?: string; icon?: string; iconColor?: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: !!selected }} onPress={onPress} hitSlop={2} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: 16, borderRadius: 999, flexShrink: 0, backgroundColor: selected ? t.c.fg.primary : t.c.bg.tileRaised, opacity: pressed ? 0.8 : 1 })}>
      {dot ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: selected ? t.c.bg.ground : dot }} /> : null}
      {icon ? <Icon name={icon} size={14} color={selected ? t.c.bg.ground : iconColor ?? t.c.fg.primary} /> : null}
      <Text style={{ fontSize: 14, lineHeight: 18, fontWeight: '600', color: selected ? t.c.bg.ground : t.c.fg.primary }}>{label}</Text>
    </Pressable>
  );
}

/** A dashed "add" pill. */
export function AddPill({ label, onPress }: { label: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={2} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1, borderStyle: 'dashed', borderColor: t.c.fg.tertiary, alignSelf: 'flex-start', opacity: pressed ? 0.7 : 1 })}>
      <Icon name="plus" size={14} color={t.c.fg.primary} />
      <Text style={{ fontSize: 14, lineHeight: 18, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

/** The grey 160° Documents gradient, under the paper heroes. */
function Gradient({ id }: { id: string }) {
  const [from, to] = gradients.documents;
  return (
    <Svg style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} width="100%" height="100%" preserveAspectRatio="none">
      <Defs>
        <LinearGradient id={id} x1="0.33" y1="0" x2="0.67" y2="1">
          <Stop offset="0" stopColor={from} />
          <Stop offset="1" stopColor={to} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}

const WIDTHS = ['90%', '70%', '80%', '50%'] as const;
const SHADOW: ViewStyle = { shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 6 };

/** A sheet of paper, tilted. */
function Paper({ left, top, tilt, color = INK, line = 'rgba(0,0,0,0.12)' }: { left: number; top: number; tilt: number; color?: string; line?: string }) {
  return (
    <View style={{ position: 'absolute', left, top, width: 74, height: 90, borderRadius: 8, backgroundColor: color, transform: [{ rotate: `${tilt}deg` }], paddingVertical: 12, paddingHorizontal: 10, gap: 6, ...SHADOW }}>
      {WIDTHS.map((w) => <View key={w} style={{ height: 4, borderRadius: 2, backgroundColor: line, width: w }} />)}
    </View>
  );
}

/** Your folders on Home: three papers on the grey, the count of new, a glass foot. */
export function FoldersHero({ line, fresh, onPress }: { line: string; fresh: number; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Your folders: ${line}${fresh ? `, ${fresh} new` : ''}`} onPress={onPress} style={({ pressed }) => ({ height: 176, borderRadius: 28, overflow: 'hidden', opacity: pressed ? 0.9 : 1 })}>
      <Gradient id="documents-hero" />
      <Paper left={24} top={22} tilt={-10} />
      <Paper left={62} top={14} tilt={-2} />
      <Paper left={100} top={20} tilt={7} color={blocks.yellow} line="rgba(0,0,0,0.16)" />
      {fresh ? (
        <View style={{ position: 'absolute', right: 18, top: 18, height: 28, paddingHorizontal: 11, borderRadius: 999, backgroundColor: blocks.lime, justifyContent: 'center' }}>
          <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: '700', color: '#0B0B0D', fontVariant: ['tabular-nums'] }}>{fresh} new</Text>
        </View>
      ) : null}
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 99, backgroundColor: 'rgba(255,255,255,0.2)', borderTopWidth: 1.5, borderTopColor: 'rgba(255,255,255,0.55)', paddingHorizontal: 16, paddingBottom: 14, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text color={INK} style={{ fontSize: 20, lineHeight: 24, fontWeight: '700', letterSpacing: -0.3 }}>Your folders</Text>
          <Text color="rgba(255,255,255,0.9)" numberOfLines={1} style={{ fontSize: 12, lineHeight: 16, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{line}</Text>
        </View>
        <Icon name="chevron-right" size={18} color="rgba(255,255,255,0.9)" />
      </View>
    </Pressable>
  );
}

/** One sheet on a Document's page: the kind's dot at its head, and what the file is. */
export function PaperHero({ dot, label }: { dot: string; label?: string | null }) {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ height: 168, borderRadius: 28, overflow: 'hidden' }}>
      <Gradient id="documents-paper" />
      <View style={{ position: 'absolute', left: '50%', top: 26, marginLeft: -64, width: 128, height: 160, borderRadius: 10, backgroundColor: INK, transform: [{ rotate: '-4deg' }], paddingVertical: 16, paddingHorizontal: 14, gap: 8, ...SHADOW }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: dot }} />
          <View style={{ height: 5, borderRadius: 3, backgroundColor: 'rgba(0,0,0,0.22)', width: '60%' }} />
        </View>
        {WIDTHS.map((w) => <View key={w} style={{ height: 4, borderRadius: 2, backgroundColor: 'rgba(0,0,0,0.12)', width: w }} />)}
      </View>
      {label ? (
        <View style={{ position: 'absolute', left: 16, top: 16, height: 28, paddingHorizontal: 11, borderRadius: 999, backgroundColor: 'rgba(11,11,13,0.55)', justifyContent: 'center' }}>
          <Text color={INK} style={{ fontSize: 12, lineHeight: 16, fontWeight: '600' }}>{label}</Text>
        </View>
      ) : null}
    </View>
  );
}

/** A note with a yellow icon: what stays on the phone. */
export function NoteCard({ icon, children }: { icon: string; children: string }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 20, backgroundColor: t.c.bg.tile, borderWidth: 1, borderColor: t.c.line }}>
      <View style={{ marginTop: 1 }}><Icon name={icon} size={18} color={t.tints.documents.ink} /></View>
      <Text color="secondary" style={{ flex: 1, fontSize: 13, lineHeight: 18 }}>{children}</Text>
    </View>
  );
}

/** An empty card: a 56 disc and one line. */
export function EmptyCard({ icon, title, line, children }: { icon: string; title?: string; line?: string; children?: React.ReactNode }) {
  const t = useTheme();
  return (
    <Card pad={0} gap={14} style={{ paddingVertical: 28, paddingHorizontal: 20, alignItems: 'center' }}>
      <Disc icon={icon} color={t.tints.documents.ink} size={56} />
      {title ? <Text variant="rowTitle" style={{ textAlign: 'center' }}>{title}</Text> : null}
      {line ? <Text style={{ fontSize: 15, lineHeight: 21, fontWeight: '500', textAlign: 'center', maxWidth: 280 }}>{line}</Text> : null}
      {children ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10 }}>{children}</View> : null}
    </Card>
  );
}

/** A row of the list: the kind's icon (a coral folder when the file is gone), title, line, and its state on the right. */
export function DocRow({ ctx, d, now }: { ctx: LifeOSContext; d: Doc; now: number }) {
  const t = useTheme();
  const router = useRouter();
  const missing = d.status === 'missing';
  return (
    <Pressable accessibilityRole="button" onPress={() => router.push(`/entity/document/${d.id}` as never)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 52, opacity: pressed ? 0.75 : 1 })}>
      {missing ? <Disc icon="folder" color={t.c.alert.coralText} /> : <Disc icon={kindIcon(d.data.kind)} color={kindColor(d.data.kind, t)} />}
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text variant="rowTitle" numberOfLines={1}>{d.title}</Text>
        <Text variant="caption" color="secondary" numberOfLines={1}>{docLine(ctx, d)}</Text>
      </View>
      {missing || d.status === 'new' ? <StatusTag status={d.status} /> : <ExpiryTag iso={d.data.expiresOn} now={now} />}
    </Pressable>
  );
}

/** Renew soon's row: the title, then its date and who issued it, and a chevron. */
export function RenewRow({ ctx, d, now }: { ctx: LifeOSContext; d: Doc; now: number }) {
  const t = useTheme();
  const router = useRouter();
  return (
    <Pressable accessibilityRole="button" onPress={() => router.push(`/entity/document/${d.id}` as never)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 56, opacity: pressed ? 0.75 : 1 })}>
      <Disc icon={kindIcon(d.data.kind)} color={kindColor(d.data.kind, t)} />
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <Text variant="rowTitle" numberOfLines={1}>{d.title}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <ExpiryTag iso={d.data.expiresOn} long now={now} />
          <Text variant="caption" color="secondary" numberOfLines={1} style={{ flexShrink: 1 }}>{docLine(ctx, d)}</Text>
        </View>
      </View>
      <Icon name="chevron-right" size={18} color={t.c.fg.tertiary} />
    </Pressable>
  );
}

/** A row that is new: tap to look, Filed to say you have, hold to open the file (Your folders). */
export function FreshRow({ d, sub, onFiled, onHold }: { d: Doc; sub: string; onFiled: () => void; onHold?: () => void }) {
  const t = useTheme();
  const router = useRouter();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 56 }}>
      <Disc icon={kindIcon(d.data.kind)} color={kindColor(d.data.kind, t)} />
      <Pressable accessibilityRole="button" accessibilityHint={onHold ? 'Hold to open the file' : undefined} onPress={() => router.push(`/entity/document/${d.id}` as never)} onLongPress={onHold} style={({ pressed }) => ({ flex: 1, minWidth: 0, gap: 2, opacity: pressed ? 0.75 : 1 })}>
        <Text variant="rowTitle" numberOfLines={1}>{d.title}</Text>
        <Text variant="caption" color="secondary" numberOfLines={1}>{sub}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`Filed: ${d.title}`} onPress={onFiled} hitSlop={2} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: 14, borderRadius: 999, backgroundColor: t.c.bg.tileRaised, opacity: pressed ? 0.8 : 1 })}>
        <Icon name="check" size={15} color={t.c.accent.gold} />
        <Text style={{ fontSize: 14, lineHeight: 18, fontWeight: '600' }}>Filed</Text>
      </Pressable>
    </View>
  );
}
