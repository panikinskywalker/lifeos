import type { BoardManifest } from '@core/registry/types';
import { healthOverview } from './overview';
import { healthTiles } from './tile';
import { HealthHome } from './home';
import { pageScreen } from './page';
import { PAGES } from './parts';

/**
 * Health (the health module's companion board; R6): the Health home (one
 * card per metric, workouts) and one page per metric at
 * /module/health/<steps · sleep · heart · weight · screen>. A first pass
 * from the kit; the NR-Health-* artboards (docs/design/HEALTH-BRIEF.md)
 * replace it.
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
  screens: [{ key: 'index', title: 'Health', component: HealthHome }, ...PAGES.map((p) => ({ key: p.key, title: p.title, component: pageScreen(p.key) }))],
  quickActions: [
    { id: 'health.addWorkout', label: 'Workout', icon: 'figure.run', route: '/entity/workout/new', global: true },
    { id: 'health.addWeight', label: 'Weight', icon: 'scalemass', route: '/entity/measurement/new?metric=weight' },
    { id: 'health.addMeasurement', label: 'Measurement', icon: 'scalemass', route: '/entity/measurement/new' },
  ],
};
