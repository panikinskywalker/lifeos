import type { BrainDef, Candidate } from '@core/brain/contract';
import type { LifeOSContext } from '@core/registry/context';
import { isoDay } from '@core/dashboard/metrics';
import type { MeasurementData } from './types';

/**
 * What Body brings the brain (docs/MODEL.md layer 8). Of the four kinds only
 * *due* fits: a **weigh-in**, when you weigh yourself by hand (three times or
 * more) and it has been twice your usual gap, at least a week. Health
 * Connect's readings come on their own and need nothing from you, so they
 * offer nothing. Yes opens the Measurement form with weight picked. What
 * leaves: the days since and your usual gap, never the weight itself.
 */

const DAY = 86_400_000;
const at = (day: string) => new Date(`${day}T12:00:00`).getTime();

function weighIn(os: LifeOSContext, now: number): Candidate[] {
  if (!os.registry.objects.has('measurement')) return [];
  const mine = os.records
    .query<MeasurementData>('measurement', { filter: { and: [{ field: 'data.metric', op: 'eq', value: 'weight' }, { field: 'data.date', op: 'lte', value: isoDay(now) }] }, sort: [{ field: 'data.date', dir: 'asc' }] }, { limit: 400 })
    .filter((m) => m.data.source !== 'health_connect');
  if (mine.length < 3) return [];
  const days = [...new Set(mine.map((m) => m.data.date))];
  const gaps = days.slice(1).map((d, i) => Math.round((at(d) - at(days[i]!)) / DAY)).sort((a, b) => a - b);
  const usual = gaps.length ? gaps[gaps.length >> 1]! : 7;
  const last = days[days.length - 1]!;
  const since = Math.round((at(isoDay(now)) - at(last)) / DAY);
  if (since < Math.max(7, usual * 2)) return [];
  return [
    {
      key: `health:weigh:${last}`,
      kind: 'due',
      shape: 'ask',
      route: '/module/health/weight',
      title: 'Weigh-in',
      line: `${since} days since you last weighed yourself`,
      record: { days_since_weigh_in: since, usual_gap_days: usual },
      rank: 20 - Math.min(since, 19),
      yes: 'Log weight',
      payload: { what: 'weigh' },
    },
  ];
}

export const healthBrain: BrainDef = {
  candidates: (os, now) => weighIn(os, now),
  act: (_os, verb) => (verb === 'yes' ? { open: '/entity/measurement/new?metric=weight' } : undefined),
  skills: [{ name: 'Body', body: 'Health nudges are gentle: never comment on a weight, a sleep or a number of steps as good or bad. A weigh-in is only a reminder that it has been a while.' }],
};
