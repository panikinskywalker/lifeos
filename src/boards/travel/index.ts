import type { BoardManifest } from '@core/registry/types';
import { travelOverview } from './overview';
import { TripSection } from './sections';

/** Companion board of the travel module: Overview, quick actions, the Trip section. */
export const travelBoard: BoardManifest = {
  id: 'travel',
  module: 'travel',
  name: 'Travel',
  icon: 'airplane',
  color: 'cyan',
  placement: 'module',
  overview: travelOverview,
  quickActions: [{ id: 'travel.addTrip', label: 'Trip', icon: 'airplane', route: '/entity/trip/new' }],
  overrides: [{ object: 'trip', record: [{ entityType: 'trip', key: 'travel.trip', title: 'Trip', component: TripSection, order: 10 }] }],
};
