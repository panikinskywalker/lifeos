import React from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import { useLive } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Icon, Text } from '@ui/kit';
import { otpOf, type DeliveryData } from '@modules/deliveries';
import { DeliveryActions, OtpBlock, StatusSteps, whereLine } from './parts';

/**
 * The Delivery page's top (a first pass until NR-Deliveries-Delivery): the
 * OTP large while it is on its way, where it is and the four steps, Track
 * and Delivered, then the shop and the order's payment, each opening its
 * record (Links, not imports).
 */
export function DeliveryHero({ entity, ctx }: { entity: ObjectRecord<any>; ctx: LifeOSContext }) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const t = useTheme();
  const router = useRouter();
  const e = entity as ObjectRecord<DeliveryData>;
  const otp = otpOf(e);
  const linked = useLive((os) => {
    const get = (id?: string) => (id ? os.records.get(id) : null);
    const pay = get(e.data.paymentId);
    const amount = pay ? (pay.data as { amount?: number; currency?: string }).amount : undefined;
    return { shop: get(e.data.shopId), pay, amount: amount != null ? os.format.currency(amount, (pay!.data as { currency?: string }).currency) : null };
  }, [e.data.shopId, e.data.paymentId]);
  const rows = [
    linked.shop ? { key: 'shop', icon: 'bag', label: 'Shop', value: linked.shop.title, id: linked.shop.id, object: 'org' } : null,
    linked.pay ? { key: 'pay', icon: 'creditcard', label: 'Paid', value: [linked.amount, linked.pay.title, linked.pay.occurredAt ? ctx.format.dateTime(linked.pay.occurredAt) : null].filter(Boolean).join(' · '), id: linked.pay.id, object: 'transaction' } : null,
  ].filter(Boolean) as Array<{ key: string; icon: string; label: string; value: string; id: string; object: string }>;
  return (
    <View style={{ gap: 12 }}>
      {otp ? <OtpBlock otp={otp} at={e.data.otpAt} /> : null}
      <View style={{ backgroundColor: t.c.bg.tile, borderRadius: 24, padding: 16, gap: 14 }}>
        <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: '600', color: t.c.fg.primary }}>{whereLine(e).replace(/^./, (c) => c.toUpperCase())}</Text>
        <StatusSteps status={e.data.status} />
        <DeliveryActions ctx={ctx} entity={e} size="md" />
      </View>
      {rows.length ? (
        <View style={{ backgroundColor: t.c.bg.tile, borderRadius: 24, paddingHorizontal: 16, paddingVertical: 6 }}>
          {rows.map((r) => (
            <Pressable key={r.key} accessibilityRole="button" accessibilityLabel={`${r.label}: ${r.value}`} onPress={() => router.push(`/entity/${r.object}/${r.id}` as never)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, opacity: pressed ? 0.7 : 1 })}>
              <Icon name={r.icon} size={18} color={t.c.fg.secondary} />
              <Text style={{ width: 44, fontSize: 13, lineHeight: 17, color: t.c.fg.secondary }}>{r.label}</Text>
              <Text numberOfLines={1} style={{ flex: 1, fontSize: 15, lineHeight: 20, fontWeight: '600', color: t.c.fg.primary }}>{r.value}</Text>
              <Icon name="chevron-right" size={16} color={t.c.fg.tertiary} />
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}
