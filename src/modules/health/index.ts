import type { ModuleManifest } from '@core/registry/types';
import { measurementType, workoutType, type MeasurementData, type WorkoutData } from './types';

export { measurementType, workoutType, type MeasurementData, type WorkoutData };
export const HEALTH_COLOR = 'red';

/** Body: Measurement and Workout, fed by Health Connect and Usage access (sources move in at R6). Screens live in `src/boards/health`. */
export const healthModule: ModuleManifest = {
  id: 'health',
  name: 'Health & Fitness',
  version: '1.0.0',
  description: 'Workouts and body measurements with trends.',
  icon: 'heart',
  color: HEALTH_COLOR,
  objects: [workoutType, measurementType],
};
