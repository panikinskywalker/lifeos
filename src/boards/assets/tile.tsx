import React from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { format } from 'date-fns';
import type { TileDef } from '@core/registry/types';
import { useLive } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { gradients } from '@ui/theme/tokens';
import { Icon, Text } from '@ui/kit';
import { assetsOf, dueForService, services, underWarranty } from '@modules/assets';
import { Caps, kmText } from './parts';

/**
 * Assets on Today (NR-Assets-Today): the small 2 × 2 and the wide 4 × 2. The
 * next service and the next warranty to end; the wide one adds a service
 * coming by km. Both open Assets home.
 */
function AssetsTile({ wide }: { wide?: boolean }) {
  const t = useTheme();
  const router = useRouter();
  const d = useLive((os) => {
    if (!os.registry.objects.has('asset')) return null;
    const now = Date.now();
    const list = services(os, now);
    return { count: assetsOf(os).length, service: list.find((s) => s.daysLeft != null), km: dueForService(os, now).find((s) => s.kmLeft != null) ?? list.find((s) => s.kmLeft != null), warranty: underWarranty(os, now)[0] };
  }, []);
  if (!d) return null;
  const big = (title: string, days: number) => `${title} · ${days < 0 ? `${-days} d late` : `${days} d`}`;
  const service = d.service ? big(d.service.title, d.service.daysLeft!) : null;
  const a11y = ['Assets', service ? `Next service ${service}` : `${d.count} things`, d.warranty ? `${d.warranty.title} warranty ${d.warranty.daysLeft} days` : null].filter(Boolean).join(', ');
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={a11y} onPress={() => router.push('/module/assets/index' as never)} style={({ pressed }) => [{ padding: 16, borderRadius: 24, backgroundColor: t.c.bg.tile, justifyContent: 'space-between', gap: 10, opacity: pressed ? 0.9 : 1 }, wide ? { minHeight: 167 } : { flex: 1, aspectRatio: 1 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Caps>ASSETS</Caps>
        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: gradients.upkeep[0] }} />
      </View>
      {wide ? (
        <>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Column label="Next service" value={service ?? 'None due'} sub={d.service?.nextDueAt ? format(d.service.nextDueAt, 'EEE d MMM') : null} />
            <Column label="Warranty ends" value={d.warranty ? big(d.warranty.title, d.warranty.daysLeft) : 'None running'} sub={d.warranty ? format(new Date(`${d.warranty.until}T12:00:00`), 'EEE d MMM') : null} />
          </View>
          {d.km ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Icon name="gauge" size={14} color={t.tints.upkeep.ink} />
              <Text numberOfLines={1} color="secondary" style={{ flex: 1, fontSize: 13, lineHeight: 17, fontWeight: '600' }}>{d.km.kmLeft! > 0 ? `${d.km.title} · ${kmText(d.km.kmLeft!)} km to service` : `${d.km.title} · ${kmText(d.km.kmLeft!)} km over`}</Text>
            </View>
          ) : <View />}
        </>
      ) : (
        <>
          <View>
            <Text color="secondary" style={{ fontSize: 12, lineHeight: 15, fontWeight: '600' }}>{service ? 'Next service' : 'You own'}</Text>
            <Text numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.6} style={{ fontSize: 26, lineHeight: 30, fontWeight: '700', letterSpacing: -0.5 }}>{service ?? (d.count ? `${d.count} ${d.count === 1 ? 'thing' : 'things'}` : 'Nothing yet')}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Icon name="shield" size={13} color={t.tints.upkeep.ink} />
            <Text numberOfLines={1} color="secondary" style={{ flex: 1, fontSize: 12, lineHeight: 15, fontWeight: '600' }}>{d.warranty ? `${d.warranty.title} warranty · ${d.warranty.daysLeft} d` : d.count ? 'No warranty running' : 'Add the car, the laptop'}</Text>
          </View>
        </>
      )}
    </Pressable>
  );
}

function Column({ label, value, sub }: { label: string; value: string; sub?: string | null }) {
  return (
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text color="secondary" style={{ fontSize: 12, lineHeight: 15, fontWeight: '600' }}>{label}</Text>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={{ fontSize: 24, lineHeight: 28, fontWeight: '700', letterSpacing: -0.5 }}>{value}</Text>
      {sub ? <Text numberOfLines={1} color="secondary" style={{ fontSize: 12, lineHeight: 15 }}>{sub}</Text> : null}
    </View>
  );
}

export const assetsTiles: TileDef[] = [{ type: 'assets', board: 'assets', name: 'Assets', description: 'The next service and the next warranty to end', icon: 'box', sizes: ['small', 'medium'], defaultSize: 'small', component: ({ size }) => <AssetsTile wide={size !== 'small'} /> }];
