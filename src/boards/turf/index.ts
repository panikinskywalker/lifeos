import type { BoardManifest } from '@core/registry/types';
import { TurfHome } from './home';
import { TurfGames } from './games';
import { TurfGame } from './game';
import { TurfPlayers } from './players';
import { TurfVenues } from './venues';
import { TurfMatchForm } from './match';
import { TurfPickTeams } from './teams';
import { TurfAudit, TurfDues } from './dues';
import { TurfSubmission } from './submission';
import { TurfPlayer, TurfPlayerEdit, TurfStatsCard } from './player';
import { TurfLeaders } from './leaders';
import { TurfLogStats } from './stats';
import { TurfVenueEdit } from './venue-edit';
import { SmsAskCard, SmsPaidCard, SubmissionCard } from './checkcards';

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
    { key: 'match', title: 'Match', component: TurfMatchForm },
    { key: 'teams', title: 'Pick teams', component: TurfPickTeams },
    { key: 'stats', title: 'Log stats', component: TurfLogStats },
    { key: 'dues', title: 'Dues', component: TurfDues },
    { key: 'audit', title: 'Audit log', component: TurfAudit },
    { key: 'leaders', title: 'Leaders', component: TurfLeaders },
    { key: 'player', title: 'Player', component: TurfPlayer },
    { key: 'card', title: 'Stats card', component: TurfStatsCard },
    { key: 'player-edit', title: 'Edit player', component: TurfPlayerEdit },
    { key: 'venue', title: 'Edit venue', component: TurfVenueEdit },
    { key: 'submission', title: 'Profile submission', component: TurfSubmission },
    { key: 'players', title: 'Players', component: TurfPlayers },
    { key: 'venues', title: 'Venues', component: TurfVenues },
  ],
  // To check cards for Turf's own filings (R9c.6).
  checkCards: { 'turf-payment': SmsPaidCard, 'turf-payment-ask': SmsAskCard, 'turf-submission': SubmissionCard },
};
