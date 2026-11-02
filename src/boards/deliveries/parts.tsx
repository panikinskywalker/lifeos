import React from 'react';
import { Linking, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { format, formatDistanceToNowStrict } from 'date-fns';
import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import { useTheme } from '@ui/theme/ThemeProvider';
import { blocks } from '@ui/theme/tokens';
import { Button, Icon, Text, useToast } from '@ui/kit';
import { isQuick, markDelivered, onTheWay, otpOf, STAGE, STATUS_WORD, STEPS, undoDelivered, type DeliveryData } from '@modules/deliveries';

/**
 * Deliveries' parts, a first pass from the kit (NR-KitComponents,
 * NR-KitRecords) until the NR-Deliveries-Parts artboard: the OTP block, the
 * status steps, the delivery card and its one line of where it is.
 */

const INK = '#0B0B0D';
const SHORT: Record<string, string> = { ordered: 'Ordered', shipped: 'Shipped', out_for_delivery: 'Out', delivered: 'Delivered' };

/** "today", "tomorrow", "yesterday", else "Wed 4 Nov". */
export function dayWord(iso: string, now = Date.now()): string {
  const day = new Date(`${iso}T12:00:00`);
  const diff = Math.round((day.getTime() - new Date(new Date(now).toDateString()).getTime() - 12 * 3_600_000) / 86_400_000);
  return diff === 0 ? 'today' : diff === 1 ? 'tomorrow' : diff === -1 ? 'yesterday' : format(day, 'EEE d MMM');
}

/** "out for delivery · Amazon · Delhivery", "arrives Wed 4 Nov · Flipkart", "delivered today · Blinkit". */
export function whereLine(e: Pick<ObjectRecord<DeliveryData>, 'data' | 'updatedAt'>, now = Date.now()): string {
  const d = e.data;
  const when =
    STAGE[d.status] < 3 && !onTheWay(e, now)
      ? 'probably came'
      : d.status === 'delivered'
      ? d.deliveredOn ? `delivered ${dayWord(d.deliveredOn, now)}` : 'delivered'
      : d.status === 'out_for_delivery'
        ? isQuick(d) ? 'on its way' : 'out for delivery'
        : d.expectedDate && d.status !== 'cancelled' && d.status !== 'returned'
          ? `${d.status === 'ordered' ? 'ordered, ' : ''}arrives ${dayWord(d.expectedDate, now)}`
          : STATUS_WORD[d.status].toLowerCase();
  return [when, d.shop, d.carrier].filter(Boolean).join(' · ');
}

/** The code for the agent, large: lime block, digits spaced, read out one by one. */
export function OtpBlock({ otp, at, compact }: { otp: string; at?: number; compact?: boolean }) {
  return (
    <View style={{ backgroundColor: blocks.lime, borderRadius: compact ? 16 : 24, paddingVertical: compact ? 10 : 16, paddingHorizontal: 16, gap: 2 }} accessible accessibilityLabel={`Delivery OTP ${otp.split('').join(' ')}`}>
      <Text style={{ fontSize: 11, lineHeight: 14, fontWeight: '700', letterSpacing: 0.9, color: INK, opacity: 0.7 }}>
        {`DELIVERY OTP${at ? ` · ${formatDistanceToNowStrict(at, { addSuffix: true }).toUpperCase()}` : ''}`}
      </Text>
      <Text style={{ fontSize: compact ? 32 : 48, lineHeight: compact ? 38 : 56, fontWeight: '700', letterSpacing: compact ? 6 : 10, color: INK, fontVariant: ['tabular-nums'] }}>{otp}</Text>
      {compact ? null : <Text style={{ fontSize: 13, lineHeight: 17, color: INK, opacity: 0.75 }}>Give it to the agent only once you have the package.</Text>}
    </View>
  );
}

/** Ordered → Shipped → Out → Delivered, the reached steps lit; a cancelled or returned one says so instead. */
export function StatusSteps({ status }: { status: DeliveryData['status'] }) {
  const t = useTheme();
  if (STAGE[status] > 3) {
    return <Text style={{ fontSize: 13, lineHeight: 17, fontWeight: '600', color: t.c.alert.coralText }}>{STATUS_WORD[status]}</Text>;
  }
  const at = STAGE[status];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }} accessibilityLabel={`Status: ${STATUS_WORD[status]}`}>
      {STEPS.map((s, i) => (
        <View key={s} style={{ flex: 1, gap: 6 }}>
          <View style={{ height: 4, borderRadius: 2, backgroundColor: i <= at ? t.c.accent.mustard : t.c.line }} />
          <Text numberOfLines={1} style={{ fontSize: 11, lineHeight: 14, fontWeight: i === at ? '700' : '500', color: i <= at ? t.c.fg.primary : t.c.fg.tertiary }}>{SHORT[s]}</Text>
        </View>
      ))}
    </View>
  );
}

