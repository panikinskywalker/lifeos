import React from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useLive } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Text } from '@ui/kit';
import { gradients } from '@ui/theme/tokens';
import { goingOffCandidates, runningOutCandidates, stockState, type StockData } from '@modules/inventory';
import { StockPill } from './parts';

/**
 * Home on Today (HOME-BRIEF screen 7; a first pass until NR-Home-Today): the
 * small 2 × 2 and the wide 4 × 2. What to use soon (the wide one shows the
 * three most urgent as pills), and the count running low. Opens Home.
 */
export function HomeTodayTile({ wide }: { wide?: boolean } = {}) {
  const t = useTheme();
  const router = useRouter();
  const d = useLive((os) => {
    if (!os.registry.objects.has('stock')) return null;
    const soon = goingOffCandidates(os);
    const low = runningOutCandidates(os);
    const top = soon.slice(0, wide ? 3 : 1).map((n) => ({ n, s: os.records.get<StockData>(n.stockId)! }));
    return { soon: soon.length, low: low.length, top, count: os.records.query<StockData>('stock', {}, { limit: 5000 }).filter((s) => s.data.quantity > 0).length };
  }, [wide]);
  if (!d) return null;
  const headline = d.soon ? `${d.soon} to use soon` : d.count ? 'All fresh' : 'Nothing yet';
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
      <Text numberOfLines={wide ? 1 : 2} adjustsFontSizeToFit minimumFontScale={0.7} style={{ fontSize: 30, lineHeight: 32, fontWeight: '700', letterSpacing: -0.5, color: t.c.fg.primary }}>{headline}</Text>
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
