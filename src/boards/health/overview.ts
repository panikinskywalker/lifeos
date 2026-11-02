import type { LifeOSContext } from '@core/registry/context';
import { compareMetric, daily, formatMetric, isoDay } from '@core/dashboard/metrics';
import { DAY_MS, type ModuleOverview, type OverviewBlock } from '@core/dashboard/overview';

/** Body at a glance (Today's card): today's steps, last night's sleep, steps against your usual week. */
export function healthOverview(os: LifeOSContext, now = Date.now()): ModuleOverview {
  const today = isoDay(now);
  const from = isoDay(now - 6 * DAY_MS);
  const steps = daily(os, 'steps', from, today);
  const sleep = daily(os, 'sleep', isoDay(now - DAY_MS), today);
  const series = Array.from({ length: 7 }, (_, i) => steps.get(isoDay(now - (6 - i) * DAY_MS)) ?? null);
  const s = steps.get(today);
  const lastNight = sleep.get(today) ?? sleep.get(isoDay(now - DAY_MS));
  const usual = compareMetric(os, 'steps', now).vsUsual;
  const vs = usual != null && Math.abs(usual) >= 0.05 ? `${Math.round(Math.abs(usual) * 100)}% ${usual > 0 ? 'above' : 'below'} your usual week` : null;
  const blocks: OverviewBlock[] = [];
  return {
    card: { headline: s != null ? `${Math.round(s).toLocaleString('en-IN')} steps` : 'No steps yet', sub: [lastNight != null ? `slept ${formatMetric('sleep', lastNight, os.format.currency)}` : null, vs].filter(Boolean).join(' · ') || null, series, seriesFormat: 'number' },
    blocks,
  };
}
