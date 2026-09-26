import type { LifeOSContext } from '@core/registry/context';
import { daily, formatMetric, isoDay } from '@core/dashboard/metrics';
import { DAY_MS, type ModuleOverview, type OverviewBlock } from '@core/dashboard/overview';

/** Body at a glance (Today's card; the Health page itself is one section per metric). */
export function healthOverview(os: LifeOSContext, now = Date.now()): ModuleOverview {
  const today = isoDay(now);
  const from = isoDay(now - 6 * DAY_MS);
  const steps = daily(os, 'steps', from, today);
  const sleep = daily(os, 'sleep', isoDay(now - DAY_MS), today);
  const series = Array.from({ length: 7 }, (_, i) => steps.get(isoDay(now - (6 - i) * DAY_MS)) ?? null);
  const s = steps.get(today);
  const lastNight = sleep.get(today) ?? sleep.get(isoDay(now - DAY_MS));
  const blocks: OverviewBlock[] = [];
  return {
    card: { headline: s != null ? `${Math.round(s).toLocaleString('en-IN')} steps` : 'No steps yet', sub: lastNight != null ? `slept ${formatMetric('sleep', lastNight, os.format.currency)}` : null, series, seriesFormat: 'number' },
    blocks,
  };
}
