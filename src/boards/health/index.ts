import type { BoardManifest } from '@core/registry/types';
import { healthOverview } from './overview';

/** Companion board of the health module: its Overview and quick actions. The metric pages are `src/screens/HealthHome.tsx` until R6. */
export const healthBoard: BoardManifest = {
  id: 'health',
  module: 'health',
  name: 'Health & Fitness',
  icon: 'heart',
  color: 'red',
  placement: 'module',
  overview: healthOverview,
  quickActions: [
    { id: 'health.addWorkout', label: 'Workout', icon: 'figure.run', route: '/entity/workout/new', global: true },
    { id: 'health.addMeasurement', label: 'Measurement', icon: 'scalemass', route: '/entity/measurement/new' },
  ],
};
