import type { BoardManifest } from '@core/registry/types';
import { deliveriesOverview } from './overview';
import { DeliveryHero } from './hero';
import { DeliveriesHome } from './home';

/**
 * Companion board of the deliveries module (R7b): the Deliveries home
 * (arriving today with the OTP large, on the way, delivered lately), the
 * Delivery page's top, the Overview. A first pass from the kit; the
 * NR-Deliveries-* artboards (docs/design/DELIVERIES-BRIEF.md) replace it.
 */
export const deliveriesBoard: BoardManifest = {
  id: 'deliveries',
  module: 'deliveries',
  name: 'Deliveries',
  icon: 'box',
  color: 'green',
  placement: 'module',
  overview: deliveriesOverview,
  screens: [{ key: 'index', title: 'Deliveries', component: DeliveriesHome }],
  quickActions: [{ id: 'deliveries.add', label: 'Delivery', icon: 'box', route: '/entity/delivery/new' }],
  overrides: [{ object: 'delivery', record: [{ entityType: 'delivery', key: 'deliveries.hero', title: 'On its way', component: DeliveryHero, order: 10, placement: 'top' }] }],
};
