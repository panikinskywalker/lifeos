import { z } from 'zod';
import type { FieldOption, ObjectDef } from '@core/domain/types';

/** Body (docs/MODEL.md layer 2, *Body*; Fields agreed with R6). No React Native: unit-tested. */

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const WORKOUT_KINDS: FieldOption[] = [
  { value: 'run', label: 'Run' },
  { value: 'walk', label: 'Walk' },
  { value: 'cycle', label: 'Cycling' },
  { value: 'strength', label: 'Strength' },
  { value: 'yoga', label: 'Yoga' },
  { value: 'swim', label: 'Swim' },
  { value: 'sport', label: 'Sport' },
  { value: 'other', label: 'Other' },
];

export interface WorkoutData {
  kind: string;
  /** Minutes (a duration Field). */
  durationMin: number;
  date: string;
  /** When it started (ms), from Health Connect. */
  startAt?: number;
  distanceKm?: number;
  calories?: number;
  intensity?: string;
  notes?: string;
  /** health_connect, or empty when you added it. */
  source?: string;
  /** The source's id for it (so a re-sync updates, never duplicates). */
  sourceKey?: string;
}

export const workoutType: ObjectDef<WorkoutData> = {
  id: 'workout', module: 'health', label: 'Workout', labelPlural: 'Workouts', icon: 'figure.run',
  schema: z.object({ kind: z.string(), durationMin: z.coerce.number().positive(), date: z.string(), startAt: z.coerce.number().optional(), distanceKm: z.coerce.number().optional(), calories: z.coerce.number().optional(), intensity: z.string().optional(), notes: z.string().optional(), source: z.string().optional(), sourceKey: z.string().optional() }),
  fields: [
    { key: 'kind', label: 'Type', type: 'select', required: true, summary: true, options: WORKOUT_KINDS },
    { key: 'durationMin', label: 'Duration', type: 'duration', required: true, summary: true },
    { key: 'date', label: 'Date', type: 'date', required: true, default: () => iso(new Date()) },
    { key: 'startAt', label: 'Started', type: 'datetime', section: 'Details' },
    { key: 'distanceKm', label: 'Distance', type: 'number', unit: 'km', section: 'Details' },
    { key: 'calories', label: 'Calories', type: 'number', unit: 'kcal', section: 'Details' },
    { key: 'intensity', label: 'Intensity', type: 'select', section: 'Details', options: [{ value: 'easy', label: 'Easy' }, { value: 'moderate', label: 'Moderate' }, { value: 'hard', label: 'Hard' }] },
    { key: 'notes', label: 'Notes', type: 'longtext', section: 'Details' },
  ],
  indexed: ['date', 'kind'], occurredAtField: 'date',
  computeTitle: (d) => WORKOUT_KINDS.find((o) => o.value === d.kind && o.value !== 'other')?.label ?? 'Workout',
  computeSubtitle: (d) => `${d.durationMin} min${d.distanceKm ? ` · ${d.distanceKm} km` : ''}`,
};

/** The metrics a Measurement can be, with the unit filled in when you leave it empty. */
export const MEASUREMENT_METRICS: Array<FieldOption & { unit?: string; title: string }> = [
  { value: 'steps', label: 'Steps', title: 'Steps', unit: 'steps' },
  { value: 'sleep', label: 'Sleep (hours)', title: 'Sleep', unit: 'h' },
  { value: 'resting_hr', label: 'Resting heart rate', title: 'Resting HR', unit: 'bpm' },
  { value: 'heart_rate', label: 'Heart rate (average)', title: 'Heart rate', unit: 'bpm' },
  { value: 'weight', label: 'Weight', title: 'Weight', unit: 'kg' },
  { value: 'water', label: 'Water (L)', title: 'Water', unit: 'L' },
  { value: 'mood', label: 'Mood (1-5)', title: 'Mood' },
  { value: 'other', label: 'Other', title: 'Measurement' },
];

export const unitFor = (metric: string) => MEASUREMENT_METRICS.find((m) => m.value === metric)?.unit;

export interface MeasurementData {
  metric: string;
  value: number;
  unit?: string;
  /** The day it counts for (a night's sleep: the day you woke). */
  date: string;
  /** Sleep: asleep and awake (ms), from Health Connect. */
  startAt?: number;
  endAt?: number;
  notes?: string;
  source?: string;
  sourceKey?: string;
}

export const measurementType: ObjectDef<MeasurementData> = {
  id: 'measurement', module: 'health', label: 'Measurement', labelPlural: 'Measurements', icon: 'scalemass',
  // Shown as its metrics (Steps, Sleep, Weight…) on the Health board, not as a list of its own.
  hidden: true,
  schema: z.object({ metric: z.string(), value: z.coerce.number(), unit: z.string().optional(), date: z.string(), startAt: z.coerce.number().optional(), endAt: z.coerce.number().optional(), notes: z.string().optional(), source: z.string().optional(), sourceKey: z.string().optional() }),
  fields: [
    { key: 'metric', label: 'Metric', type: 'select', required: true, summary: true, options: MEASUREMENT_METRICS.map(({ value, label }) => ({ value, label })) },
    { key: 'value', label: 'Value', type: 'number', required: true },
    { key: 'unit', label: 'Unit', type: 'text' },
    { key: 'date', label: 'Date', type: 'date', required: true, default: () => iso(new Date()) },
    { key: 'startAt', label: 'Asleep', type: 'datetime', section: 'Sleep' },
    { key: 'endAt', label: 'Awake', type: 'datetime', section: 'Sleep' },
    { key: 'notes', label: 'Notes', type: 'longtext', section: 'Details' },
  ],
  indexed: ['metric', 'date'], occurredAtField: 'date',
  computeTitle: (d) => MEASUREMENT_METRICS.find((m) => m.value === d.metric)?.title ?? d.metric,
  computeSubtitle: (d) => `${d.value}${(d.unit ?? unitFor(d.metric)) ? ` ${d.unit ?? unitFor(d.metric)}` : ''}`,
};