/** Track (the shop's or courier's page) and Delivered by hand, with Undo. */
export function DeliveryActions({ ctx, entity, size = 'sm' }: { ctx: LifeOSContext; entity: ObjectRecord<DeliveryData>; size?: 'sm' | 'md' }) {
  const toast = useToast();
  const d = entity.data;
  const open = STAGE[d.status] < 3;
  if (!open && !d.trackingUrl) return null;
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {d.trackingUrl ? <Button title="Track" icon="link" size={size} variant={open ? 'secondary' : 'primary'} style={{ flex: 1 }} onPress={() => void Linking.openURL(d.trackingUrl!).catch(() => {})} /> : null}
      {open ? (
        <Button
          title="Delivered"
          icon="check"
          size={size}
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

/** One delivery as a card: what, where it is, the steps, the OTP when it has one; tap opens it. */
export function DeliveryCard({ ctx, entity, now = Date.now() }: { ctx: LifeOSContext; entity: ObjectRecord<DeliveryData>; now?: number }) {
  const t = useTheme();
  const router = useRouter();
  const otp = otpOf(entity, now);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${entity.title}, ${whereLine(entity, now)}`} onPress={() => router.push(`/entity/delivery/${entity.id}` as never)} style={({ pressed }) => ({ backgroundColor: t.c.bg.tile, borderRadius: 24, padding: 16, gap: 12, opacity: pressed ? 0.9 : 1 })}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: t.c.bg.tileRaised, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={isQuick(entity.data) ? 'bolt' : 'box'} size={20} color={t.c.fg.primary} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text numberOfLines={1} style={{ fontSize: 17, lineHeight: 22, fontWeight: '600', color: t.c.fg.primary }}>{entity.title}</Text>
          <Text numberOfLines={1} style={{ fontSize: 13, lineHeight: 17, color: t.c.fg.secondary }}>{whereLine(entity, now)}</Text>
        </View>
      </View>
      <StatusSteps status={entity.data.status} />
      {otp ? <OtpBlock otp={otp} at={entity.data.otpAt} compact /> : null}
      <DeliveryActions ctx={ctx} entity={entity} />
    </Pressable>
  );
}

/** A small row for the lists below the cards. */
export function DeliveryRow({ entity }: { entity: ObjectRecord<DeliveryData> }) {
  const t = useTheme();
  const router = useRouter();
  return (
    <Pressable accessibilityRole="button" onPress={() => router.push(`/entity/delivery/${entity.id}` as never)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, opacity: pressed ? 0.7 : 1 })}>
      <Icon name={isQuick(entity.data) ? 'bolt' : 'box'} size={18} color={t.c.fg.secondary} />
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ fontSize: 15, lineHeight: 20, fontWeight: '600', color: t.c.fg.primary }}>{entity.title}</Text>
        <Text numberOfLines={1} style={{ fontSize: 12, lineHeight: 16, color: t.c.fg.secondary }}>{whereLine(entity)}</Text>
      </View>
      <Icon name="chevron-right" size={16} color={t.c.fg.tertiary} />
    </Pressable>
  );
}
