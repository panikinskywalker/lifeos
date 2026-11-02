import React from 'react';
import { useRouter } from 'expo-router';
import { activeHabits } from '@core/habits/habits';
import type { TileDef, TileProps } from '@core/registry/types';
import { useLive } from '@ui/hooks';
import { Tile } from '@ui/kit';
import { HabitChecklist, HabitWeek } from './widgets';

/** Today's habits: tap to tick; only when you track some. Two looks: today's list or this week. */
function HabitsTile({ config }: TileProps) {
  const router = useRouter();
  const n = useLive((o) => activeHabits(o).length, []);
  if (!n) return null;
  const week = config.style === 'week';
  return (
    <Tile size="2x1" tint="health" icon="flame" label="Habits" meta={week ? 'this week' : 'today'} onPress={() => router.push('/module/habits' as never)}>
      {week ? <HabitWeek /> : <HabitChecklist />}
    </Tile>
  );
}

export const habitsTiles: TileDef[] = [
  {
    type: 'habits',
    board: 'habits',
    name: 'Habits',
    description: 'Tick today’s habits, with their streaks',
    icon: 'flame',
    sizes: ['medium'],
    defaultSize: 'medium',
    configFields: [{ key: 'style', label: 'Look', type: 'select', options: [{ value: 'list', label: 'Today list' }, { value: 'week', label: 'This week' }] }],
    component: HabitsTile,
  },
];
