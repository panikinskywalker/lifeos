import React from 'react';
import type { LifeOSContext } from '@core/registry/context';
import { PrepScreen } from './prep';

/**
 * Packing (R7d) now lives in Prep › Packing (the trip template's JP-Pack):
 * the clothes in their four states, the things, the departure-day check and
 * Pack. Old links to /module/travel/pack (the brain's Pack nudge) land there.
 */
export function PackScreen({ ctx, params }: { ctx: LifeOSContext; params: Record<string, string> }) {
  return <PrepScreen ctx={ctx} params={{ ...params, tab: 'packing' }} />;
}
