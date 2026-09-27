/** Habits (M5): check-ins, streaks by frequency, and dumps that tick them. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBetterSqliteAdapter } from '@core/db/betterSqliteAdapter';
import { createLifeOS } from '@core/lifeos';
import { Registry } from '@core/registry/registry';
import type { LifeOSContext } from '@core/registry/context';
import { bus } from '@core/events/bus';
import { activeHabits, checkIn, doneDays, habitSaid, streakOf, toggleCheckIn } from '@core/habits/habits';
import { extractDump } from '@core/dumps/extract';
import { habitLogType, habitType } from './habits/types';
import { z } from 'zod';

let os: LifeOSContext;
const NOW = Date.parse('2026-09-27T20:00:00'); // a Sunday
const day = (n: number) => {
  const d = new Date(NOW);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
beforeEach(async () => {
  bus.clear();
  // The check-in tool as the habits module registers it (its UI file needs React Native).
  const tool = {
    name: 'habit_check_in',
    description: '',
    input: z.object({ habit: z.string(), date: z.string().optional(), entityId: z.string().optional() }),
    run: async (i: unknown, o: LifeOSContext) => {
      const x = i as { habit: string; date?: string; entityId?: string };
      const h = activeHabits(o).find((y) => y.id === x.entityId) ?? activeHabits(o).find((y) => y.title.toLowerCase().includes(x.habit.toLowerCase()));
      if (!h) return { error: 'no habit' };
      const logId = checkIn(o, h.id, x.date ?? day(0));
      return { logged: `${h.title} ✓`, entityId: h.id, logId };
    },
  };
  os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules: [{ id: 'habits', name: 'Habits', version: '1', description: '', icon: 'x', color: '#000', entityTypes: [habitType, habitLogType], aiTools: [tool as never] }], registry: new Registry() });
});
afterEach(() => os.db.close());

describe('habits', () => {
  it('streaks: daily in a row; today not done yet doesn’t break it; a gap does', () => {
    const yoga = os.entities.create({ type: 'habit', title: 'Yoga', data: { frequency: 'daily' } });
    for (const n of [-1, -2, -3, -5]) checkIn(os, yoga.id, day(n));
    const h = activeHabits(os)[0]!;
    expect(streakOf(h, doneDays(os, yoga.id, day(-30)), NOW)).toEqual({ count: 3, unit: 'day' });
    toggleCheckIn(os, yoga.id, day(0));
    expect(streakOf(h, doneDays(os, yoga.id, day(-30)), NOW).count).toBe(4);
    toggleCheckIn(os, yoga.id, day(0)); // undo
    expect(doneDays(os, yoga.id, day(0)).has(day(0))).toBe(false);
  });

  it('weekday habits skip weekends; weekly habits count weeks that met the target', () => {
    const standup = os.entities.create({ type: 'habit', title: 'Journal', data: { frequency: 'weekdays' } });
    // Mon 21 – Fri 25 Sep done; Sat/Sun not needed.
    for (const n of [-6, -5, -4, -3, -2]) checkIn(os, standup.id, day(n));
    const h = activeHabits(os).find((x) => x.id === standup.id)!;
    expect(streakOf(h, doneDays(os, standup.id, day(-30)), NOW).count).toBe(5);
    const gym = os.entities.create({ type: 'habit', title: 'Gym', data: { frequency: 'weekly', targetPerWeek: 3 } });
    for (const n of [-1, -3, -5, -8, -10, -12, -15]) checkIn(os, gym.id, day(n));
    const g = activeHabits(os).find((x) => x.id === gym.id)!;
    expect(streakOf(g, doneDays(os, gym.id, day(-60)), NOW)).toEqual({ count: 2, unit: 'week' });
  });

  it('what counts as having done it: "did yoga", "went for a run", yesterday; not plans or misses', () => {
    os.entities.create({ type: 'habit', title: 'Yoga', data: {} });
    os.entities.create({ type: 'habit', title: 'Run', data: {} });
    os.entities.create({ type: 'habit', title: 'Read 20 pages', data: {} });
    expect(habitSaid(os, 'did yoga this morning', NOW)).toMatchObject({ habit: { title: 'Yoga' }, date: day(0) });
    expect(habitSaid(os, 'went for a run yesterday', NOW)).toMatchObject({ habit: { title: 'Run' }, date: day(-1) });
    expect(habitSaid(os, 'read for an hour before bed', NOW)).toMatchObject({ habit: { title: 'Read 20 pages' } });
    expect(habitSaid(os, 'skipped yoga today', NOW)).toBeNull();
    expect(habitSaid(os, 'I will run tomorrow', NOW)).toBeNull();
    expect(habitSaid(os, 'yoga class was full', NOW)).toBeNull();
  });

  it('a dump ticks the habit on the phone, logged in To check with Undo', async () => {
    const yoga = os.entities.create({ type: 'habit', title: 'Yoga', data: {} });
    const d = os.dumps.add({ body: 'Did yoga. Then had a long call with mom.', createdAt: NOW });
    await extractDump(os, d.id, null);
    expect(doneDays(os, yoga.id, day(-1)).has(day(0))).toBe(true);
    expect(os.dumps.extractions(d.id).map((x) => x.label)).toContain('Yoga ✓');
  });
});
