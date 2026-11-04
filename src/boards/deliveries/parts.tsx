import React from 'react';
import { Linking, Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { format, formatDistanceToNowStrict } from 'date-fns';
import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import { daysUntil } from '@core/dashboard/overview';
import { sourceState } from '@core/sources/deviceData';
import { useLive } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { blocks } from '@ui/theme/tokens';
import { Icon, IconButton, Text, useToast } from '@ui/kit';
import { arrivesToday, isQuick, markDelivered, onTheWay, STAGE, STATUS_WORD, undoDelivered, type DeliveryData } from '@modules/deliveries';

/** The pieces the NR-Deliveries-* artboards share: shop discs, pills, rows, the OTP, Track and Delivered, the words for where a parcel is. */

export type Delivery = ObjectRecord<DeliveryData>;

/** Ink on a colour block (the lime Today block, shop discs). */
export const INK = '#0B0B0D';

export const deliveryRoute = (id: string) => `/entity/delivery/${id}` as never;
export const dayLabel = (iso: string) => format(new Date(`${iso}T12:00:00`), 'EEE d MMM');
/** A time today, else the day. */
export const stamp = (at: number, now = Date.now()) => format(at, new Date(at).toDateString() === new Date(now).toDateString() ? 'h:mm aaa' : 'EEE d MMM');

/** Whole days past its expected day; 0 when it is not late (one out for delivery today never is). */
export function lateDays(e: Delivery, now = Date.now()): number {
  if (!e.data.expectedDate || !onTheWay(e, now) || arrivesToday(e, now)) return 0;
  return Math.max(0, -daysUntil(e.data.expectedDate, now));
}

/** Out for delivery first, then by expected day, the undated last. */
export const soonest = (a: Delivery, b: Delivery) => Number(b.data.status === 'out_for_delivery') - Number(a.data.status === 'out_for_delivery') || (a.data.expectedDate ?? '9999').localeCompare(b.data.expectedDate ?? '9999');

/** "out for delivery · Amazon", "arrives in 2 d · Meesho", "arrives 2 d ago · Myntra". */
export function whereLine(e: Delivery, now = Date.now()): string {
  const d = e.data;
  const left = d.expectedDate ? daysUntil(d.expectedDate, now) : null;
  const when =
    d.status === 'out_for_delivery' && !lateDays(e, now)
      ? isQuick(d) ? 'on its way' : 'out for delivery'
      : left === null ? STATUS_WORD[d.status].toLowerCase()
      : left < 0 ? `arrives ${-left} d ago`
      : left === 0 ? 'arrives today'
      : left === 1 ? 'arrives tomorrow'
      : `arrives in ${left} d`;
  return [when, d.shop ?? d.carrier].filter(Boolean).join(' · ');
}

/** When it reached each status, from the messages on its Timeline (the first message of each). */
export function stepTimes(os: LifeOSContext, id: string): Partial<Record<DeliveryData['status'], number>> {
  const out: Partial<Record<DeliveryData['status'], number>> = {};
  const words = Object.entries(STATUS_WORD) as Array<[DeliveryData['status'], string]>;
  for (const e of os.records.timeline.forEntity(id, 100)) {
    for (const [status, word] of words) if (e.title === word || e.title.startsWith(`${word} ·`)) out[status] = e.occurredAt;
  }
  return out;
}

/** Which sources are on. Mail's accounts live in settings (its reader is app-shell code a board does not import). */
export function sourcesOn(os: LifeOSContext) {
  return { sms: sourceState(os, 'sms').enabled, notifications: sourceState(os, 'notifications').enabled, mail: os.settings.get<unknown[]>('email.accounts', []).length > 0 };
}

/** The filings that want a word from you: "Assumed delivered" and the like. */
export const flaggedFilings = (os: LifeOSContext) => os.filings.ofKind('delivery', { open: true, limit: 200 }).filter((f) => f.flag);

const SHOP_COLOR: Record<string, string> = { Amazon: blocks.yellow, Flipkart: blocks.sky, Myntra: blocks.lilac, Meesho: blocks.pink, Nykaa: blocks.orange, Lenskart: blocks.mint };
const OTHER_SHOPS = [blocks.sky, blocks.pink, blocks.yellow, blocks.lilac, blocks.orange, blocks.mint];

/** A shop's colour: the same on its disc, in From and on the form. */
export function shopColor(shop: string): string {
  return SHOP_COLOR[shop] ?? OTHER_SHOPS[[...shop].reduce((n, c) => n + c.charCodeAt(0), 0) % OTHER_SHOPS.length]!;
}

/** The shop's first letter on its colour; with no shop, the box on a dark disc; grey when the order closed without arriving. */
export function ShopDisc({ shop, size = 40, muted }: { shop?: string | null; size?: number; muted?: boolean }) {
  const t = useTheme();
  const font = size >= 40 ? { fontSize: 14, lineHeight: 18 } : size >= 28 ? { fontSize: 11, lineHeight: 14 } : { fontSize: 10, lineHeight: 13 };
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: shop && !muted ? shopColor(shop) : t.c.bg.tileRaised, alignItems: 'center', justifyContent: 'center' }}>
      {shop ? <Text style={{ ...font, fontWeight: '700', color: muted ? t.c.fg.secondary : INK }}>{shop[0]!.toUpperCase()}</Text> : <Icon name="box" size={size * 0.45} color={blocks.sky} />}
    </View>
  );
}

