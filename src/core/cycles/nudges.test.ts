import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createBetterSqliteAdapter } from '../db/betterSqliteAdapter';
import { createLifeOS } from '../lifeos';
import { Registry } from '../registry/registry';
import type { LifeOSContext } from '../registry/context';
import type { ModuleManifest } from '../registry/types';
import { bus } from '../events/bus';
import { cycleNudges } from './nudges';

const d = (s: string, h = 10) => new Date(`${s}T${String(h).padStart(2, '0')}:00:00`).getTime();
const plain = (type: string) => ({ type, module: 'm', label: type, labelPlural: type, icon: 'x', schema: z.object({ name: z.string() }), fields: [], computeTitle: (x: Record<string, unknown>) => String(x.name) });
const mod: ModuleManifest = { id: 'm', name: 'M', version: '1', description: '', icon: 'x', color: '#000', objects: [plain('subscription'), plain('routine'), plain('vehicle'), plain('person')] };

let os: LifeOSContext;
beforeEach(async () => {
  bus.clear();
  os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules: [mod], registry: new Registry() });
});
afterEach(() => os.db.close());

describe('cycle nudges', () => {
  it('lead-window and due-day nudges at 9:00 in PRODUCT phrasing; late items nudge next morning', () => {
    const now = d('2026-09-23', 20); // Wed 8 pm
    const jio = os.records.create({ type: 'subscription', data: { name: 'Jio' } });
    os.cycles.create({ entityId: jio.id, name: 'Renewal', kind: 'fixed', everyN: 84, everyUnit: 'day', nextDueAt: d('2026-09-29'), leadDays: 3 });
    const laundry = os.records.create({ type: 'routine', data: { name: 'Laundry' } });
    os.cycles.create({ entityId: laundry.id, name: 'Laundry', kind: 'interval', everyN: 4, everyUnit: 'day', nextDueAt: d('2026-09-21') });
    const dad = os.records.create({ type: 'person', data: { name: 'Dad' } });
    os.cycles.create({ entityId: dad.id, name: 'Keep in touch', kind: 'interval', everyN: 7, everyUnit: 'day', lastDoneAt: d('2026-09-14'), template: 'person.contact' });

    const n = cycleNudges(os, now);
    const fmt = (x: { at: number; body: string }) => `${new Date(x.at).getDate()} ${new Date(x.at).getHours()}h ${x.body}`;
    expect(n.map(fmt)).toEqual([
      '24 9h Laundry is 3 days late',
      expect.stringMatching(/^24 9h Haven’t been in touch with Dad in \d+ days$/),
      '26 9h Jio runs out in 3 days',
      '29 9h Jio renews today',
    ]);
    expect(new Set(n.map((x) => x.key)).size).toBe(n.length);
  });

  it('meter cycles nudge when close; snoozed ones wait', () => {
    const now = d('2026-09-23', 8);
    const car = os.records.create({ type: 'vehicle', data: { name: 'Creta' } });
    os.cycles.logMeter(car.id, 29600);
    os.cycles.create({ entityId: car.id, name: 'Service', kind: 'meter', meterEvery: 10000, nextDueMeter: 30000 });
    const plants = os.records.create({ type: 'routine', data: { name: 'Water plants' } });
    const c = os.cycles.create({ entityId: plants.id, name: 'Water plants', kind: 'interval', everyN: 3, everyUnit: 'day', nextDueAt: d('2026-09-23') });
    os.cycles.snooze(c.id, d('2026-09-25', 9));
    const n = cycleNudges(os, now);
    expect(n[0]).toMatchObject({ body: 'Creta: service due 400 km', at: d('2026-09-23', 9) });
    expect(n.find((x) => x.entityId === plants.id)!.at).toBeGreaterThanOrEqual(d('2026-09-25', 9));
  });
});
