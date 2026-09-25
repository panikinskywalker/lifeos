import type { ModuleManifest } from '@core/registry/types';
import { VehicleHero } from './hero';
import { ASSETS_COLOR, assetsAiTools, assetType, routineType, vehicleType } from './types';

export * from './types';

export const assetsModule: ModuleManifest = {
  id: 'assets', name: 'Assets', version: '1.0.0', description: 'Things you own — electronics, furniture, vehicles — with warranties, value and linked expenses.', icon: 'cube.box', color: ASSETS_COLOR,
  dependencies: ['crm'], entityTypes: [assetType, vehicleType, routineType],
  quickActions: [{ id: 'assets.add', label: 'Asset', icon: 'cube.box', route: '/entity/asset/new' }, { id: 'assets.addVehicle', label: 'Vehicle', icon: 'car', route: '/entity/vehicle/new' }],
  aiTools: assetsAiTools,
  detailSections: [{ entityType: 'vehicle', key: 'assets.vehicle', title: 'Vehicle', component: VehicleHero, order: 10, placement: 'top' }],
};
