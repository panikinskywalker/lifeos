import type { BoardManifest } from '@core/registry/types';
import { travelOverview } from './overview';
import { TravelHome } from './home';
import { UpcomingScreen } from './upcoming';
import { PackScreen } from './pack';
import { TripPage, TripsHere } from './trip';
import { TripForm } from './form';
import { travelTiles } from './tile';

/**
 * Companion board of the travel module, drawn to the NR-Travel-* artboards
 * (v3 Noir): the Travel home, all trips, packing, the Trip page (the whole
 * record page), the trip form, the Today tile, and Trips here on a Place.
 */
export const travelBoard: BoardManifest = {
  id: 'travel',
  module: 'travel',
  name: 'Travel',
  icon: 'airplane',
  color: 'cyan',
  placement: 'module',
  overview: travelOverview,
  tiles: travelTiles,
  screens: [
    { key: 'index', title: 'Travel', component: TravelHome },
    { key: 'upcoming', title: 'Upcoming', component: UpcomingScreen },
    { key: 'pack', title: 'Packing', component: PackScreen },
  ],
  quickActions: [{ id: 'travel.addTrip', label: 'Trip', icon: 'airplane', route: '/entity/trip/new' }],
  overrides: [
    { object: 'trip', form: TripForm, record: [{ entityType: 'trip', key: 'travel.trip', title: 'Trip', component: TripPage, order: 0, placement: 'page' }] },
    { object: 'place', record: [{ entityType: 'place', key: 'travel.tripsHere', title: 'Trips here', component: TripsHere, order: 40 }] },
  ],
};
