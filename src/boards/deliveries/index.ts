import type { BoardManifest } from '@core/registry/types';
import { deliveriesOverview } from './overview';
import { DeliveryHero } from './hero';

/** Companion board of the deliveries module: its Overview, quick actions and record overrides. */
export const deliveriesBoard: BoardManifest = {
  id: 'deliveries',
  module: 'deliveries',
  name: 'Deliveries',
  icon: 'box',
  color: 'green',
  placement: 'module',
  overview: deliveriesOverview,
  overrides: [{ object: 'delivery', record: [{ entityType: 'delivery', key: 'deliveries.hero', title: 'On its way', component: DeliveryHero, order: 10, placement: 'top' }] }],
};
