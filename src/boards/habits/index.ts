import type { BoardManifest } from '@core/registry/types';
import { habitsOverview } from './overview';
import { habitsTiles } from './tile';
import { HabitsHome } from './home';
import { AllHabits } from './list';
import { TickOff } from './tick';
import { HabitPage } from './record';
import { HabitForm } from './form';

/** Companion board of the habits module (NR-Habits-*): the home, all habits, tick off today, the habit's page and form, the Today tile, the Overview. */
export const habitsBoard: BoardManifest = {
  id: 'habits',
  module: 'habits',
  name: 'Habits',
  icon: 'flame',
  color: 'orange',
  placement: 'module',
  overview: habitsOverview,
  tiles: habitsTiles,
  screens: [
    { key: 'index', title: 'Habits', component: HabitsHome },
    { key: 'all', title: 'All habits', component: AllHabits },
    { key: 'tick', title: 'Today’s habits', component: TickOff },
  ],
  quickActions: [{ id: 'habits.add', label: 'Habit', icon: 'flame', route: '/entity/habit/new' }],
  overrides: [{ object: 'habit', form: HabitForm, record: [{ entityType: 'habit', key: 'habits.habit', title: 'Habit', component: HabitPage, order: 0, placement: 'page', ownLinks: true }] }],
};
