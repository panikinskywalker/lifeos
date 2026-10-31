import type { BoardManifest } from '@core/registry/types';
import { HOME_ORDER, HOME_STOCKED } from '@modules/inventory';
import { inventoryOverview } from './overview';
import { HomeScreen } from './home';
import { SpaceScreen } from './space';
import { ShoppingList } from './list';
import { StockPage } from './thing';
import { OrderCard, StockedCard } from './cards';

/**
 * Home (the inventory module's board; docs/MODEL.md layer 8, R7e): a board
 * in Browse › Boards and a Today tile. Home, a space's pills, the shopping
 * list, the Stock page, and the two To check cards for groceries coming in.
 * A first pass from the kit; the NR-Home-* artboards replace it.
 */
export const inventoryBoard: BoardManifest = {
  id: 'inventory',
  module: 'inventory',
  name: 'Home',
  icon: 'home',
  color: 'teal',
  placement: 'browse',
  overview: inventoryOverview,
  screens: [
    { key: 'index', title: 'Home', component: HomeScreen },
    { key: 'space', title: 'Space', component: SpaceScreen },
    { key: 'list', title: 'Shopping list', component: ShoppingList },
  ],
  quickActions: [{ id: 'inventory.add', label: 'Stock', icon: 'home', route: '/module/inventory/index' }],
  overrides: [{ object: 'stock', record: [{ entityType: 'stock', key: 'inventory.stock', title: 'Stock', component: StockPage, order: 0, placement: 'page' }] }],
  checkCards: { [HOME_ORDER]: OrderCard, [HOME_STOCKED]: StockedCard },
};
