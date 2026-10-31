import type { BoardManifest } from '@core/registry/types';
import { assetsOverview } from './overview';
import { AssetHero } from './hero';

/** Companion board of the assets module: its Overview, quick actions and the Asset page's sections (R7a). */
export const assetsBoard: BoardManifest = {
  id: 'assets',
  module: 'assets',
  name: 'Assets',
  icon: 'cube.box',
  color: 'brown',
  placement: 'module',
  overview: assetsOverview,
  quickActions: [
    { id: 'assets.add', label: 'Asset', icon: 'cube.box', route: '/entity/asset/new' },
    { id: 'assets.addVehicle', label: 'Vehicle', icon: 'car', route: '/entity/asset/new?category=vehicle' },
    { id: 'assets.addClothes', label: 'Clothes', icon: 'shirt', route: '/entity/asset/new?category=clothing' },
  ],
  overrides: [{ object: 'asset', record: [{ entityType: 'asset', key: 'assets.asset', title: 'Asset', component: AssetHero, order: 10, placement: 'top' }] }],
};
