import type { ModuleManifest } from '@core/registry/types';
import { ASSETS_COLOR, assetType, routineType } from './types';
import { assetsAiTools } from './aiTools';
import { foldClothes, foldVehicles } from './fold';

export * from './types';
export * from './assets';
export { foldClothes, foldVehicles } from './fold';
export { assetsAiTools } from './aiTools';

/**
 * Assets (docs/MODEL.md §2 Things, R7a): what you own, vehicles and clothes
 * included, with warranty, service and km cycles. Routine stays here until
 * R5 makes it a Habit.
 */
export const assetsModule: ModuleManifest = {
  id: 'assets',
  name: 'Assets',
  version: '2.0.0',
  description: 'What you own: vehicles, devices, appliances, clothes. Warranties, service by months or km, and what’s clean.',
  icon: 'cube.box',
  color: ASSETS_COLOR,
  objects: [assetType, routineType],
  aiTools: assetsAiTools,
  onStart: (os) => {
    // R7a, once: vehicles become Assets; Stock in Clothes becomes clothing once Home's spaces exist.
    if (!os.settings.get<boolean>('assets.r7a', false)) {
      foldVehicles(os);
      os.settings.set('assets.r7a', true);
    }
    if (!os.settings.get<boolean>('assets.r7a.clothes', false) && foldClothes(os) != null) os.settings.set('assets.r7a.clothes', true);
  },
};
