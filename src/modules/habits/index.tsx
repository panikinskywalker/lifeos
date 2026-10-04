import { Pressable, View } from 'react-native';
import { z } from 'zod';
import type { ModuleManifest } from '@core/registry/types';
import type { Entity } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import { palette } from '@ui/theme/tokens';
import { useTheme } from '@ui/theme/ThemeProvider';
import { useLive, useOS } from '@ui/hooks';
import { Button, HeatMap, Icon, Ring, Section, StatTrio, Text } from '@ui/kit';
import { activeHabits, checkIn, doneDays, dueOn, findHabit, isoOf, streakOf, toggleCheckIn, type Habit } from '@core/habits/habits';
import { habitsOverview } from './overview';

export const HABITS_COLOR = palette.orange;
export * from './types';
import { habitLogType, habitType, type HabitData } from './types';
const today = () => isoOf(Date.now());
const DAY = 86_400_000;

/**
 * This week, Monday to Sunday: a row per habit, a circle per day — ticked
 * when done, joined to the next when you kept it going, faint on days it
 * isn't due, empty for days still to come. Tap any past day to fix it.
 */
export function HabitWeek({ limit = 8 }: { limit?: number }) {
  const os = useOS();
  const t = useTheme();
  const now = Date.now();
  const monday = (() => {
    const d = new Date(now);
    d.setHours(12, 0, 0, 0);
    return d.getTime() - ((d.getDay() + 6) % 7) * DAY;
  })();
  const week = Array.from({ length: 7 }, (_, i) => isoOf(monday + i * DAY));
  const rows = useLive((o) => activeHabits(o).map((h) => ({ h, done: doneDays(o, h.id, week[0]!) })), []);
  if (!rows.length) return <Text variant="caption" color="secondary">No habits yet — add one in Browse › Habits.</Text>;
  const size = 24;
  const gap = 4;
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const short = (t: number) => `${new Date(t).getDate()} ${MON[new Date(t).getMonth()]}`;
  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text variant="caption" color="secondary" style={{ flex: 1 }} numberOfLines={1}>
          {short(monday)} – {short(monday + 6 * DAY)}
        </Text>
        <View style={{ flexDirection: 'row' }}>
          {week.map((d, i) => (
            <View key={d} style={{ flexDirection: 'row' }}>
              <Text variant="labelMicro" color={d === today() ? 'primary' : 'secondary'} style={{ width: size, textAlign: 'center' }}>
                {new Date(`${d}T12:00:00`).toLocaleDateString('en-IN', { weekday: 'narrow' })}
              </Text>
              {i < 6 ? <View style={{ width: gap }} /> : null}
            </View>
          ))}
        </View>
      </View>
      {rows.slice(0, limit).map(({ h, done }) => (
        <View key={h.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text variant="label" style={{ flex: 1 }} numberOfLines={1}>{h.title}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {week.map((d, i) => {
              const on = done.has(d);
              const future = d > today();
              const due = dueOn(h, d);
              const joined = on && i < 6 && done.has(week[i + 1]!);
              return (
                <View key={d} style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on, disabled: future }}
                    accessibilityLabel={`${h.title}, ${d}`}
                    disabled={future}
                    onPress={() => toggleCheckIn(os, h.id, d)}
                    style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? HABITS_COLOR : future ? 'transparent' : t.tints.health.fill, borderWidth: future ? 1.5 : 0, borderColor: t.c.fg.tertiary, opacity: due || on ? 1 : 0.4 }}
                  >
                    {on ? <Icon name="check" size={14} color="#fff" /> : null}
                  </Pressable>
                  {i < 6 ? <View style={{ width: gap, height: 3, backgroundColor: joined ? HABITS_COLOR : 'transparent' }} /> : null}
                </View>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}

/** Habits due today, each a tap to tick, with its streak (the dashboard widget and Today's tile). */
export function HabitChecklist({ limit = 8 }: { limit?: number }) {
  const os = useOS();
  const t = useTheme();
  const rows = useLive(
    (o) =>
      activeHabits(o)
        .filter((h) => dueOn(h, today()))
        .map((h) => {
          const done = doneDays(o, h.id, isoOf(Date.now() - 400 * DAY));
          return { h, doneToday: done.has(today()), streak: streakOf(h, done) };
        }),
    [],
  );
  if (!rows.length) return <Text variant="caption" color="secondary">No habits yet — add one in Browse › Habits.</Text>;
  return (
    <View style={{ gap: 4 }}>
      {rows.slice(0, limit).map(({ h, doneToday, streak }) => (
        <Pressable key={h.id} accessibilityRole="checkbox" accessibilityState={{ checked: doneToday }} accessibilityLabel={`${h.title}, ${streak.count} ${streak.unit} streak`} onPress={() => toggleCheckIn(os, h.id, today())} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 }}>
          <Icon name={doneToday ? 'check-circle' : 'circle'} size={24} color={doneToday ? HABITS_COLOR : t.c.fg.tertiary} />
          <Text variant="label" style={{ flex: 1, textDecorationLine: doneToday ? 'line-through' : 'none' }} numberOfLines={1}>{h.title}</Text>
          {streak.count ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Icon name="flame" size={14} color={HABITS_COLOR} />
              <Text variant="caption" color="secondary">{streak.count}{streak.unit === 'week' ? ' wk' : ''}</Text>
            </View>
          ) : null}
        </Pressable>
      ))}
    </View>
  );
}

/** A habit's page: the streak, a big check-in, the last week (tap a day to fix it), 13 weeks as a heat map. */
function HabitSection({ entity }: { entity: Entity<any>; ctx: LifeOSContext }) {
  const os = useOS();
  const h: Habit = useLive((o) => activeHabits(o).find((x) => x.id === entity.id) ?? { id: entity.id, title: entity.title, frequency: (entity.data as HabitData).frequency ?? 'daily', perWeek: (entity.data as HabitData).targetPerWeek ?? 7 }, [entity.id, entity.updatedAt]);
  const done = useLive((o) => doneDays(o, entity.id, isoOf(Date.now() - 400 * DAY)), [entity.id]);
  const s = streakOf(h, done);
  const last30 = Array.from({ length: 30 }, (_, i) => isoOf(Date.now() - i * DAY)).filter((d) => dueOn(h, d));
  const rate = last30.length ? last30.filter((d) => done.has(d)).length / last30.length : 0;
  const week = Array.from({ length: 7 }, (_, i) => isoOf(Date.now() - (6 - i) * DAY));
  const doneToday = done.has(today());
  return (
    <View style={{ gap: 16 }}>
      <StatTrio stats={[{ label: 'Streak', value: `${s.count} ${s.unit === 'week' ? 'wk' : 'd'}`, tone: s.count ? 'ok' : undefined }, { label: 'Last 30 days', value: `${Math.round(rate * 100)}%` }, { label: 'All time', value: String(done.size) }]} />
      <Button title={doneToday ? 'Done today — tap to undo' : 'Done today'} icon={doneToday ? 'check-circle' : 'check'} variant={doneToday ? 'secondary' : 'primary'} onPress={() => toggleCheckIn(os, entity.id, today())} />
      <Section title="This week">
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          {week.map((d) => {
            const on = done.has(d);
            const due = dueOn(h, d);
            return (
              <Pressable key={d} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={d} onPress={() => toggleCheckIn(os, entity.id, d)} style={{ alignItems: 'center', gap: 6, opacity: due ? 1 : 0.4 }}>
                <Text variant="caption" color="secondary">{new Date(`${d}T12:00:00`).toLocaleDateString('en-IN', { weekday: 'narrow' })}</Text>
                <Ring progress={on ? 1 : 0} size={34} stroke={4} color={HABITS_COLOR}>
                  {on ? <Icon name="check" size={14} color={HABITS_COLOR} /> : null}
                </Ring>
              </Pressable>
            );
          })}
        </View>
      </Section>
      <Section title="Last 13 weeks">
        <HeatMap days={Array.from({ length: 91 }, (_, i) => { const d = isoOf(Date.now() - (90 - i) * DAY); return { day: d, value: done.has(d) ? 1 : dueOn(h, d) ? 0 : null }; })} color={HABITS_COLOR} accessibilityLabel={`${entity.title}, last 13 weeks`} />
      </Section>
      <Text variant="caption" color="tertiary" style={{ textAlign: 'center' }}>Saying “did {entity.title.toLowerCase()}” in a dump ticks it too.</Text>
    </View>
  );
}

export const habitsModule: ModuleManifest = {
  overview: habitsOverview,
  id: 'habits',
  name: 'Habits',
  version: '1.0.0',
  description: 'Daily habits with streaks and a heat map.',
  icon: 'flame',
  color: HABITS_COLOR,
  entityTypes: [habitType, habitLogType],
  quickActions: [{ id: 'habits.add', label: 'Habit', icon: 'flame', route: '/entity/habit/new' }],
  detailSections: [{ entityType: 'habit', key: 'habits.habit', title: 'Streak', component: HabitSection, order: 10 }],
  aiTools: [
    {
      name: 'habits_status',
      description: 'Active habits with whether each is done today and its current streak.',
      input: z.object({}),
      run: async (_i, os) =>
        activeHabits(os).map((h) => {
          const done = doneDays(os, h.id, isoOf(Date.now() - 400 * DAY));
          const s = streakOf(h, done);
          return { id: h.id, title: h.title, doneToday: done.has(today()), streak: `${s.count} ${s.unit}${s.count === 1 ? '' : 's'}` };
        }),
    },
    {
      name: 'habit_check_in',
      description: 'Tick a habit the user tracks as done for a day (default today). Name it as they said it.',
      input: z.object({ habit: z.string(), date: z.string().optional(), entityId: z.string().optional() }),
      run: async (i, os) => {
        const x = i as { habit: string; date?: string; entityId?: string };
        const h = x.entityId ? activeHabits(os).find((y) => y.id === x.entityId) : findHabit(os, x.habit);
        if (!h) return { error: `no habit called ${x.habit}` };
        const date = x.date ?? today();
        const logId = checkIn(os, h.id, date);
        return { logged: `${h.title} ✓ ${date === today() ? 'today' : date.slice(8) + '/' + date.slice(5, 7)}`, entityId: h.id, logId, already: !logId };
      },
    },
  ],
};
