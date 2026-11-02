import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import type { LifeOSContext } from '@core/registry/context';
import { useLive } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Button, Card, EmptyState, Screen, Section, Text } from '@ui/kit';
import { arrivesToday, onTheWay, STAGE, type DeliveryData } from '@modules/deliveries';
import { ToCheckBell } from '../../screens/ToCheckBell';
import { DeliveryCard, DeliveryRow } from './parts';

/**
 * Deliveries (the board's home; a first pass from the kit until the
 * NR-Deliveries-Home artboard, laid out as docs/design/DELIVERIES-BRIEF.md
 * screen 1): Arriving today as cards with the OTP large, then the rest on
 * the way by day, then delivered in the last two weeks.
 */
export function DeliveriesHome({ ctx }: { ctx: LifeOSContext; params: Record<string, string> }) {
  const router = useRouter();
  const t = useTheme();
  const d = useLive((os) => {
    const now = Date.now();
    const all = os.records.query<DeliveryData>('delivery', { sort: [{ field: 'updatedAt', dir: 'desc' }] }, { limit: 500 });
    const today = all.filter((e) => arrivesToday(e, now)).sort((a, b) => STAGE[b.data.status] - STAGE[a.data.status] || (b.data.otp ? 1 : 0) - (a.data.otp ? 1 : 0));
    const ids = new Set(today.map((e) => e.id));
    const coming = all.filter((e) => onTheWay(e, now) && !ids.has(e.id)).sort((a, b) => (a.data.expectedDate ?? '9999').localeCompare(b.data.expectedDate ?? '9999'));
    const since = now - 14 * 86_400_000;
    const done = all.filter((e) => !onTheWay(e, now) && !ids.has(e.id) && e.updatedAt >= since).slice(0, 12);
    return { all, today, coming, done, now };
  }, []);

  const header = {
    title: 'Deliveries',
    subtitle: d.today.length || d.coming.length ? [d.today.length ? `${d.today.length} today` : null, d.coming.length ? `${d.coming.length} on the way` : null].filter(Boolean).join(' · ') : 'Nothing on the way',
    right: <ToCheckBell />,
    onBack: () => (router.canGoBack() ? router.back() : router.replace('/browse' as never)),
  };

  if (!d.all.length) {
    return (
      <Screen {...header}>
        <EmptyState icon="box" title="No deliveries yet" line="Orders come in on their own: shop and courier texts, Amazon, Flipkart, Myntra, Instamart, Zepto and Blinkit notifications, and shipping mail." action="Data sources" actionIcon="settings" onAction={() => router.push('/settings/sources' as never)} />
      </Screen>
    );
  }

  return (
    <Screen {...header} contentStyle={{ gap: 14 }}>
      {d.today.length ? (
        <Section title="Arriving today">
          <View style={{ gap: 12 }}>
            {d.today.map((e) => <DeliveryCard key={e.id} ctx={ctx} entity={e} now={d.now} />)}
          </View>
        </Section>
      ) : (
        <Text style={{ fontSize: 15, lineHeight: 20, color: t.c.fg.secondary }}>Nothing arriving today.</Text>
      )}
      {d.coming.length ? (
        <Section title="On the way">
          <Card>
            {d.coming.map((e) => <DeliveryRow key={e.id} entity={e} />)}
          </Card>
        </Section>
      ) : null}
      {d.done.length ? (
        <Section title="Delivered lately" meta="Last 2 weeks">
          <Card>
            {d.done.map((e) => <DeliveryRow key={e.id} entity={e} />)}
          </Card>
        </Section>
      ) : null}
      <Button title="Every delivery" variant="secondary" size="sm" onPress={() => router.push('/entity/delivery' as never)} />
    </Screen>
  );
}
