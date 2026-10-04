import React from 'react';
import { Linking, View } from 'react-native';
import { formatDistanceToNowStrict } from 'date-fns';
import type { Entity } from '@core/domain/types';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Button, Text } from '@ui/kit';
import { DELIVERY_STATUSES, type DeliveryData } from '@modules/deliveries/types';

/** A delivery on its way: the code for the agent (big), and the tracking page one tap away. */
export function DeliveryHero({ entity }: { entity: Entity<any> }) {
  const t = useTheme();
  const d = (entity as Entity<DeliveryData>).data;
  const active = d.status === 'ordered' || d.status === 'shipped' || d.status === 'out_for_delivery';
  const otp = active && d.otp && (!d.otpAt || Date.now() - d.otpAt < 3 * 86_400_000) ? d.otp : null;
  if (!otp && !d.trackingUrl) return null;
  return (
    <View style={{ backgroundColor: t.c.bg.container, borderRadius: 24, padding: 16, gap: 12 }}>
      {otp ? (
        <View style={{ gap: 4 }}>
          <Text variant="labelMicro" color="secondary" style={{ textTransform: 'uppercase' }}>
            Delivery OTP{d.otpAt ? ` · ${formatDistanceToNowStrict(d.otpAt, { addSuffix: true })}` : ''}
          </Text>
          <Text variant="title" style={{ fontSize: 34, letterSpacing: 6, fontVariant: ['tabular-nums'] }} accessibilityLabel={`OTP ${otp.split('').join(' ')}`}>
            {otp}
          </Text>
          <Text variant="caption" color="secondary">Give this to the delivery agent only when you have the package.</Text>
        </View>
      ) : (
        <Text variant="caption" color="secondary">{DELIVERY_STATUSES.find((s) => s.value === d.status)?.label}</Text>
      )}
      {d.trackingUrl ? <Button title="Track package" icon="link" variant={otp ? 'secondary' : 'primary'} onPress={() => void Linking.openURL(d.trackingUrl!).catch(() => {})} /> : null}
    </View>
  );
}
