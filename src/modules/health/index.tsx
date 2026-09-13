import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { z } from 'zod';
import type { ModuleManifest, WidgetDef, WidgetProps } from '@core/registry/types';
import type { EntityTypeDef } from '@core/domain/types';
import { palette } from '@ui/theme/tokens';
import { useLive } from '@ui/hooks';
import { Card, SectionHeader, Stat, Text } from '@ui/components/primitives';
import { Bars, Sparkline } from '@ui/components/charts';

export const HEALTH_COLOR = palette.red;
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export interface WorkoutData { kind: string; durationMin: number; date: string; distanceKm?: number; calories?: number; intensity?: string; notes?: string }
export const workoutType: EntityTypeDef<WorkoutData> = {
  type: 'workout', module: 'health', label: 'Workout', labelPlural: 'Workouts', icon: 'figure.run',
  schema: z.object({ kind: z.string(), durationMin: z.coerce.number().positive(), date: z.string(), distanceKm: z.coerce.number().optional(), calories: z.coerce.number().optional(), intensity: z.string().optional(), notes: z.string().optional() }),
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

export interface MeasurementData { metric: string; value: number; unit?: string; date: string; notes?: string }
export const measurementType: EntityTypeDef<MeasurementData> = {
  type: 'measurement', module: 'health', label: 'Measurement', labelPlural: 'Measurements', icon: 'scalemass',
  schema: z.object({ metric: z.string(), value: z.coerce.number(), unit: z.string().optional(), date: z.string(), notes: z.string().optional() }),
  fields: [
    { key: 'metric', label: 'Metric', type: 'select', required: true, summary: true, options: [{ value: 'weight', label: 'Weight' }, { value: 'sleep', label: 'Sleep (hours)' }, { value: 'steps', label: 'Steps' }, { value: 'resting_hr', label: 'Resting heart rate' }, { value: 'water', label: 'Water (L)' }, { value: 'mood', label: 'Mood (1-5)' }, { value: 'other', label: 'Other' }] },
    { key: 'value', label: 'Value', type: 'number', required: true },
    { key: 'unit', label: 'Unit', type: 'text' },
    { key: 'date', label: 'Date', type: 'date', required: true, defaultValue: () => iso(new Date()) },
    { key: 'notes', label: 'Notes', type: 'longtext', section: 'Details' },
  ],
  indexed: ['metric', 'date'], occurredAtField: 'date',
  computeTitle: (d) => ({ weight: 'Weight', sleep: 'Sleep', steps: 'Steps', resting_hr: 'Resting HR', water: 'Water', mood: 'Mood', other: 'Measurement' })[d.metric] ?? d.metric,
  computeSubtitle: (d) => `${d.value}${d.unit ? ` ${d.unit}` : ''}`,
};

function ActivityWidget({ size }: WidgetProps) {
  const router = useRouter();
  const weeks = useLive((os) => {
    const from = new Date(); from.setDate(from.getDate() - 6);
    const rows = os.entities.groupBy('workout', { filter: { and: [{ field: 'data.date', op: 'gte', value: iso(from) }] } }, 'data.date', { sum: ['data.durationMin'] });
    const map = new Map(rows.map((r) => [r.key, r.values['sum_data.durationMin']]));
    const out: Array<{ label: string; value: number }> = [];
    for (let i = 0; i < 7; i++) { const d = new Date(from); d.setDate(from.getDate() + i); out.push({ label: ['S', 'M', 'T', 'W', 'T', 'F', 'S'][d.getDay()], value: map.get(iso(d)) ?? 0 }); }
    return out;
  }, []);
  const weight = useLive((os) => os.entities.query<MeasurementData>('measurement', { filter: { and: [{ field: 'data.metric', op: 'eq', value: 'weight' }] }, sort: [{ field: 'data.date', dir: 'desc' }] }, { limit: 14 }).reverse(), []);
  const total = weeks.reduce((s, w) => s + w.value, 0);
  return (
    <Card onPress={() => router.push('/entity/workout')}>
      <SectionHeader title="Activity" icon="figure.run" color={HEALTH_COLOR} action="Workouts" />
      <Stat value={`${total}`} unit="min this week" small />
      <View style={{ marginTop: 8 }}><Bars data={weeks} height={70} color={HEALTH_COLOR} /></View>
      {size === 'large' && weight.length > 1 ? (
        <View style={{ marginTop: 12 }}>
          <Text variant="footnote" color="secondary">Weight · latest {weight[weight.length - 1].data.value} {weight[weight.length - 1].data.unit ?? 'kg'}</Text>
          <Sparkline values={weight.map((w) => w.data.value)} color={HEALTH_COLOR} height={44} />
        </View>
      ) : null}
    </Card>
  );
}

const widgets: WidgetDef[] = [{ type: 'health.activity', module: 'health', name: 'Activity', icon: 'figure.run', sizes: ['small', 'medium', 'large'], defaultSize: 'medium', component: ActivityWidget }];

export const healthModule: ModuleManifest = {
  id: 'health', name: 'Health & Fitness', version: '1.0.0', description: 'Workouts and body measurements with trends.', icon: 'heart', color: HEALTH_COLOR,
  entityTypes: [workoutType, measurementType], widgets,
  quickActions: [{ id: 'health.addWorkout', label: 'Workout', icon: 'figure.run', route: '/entity/workout/new', global: true }, { id: 'health.addMeasurement', label: 'Measurement', icon: 'scalemass', route: '/entity/measurement/new' }],
};
