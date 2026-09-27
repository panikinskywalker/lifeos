import type { LifeOSContext } from '@core/registry/context';
import { DAY_MS, isoOf, type ModuleOverview, type OverviewBlock } from '@core/dashboard/overview';
import { activeHabits, streakOf } from '@core/habits/habits';

/** Habits at a glance: done today, streaks, the last 12 weeks as a heat map, this week per habit. */
export function habitsOverview(os: LifeOSContext, now = Date.now()): ModuleOverview {
  const habits = os.entities.query<{ frequency?: string; targetPerWeek?: number }>('habit', { filter: { and: [{ field: 'status', op: 'neq', value: 'paused' }] } }, { limit: 100 });
  const from = isoOf(now - 83 * DAY_MS);
  const logs = os.entities.query<{ habitId: string; date: string }>('habit_log', { filter: { and: [{ field: 'data.date', op: 'gte', value: from }] } }, { limit: 20000 });
  const byDay = new Map<string, Set<string>>();
  for (const l of logs) {
    if (!byDay.has(l.data.date)) byDay.set(l.data.date, new Set());
    byDay.get(l.data.date)!.add(l.data.habitId);
  }
  const today = isoOf(now);
  const doneToday = byDay.get(today)?.size ?? 0;
  // Streaks respect how often each habit is meant to happen (weekdays skip weekends; weekly ones count weeks).
  const byId = new Map(activeHabits(os).map((h) => [h.id, h]));
  const streak = (id: string) => {
    const h = byId.get(id);
    if (!h) return 0;
    const done = new Set([...byDay.entries()].filter(([, set]) => set.has(id)).map(([d]) => d));
    return streakOf(h, done, now).count;
  };
  const streaks = habits.map((h) => ({ h, s: streak(h.id) })).sort((a, b) => b.s - a.s);
  const heat = Array.from({ length: 84 }, (_, i) => {
    const day = isoOf(now - (83 - i) * DAY_MS);
    return { day, value: habits.length ? (byDay.get(day)?.size ?? 0) / habits.length : null };
  });
  const monday = now - ((new Date(now).getDay() + 6) % 7) * DAY_MS;
  const weekDays = Array.from({ length: 7 }, (_, i) => isoOf(monday + i * DAY_MS)).filter((d) => d <= today);
  const blocks: OverviewBlock[] = [
    { kind: 'stats', items: [{ label: 'Done today', value: `${doneToday}/${habits.length}`, tone: habits.length && doneToday === habits.length ? 'ok' : undefined }, { label: 'Best streak', value: streaks[0] ? `${streaks[0].s} d` : '—', sub: streaks[0]?.h.title ?? null }] },
    { kind: 'heat', title: 'Last 12 weeks', days: heat },
  ];
  if (habits.length)
    blocks.push({
      kind: 'progress',
      title: 'This week',
      items: habits.map((h) => {
        const n = weekDays.filter((d) => byDay.get(d)?.has(h.id)).length;
        const target = h.data.targetPerWeek ?? (h.data.frequency === 'weekdays' ? 5 : h.data.frequency === 'weekly' ? 1 : 7);
        return { label: h.title, ratio: n / target, sub: `${n} of ${target} · streak ${streak(h.id)} d`, entityId: h.id, type: 'habit' };
      }),
    });
  return { card: { headline: habits.length ? `${doneToday}/${habits.length} today` : 'No habits yet', sub: streaks[0]?.s ? `best streak ${streaks[0].s} d · ${streaks[0].h.title}` : null, series: heat.slice(-7).map((d) => d.value), seriesFormat: 'percent' }, blocks };
}
