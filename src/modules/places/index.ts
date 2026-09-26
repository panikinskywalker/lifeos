import type { ModuleManifest } from '@core/registry/types';
import { orgType, placeType } from './types';
import { placesOverview } from './overview';

export * from './types';

export const placesModule: ModuleManifest = {
  overview: placesOverview,
  id: 'places',
  name: 'Places & organisations',
  version: '1.0.0',
  description: 'Cities, venues, companies and shops — the where and who-with of your life graph.',
  icon: 'location',
  color: placeType.color!,
  entityTypes: [placeType, orgType],
};
