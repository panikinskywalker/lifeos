import { z } from 'zod';
import type { ObjectDef } from '@core/domain/types';

export interface HabitData {
  frequency: 'daily' | 'weekdays' | 'weekly';
  targetPerWeek?: number;
  icon?: string;
  color?: string;
  reminderTime?: string;
  why?: string;
}
export interface HabitLogData {
  habitId: string;
  date: string;
  value?: number;
}

export const habitType: ObjectDef<HabitData> = {
  id: 'habit',
  module: 'habits',
  label: 'Habit',
  labelPlural: 'Habits',
  icon: 'flame',
  schema: z.object({ frequency: z.enum(['daily', 'weekdays', 'weekly']).default('daily'), targetPerWeek: z.coerce.number().optional(), icon: z.string().optional(), color: z.string().optional(), reminderTime: z.string().optional(), why: z.string().optional() }),
  fields: [
    { key: 'frequency', label: 'Frequency', type: 'select', defaultValue: 'daily', summary: true, options: [{ value: 'daily', label: 'Every day' }, { value: 'weekdays', label: 'Weekdays' }, { value: 'weekly', label: 'Times per week' }] },
    { key: 'targetPerWeek', label: 'Target per week', type: 'number', description: 'For "times per week" habits' },
    { key: 'why', label: 'Why', type: 'longtext', section: 'Details' },
  ],
  statuses: [{ value: 'active', label: 'Active' }, { value: 'paused', label: 'Paused', color: 'gray' }],
  links: [{ kind: 'habit', label: 'Logs', to: 'habit_log', cardinality: 'many' }],
};

export const habitLogType: ObjectDef<HabitLogData> = {
  id: 'habit_log',
  module: 'habits',
  label: 'Habit check-in',
  labelPlural: 'Habit check-ins',
  icon: 'checkmark',
  hidden: true,
  schema: z.object({ habitId: z.string(), date: z.string(), value: z.coerce.number().optional() }),
  fields: [
    { key: 'habitId', label: 'Habit', type: 'relation', relationTo: 'habit', relationKind: 'habit' },
    { key: 'date', label: 'Date', type: 'date', required: true },
    { key: 'value', label: 'Value', type: 'number' },
  ],
  indexed: ['habitId', 'date'],
  occurredAtField: 'date',
  computeTitle: (d) => `Check-in ${d.date}`,
};

