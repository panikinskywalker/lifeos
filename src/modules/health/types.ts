import { z } from 'zod';
import type { ObjectDef } from '@core/domain/types';


/** Health record types (no React Native — unit-tested). */

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export interface WorkoutData { kind: string; durationMin: number; date: string; distanceKm?: number; calories?: number; intensity?: string; notes?: string; /** health_connect, … */ source?: string; /** The source's id for it (so a re-sync updates, never duplicates). */ sourceKey?: string }
export const workoutType: ObjectDef<WorkoutData> = {
  id: 'workout', module: 'health', label: 'Workout', labelPlural: 'Workouts', icon: 'figure.run',
  schema: z.object({ kind: z.string(), durationMin: z.coerce.number().positive(), date: z.string(), distanceKm: z.coerce.number().optional(), calories: z.coerce.number().optional(), intensity: z.string().optional(), notes: z.string().optional(), source: z.string().optional(), sourceKey: z.string().optional() }),
  fields: [
    { key: 'kind', label: 'Type', type: 'select', required: true, summary: true, options: [{ value: 'run', label: 'Run' }, { value: 'walk', label: 'Walk' }, { value: 'cycle', label: 'Cycling' }, { value: 'strength', label: 'Strength' }, { value: 'yoga', label: 'Yoga' }, { value: 'swim', label: 'Swim' }, { value: 'sport', label: 'Sport' }, { value: 'other', label: 'Other' }] },
    { key: 'durationMin', label: 'Duration (min)', type: 'number', required: true, summary: true },
    { key: 'date', label: 'Date', type: 'date', required: true, defaultValue: () => iso(new Date()) },
    { key: 'distanceKm', label: 'Distance (km)', type: 'number', section: 'Details' },
    { key: 'calories', label: 'Calories', type: 'number', section: 'Details' },
    { key: 'intensity', label: 'Intensity', type: 'select', section: 'Details', options: [{ value: 'easy', label: 'Easy' }, { value: 'moderate', label: 'Moderate' }, { value: 'hard', label: 'Hard' }] },
    { key: 'notes', label: 'Notes', type: 'longtext', section: 'Details' },
  ],
  indexed: ['date', 'kind'], occurredAtField: 'date',
  computeTitle: (d) => ({ run: 'Run', walk: 'Walk', cycle: 'Cycling', strength: 'Strength', yoga: 'Yoga', swim: 'Swim', sport: 'Sport', other: 'Workout' })[d.kind] ?? 'Workout',
  computeSubtitle: (d) => `${d.durationMin} min${d.distanceKm ? ` · ${d.distanceKm} km` : ''}`,
};

export interface MeasurementData { metric: string; value: number; unit?: string; date: string; notes?: string; source?: string; sourceKey?: string }
export const measurementType: ObjectDef<MeasurementData> = {
  id: 'measurement', module: 'health', label: 'Measurement', labelPlural: 'Measurements', icon: 'scalemass',
  // Shown as its metrics (Steps, Sleep, Weight…) on the Health page, not as a category of its own.
  hidden: true,
  schema: z.object({ metric: z.string(), value: z.coerce.number(), unit: z.string().optional(), date: z.string(), notes: z.string().optional(), source: z.string().optional(), sourceKey: z.string().optional() }),
  fields: [
    { key: 'metric', label: 'Metric', type: 'select', required: true, summary: true, options: [{ value: 'weight', label: 'Weight' }, { value: 'sleep', label: 'Sleep (hours)' }, { value: 'steps', label: 'Steps' }, { value: 'resting_hr', label: 'Resting heart rate' }, { value: 'heart_rate', label: 'Heart rate (avg)' }, { value: 'water', label: 'Water (L)' }, { value: 'mood', label: 'Mood (1-5)' }, { value: 'other', label: 'Other' }] },
    { key: 'value', label: 'Value', type: 'number', required: true },
    { key: 'unit', label: 'Unit', type: 'text' },
    { key: 'date', label: 'Date', type: 'date', required: true, defaultValue: () => iso(new Date()) },
    { key: 'notes', label: 'Notes', type: 'longtext', section: 'Details' },
  ],
  indexed: ['metric', 'date'], occurredAtField: 'date',
  computeTitle: (d) => ({ weight: 'Weight', sleep: 'Sleep', steps: 'Steps', resting_hr: 'Resting HR', heart_rate: 'Heart rate', water: 'Water', mood: 'Mood', other: 'Measurement' })[d.metric] ?? d.metric,
  computeSubtitle: (d) => `${d.value}${d.unit ? ` ${d.unit}` : ''}`,
};

