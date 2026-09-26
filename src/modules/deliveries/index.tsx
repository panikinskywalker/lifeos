import type { ModuleManifest } from '@core/registry/types';
import { deliveryType } from './types';
import { DeliveryHero } from './hero';
import { deliveriesOverview } from './overview';

export * from './types';

export const deliveriesModule: ModuleManifest = {
  overview: deliveriesOverview,
  id: 'deliveries',
  name: 'Deliveries',
  version: '1.0.0',
  description: 'Parcels on their way — filed from Amazon, Flipkart and courier texts, updated as they move.',
  icon: 'box',
  color: deliveryType.color!,
  entityTypes: [deliveryType],
  detailSections: [{ entityType: 'delivery', key: 'deliveries.hero', title: 'On its way', component: DeliveryHero, order: 10, placement: 'top' }],
};
