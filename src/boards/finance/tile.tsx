import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { format } from 'date-fns';
import { spendPace } from '@core/dashboard/metrics';
import type { TileDef } from '@core/registry/types';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { LineChart, Stat, Text, Tile } from '@ui/kit';
import { NeedsSource } from '../../screens/NeedsSource';

/** Spend this month on Today: the month so far against your usual month's pace; opens Spend. */
function SpendTile() {
  const router = useRouter();
  const t = useTheme();
  const os = useOS();
  const p = useLive((o) => (o.registry.objects.has('transaction') ? spendPace(o) : null), []);
  if (!p) return null;
  const diff = p.usualByToday != null ? p.spent - p.usualByToday : null;
  // Noir: an orange colour block, black ink (NR-Today · "SPENT · SEP").
  const ink = t.dark ? t.c.bg.ground : t.tints.finance.ink;
  const series = [{ label: 'This month', color: ink, values: p.thisMonth }, ...(p.usual.length ? [{ label: 'Usual', color: t.dark ? `${ink}6B` : t.c.fg.tertiary, values: p.usual.slice(0, 31), dashed: true }] : [])];
  return (
    <Tile size="2x1" tint="finance" icon="wallet" filled={t.dark} caps={t.dark} label={t.dark ? `Spent · ${format(new Date(), 'MMM')}` : 'Spend this month'} meta={t.dark ? undefined : format(new Date(), 'MMM')} onPress={() => router.push('/spend' as never)}>
      {p.spent || p.usual.length ? (
        <View style={{ gap: 8 }}>
          {t.dark && diff != null ? (
            // On the colour block the number stays black; over / under usual is a black pill (lime under, coral over).
            <View style={{ alignSelf: 'flex-start', height: 28, paddingHorizontal: 11, borderRadius: 999, justifyContent: 'center', backgroundColor: t.c.bg.ground }}>
              <Text variant="labelMicro" color={diff > 0 ? t.c.alert.coral : t.c.accent.mustard}>
                {`${diff > 0 ? '+' : '−'}${os.format.currency(Math.abs(diff))} vs usual`}
              </Text>
            </View>
          ) : null}
          <Stat value={os.format.currency(p.spent)} size="count" caption={diff == null ? 'Your usual month shows after a month of data' : `${os.format.currency(Math.abs(diff))} ${diff > 0 ? 'more' : 'less'} than usual by today${p.usualMonth ? ` · usual month ${os.format.currency(p.usualMonth)}` : ''}`} tone={!t.dark && diff != null && diff > 0 ? 'alert' : undefined} />
          <LineChart series={series} labels={Array.from({ length: Math.max(p.thisMonth.length, p.usual.length ? 31 : 0) }, (_, i) => (i % 7 === 0 ? String(i + 1) : ''))} height={90} minZero formatY={(n) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(Math.round(n)))} accessibilityLabel="Spend this month vs your usual month" />
        </View>
      ) : (
        <NeedsSource id="spend" />
      )}
    </Tile>
  );
}

export const financeTiles: TileDef[] = [{ type: 'spend', board: 'finance', name: 'Spend this month', description: 'Pace against your usual month', icon: 'wallet', sizes: ['medium'], defaultSize: 'medium', component: SpendTile }];
