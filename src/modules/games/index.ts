import type { ModuleManifest } from '@core/registry/types';
import { GAMES_COLOR, gamesObjects } from './types';
import { gamesAiTools } from './aiTools';
import { turfLedgerSource } from './sources';

export * from './types';
export * from './pull';
export * from './lib';
export * from './sources';

/** games (docs/MODEL.md layer 2, R9a): the football you run in Turf Ledger, read into LifeOS. Writing back is R9b. */
export const gamesModule: ModuleManifest = {
  id: 'games',
  name: 'Games',
  version: '1.0.0',
  description: 'Your football from Turf Ledger — matches, who played, who paid, goals and leaders.',
  icon: 'target',
  color: GAMES_COLOR,
  dependencies: ['crm', 'places', 'finance'],
  objects: gamesObjects,
  aiTools: gamesAiTools,
  sources: [turfLedgerSource],
};
