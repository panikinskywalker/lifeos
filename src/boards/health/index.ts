import type { BoardManifest } from '@core/registry/types';
import { healthOverview } from './overview';
import { healthTiles } from './tile';
import { HealthHome } from './home';
import { WorkoutsScreen } from './workouts';
import { WorkoutPage } from './workout';
import { MeasurementForm, WorkoutForm } from './form';
import { pageScreen } from './page';
import { PAGES } from './parts';

/**
 * Health & Fitness (the health module's companion board), drawn to the
 * NR-Health-* artboards (v3 Noir): the home, Workouts, a Workout's whole page,
 * the Workout and Measurement form, the Today tiles, and one page per metric
 * at /module/health/<steps · sleep · heart · weight · screen>.
 */
export const healthBoard: BoardManifest = {
  id: 'health',
  module: 'health',
  name: 'Health & Fitness',
  icon: 'heart',
  color: 'red',
  placement: 'module',
  overview: healthOverview,
  tiles: healthTiles,
  screens: [
    { key: 'index', title: 'Health & Fitness', component: HealthHome },
    { key: 'workouts', title: 'Workouts', component: WorkoutsScreen },
    ...PAGES.map((p) => ({ key: p.key, title: p.title, component: pageScreen(p.key) })),
  ],
  quickActions: [
    { id: 'health.addWorkout', label: 'Workout', icon: 'figure.run', route: '/entity/workout/new', global: true },
    { id: 'health.addWeight', label: 'Weight', icon: 'scalemass', route: '/entity/measurement/new?metric=weight' },
    { id: 'health.addMeasurement', label: 'Measurement', icon: 'scalemass', route: '/entity/measurement/new' },
  ],
  overrides: [
    { object: 'workout', form: WorkoutForm, record: [{ entityType: 'workout', key: 'health.workout', title: 'Workout', component: WorkoutPage, order: 0, placement: 'page', ownLinks: true }] },
    { object: 'measurement', form: MeasurementForm },
  ],
};
