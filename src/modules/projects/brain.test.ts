import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBetterSqliteAdapter } from '@core/db/betterSqliteAdapter';
import { createLifeOS } from '@core/lifeos';
import { Registry } from '@core/registry/registry';
import type { LifeOSContext } from '@core/registry/context';
import { bus } from '@core/events/bus';
import { answerNudge, fileNudge, runPass, upkeepCandidates } from '@core/brain';
import { crmModule } from '../crm';
import { travelModule } from '../travel';
import { comingUp, projectsBrain, projectsModule, type TaskData } from '.';

/** What Projects brings the brain (layer 8, slice 6): overdue tasks, and Events coming up that need you. */

const DAY = 86_400_000;
const HOUR = 3_600_000;
const NOW = new Date(new Date().setHours(10, 0, 0, 0)).getTime(); // 10 am today
const day = (n: number) => {
  const d = new Date(NOW + n * DAY);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const at = (days: number, hour: number) => new Date(new Date(NOW + days * DAY).setHours(hour, 0, 0, 0)).getTime();
let os: LifeOSContext;
beforeEach(async () => {
  bus.clear();
  os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules: [crmModule, travelModule, projectsModule], registry: new Registry() });
});
afterEach(() => os.db.close());

const task = (title: string, due: string, priority = 'medium', repeat?: string) => os.records.create<TaskData>({ object: 'task', title, status: 'todo', data: { dueDate: due, priority, repeat } as TaskData });
const event = (title: string, kind: string, startAt: number, extra: Record<string, unknown> = {}) => os.records.create({ object: 'event', title, data: { kind, startAt, ...extra } });

describe('Projects’ candidates', () => {
  it('an open task past its due day, longest late first; urgent only when marked urgent; Upkeep leaves tasks to Projects', () => {
    const lease = task('Send the lease', day(-3), 'high');
    task('Pay the maid', day(-1), 'urgent');
    task('Due today', day(0));
    task('Later', day(4));
    const c = projectsBrain.candidates(os, NOW);
    expect(c.map((x) => [x.title, x.kind, x.shape, x.yes, !!x.urgent, x.line])).toEqual([
      ['Send the lease', 'due', 'ask', 'Done', false, 'Send the lease: 3 days late'],
      ['Pay the maid', 'due', 'ask', 'Done', true, 'Pay the maid: 1 day late'],
    ]);
    expect(c[0]!.record).toEqual({ task: 'Send the lease', project: null, due: day(-3), days_late: 3, priority: 'high', repeats: false });
    // Upkeep's key for the same Due Cycle.
    expect(c[0]!.key).toBe(`upkeep:${os.cycles.forEntity(lease.id)[0]!.id}:${os.cycles.forEntity(lease.id)[0]!.nextDueAt}`);
    expect(upkeepCandidates(os, NOW)).toEqual([]);
  });

  it('Done ticks it; a repeating one stays open and its Due moves on', () => {
    const once = task('Send the lease', day(-3));
    const weekly = task('Water the plants', day(-2), 'medium', 'week');
    for (const c of projectsBrain.candidates(os, NOW)) answerNudge(os, fileNudge(os, 'projects', c, { passId: 'p', line: c.line, at: NOW }).id, 'yes');
    expect(os.records.get(once.id)!.status).toBe('done');
    expect(os.records.get(weekly.id)!.status).toBe('todo');
    expect(os.records.get<TaskData>(weekly.id)!.data.dueDate! > day(-2)).toBe(true);
  });

  it('coming up: today and tomorrow, kinds that need you, not on a trip, not already started', () => {
    event('Dinner at Bombay Canteen', 'dinner', at(1, 20), { location: 'Lower Parel', personIds: [] });
    event('Standup', 'meeting', at(1, 9));
    event('Dentist', 'appointment', NOW + 3 * HOUR);
    event('Breakfast', 'dinner', NOW - HOUR);
    event('Concert', 'concert', at(3, 19));
    const trip = os.records.create({ object: 'trip', title: 'Goa', data: { destination: 'Goa' } });
    event('Flight to Goa', 'flight', at(1, 7), { tripId: trip.id });
    const c = comingUp(os, NOW);
    expect(c.map((x) => [x.title, x.kind, x.shape, x.yes, !!x.urgent])).toEqual([
      ['Dentist', 'coming up', 'ask', 'Open', true],
      ['Dinner at Bombay Canteen', 'coming up', 'ask', 'Open', false],
    ]);
    expect(c[0]!.line).toBe('Dentist: today 1 pm');
    expect(c[1]!.line).toBe('Dinner at Bombay Canteen: tomorrow 8 pm, Lower Parel');
    expect(c[1]!.record).toEqual({ event: 'Dinner at Bombay Canteen', kind: 'dinner', when: 'tomorrow 8 pm', where: 'Lower Parel', people: 0 });
    const n = fileNudge(os, 'projects', c[1]!, { passId: 'p', line: c[1]!.line, at: NOW });
    expect(answerNudge(os, n.id, 'yes')).toEqual({ open: `/entity/event/${c[1]!.subjectId}` });
  });

  it('a pass files Projects’ two, urgent first', async () => {
    task('Send the lease', day(-3));
    task('Book the plumber', day(-5));
    event('Dentist', 'appointment', NOW + 2 * HOUR);
    const r = await runPass(os, { pass: 'morning', model: null, now: NOW });
    expect(r.filed.filter((n) => n.module === 'projects').map((n) => n.title)).toEqual(['Dentist', 'Book the plumber']);
  });
});
