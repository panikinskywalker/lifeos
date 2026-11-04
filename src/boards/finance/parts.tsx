import React from 'react';
import { Linking, Pressable, ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { format, isToday, isYesterday } from 'date-fns';
import type { ObjectRecord } from '@core/domain/types';
import type { RecordControls } from '@core/registry/types';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import type { Theme } from '@ui/theme/tokens';
import { blocks } from '@ui/theme/tokens';
import { Icon, IconButton, Text } from '@ui/kit';
import { TagChips } from '@ui/components/fields';
import { categoryOf, type AccountData, type TransactionData } from '@modules/finance/types';
import type { SplitRecord } from '@modules/finance/split';

/**
 * Money's parts (NR-Money-*): the coloured disc, section heads, the split bar,
 * the transaction row, the top bar of a record page. Sizes and colours are the
 * artboards'; every Money screen draws from here.
 */

/** The artboards' category colours; a custom category uses its own palette colour. */
const CATEGORY_COLORS: Record<string, string> = {
  housing: '#D9B48F',
  food: '#FF9F5A',
  groceries: blocks.mint,
  transport: blocks.sky,
  subscriptions: '#B8F0D8',
  shopping: blocks.pink,
  utilities: '#6FD3C8',
  entertainment: blocks.lilac,
  health: '#FF8A7A',
  travel: '#FF8A6A',
  education: '#9FB8F7',
  gifts: blocks.yellow,
  investment: blocks.lime,
  salary: blocks.lime,
  freelance: '#6FD3C8',
};

export const catColor = (value: string | undefined, t: Theme) => CATEGORY_COLORS[value ?? 'other'] ?? t.paletteColor(categoryOf(value)?.color) ?? t.c.fg.tertiary;

const DISC_COLORS = [blocks.yellow, blocks.mint, blocks.lilac, blocks.sky, blocks.pink, '#FF9F5A', '#FF8A6A', '#6FD3C8'];

/** A merchant's or person's colour: fixed per name or id. */
export function discColor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return DISC_COLORS[h % DISC_COLORS.length]!;
}

/** A disc with the first letter (40 in a row, 56 on a record, 32 or 28 in a chip). */
export function Disc({ name, colorKey, size = 40 }: { name: string; colorKey?: string; size?: number }) {
  const letter = name.trim().match(/\p{L}|\p{N}/u)?.[0]?.toUpperCase() ?? '?';
  const fontSize = size >= 56 ? 22 : size >= 40 ? 15 : size >= 32 ? 12 : 11;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: discColor(colorKey ?? name), alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <Text style={{ fontSize, lineHeight: fontSize + 4, fontWeight: '700', color: '#0B0B0D' }}>{letter}</Text>
    </View>
  );
}

/** A raised 40 disc with an icon. */
export function IconDisc({ icon, color, size = 40 }: { icon: string; color?: string; size?: number }) {
  const t = useTheme();
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: t.c.bg.tileRaised, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <Icon name={icon} size={18} color={color ?? t.tints.finance.ink} />
    </View>
  );
}

export function Hairline() {
  const t = useTheme();
  return <View style={{ height: 1, backgroundColor: t.c.line }} />;
}

export function Caps({ children, color, style }: { children: React.ReactNode; color?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <Text variant="labelCaps" color={color ?? 'secondary'} numberOfLines={1} style={style as never}>
      {children}
    </Text>
  );
}

/** Section head: 17/600 title, a 13/400 line under it, an optional link on the right. */
export function SectionHead({ title, sub, action, chevron, lime, onAction }: { title: string; sub?: string | null; action?: string; chevron?: boolean; lime?: boolean; onAction?: () => void }) {
  const t = useTheme();
  const tone = lime ? t.c.accent.gold : t.c.fg.secondary;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 6, paddingHorizontal: 4 }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="heading" accessibilityRole="header">{title}</Text>
        {sub ? <Text variant="caption" color="secondary" numberOfLines={1}>{sub}</Text> : null}
      </View>
      {action ? (
        <Pressable accessibilityRole="button" accessibilityLabel={action} hitSlop={14} onPress={onAction} style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          <Text style={{ fontSize: 13, lineHeight: 17, fontWeight: '600', color: tone }}>{action}</Text>
          {chevron ? <Icon name="chevron-right" size={14} color={tone} /> : null}
        </Pressable>
      ) : null}
    </View>
  );
}

