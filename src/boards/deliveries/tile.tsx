import React from 'react';
import { Pressable, View, type TextStyle } from 'react-native';
import { useRouter } from 'expo-router';
import type { TileDef } from '@core/registry/types';
import { daysUntil } from '@core/dashboard/overview';
import { useLive } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { gradients } from '@ui/theme/tokens';
import { Icon, Text } from '@ui/kit';
import { arrivesToday, onTheWay, otpOf, type DeliveryData } from '@modules/deliveries';
import { Pill, soonest } from './parts';

/**
 * Deliveries on Today (NR-Deliveries-Tile): small (2 × 2) or wide (4 × 2).
 * How many are on the way, and the nearest with its code. Both open the
 * Deliveries home. The blue dot is the Deliveries colour from Browse.
 */

function DeliveriesTile({ wide }: { wide: boolean }) {
  const t = useTheme();
  const router = useRouter();
  const d = useLive((os) => {
    if (!os.registry.objects.has('delivery')) return null;
    const now = Date.now();
    const onWay = os.records.query<DeliveryData>('delivery', {}, { limit: 2000 }).filter((e) => onTheWay(e, now)).sort(soonest);
    const today = onWay.filter((e) => arrivesToday(e, now));
    const top = today.find((e) => otpOf(e, now)) ?? today[0] ?? onWay[0] ?? null;
    if (!top) return { count: 0, today: 0, title: null, otp: null, when: null, out: false };
    const left = top.data.expectedDate ? daysUntil(top.data.expectedDate, now) : null;
    return {
      count: onWay.length,
      today: today.length,
      title: top.title,
      otp: otpOf(top, now),
      out: top.data.status === 'out_for_delivery',
      when: today.includes(top) ? 'today' : left === null ? null : left < 0 ? `${-left} d late` : left === 1 ? 'tomorrow' : `in ${left} d`,
    };
  }, []);
  if (!d) return null;

  const code = d.otp ? `OTP ${d.otp}` : null;
  const wideLine = d.title ? [d.out ? `${d.title} out for delivery` : [d.title, d.when].filter(Boolean).join(' · '), code].filter(Boolean).join(' · ') : null;
  const label = `Deliveries, ${d.count ? `${d.count} on the way` : 'nothing on the way'}${wideLine ? `, ${wideLine}` : ''}`;
  const head = (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Text style={{ fontSize: 11, lineHeight: 14, fontWeight: '600', letterSpacing: 0.9, color: t.c.fg.secondary }}>DELIVERIES</Text>
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: gradients.upkeep[0] }} />
    </View>
  );
  const big: TextStyle = { fontSize: 30, lineHeight: 32, fontWeight: '700', letterSpacing: -0.5, color: t.c.fg.primary, fontVariant: ['tabular-nums'] };
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => router.push('/module/deliveries/index' as never)} style={({ pressed }) => [{ padding: 16, borderRadius: 24, backgroundColor: t.c.bg.tile, justifyContent: 'space-between', opacity: pressed ? 0.9 : 1 }, wide ? { minHeight: 167 } : { flex: 1, aspectRatio: 1 }]}>
      {head}
      {wide ? (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ ...big, flexShrink: 1 }}>{d.count ? `${d.count} on the way` : 'Nothing on the way'}</Text>
            {d.today ? <Pill label={`${d.today} today`} tone="lime" /> : null}
          </View>
          {wideLine ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Icon name={d.out ? 'car' : 'box'} size={16} color={t.c.accent.mustard} />
              <Text numberOfLines={1} style={{ flex: 1, fontSize: 13, lineHeight: 17, fontWeight: '600', color: t.c.fg.primary }}>{wideLine}</Text>
            </View>
          ) : <View />}
        </>
      ) : (
        <>
          {d.count ? (
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
              <Text style={big}>{d.count}</Text>
              <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 15, lineHeight: 19, fontWeight: '600', color: t.c.fg.primary }}>on the way</Text>
            </View>
          ) : (
            <Text numberOfLines={2} style={{ fontSize: 22, lineHeight: 25, fontWeight: '700', letterSpacing: -0.5, color: t.c.fg.primary }}>Nothing on the way</Text>
          )}
          <View style={{ gap: 2 }}>
            {code ? <Text numberOfLines={1} style={{ fontSize: 12, lineHeight: 15, fontWeight: '700', letterSpacing: 0.5, color: t.c.accent.mustard, fontVariant: ['tabular-nums'] }}>{code}</Text> : null}
            {d.title ? <Text numberOfLines={1} style={{ fontSize: 12, lineHeight: 15, fontWeight: '500', color: t.c.fg.secondary }}>{[d.title, d.when].filter(Boolean).join(' · ')}</Text> : null}
          </View>
        </>
      )}
    </Pressable>
  );
}

export const deliveriesTiles: TileDef[] = [{ type: 'deliveries', board: 'deliveries', name: 'Deliveries', description: 'What is on the way, and the code for the agent', icon: 'box', sizes: ['small', 'medium'], defaultSize: 'small', component: ({ size }) => <DeliveriesTile wide={size !== 'small'} /> }];
