import React from 'react';
import { useRouter } from 'expo-router';
import { format } from 'date-fns';
import { BentoGrid, IconButton, Ring, Screen, StatTile, Text, Tile } from '@ui/kit';
import { useTheme } from '@ui/theme/ThemeProvider';

/**
 * Today — placeholder bento for M1. Each tile names the milestone that makes
 * it real (Upkeep M2, brief M4); nothing here is fake data.
 */
export default function TodayTab() {
  const router = useRouter();
  const t = useTheme();
  return (
    <Screen tab eyebrow={format(new Date(), 'EEEE, d MMMM')} title="Today" right={<IconButton icon="search" accessibilityLabel="Search" filled onPress={() => router.push('/search')} />}>
      <BentoGrid>
        <Tile size="2x1" tint="memory" filled icon="sparkle" label="Brief" meta="M4">
          <Text variant="body" color={t.tints.memory.ink}>
            Your morning brief will sit here: what’s due, what’s running out, who to call.
          </Text>
        </Tile>
        <StatTile tint="upkeep" icon="alert" label="Overdue" value="—" caption="Upkeep arrives in M2" onPress={() => router.push('/upkeep')} />
        <StatTile tint="tasks" icon="calendar" label="Due today" value="—" caption="Upkeep arrives in M2" onPress={() => router.push('/upkeep')} />
        <StatTile size="2x1" tint="finance" icon="wallet" label="Spend this month" value="—" caption="Finance tiles arrive in M4" />
        <StatTile tint="people" icon="people" label="People to call" value="—" caption="M2" />
        <Tile tint="health" icon="activity" label="Habits" meta="M4">
          <Ring progress={0} size={56} stroke={7} />
        </Tile>
      </BentoGrid>
    </Screen>
  );
}
