/**
 * How long Today's numbers take on a big, realistic dataset (M5 performance
 * pass). Node is several times faster than the phone's JS engine, so the
 * budget here is ~150 ms for everything Today computes on open.
 *   npx tsx scripts/bench-today.ts
 */
import { createBetterSqliteAdapter } from '../src/core/db/betterSqliteAdapter';
import { createLifeOS } from '../src/core/lifeos';
import { Registry } from '../src/core/registry/registry';
import { saveHealthDays, saveUsageDays } from '../src/core/sources/deviceData';
import { metricSeries, peopleToCall, spendPace, upcoming } from '../src/core/dashboard/metrics';
import { doneToday, myDay, progress } from '../src/core/dashboard/day';
import { upkeep } from '../src/core/cycles/upkeep';
import { onThisDay } from '../src/core/almanac/almanac';
import { measurementType, workoutType } from '../src/modules/health/types';
import { accountType, subscriptionType, transactionType } from '../src/modules/finance/types';
import { groupType, personType } from '../src/modules/crm/types';
import { eventType, goalType, projectType, taskType } from '../src/modules/projects/types';
import { tripType } from '../src/modules/travel/types';
import { deliveryType } from '../src/modules/deliveries/types';
import { habitLogType, habitType } from '../src/modules/habits/types';
import { financeOverview } from '../src/boards/finance/overview';
import { peopleOverview } from '../src/boards/crm/overview';
import { projectsOverview } from '../src/boards/projects/overview';
import { habitsOverview } from '../src/boards/habits/overview';
import { travelOverview } from '../src/boards/travel/overview';
import { deliveriesOverview } from '../src/boards/deliveries/overview';

const DAY = 86_400_000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

async function main() {
  const os = await createLifeOS({
    db: createBetterSqliteAdapter(':memory:'),
    modules: [{ id: 'all', name: 'all', version: '1', description: '', icon: 'x', color: '#000', objects: [measurementType, workoutType, accountType, subscriptionType, transactionType, personType, groupType, eventType, taskType, projectType, goalType, tripType, deliveryType, habitType, habitLogType] }],
    registry: new Registry(),
  });
  const now = Date.now();
  const cats = ['food', 'groceries', 'transport', 'shopping', 'utilities', 'entertainment', 'health'];
  os.db.transaction(() => {
    for (let i = 0; i < 5000; i++) os.records.create({ object: 'transaction', data: { amount: 50 + ((i * 37) % 3000), kind: i % 25 ? 'expense' : 'income', category: cats[i % cats.length], merchant: `Shop ${i % 300}`, date: iso(now - (i % 180) * DAY) } });
    for (let i = 0; i < 300; i++) os.records.create({ object: 'person', title: `Person ${i}`, data: { contactEvery: i % 3 ? undefined : 14, lastContactAt: iso(now - (i % 40) * DAY), birthday: `1990-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 27) + 1).padStart(2, '0')}` } });
    for (let i = 0; i < 400; i++) os.records.create({ object: 'task', title: `Task ${i}`, status: i % 3 ? 'todo' : 'done', data: { dueDate: iso(now + ((i % 30) - 10) * DAY), completedAt: i % 3 ? undefined : now - (i % 10) * DAY } });
    for (let i = 0; i < 200; i++) os.records.create({ object: 'event', title: `Event ${i}`, data: { startAt: now + ((i % 60) - 30) * DAY + (i % 10) * 3_600_000 } });
    for (let i = 0; i < 150; i++) os.records.create({ object: 'delivery', data: { item: `Parcel ${i}`, status: i % 10 ? 'delivered' : 'shipped', deliveredOn: iso(now - (i % 90) * DAY) } });
    for (let h = 0; h < 6; h++) {
      const habit = os.records.create({ object: 'habit', title: `Habit ${h}`, data: { frequency: 'daily' } });
      for (let d = 0; d < 120; d++) if ((d + h) % 3) os.records.create({ object: 'habit_log', data: { habitId: habit.id, date: iso(now - d * DAY) } });
    }
  });
  saveHealthDays(os, Array.from({ length: 180 }, (_, i) => ({ day: iso(now - i * DAY), steps: 4000 + ((i * 97) % 8000), sleepMin: 360 + (i % 90), restingHr: 60 + (i % 8) })));
  saveUsageDays(os, Array.from({ length: 30 }, (_, i) => ({ day: iso(now - i * DAY), totalMs: (3 + (i % 3)) * 3_600_000, apps: [] })));

  const time = (name: string, f: () => unknown) => {
    const t0 = performance.now();
    f();
    const ms = performance.now() - t0;
    rows.push([name, ms]);
  };
  const rows: Array<[string, number]> = [];
  let u = upkeep(os);
  time('upkeep', () => (u = upkeep(os)));
  time('myDay', () => myDay(os, now, u));
  time('progress', () => progress(os, now));
  time('doneToday', () => doneToday(os, now));
  time('steps (week)', () => metricSeries(os, 'steps', 'week', now));
  time('sleep (week)', () => metricSeries(os, 'sleep', 'week', now));
  time('screen (week)', () => metricSeries(os, 'screen', 'week', now));
  time('spendPace', () => spendPace(os, now));
  time('upcoming', () => upcoming(os, 5, now, 14, u));
  time('peopleToCall', () => peopleToCall(os, 3, now, u));
  time('onThisDay', () => onThisDay(os));
  for (const [n, f] of [['finance', financeOverview], ['people', peopleOverview], ['projects', projectsOverview], ['habits', habitsOverview], ['travel', travelOverview], ['deliveries', deliveriesOverview]] as const) time(`area: ${n}`, () => f(os, now, { cardOnly: true } as never));
  const total = rows.reduce((n, [, ms]) => n + ms, 0);
  for (const [n, ms] of rows.sort((a, b) => b[1] - a[1])) console.log(`${n.padEnd(18)} ${ms.toFixed(1).padStart(7)} ms`);
  console.log(`${'TOTAL'.padEnd(18)} ${total.toFixed(1).padStart(7)} ms`);
}
void main();
