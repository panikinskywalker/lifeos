import type { BoardManifest } from '@core/registry/types';
import { habitsOverview } from './overview';
import { HabitSection } from './widgets';

export { HabitChecklist, HabitWeek } from './widgets';

/** Companion board of the habits module: Overview, quick action, the Habit streak section; HabitWeek / HabitChecklist are Today's habits tile. */
export const habitsBoard: BoardManifest = {
  id: 'habits',
  module: 'habits',
  name: 'Habits',
  icon: 'flame',
  color: 'orange',
  placement: 'module',
  overview: habitsOverview,
  quickActions: [{ id: 'habits.add', label: 'Habit', icon: 'flame', route: '/entity/habit/new' }],
  overrides: [{ object: 'habit', record: [{ entityType: 'habit', key: 'habits.habit', title: 'Streak', component: HabitSection, order: 10 }] }],
};
