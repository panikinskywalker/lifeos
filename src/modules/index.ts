import type { ModuleManifest } from '@core/registry/types';
import { dashboardModule } from './dashboard';
import { financeModule } from './finance';
import { projectsModule } from './projects';
import { healthModule } from './health';
import { crmModule } from './crm';
import { travelModule } from './travel';
import { assetsModule } from './assets';
import { documentsModule } from './documents';
import { knowledgeModule } from './knowledge';
import { habitsModule } from './habits';
import { inventoryModule } from './inventory';
import { automationModule } from './automation';
import { placesModule } from './places';
import { deliveriesModule } from './deliveries';

/**
 * The install list. Adding a module = adding one line here (or, later,
 * loading a manifest from a plugin bundle at runtime — the registry doesn't
 * care where a manifest comes from).
 */
export const installedModules: ModuleManifest[] = [
  dashboardModule,
  crmModule,
  travelModule,
  projectsModule,
  financeModule,
  healthModule,
  assetsModule,
  documentsModule,
  knowledgeModule,
  habitsModule,
  inventoryModule,
  automationModule,
  placesModule,
  deliveriesModule,
];
