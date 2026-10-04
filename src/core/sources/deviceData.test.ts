import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBetterSqliteAdapter } from '../db/betterSqliteAdapter';
import { createLifeOS } from '../lifeos';
import { Registry } from '../registry/registry';
import type { LifeOSContext } from '../registry/context';
import { bus } from '../events/bus';
import { metricDays, saveHealthDays, saveUsageDays, setSourceState, sourceState, topApps, usageDays } from './deviceData';
import { measurementType, workoutType } from '../../modules/health/types';

let os: LifeOSContext;
beforeEach(async () => {
  bus.clear();
  os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules: [{ id: 'health', name: 'Health', version: '1', description: '', icon: 'x', color: '#000', objects: [measurementType, workoutType] }], registry: new Registry() });
});
afterEach(() => os.db.close());

describe('device data', () => {
  it('screen time: a day re-synced replaces itself; top apps over a range', () => {
    saveUsageDays(os, [{ day: '2026-09-25', totalMs: 3 * 3600_000, pickups: 60, apps: [{ package: 'com.whatsapp', label: 'WhatsApp', ms: 3600_000 }, { package: 'com.instagram.android', label: 'Instagram', ms: 2 * 3600_000 }] }]);
    saveUsageDays(os, [{ day: '2026-09-26', totalMs: 3600_000, apps: [{ package: 'com.whatsapp', label: 'WhatsApp', ms: 1800_000 }] }]);
    saveUsageDays(os, [{ day: '2026-09-26', totalMs: 2 * 3600_000, apps: [{ package: 'com.whatsapp', label: 'WhatsApp', ms: 5400_000 }] }]);
    expect(usageDays(os, '2026-09-25', '2026-09-26').map((d) => [d.day, d.totalMs / 3600_000])).toEqual([['2026-09-25', 3], ['2026-09-26', 2]]);
    expect(topApps(os, '2026-09-25', '2026-09-26').map((a) => [a.label, a.ms / 3600_000])).toEqual([['WhatsApp', 2.5], ['Instagram', 2]]);
  });

  it('Health Connect days → measurements and workouts, updated in place on re-sync', () => {
    expect(saveHealthDays(os, [{ day: '2026-09-26', steps: 4200.4, sleepMin: 432, restingHr: 58.6, workouts: [{ id: 'w1', type: 56, title: 'Morning run', start: 0, minutes: 31.5 }] }])).toBe(4);
    expect(saveHealthDays(os, [{ day: '2026-09-26', steps: 9100, sleepMin: 432, restingHr: 58.6, workouts: [{ id: 'w1', type: 56, title: 'Morning run', start: 0, minutes: 31.5 }] }])).toBe(0);
    expect(metricDays(os, 'steps', '2026-09-01', '2026-09-30')).toEqual([{ day: '2026-09-26', value: 9100 }]);
    expect(metricDays(os, 'sleep', '2026-09-01', '2026-09-30')).toEqual([{ day: '2026-09-26', value: 7.2 }]);
    expect(os.records.query('workout')[0]).toMatchObject({ title: 'Run', data: { kind: 'run', durationMin: 32, source: 'health_connect' } });
    expect(os.records.query('measurement')).toHaveLength(3);
  });

  it('source state', () => {
    setSourceState(os, 'sms', { enabled: true, lastSync: 5, addTotal: 3 });
    setSourceState(os, 'sms', { addTotal: 2, cursor: '100' });
    expect(sourceState(os, 'sms')).toMatchObject({ enabled: true, lastSync: 5, total: 5, cursor: '100' });
  });
});
