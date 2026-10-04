import type { BoardManifest } from '@core/registry/types';
import { placesOverview } from './overview';

/** Companion board of the places module: its Overview, quick actions and record overrides. */
export const placesBoard: BoardManifest = {
  id: 'places',
  module: 'places',
  name: 'Places & organisations',
  icon: 'location',
  color: 'cyan',
  placement: 'module',
  overview: placesOverview,
};
