import type { BoardManifest } from '@core/registry/types';
import { travelOverview } from './overview';
import { TravelHome } from './home';
import { PackScreen } from './pack';
import { TripBody, TripHero, TripsHere } from './trip';

/**
 * Companion board of the travel module (R7d): the Travel home, the packing
 * picker, the Trip page's sections and Trips here on a Place. A first pass
 * from the v3 Noir kit; the NR-Travel-* artboards (TRAVEL-BRIEF.md) replace it.
 */
export const travelBoard: BoardManifest = {
  id: 'travel',
  module: 'travel',
  name: 'Travel',
  icon: 'airplane',
  color: 'cyan',
  placement: 'module',
  overview: travelOverview,
  screens: [
    { key: 'index', title: 'Travel', component: TravelHome },
    { key: 'pack', title: 'Packing', component: PackScreen },
  ],
  quickActions: [{ id: 'travel.addTrip', label: 'Trip', icon: 'airplane', route: '/entity/trip/new' }],
  overrides: [
    {
      object: 'trip',
      record: [
        { entityType: 'trip', key: 'travel.trip', title: 'Trip', component: TripHero, order: 10, placement: 'top' },
        { entityType: 'trip', key: 'travel.tripBody', title: 'Flights, stays and spend', component: TripBody, order: 11 },
      ],
    },
    { object: 'place', record: [{ entityType: 'place', key: 'travel.tripsHere', title: 'Trips here', component: TripsHere, order: 40 }] },
  ],
};
