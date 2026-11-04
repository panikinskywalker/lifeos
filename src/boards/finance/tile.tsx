import React from 'react';
import { Pressable, View, type TextStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { format, subDays } from 'date-fns';
import { daily, spendPace } from '@core/dashboard/metrics';
import { sourceState } from '@core/sources/deviceData';
import type { TileDef } from '@core/registry/types';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Caps } from './parts';
import { Text } from '@ui/kit';

const iso = (d: Date) => format(d, 'yyyy-MM-dd');

/** Seven bars, today in lime, or coral once the month is over the usual (NR-Money-Tile). */
function WeekBars({ week, over, height, letters }: { week: Array<{ day: Date; total: number }>; over: boolean; height: number; letters?: boolean }) {
  const t = useTheme();
  const max = Math.max(...week.map((d) => d.total), 1);
  return (
    <View style={{ gap: 2 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4, height }}>
        {week.map((d, i) => {
          const today = i === week.length - 1;
          return <View key={i} style={{ flex: 1, height: Math.max(5, (d.total / max) * height), borderRadius: 4, backgroundColor: today ? (over ? t.c.alert.coralText : t.c.accent.mustard) : t.dark ? '#F5F5F752' : t.c.fg.tertiary }} />;
        })}
      </View>
      {letters ? (
        <View style={{ flexDirection: 'row', gap: 4 }}>
          {week.map((d, i) => (
            <Text key={i} style={{ flex: 1, textAlign: 'center', fontSize: 10, lineHeight: 13, fontWeight: i === week.length - 1 ? '700' : '600', color: i === week.length - 1 ? t.c.fg.primary : t.c.fg.tertiary }}>{format(d.day, 'EEEEE')}</Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** Money on Today (NR-Money-Tile): this month against your usual month, the last 7 days; opens Money home. Empty, it names the permission it needs. */
function MoneyTile({ wide }: { wide: boolean }) {
  const router = useRouter();
  const t = useTheme();
  const os = useOS();
  const v = useLive((o) => {
    if (!o.registry.objects.has('transaction')) return null;
    const now = new Date();
    const byDay = daily(o, 'spend', iso(subDays(now, 6)), iso(now));
    return { pace: spendPace(o), week: Array.from({ length: 7 }, (_, i) => { const d = subDays(now, 6 - i); return { day: d, total: byDay.get(iso(d)) ?? 0 }; }), sms: sourceState(o, 'sms').enabled };
  }, []);
  if (!v) return null;
  const { pace: p, week, sms } = v;
  const money = os.format.currency;
  const size = wide ? { minHeight: 167 } : { flex: 1, aspectRatio: 1 };
  const box = { padding: 16, borderRadius: 24, backgroundColor: t.c.bg.tile, justifyContent: 'space-between' as const, ...size };
  const head = (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Caps>MONEY</Caps>
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: t.tints.finance.ink }} />
    </View>
  );
  if (!p.spent && !p.usual.length && !sms) {
    return (
      <Pressable accessibilityRole="button" accessibilityLabel="Money tile: needs SMS access, opens Data sources" onPress={() => router.push('/settings/sources' as never)} style={box}>
        {head}
        <Text style={{ fontSize: 17, lineHeight: 22, fontWeight: '700', letterSpacing: -0.2 }}>Needs SMS access</Text>
        <Text style={{ fontSize: 12, lineHeight: 15, fontWeight: '600', color: t.c.accent.gold }}>Open Data sources</Text>
      </Pressable>
    );
  }
  const usual = p.usualMonth;
  const over = !!usual && p.spent > usual;
  const usualLine = usual ? (over ? `over usual ${money(Math.round(usual))}` : `this month · usual ${money(Math.round(usual))}`) : 'this month';
  const sub = (fontSize: number, lineHeight: number) => (
    <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={{ fontSize, lineHeight, fontWeight: over ? '600' : '500', fontVariant: ['tabular-nums'], color: over ? t.c.alert.coralText : t.c.fg.secondary }}>{usualLine}</Text>
  );
  const label = `Money: ${money(p.spent)} this month${usual ? `, ${over ? 'over the' : ''} usual ${money(Math.round(usual))}` : ''}`;
  const open = () => router.push('/module/finance/index' as never);
  if (!wide) {
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={open} style={({ pressed }) => [box, { opacity: pressed ? 0.9 : 1 }]}>
        {head}
        <View style={{ gap: 2 }}>
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ fontSize: 28, lineHeight: 30, fontWeight: '700', letterSpacing: -1, fontVariant: ['tabular-nums'] }}>{money(p.spent)}</Text>
          {sub(12, 15)}
        </View>
        <WeekBars week={week} over={over} height={28} />
      </Pressable>
    );
  }
  const today = week[week.length - 1]!.total;
  const seven = week.reduce((n, d) => n + d.total, 0);
  const foot: TextStyle = { fontSize: 13, lineHeight: 17, fontWeight: '600', fontVariant: ['tabular-nums'], color: t.c.fg.secondary };
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}, the last 7 days`} onPress={open} style={({ pressed }) => [box, { opacity: pressed ? 0.9 : 1 }]}>
      {head}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ fontSize: 32, lineHeight: 34, fontWeight: '700', letterSpacing: -1, fontVariant: ['tabular-nums'] }}>{money(p.spent)}</Text>
          {sub(13, 17)}
        </View>
        <View style={{ width: 150 }}>
          <WeekBars week={week} over={over} height={40} letters />
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Text numberOfLines={1} style={[foot, { flex: 1 }]}>{money(today)} today</Text>
        <Text numberOfLines={1} style={foot}>{money(seven)} in 7 days</Text>
      </View>
    </Pressable>
  );
}

export const financeTiles: TileDef[] = [{ type: 'spend', board: 'finance', name: 'Money', description: 'This month against your usual month, the last 7 days', icon: 'wallet', sizes: ['small', 'medium'], defaultSize: 'medium', component: ({ size }) => <MoneyTile wide={size !== 'small'} /> }];
