import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { format } from 'date-fns';
import { upkeep } from '@core/cycles/upkeep';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { BentoGrid, Card, IconButton, Ring, RowItem, RowList, Screen, StackedBar, Stat, Text, Tile } from '@ui/kit';
import { monthReport } from '@modules/finance/reports';
import { categoryOf } from '@modules/finance/types';

function greeting(d = new Date()) {
  const h = d.getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

/**
 * Today (canvas 01). Overdue, running out and this month's spend are live
 * (M2); the brief and habits arrive in M4. Nothing here is invented data.
 */
export default function TodayTab() {
  const router = useRouter();
  const t = useTheme();
  const os = useOS();
  const u = useLive((o) => upkeep(o), []);
  const runningOut = u.items.filter((i) => i.entity.type === 'subscription' && i.status.daysLeft != null && i.status.daysLeft >= 0 && i.status.daysLeft <= 7).slice(0, 3);
  const month = useLive((o) => (o.registry.entityTypes.has('transaction') ? monthReport(o, 0) : null), []);
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
          <Stat value={String(u.overdue)} size="count" tone={u.overdue ? 'alert' : undefined} caption={u.overdue ? (u.sections.overdue[0]!.entity.title + (u.overdue > 1 ? ` + ${u.overdue - 1} more` : '')) : 'Nothing late'} />
        </Tile>
        <Tile tint="health" icon="activity" label="Habits">
          <Ring progress={0} size={72} color={t.tints.health.ink} />
          <Text variant="caption" color="secondary">Arrives in M4</Text>
        </Tile>
      </BentoGrid>
      <Tile size="2x1" tint="finance" icon="hourglass" label="Running out" meta="next 7 days" onPress={() => router.navigate('/upkeep')}>
        {runningOut.length ? (
          <RowList>
            {runningOut.map((i) => (
              <RowItem key={i.cycle.id} icon="repeat" tint="finance" title={i.entity.title} subtitle={i.cycle.costEstimate ? os.format.currency(i.cycle.costEstimate) : null} value={i.status.daysLeft === 0 ? 'Today' : `in ${i.status.daysLeft} d`} valueTone={i.status.daysLeft! <= 1 ? 'alert' : 'secondary'} />
            ))}
          </RowList>
        ) : (
          <Text variant="caption" color="secondary">No subscriptions or recharges end this week.</Text>
        )}
      </Tile>
      {month ? (
        <Tile size="2x1" tint="finance" icon="wallet" label="Spent this month" meta={format(new Date(), 'MMM')} onPress={() => router.push('/module/finance/reports' as never)} footer={month.byCategory.length ? <StackedBar parts={month.byCategory.slice(0, 4).map((c, i) => ({ label: categoryOf(c.category).label, value: c.total, color: t.c.chart[i]!, display: `${Math.round(c.share * 100)}%` }))} /> : undefined}>
          <Stat value={os.format.currency(month.spend)} size="hero" caption={month.vsLast == null ? 'Tap for the month view' : `${month.vsLast >= 0 ? '+' : '−'}${Math.round(Math.abs(month.vsLast) * 100)}% vs last month`} />
        </Tile>
      ) : null}
    </Screen>
  );
}
