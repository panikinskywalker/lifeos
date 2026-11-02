import type { BoardManifest } from '@core/registry/types';
import { healthBoard } from './health';
import { placesBoard } from './places';
import { assetsBoard } from './assets';
import { deliveriesBoard } from './deliveries';
import { documentsBoard } from './documents';
import { inventoryBoard } from './inventory';
import { knowledgeBoard } from './knowledge';
import { crmBoard } from './crm';
import { travelBoard } from './travel';
import { habitsBoard } from './habits';
import { projectsBoard } from './projects';
import { financeBoard } from './finance';
import { automationBoard } from './automation';
import { turfBoard } from './turf';
import { todayBoard } from './today';
import { timeBoard } from './time';
import { activityBoard } from './activity';

/**
 * The boards (docs/MODEL.md §3): what you see on screen. Companion boards
 * (placement 'module') carry a module's Overview, quick actions and record
 * overrides; bar boards (Today, Upkeep) and browse boards (Automations, Turf…)
 * connect modules. Boards register after modules; adding one = one line here.
 */
export const installedBoards: BoardManifest[] = [
  healthBoard,
  placesBoard,
  assetsBoard,
  deliveriesBoard,
  documentsBoard,
  inventoryBoard,
  knowledgeBoard,
  crmBoard,
  travelBoard,
  habitsBoard,
  projectsBoard,
  financeBoard,
  automationBoard,
  turfBoard,
  todayBoard,
  timeBoard,
  activityBoard,
];