/** A card of rows with hairlines between them. */
export function Rows({ children, padding = 14, gap = 0, style }: { children: React.ReactNode; padding?: number; gap?: number; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const kids = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={[{ paddingVertical: padding === 14 && gap === 0 ? 6 : padding, paddingHorizontal: padding, borderRadius: 24, backgroundColor: t.c.bg.tile, gap }, style]}>
      {kids.map((k, i) => (
        <React.Fragment key={i}>
          {i ? <Hairline /> : null}
          {k}
        </React.Fragment>
      ))}
    </View>
  );
}

/** The split bar: 10 tall, 3 apart, each part growing with its share. */
export function SplitBar({ parts }: { parts: Array<{ key: string; share: number; color: string }> }) {
  return (
    <View accessibilityRole="image" accessibilityLabel="Spend split by category" style={{ flexDirection: 'row', gap: 3 }}>
      {parts.map((p) => (
        <View key={p.key} style={{ flexGrow: Math.max(p.share, 0.001), flexBasis: 0, minWidth: 5, height: 10, borderRadius: 5, backgroundColor: p.color }} />
      ))}
    </View>
  );
}

/** A 28-tall status pill. */
export function StatusPill({ label, dot, lime, coral }: { label: string; dot?: string; lime?: boolean; coral?: boolean }) {
  const t = useTheme();
  const bg = lime ? t.c.accent.mustardSoft : coral ? t.c.alert.coralFill : t.c.bg.tileRaised;
  const fg = lime ? t.c.accent.gold : coral ? t.c.alert.coralText : t.c.fg.primary;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 28, paddingHorizontal: 11, borderRadius: 999, backgroundColor: bg }}>
      {dot ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot }} /> : null}
      <Text numberOfLines={1} style={{ fontSize: 12, lineHeight: 16, fontWeight: '600', color: fg, fontVariant: ['tabular-nums'] }}>{label}</Text>
    </View>
  );
}

/** A 44-tall action pill, lime or raised, sharing its row. */
export function ActionPill({ title, icon, lime, onPress }: { title: string; icon?: string; lime?: boolean; onPress: () => void }) {
  const t = useTheme();
  const fg = lime ? t.c.accent.mustardInk : t.c.fg.primary;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={({ pressed }) => ({ flex: 1, minWidth: 0, height: 44, paddingHorizontal: 16, borderRadius: 999, backgroundColor: lime ? t.c.accent.mustard : t.c.bg.tileRaised, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: pressed ? 0.8 : 1 })}>
      {icon ? <Icon name={icon} size={18} color={fg} /> : null}
      <Text numberOfLines={1} style={{ fontSize: 15, lineHeight: 20, fontWeight: '700', color: fg, flexShrink: 1 }}>{title}</Text>
    </Pressable>
  );
}

/** A 40-tall raised pill that hugs its text (Remove split, Add a link, Clear filters). */
export function SmallPill({ title, icon, iconColor, onPress }: { title: string; icon?: string; iconColor?: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} hitSlop={4} onPress={onPress} style={({ pressed }) => ({ alignSelf: 'flex-start', height: 40, paddingHorizontal: 16, borderRadius: 999, backgroundColor: t.c.bg.tileRaised, flexDirection: 'row', alignItems: 'center', gap: 8, opacity: pressed ? 0.8 : 1 })}>
      {icon ? <Icon name={icon} size={16} color={iconColor ?? t.c.fg.primary} /> : null}
      <Text variant="label">{title}</Text>
    </Pressable>
  );
}

