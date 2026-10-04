import type { BoardManifest } from '@core/registry/types';
import { inventoryOverview } from './overview';

/** Companion board of the inventory module: its Overview, quick actions and record overrides. */
export const inventoryBoard: BoardManifest = {
  id: 'inventory',
  module: 'inventory',
  name: 'Inventory',
  icon: 'shippingbox',
  color: 'teal',
  placement: 'module',
  overview: inventoryOverview,
  quickActions: [{ id: 'inventory.add', label: 'Item', icon: 'shippingbox', route: '/entity/item/new' }],
};
