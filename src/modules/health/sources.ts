import type { SourceDef } from '@core/registry/types';
import { saveUsageDays, sourceState, usageDays } from '@core/sources/deviceData';
import { isoDay } from '@core/dashboard/metrics';
import { saveHealthDays } from './healthConnect';

/**
 * The sources that feed Body (docs/MODEL.md layer 4; R6). Each reads the
 * phone through the device bridge (os.device.health / usage), as crm's
 * contacts and projects' calendar do; the native calls stay in platform.
 * Both are `readings` sources that file their own records and report how
 * many are new. A first sync looks back further; after that, from the day
 * before the last sync (a day's totals grow until it ends).
 */

const DAY = 86_400_000;
/** How far back a first sync reads. */
export const HISTORY = { healthDays: 90, usageDays: 30 };

/** From the start of the day before the last sync, or `firstDays` back on the first. */
export function readFrom(lastSync: number | null, now: number, firstDays: number): number {
  const from = new Date(lastSync ? Math.min(lastSync, now - DAY) - DAY : now - firstDays * DAY);
  from.setHours(0, 0, 0, 0);
  return from.getTime();
}

/** Health Connect: steps, sleep, heart rate, weight and workouts. */
export const healthSource: SourceDef = {
  id: 'health',
  label: 'Health Connect',
  modules: ['health'],
  permission: 'Health Connect',
  kind: 'readings',
  available: async (os) => (await os.device?.health?.access()) === 'granted',
  sync: async (os) => {
    const hc = os.device?.health;
    if (!hc) return { filed: 0 };
    const now = Date.now();
    return { filed: saveHealthDays(os, await hc.read(readFrom(sourceState(os, 'health').lastSync, now, HISTORY.healthDays), now)) };
  },
};

/** Usage access: screen time per day and per app, kept in core's usage tables (layer 2, *Body*). */
export const usageSource: SourceDef = {
  id: 'usage',
  label: 'Screen time',
  modules: ['health'],
  permission: 'Usage access',
  kind: 'readings',
  available: async (os) => (await os.device?.usage?.access()) === 'granted',
  sync: async (os) => {
    const u = os.device?.usage;
    if (!u) return { filed: 0 };
    const now = Date.now();
    const from = readFrom(sourceState(os, 'usage').lastSync, now, HISTORY.usageDays);
    const days = await u.read(from, now);
    const had = new Set(usageDays(os, isoDay(from), isoDay(now)).map((d) => d.day));
    saveUsageDays(os, days);
    return { filed: days.filter((d) => !had.has(d.day)).length };
  },
};

export const healthSources: SourceDef[] = [healthSource, usageSource];