/** Pill-in-a-track segments (Kind on the form, Divide on the split sheet). */
export function Seg<V extends string>({ value, options, onChange, track, fontSize = 14 }: { value: V; options: Array<{ value: V; label: string }>; onChange: (v: V) => void; track?: string; fontSize?: number }) {
  const t = useTheme();
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', gap: 4, padding: 4, borderRadius: 999, backgroundColor: track ?? t.c.bg.tileRaised }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} accessibilityRole="tab" accessibilityLabel={o.label} accessibilityState={{ selected: on }} onPress={() => onChange(o.value)} style={{ flex: 1, height: 40, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? t.c.fg.primary : 'transparent' }}>
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={{ fontSize, lineHeight: 18, fontWeight: '700', color: on ? t.c.bg.ground : t.c.fg.primary }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A small sparkline with a dot on the latest value. */
export function Spark({ values, width = 72, height = 28, color }: { values: number[]; width?: number; height?: number; color: string }) {
  const min = Math.min(...values);
  const span = Math.max(...values) - min || 1;
  const pts = values.map((v, i) => [(i / Math.max(values.length - 1, 1)) * (width - 3), height - 4 - ((v - min) / span) * (height - 8)] as const);
  const last = pts[pts.length - 1]!;
  return (
    <Svg width={width} height={height} style={{ flexShrink: 0 }}>
      <Path d={pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ')} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={last[0]} cy={last[1]} r={3} fill={color} />
    </Svg>
  );
}

/** A date string as a local day. */
export const day = (iso: string) => new Date(`${iso}T12:00:00`);

/** "today", "yesterday", "Wed" this week, else "21 Oct". */
export function relDay(iso: string): string {
  const d = day(iso);
  if (isToday(d)) return 'today';
  if (isYesterday(d)) return 'yesterday';
  return Date.now() - d.getTime() < 6 * 86_400_000 ? format(d, 'EEE') : format(d, 'd MMM');
}

export const splitOf = (d: TransactionData) => (d as TransactionData & { split?: SplitRecord }).split;

/** What a payment is, in a row's second line. */
export const kindWord = (d: TransactionData) => (d.kind === 'income' ? 'Received' : d.kind === 'transfer' ? 'Transfer' : categoryOf(d.category).label);

/** "−₹486", "+₹810", "₹5,000" for a transfer. */
export function signedAmount(d: TransactionData, money: (n: number, c?: string) => string): string {
  const sign = d.kind === 'income' ? '+' : d.kind === 'transfer' ? '' : '−';
  return `${sign}${money(d.amount, d.currency)}`;
}

/** A payment's row: disc, payee, one line, amount. Opens the Transaction page. */
export function TxRow({ tx, line, minHeight = 60 }: { tx: ObjectRecord<TransactionData>; line: string; minHeight?: number }) {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const money = os.format.currency;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${tx.title}, ${signedAmount(tx.data, money)}, ${line}`} onPress={() => router.push(`/entity/transaction/${tx.id}` as never)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight, opacity: pressed ? 0.7 : 1 })}>
      <Disc name={tx.title} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text variant="rowTitle" numberOfLines={1}>{tx.title}</Text>
        <Text variant="caption" color="secondary" numberOfLines={1}>{line}</Text>
      </View>
      <Text style={{ fontSize: 16, lineHeight: 21, fontWeight: '700', fontVariant: ['tabular-nums'], color: tx.data.kind === 'income' ? t.c.accent.gold : t.c.fg.primary }}>{signedAmount(tx.data, money)}</Text>
    </Pressable>
  );
}

const ACCOUNT_ICONS: Record<AccountData['kind'], string> = { bank: 'bank', credit: 'card', investment: 'trend', cash: 'cash', wallet: 'wallet', loan: 'receipt' };
export const accountIcon = (kind: AccountData['kind']) => ACCOUNT_ICONS[kind] ?? 'card';

/** "HDFC savings ··4821". */
export const accountName = (a: ObjectRecord<AccountData>) => [a.title, a.data.last4 ? `··${a.data.last4}` : null].filter(Boolean).join(' ');

/** A record page's top bar: back, what it is in the middle, more and the white Edit pill. */
export function RecordBar({ label, controls }: { label: string; controls: RecordControls }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: insets.top + 12 }}>
      <IconButton icon="chevron-left" accessibilityLabel="Back" filled onPress={controls.back} />
      <Text numberOfLines={1} style={{ flex: 1, textAlign: 'center', fontSize: 14, lineHeight: 18, fontWeight: '600', color: t.c.fg.secondary }}>{label}</Text>
      <IconButton icon="more" accessibilityLabel="More" filled onPress={controls.more} />
      <Pressable accessibilityRole="button" accessibilityLabel="Edit" hitSlop={4} onPress={controls.edit} style={({ pressed }) => ({ height: 40, paddingHorizontal: 16, borderRadius: 999, backgroundColor: t.c.fg.primary, justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}>
        <Text style={{ fontSize: 13, lineHeight: 18, fontWeight: '700', color: t.c.bg.ground }}>Edit</Text>
      </Pressable>
    </View>
  );
}

/** A Field row: 14 label on the left, the value after it. */
export function FieldRow({ label, children, top }: { label: string; children: React.ReactNode; top?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: top ? 'flex-start' : 'center', gap: 12, minHeight: 52, paddingVertical: top ? 15 : 6 }}>
      <Text numberOfLines={2} color="secondary" style={{ fontSize: 14, lineHeight: 18, width: 128, flexShrink: 0 }}>{label}</Text>
      <View style={{ flex: 1, minWidth: 0, alignItems: 'flex-start' }}>{children}</View>
    </View>
  );
}

export function FieldValue({ children, color }: { children: React.ReactNode; color?: string }) {
  return <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: '600', color }}>{children}</Text>;
}

/** What the generic record page keeps and a Money page must too: receipts and files, tags, reminders. Shown only when there are some. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function RecordExtras({ entity, module }: { entity: ObjectRecord<any>; module: string }) {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const files = useLive((o) => o.attachments.forEntity(entity.id).filter((a) => a.kind !== 'cover'), [entity.id]);
  const tags = useLive((o) => o.tags.forEntity(entity.id).map((x) => x.name), [entity.id]);
  const reminders = useLive((o) => o.reminders.forEntity(entity.id).filter((r) => !r.doneAt), [entity.id]);
  const open = (uri: string) => void Linking.openURL(uri).catch(() => {});
  const isImage = (a: (typeof files)[number]) => a.kind === 'image' || a.kind === 'receipt' || !!a.mime?.startsWith('image/');
  return (
    <>
      {files.length ? (
        <View style={{ gap: 10 }}>
          <SectionHead title="Attachments" sub={String(files.length)} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {files.map((a) => (
              <Pressable key={a.id} accessibilityRole="button" accessibilityLabel={a.name} onPress={() => open(a.uri)} onLongPress={() => os.attachments.remove(a.id)}>
                {isImage(a) ? (
                  <Image source={{ uri: a.uri }} style={{ width: 104, height: 104, borderRadius: 24, backgroundColor: t.c.bg.tile }} contentFit="cover" />
                ) : (
                  <View style={{ width: 104, height: 104, padding: 12, borderRadius: 24, backgroundColor: t.c.bg.tile, justifyContent: 'space-between' }}>
                    <Icon name="file" size={18} color={t.c.fg.secondary} />
                    <Text variant="caption" numberOfLines={2}>{a.name}</Text>
                  </View>
                )}
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}
      {tags.length ? (
        <View style={{ gap: 10 }}>
          <SectionHead title="Tags" />
          <TagChips tags={tags} module={module} onPress={(name) => router.push(`/tag/${encodeURIComponent(name)}` as never)} />
        </View>
      ) : null}
      {reminders.length ? (
        <View style={{ gap: 10 }}>
          <SectionHead title="Reminders" />
          <Rows>
            {reminders.map((r) => {
              const at = r.snoozedUntil ?? r.nextAt ?? r.dueAt;
              return (
                <View key={r.id} style={{ minHeight: 52, justifyContent: 'center', gap: 2 }}>
                  <Text variant="rowTitle" numberOfLines={1}>{r.title}</Text>
                  {at ? <Text variant="caption" color="secondary">{os.format.dateTime(at)}</Text> : null}
                </View>
              );
            })}
          </Rows>
        </View>
      ) : null}
    </>
  );
}
