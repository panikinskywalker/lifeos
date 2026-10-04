import { z } from 'zod';
import type { ModuleManifest } from '@core/registry/types';
import { activeHabits, doneDays, findHabit, isoOf, streakOf, checkIn } from '@core/habits/habits';
import { habitLogType, habitType } from './types';

export const HABITS_COLOR = 'orange';
export * from './types';
const today = () => isoOf(Date.now());
const DAY = 86_400_000;

export const habitsModule: ModuleManifest = {
  id: 'habits',
  name: 'Habits',
  version: '1.0.0',
  description: 'Daily habits with streaks and a heat map.',
  icon: 'flame',
  color: HABITS_COLOR,
  entityTypes: [habitType, habitLogType],
  aiTools: [
    {
      name: 'habits_status',
      description: 'Active habits with whether each is done today and its current streak.',
      input: z.object({}),
      run: async (_i, os) =>
        activeHabits(os).map((h) => {
          const done = doneDays(os, h.id, isoOf(Date.now() - 400 * DAY));
          const s = streakOf(h, done);
          return { id: h.id, title: h.title, doneToday: done.has(today()), streak: `${s.count} ${s.unit}${s.count === 1 ? '' : 's'}` };
        }),
    },
    {
      name: 'habit_check_in',
      description: 'Tick a habit the user tracks as done for a day (default today). Name it as they said it.',
      input: z.object({ habit: z.string(), date: z.string().optional(), entityId: z.string().optional() }),
      run: async (i, os) => {
        const x = i as { habit: string; date?: string; entityId?: string };
        const h = x.entityId ? activeHabits(os).find((y) => y.id === x.entityId) : findHabit(os, x.habit);
        if (!h) return { error: `no habit called ${x.habit}` };
        const date = x.date ?? today();
        const logId = checkIn(os, h.id, date);
        return { logged: `${h.title} ✓ ${date === today() ? 'today' : date.slice(8) + '/' + date.slice(5, 7)}`, entityId: h.id, logId, already: !logId };
      },
    },
  ],
};

