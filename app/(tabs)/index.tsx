import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { format } from 'date-fns';
import { useTheme } from '@ui/theme/ThemeProvider';
import { BentoGrid, Card, IconButton, Ring, Screen, Stat, Text, Tile } from '@ui/kit';

function greeting(d = new Date()) {
  const h = d.getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

/**
 * Today (canvas 01) — layout in place, content arriving with its milestone:
 * the brief in M4, overdue and running-out with the cycle engine in M2.
 * Nothing here is invented data.
 */
export default function TodayTab() {
  const router = useRouter();
  const t = useTheme();
  const bullets: Array<[string, string]> = [
    [t.tints.finance.ink, 'What’s running out, a few days ahead'],
    [t.tints.upkeep.ink, 'Services and chores coming due'],
    [t.c.alert.coral, 'Anything overdue'],
  ];
  return (
    <Screen tab compact title={greeting()} subtitle={format(new Date(), 'EEEE d MMM')} right={<IconButton icon="user-circle" accessibilityLabel="You" filled onPress={() => router.navigate('/you')} />}>
      <Card icon="sparkle" iconTone="accent" title="Brief" meta="arrives in M4">
        <View style={{ gap: 10 }}>
          {bullets.map(([c, line]) => (
            <View key={line} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c }} />
              <Text variant="body" style={{ flex: 1 }}>
                {line}
              </Text>
            </View>
          ))}
        </View>
      </Card>
      <BentoGrid>
        <Tile iconTone="alert" icon="alert" label="Overdue" onPress={() => router.navigate('/upkeep')}>
          <Stat value="—" size="count" caption="Cycles arrive in M2" />
        </Tile>
        <Tile tint="health" icon="activity" label="Habits">
          <Ring progress={0} size={72} color={t.tints.health.ink} />
          <Text variant="caption" color="secondary">Arrives in M4</Text>
        </Tile>
      </BentoGrid>
      <Tile size="2x1" tint="finance" icon="hourglass" label="Running out" meta="M2">
        <Text variant="caption" color="secondary">Subscriptions and recharges ending within a week.</Text>
      </Tile>
      <Tile size="2x1" tint="finance" icon="wallet" label="Spent this month" meta={format(new Date(), 'MMM')} onPress={() => router.push('/entity/transaction')}>
        <Stat value="—" size="hero" caption="The month view arrives in M4 · tap for transactions" />
      </Tile>
    </Screen>
  );
}