export type PillTone = 'lime' | 'coral' | 'quiet' | 'white';

/** Status pill: 28 tall, 12/600. */
export function Pill({ label, tone = 'quiet' }: { label: string; tone?: PillTone }) {
  const t = useTheme();
  const look = { lime: [t.c.accent.mustardSoft, t.c.accent.mustard], coral: [t.c.alert.coralFill, t.c.alert.coralText], quiet: [t.c.bg.dim, t.c.fg.secondary], white: [t.c.fg.primary, t.c.bg.ground] }[tone];
  return (
    <View style={{ height: 28, paddingHorizontal: 11, borderRadius: 999, backgroundColor: look[0], alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <Text numberOfLines={1} style={{ fontSize: 12, lineHeight: 16, fontWeight: '600', color: look[1], fontVariant: ['tabular-nums'] }}>{label}</Text>
    </View>
  );
}

export function Hair({ color }: { color?: string }) {
  const t = useTheme();
  return <View style={{ height: 1, backgroundColor: color ?? t.c.line }} />;
}

/** Children with a hairline between them. */
export function Divided({ children }: { children: React.ReactNode }) {
  return (
    <>
      {React.Children.toArray(children).map((c, i) => (
        <React.Fragment key={i}>
          {i ? <Hair /> : null}
          {c}
        </React.Fragment>
      ))}
    </>
  );
}

/** A card of rows: 24 radius, charcoal. */
export function RowCard({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return <View style={[{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 24, backgroundColor: t.c.bg.tile }, style]}><Divided>{children}</Divided></View>;
}

/** The small caps over a group. */
export function GroupLabel({ text, color, dot, count }: { text: string; color?: string; dot?: boolean; count?: number }) {
  const t = useTheme();
  const c = color ?? t.c.fg.tertiary;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 }}>
      {dot ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c }} /> : null}
      <Text numberOfLines={1} style={{ flex: 1, fontSize: 11, lineHeight: 14, fontWeight: '600', letterSpacing: 0.9, color: c }}>{text}</Text>
      {count != null ? <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: '600', color: t.c.fg.secondary }}>{count}</Text> : null}
    </View>
  );
}

