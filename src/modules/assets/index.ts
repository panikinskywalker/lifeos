import type { ModuleManifest } from '@core/registry/types';
import { ASSETS_COLOR, assetsAiTools, assetType, routineType, vehicleType } from './types';

export * from './types';

export const assetsModule: ModuleManifest = {
  id: 'assets', name: 'Assets', version: '1.0.0', description: 'Things you own — electronics, furniture, vehicles — with warranties, value and linked expenses.', icon: 'cube.box', color: ASSETS_COLOR,
  dependencies: ['crm'], objects: [assetType, vehicleType, routineType],
  aiTools: assetsAiTools,
};
