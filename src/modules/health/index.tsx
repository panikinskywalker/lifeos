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
import { measurementType, workoutType, type MeasurementData, type WorkoutData } from './types';
export { measurementType, workoutType, type MeasurementData, type WorkoutData };
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
