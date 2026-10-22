import type { BoardManifest } from '@core/registry/types';
import { placesOverview } from './overview';
import { PlacesHome } from './screens';
import { OrgSection, PlaceBody, PlaceHero } from './sections';

/** Companion board of the places module (R3): its Overview, the Places screen, quick actions, the Place and Organisation sections. */
export const placesBoard: BoardManifest = {
  id: 'places',
  module: 'places',
  name: 'Places & organisations',
  icon: 'location',
  color: 'cyan',
  placement: 'module',
  overview: placesOverview,
  screens: [{ key: 'index', title: 'Places', component: PlacesHome }],
  quickActions: [
    { id: 'places.addPlace', label: 'Place', icon: 'location', route: '/entity/place/new' },
    { id: 'places.addOrg', label: 'Organisation', icon: 'briefcase', route: '/entity/org/new' },
  ],
  overrides: [
    {
      object: 'place',
      record: [
        { entityType: 'place', key: 'places.card', title: 'Place', component: PlaceHero, order: 10, placement: 'top' },
        { entityType: 'place', key: 'places.visits', title: 'Visits', component: PlaceBody, order: 10 },
      ],
    },
    { object: 'org', record: [{ entityType: 'org', key: 'places.org', title: 'Organisation', component: OrgSection, order: 10 }] },
  ],
};
