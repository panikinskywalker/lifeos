import type { BoardManifest } from '@core/registry/types';
import { assetsOverview } from './overview';
import { VehicleHero } from './hero';

/** Companion board of the assets module: its Overview, quick actions and record overrides. */
export const assetsBoard: BoardManifest = {
  id: 'assets',
  module: 'assets',
  name: 'Assets',
  icon: 'cube.box',
  color: 'brown',
  placement: 'module',
  overview: assetsOverview,
  quickActions: [{ id: 'assets.add', label: 'Asset', icon: 'cube.box', route: '/entity/asset/new' }, { id: 'assets.addVehicle', label: 'Vehicle', icon: 'car', route: '/entity/vehicle/new' }],
  overrides: [{ object: 'vehicle', record: [{ entityType: 'vehicle', key: 'assets.vehicle', title: 'Vehicle', component: VehicleHero, order: 10, placement: 'top' }] }],
};
