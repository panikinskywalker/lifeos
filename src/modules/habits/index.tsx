import React from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { z } from 'zod';
import type { ModuleManifest, WidgetDef, WidgetProps } from '@core/registry/types';
import type { Entity, EntityTypeDef } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import { palette } from '@ui/theme/tokens';
import { useTheme } from '@ui/theme/ThemeProvider';
import { useLive, useOS } from '@ui/hooks';
import { Card, Icon, SectionHeader, Stat, Text } from '@ui/components/primitives';
import { HeatGrid, ProgressRing } from '@ui/components/charts';
import { habitsOverview } from './overview';

export const HABITS_COLOR = palette.orange;
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = () => iso(new Date());

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

export const habitType: EntityTypeDef<HabitData> = {
  type: 'habit',
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
  statuses: [{ value: 'active', label: 'Active' }, { value: 'paused', label: 'Paused', color: palette.gray }],
  relations: [{ kind: 'habit', label: 'Logs', to: 'habit_log', cardinality: 'many' }],
};

export const habitLogType: EntityTypeDef<HabitLogData> = {
  type: 'habit_log',
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

export function habitLogs(os: LifeOSContext, habitId: string, days = 28): Set<string> {
  const from = new Date();
  from.setDate(from.getDate() - days);
  return new Set(os.entities.query<HabitLogData>('habit_log', { filter: { and: [{ field: 'data.habitId', op: 'eq', value: habitId }, { field: 'data.date', op: 'gte', value: iso(from) }] } }, { limit: 400 }).map((l) => l.data.date));
}

export function toggleHabit(os: LifeOSContext, habitId: string, date = today()) {
  const existing = os.entities.query<HabitLogData>('habit_log', { filter: { and: [{ field: 'data.habitId', op: 'eq', value: habitId }, { field: 'data.date', op: 'eq', value: date }] } }, { limit: 1 })[0];
  if (existing) os.entities.delete(existing.id);
  else os.entities.create<HabitLogData>({ type: 'habit_log', data: { habitId, date } });
}

export function streak(logs: Set<string>): number {
  let n = 0;
  const d = new Date();
  if (!logs.has(iso(d))) d.setDate(d.getDate() - 1); // today not yet done doesn't break the streak
  while (logs.has(iso(d))) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

function lastNDays(n: number): string[] {
  const out: string[] = [];
  const d = new Date();
  d.setDate(d.getDate() - n + 1);
  for (let i = 0; i < n; i++) {
    out.push(iso(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

function HabitsWidget({ size }: WidgetProps) {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const habits = useLive((o) => o.entities.query<HabitData>('habit', { filter: { and: [{ field: 'status', op: 'eq', value: 'active' }] } }).map((h) => ({ h, logs: habitLogs(o, h.id, 35) })), []);
  const doneToday = habits.filter((x) => x.logs.has(today())).length;
  return (
    <Card onPress={() => router.push('/entity/habit')}>
      <SectionHeader title="Habits" icon="flame" color={HABITS_COLOR} action="All" />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <ProgressRing progress={habits.length ? doneToday / habits.length : 0} size={64} stroke={8} color={HABITS_COLOR}>
          <Text variant="caption" style={{ fontWeight: '700' }}>
            {doneToday}/{habits.length}
          </Text>
        </ProgressRing>
        <View style={{ flex: 1, gap: 6 }}>
          {habits.length === 0 ? (
            <Text color="tertiary">Add a habit to start a streak.</Text>
          ) : (
            habits.slice(0, size === 'small' ? 2 : 5).map(({ h, logs }) => {
              const done = logs.has(today());
              return (
                <Pressable key={h.id} onPress={() => toggleHabit(os, h.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Icon name={done ? 'checkmark.circle' : 'circle'} size={22} color={done ? HABITS_COLOR : t.colors.textTertiary} />
                  <Text variant="subhead" style={{ flex: 1, textDecorationLine: done ? 'line-through' : 'none' }} numberOfLines={1}>
                    {h.title}
                  </Text>
                  <Text variant="caption" color="secondary">
                    🔥 {streak(logs)}
                  </Text>
                </Pressable>
              );
            })
          )}
        </View>
      </View>
    </Card>
  );
}

function HabitSection({ entity }: { entity: Entity<any>; ctx: LifeOSContext }) {
  const os = useOS();
  const logs = useLive((o) => habitLogs(o, entity.id, 91), [entity.id]);
  const days = lastNDays(91);
  const done = logs.has(today());
  const total = useLive((o) => o.entities.count('habit_log', { filter: { and: [{ field: 'data.habitId', op: 'eq', value: entity.id }] } }), [entity.id]);
  const last30 = lastNDays(30).filter((d) => logs.has(d)).length;
  return (
    <View style={{ gap: 16 }}>
      <Card style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row', gap: 16 }}>
          <View style={{ flex: 1 }}>
            <Stat value={`${streak(logs)}`} unit="day streak" small color={HABITS_COLOR} />
          </View>
          <View style={{ flex: 1 }}>
            <Stat value={`${Math.round((last30 / 30) * 100)}%`} label="Last 30 days" small />
          </View>
          <View style={{ flex: 1 }}>
            <Stat value={`${total}`} label="All time" small />
          </View>
        </View>
        <Pressable onPress={() => toggleHabit(os, entity.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: done ? HABITS_COLOR : HABITS_COLOR + '22', padding: 14, borderRadius: 12 }}>
          <Icon name={done ? 'checkmark.circle' : 'circle'} size={22} color={done ? '#fff' : HABITS_COLOR} />
          <Text variant="headline" color={done ? '#fff' : HABITS_COLOR}>
            {done ? 'Done today' : 'Mark done today'}
          </Text>
        </Pressable>
      </Card>
      <View>
        <SectionHeader title="Last 13 weeks" icon="calendar" color={HABITS_COLOR} />
        <Card style={{ alignItems: 'center' }}>
          <HeatGrid cells={days.map((d) => ({ key: d, level: logs.has(d) ? 1 : 0 }))} color={HABITS_COLOR} columns={13} size={18} gap={4} />
        </Card>
      </View>
    </View>
  );
}

const widgets: WidgetDef[] = [{ type: 'habits.today', module: 'habits', name: 'Habits today', icon: 'flame', sizes: ['small', 'medium', 'large'], defaultSize: 'medium', component: HabitsWidget }];

export const habitsModule: ModuleManifest = {
  overview: habitsOverview,
  id: 'habits',
  name: 'Habits',
  version: '1.0.0',
  description: 'Daily habits with streaks and a heat map.',
  icon: 'flame',
  color: HABITS_COLOR,
  entityTypes: [habitType, habitLogType],
  widgets,
  defaultWidgets: [{ type: 'habits.today', size: 'medium' }],
  quickActions: [{ id: 'habits.add', label: 'Habit', icon: 'flame', route: '/entity/habit/new' }],
  detailSections: [{ entityType: 'habit', key: 'habits.habit', title: 'Streak', component: HabitSection, order: 10 }],
  aiTools: [
    {
      name: 'habits_status',
      description: 'Active habits with whether each is done today and its current streak.',
      input: z.object({}),
      run: async (_i, os) => os.entities.query<HabitData>('habit', { filter: { and: [{ field: 'status', op: 'eq', value: 'active' }] } }).map((h) => { const logs = habitLogs(os, h.id, 60); return { id: h.id, title: h.title, doneToday: logs.has(today()), streak: streak(logs) }; }),
    },
    {
      name: 'log_habit',
      description: 'Mark a habit done (or undo) for a date (default today).',
      input: z.object({ habitId: z.string(), date: z.string().optional() }),
      confirm: true,
      run: async (i, os) => { const x = i as { habitId: string; date?: string }; toggleHabit(os, x.habitId, x.date ?? today()); return { ok: true }; },
    },
  ],
};