/** One delivery: its shop's disc, what it is, one line, something on the right. Tap opens it. */
export function DeliveryRow({ entity, sub, subColor, right, minHeight = 56, muted }: { entity: Delivery; sub: string; subColor?: string; right?: React.ReactNode; minHeight?: number; muted?: boolean }) {
  const t = useTheme();
  const router = useRouter();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${entity.title}, ${sub}`} onPress={() => router.push(deliveryRoute(entity.id))} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight, opacity: pressed ? 0.7 : 1 })}>
      <ShopDisc shop={entity.data.shop} muted={muted} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text numberOfLines={1} style={{ fontSize: 16, lineHeight: 21, fontWeight: '600', color: muted ? t.c.fg.secondary : t.c.fg.primary }}>{entity.title}</Text>
        <Text numberOfLines={1} style={{ fontSize: 13, lineHeight: 17, color: subColor ?? t.c.fg.secondary, fontVariant: ['tabular-nums'] }}>{sub}</Text>
      </View>
      {right}
    </Pressable>
  );
}

/** The code for the agent, large: "DELIVERY OTP · 2 HOURS AGO" over the digits. On its own raised slab unless `bare`. */
export function OtpBlock({ otp, at, bare, note }: { otp: string; at?: number; bare?: boolean; note?: string }) {
  const t = useTheme();
  return (
    <View accessible accessibilityLabel={`Delivery OTP ${otp.split('').join(' ')}`} style={bare ? { gap: 4 } : { paddingVertical: 14, paddingHorizontal: 16, borderRadius: 18, backgroundColor: t.c.bg.tileRaised, gap: 4 }}>
      <Text numberOfLines={1} style={{ fontSize: 11, lineHeight: 14, fontWeight: '600', letterSpacing: 0.9, color: t.c.fg.secondary }}>
        {`DELIVERY OTP${at ? ` · ${formatDistanceToNowStrict(at, { addSuffix: true }).toUpperCase()}` : ''}`}
      </Text>
      <Text style={{ fontSize: 34, lineHeight: 40, fontWeight: '700', letterSpacing: 6, color: t.c.fg.primary, fontVariant: ['tabular-nums'] }}>{otp}</Text>
      {note ? <Text style={{ fontSize: 13, lineHeight: 17, color: t.c.fg.secondary }}>{note}</Text> : null}
    </View>
  );
}

/** A raised pill with a lime icon. */
export function PillAction({ title, icon, onPress, height = 44, style }: { title: string; icon: string; onPress: () => void; height?: number; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={({ pressed }) => [{ flexDirection: 'row', height, borderRadius: 999, backgroundColor: t.c.bg.tileRaised, alignItems: 'center', justifyContent: 'center', gap: 8, opacity: pressed ? 0.75 : 1 }, style]}>
      <Icon name={icon} size={17} color={t.c.accent.mustard} />
      <Text numberOfLines={1} style={{ fontSize: 15, lineHeight: 19, fontWeight: '600', color: t.c.fg.primary }}>{title}</Text>
    </Pressable>
  );
}

/** Track package (the shop's or courier's page) and Delivered by hand, with Undo. */
export function DeliveryActions({ ctx, entity, height }: { ctx: LifeOSContext; entity: Delivery; height?: number }) {
  const toast = useToast();
  const d = entity.data;
  const open = STAGE[d.status] < 3;
  if (!open && !d.trackingUrl) return null;
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {d.trackingUrl ? <PillAction title="Track package" icon="link" height={height} style={{ flex: 1 }} onPress={() => void Linking.openURL(d.trackingUrl!).catch(() => {})} /> : null}
      {open ? (
        <PillAction
          title="Delivered"
          icon="check"
          height={height}
          style={{ flex: 1 }}
          onPress={() => {
            const u = markDelivered(ctx, entity.id);
            if (u) toast.show({ message: `${entity.title} delivered`, icon: 'check', undo: () => undoDelivered(ctx, u) });
          }}
        />
      ) : null}
    </View>
  );
}

/** The footnote: a small icon and a line. */
export function Footnote({ icon = 'lock', text }: { icon?: string; text: string }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingHorizontal: 4 }}>
      <Icon name={icon} size={16} color={t.c.fg.secondary} />
      <Text style={{ flex: 1, fontSize: 13, lineHeight: 18, color: t.c.fg.secondary }}>{text}</Text>
    </View>
  );
}

/** The header's round Add. */
export function AddButton() {
  const t = useTheme();
  const router = useRouter();
  return <IconButton icon="plus" accessibilityLabel="Add delivery" filled={t.c.accent.mustard} color={t.c.accent.mustardInk} onPress={() => router.push('/entity/delivery/new' as never)} />;
}

/** The home's bell: what filing wants a word on, and it opens Filing. */
export function FilingBell() {
  const t = useTheme();
  const router = useRouter();
  const n = useLive((os) => flaggedFilings(os).length, []);
  return (
    <View>
      <IconButton icon="bell" accessibilityLabel={n ? `To check, ${n} waiting` : 'Filing'} filled onPress={() => router.push('/module/deliveries/filing' as never)} />
      {n ? (
        <View pointerEvents="none" style={{ position: 'absolute', top: -2, right: -2, minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: 9, backgroundColor: t.c.accent.mustard, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 11, lineHeight: 18, fontWeight: '700', color: t.c.accent.mustardInk, fontVariant: ['tabular-nums'] }}>{n}</Text>
        </View>
      ) : null}
    </View>
  );
}
