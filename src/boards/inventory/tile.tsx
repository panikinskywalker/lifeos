import React from 'react';
import type { TileDef } from '@core/registry/types';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useLive } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Text } from '@ui/kit';
import { gradients } from '@ui/theme/tokens';
import { goingOffCandidates, runningOutCandidates, stockState, type StockData } from '@modules/inventory';
import { StockPill } from './parts';

/**
 * Home on Today (NR-Home-Today; empty from NR-Home-States): the small 2 × 2 and
 * the wide 4 × 2. How many to use soon (the wide one shows the three most
 * urgent as pills), and the count running low. Opens Home. With nothing to use
 * soon but things past their life, it says those instead of "All fresh".
 */
export function HomeTodayTile({ wide }: { wide?: boolean } = {}) {
  const t = useTheme();
  const router = useRouter();
  const d = useLive((os) => {
    if (!os.registry.objects.has('stock')) return null;
    const off = goingOffCandidates(os).map((n) => ({ n, s: os.records.get<StockData>(n.stockId)! }));
    const soon = off.filter(({ s }) => stockState(s.data).state === 'use soon');
    const low = runningOutCandidates(os);
    return { soon: soon.length, gone: off.length - soon.length, low: low.length, top: soon.slice(0, 3), count: os.records.query<StockData>('stock', {}, { limit: 5000 }).filter((s) => s.data.quantity > 0).length };
  }, []);
  if (!d) return null;
  const headline = d.soon ? `${d.soon} to use soon` : d.gone ? `${d.gone} probably gone` : d.count ? 'All fresh' : 'Nothing yet';
  const lowLine = d.low ? `${d.low} running low` : d.count ? 'Nothing running low' : 'Share a Blinkit invoice';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Home, ${headline}, ${lowLine}`}
      onPress={() => router.push('/module/inventory/index' as never)}
      style={({ pressed }) => [{ padding: 16, borderRadius: 24, backgroundColor: t.c.bg.tile, justifyContent: 'space-between', gap: 10, opacity: pressed ? 0.9 : 1 }, wide ? { minHeight: 167 } : { flex: 1, aspectRatio: 1 }]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 11, lineHeight: 14, fontWeight: '600', letterSpacing: 0.9, color: t.c.fg.secondary }}>HOME</Text>
        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: gradients.upkeep[0] }} />
      </View>
      <Text numberOfLines={wide ? 1 : 3} adjustsFontSizeToFit minimumFontScale={0.7} style={{ fontSize: 30, lineHeight: 32, fontWeight: '700', letterSpacing: -0.5, color: t.c.fg.primary }}>{headline}</Text>
      {wide && d.top.length ? (
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', maxHeight: 32, overflow: 'hidden' }}>
          {d.top.map(({ n, s }) => (
            <StockPill key={n.stockId} title={s.title} state={stockState(s.data).state} quantity={s.data.quantity} guess={n.estimated} size="sm" />
          ))}
        </View>
      ) : null}
      <Text numberOfLines={1} style={{ fontSize: 12, lineHeight: 15, fontWeight: '600', color: d.low ? t.c.fg.primary : t.c.fg.secondary }}>{lowLine}</Text>
    </Pressable>
  );
}

export const inventoryTiles: TileDef[] = [{ type: 'home', board: 'inventory', name: 'Home', description: 'What to use soon and what’s running low', icon: 'home', sizes: ['small', 'medium'], defaultSize: 'small', component: ({ size }) => <HomeTodayTile wide={size !== 'small'} /> }];
