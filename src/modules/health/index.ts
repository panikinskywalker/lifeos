import type { ModuleManifest } from '@core/registry/types';
import { measurementType, workoutType } from './types';
import { healthSources } from './sources';
import { healthTools } from './aiTools';
import { healthBrain } from './brain';

export * from './types';
export { saveHealthDays } from './healthConnect';
export { healthSource, usageSource, healthSources, readFrom, HISTORY } from './sources';
export { HEALTH_METRICS, isHealthMetric, latestMeasurement, healthToday, sleepNights, workoutsIn, compareInWords, logMeasurement, type HealthMetric, type WorkoutSummary } from './lib';
export { healthTools } from './aiTools';
export { healthBrain } from './brain';
export const HEALTH_COLOR = 'red';

/**
 * Body (docs/MODEL.md layer 2, *Body*; R6): Measurement and Workout, fed by
 * Health Connect and Usage access (screen time, kept in core's usage tables).
 * Its pages live in `src/boards/health`.
 */
export const healthModule: ModuleManifest = {
  id: 'health',
  name: 'Health & Fitness',
  version: '1.1.0',
  description: 'Steps, sleep, heart rate, weight, screen time and workouts.',
  icon: 'heart',
  color: HEALTH_COLOR,
  objects: [workoutType, measurementType],
  sources: healthSources,
  aiTools: healthTools,
  brain: healthBrain,
};
