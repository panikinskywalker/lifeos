import type { ModuleManifest } from '@core/registry/types';
import { GAMES_COLOR, gamesObjects } from './types';
import { gamesAiTools } from './aiTools';
import { gamesBrain } from './brain';
import { turfWebSource } from './sources';
import { bus } from '@core/events/bus';
import { matchTransaction } from './smsMatch';

export * from './types';
export { gamesBrain } from './brain';
export * from './sync';
export * from './lib';
export * from './sources';
export * from './payments';
export * from './changes';
export * from './rules';
export { rateSquad, nightsFor, matchRating, baseOverall, faceStats, band, positionCode, cardValue, RATINGS_VERSION, type PlayerRating, type SquadRatings, type RatedNight, type RatedPlayer, type RatedGame, type FaceStats } from './ratings';
export * from './kits';
export * from './teams';
export * from './leaders';
export * from './money';
export * from './inbox';
export * from './smsMatch';
export { computeDues, type Dues, type DuePerson, type DueGame, type ShareRow } from './dues';
export { rupees, kitEmoji, statsCardText, leaderboardText as leaderboardTextOf } from './messages';
export { generateBestBalance, calculateChemistry, playerPositionCode, type BalanceResult, type RatingPlayer, type RatingGame } from './balance';

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
  brain: gamesBrain,
  sources: [turfWebSource],
  // A share paid by SMS (R9c.6): every money-in Transaction finance files is checked against the open shares.
  onStart: (os) => {
    bus.on('entity.created', ({ entity }) => {
      if (entity.object !== 'transaction') return;
      try {
        matchTransaction(os, entity.id);
      } catch (e) {
        console.warn('[turf] SMS share match failed', e);
      }
    });
  },
};
