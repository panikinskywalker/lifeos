import type { ModuleManifest } from '@core/registry/types';
import { GAMES_COLOR, gamesObjects } from './types';
import { gamesAiTools } from './aiTools';
import { turfWebSource } from './sources';

export * from './types';
export * from './sync';
export * from './lib';
export * from './sources';

/** games (docs/MODEL.md layer 2; R9a, R9c): the football you run in Turf web, synced into LifeOS. Sending changes back is R9c.2. */
export const gamesModule: ModuleManifest = {
  id: 'games',
  name: 'Games',
  version: '1.0.0',
  description: 'Your football from Turf web — matches, who played, who paid, goals and leaders.',
  icon: 'target',
  color: GAMES_COLOR,
  dependencies: ['crm', 'places', 'finance'],
  objects: gamesObjects,
  aiTools: gamesAiTools,
  sources: [turfWebSource],
};
