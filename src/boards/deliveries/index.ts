import type { BoardManifest } from '@core/registry/types';
import { deliveriesOverview } from './overview';
import { DeliveriesHome } from './home';
import { DeliveriesArriving } from './arriving';
import { DeliveriesList } from './list';
import { DeliveriesFiling } from './filing';
import { DeliveryPage } from './record';
import { DeliveryForm } from './form';
import { deliveriesTiles } from './tile';

/**
 * Companion board of the deliveries module, drawn to the NR-Deliveries-*
 * artboards (v3 Noir): the home (with its empty state), Arriving, All
 * deliveries, Filing, the Delivery page (the whole record page), the form,
 * the Today tile and the Overview.
 */
export const deliveriesBoard: BoardManifest = {
  id: 'deliveries',
  module: 'deliveries',
  name: 'Deliveries',
  icon: 'box',
  color: 'green',
  placement: 'module',
  overview: deliveriesOverview,
  tiles: deliveriesTiles,
  screens: [
    { key: 'index', title: 'Deliveries', component: DeliveriesHome },
    { key: 'arriving', title: 'Arriving', component: DeliveriesArriving },
    { key: 'list', title: 'All deliveries', component: DeliveriesList },
    { key: 'filing', title: 'Filing', component: DeliveriesFiling },
  ],
  quickActions: [{ id: 'deliveries.add', label: 'Delivery', icon: 'box', route: '/entity/delivery/new' }],
  overrides: [{ object: 'delivery', form: DeliveryForm, record: [{ entityType: 'delivery', key: 'deliveries.page', title: 'Delivery', component: DeliveryPage, order: 0, placement: 'page', ownLinks: true }] }],
};
