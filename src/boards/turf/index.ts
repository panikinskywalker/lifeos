import type { BoardManifest } from '@core/registry/types';
import { TurfGame, TurfGames, TurfHome, TurfPlayers, TurfVenues } from './screens';

/** Turf (docs/MODEL.md layer 3; R9): the first user board, over games + crm + places + finance. A Browse › Boards tile. */
export const turfBoard: BoardManifest = {
  id: 'turf',
  name: 'Turf',
  icon: 'target',
  color: 'green',
  placement: 'browse',
  screens: [
    { key: 'index', title: 'Turf', component: TurfHome },
    { key: 'games', title: 'Games', component: TurfGames },
    { key: 'game', title: 'Game', component: TurfGame },
    { key: 'players', title: 'Players', component: TurfPlayers },
    { key: 'venues', title: 'Venues', component: TurfVenues },
  ],
};
