import type { BoardManifest } from '@core/registry/types';
import { assetsOverview } from './overview';
import { AssetsHome } from './home';
import { AssetsList } from './list';
import { AssetPage } from './page';
import { AssetForm } from './form';
import { assetsTiles } from './tile';
import { QUICK_ADD } from './parts';

/**
 * Companion board of the assets module (NR-Assets-*): its home and All Assets,
 * the Asset and Vehicle page, the form, the Today tile, the Overview.
 */
export const assetsBoard: BoardManifest = {
  id: 'assets',
  module: 'assets',
  name: 'Assets',
  icon: 'cube.box',
  color: 'brown',
  placement: 'module',
  overview: assetsOverview,
  tiles: assetsTiles,
  screens: [
    { key: 'index', title: 'Assets', component: AssetsHome },
    { key: 'list', title: 'All Assets', component: AssetsList },
  ],
  quickActions: QUICK_ADD,
  overrides: [{ object: 'asset', form: AssetForm, record: [{ entityType: 'asset', key: 'assets.asset', title: 'Asset', component: AssetPage, order: 0, placement: 'page' }] }],
};
