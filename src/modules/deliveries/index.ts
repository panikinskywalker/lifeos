import type { ModuleManifest } from '@core/registry/types';
import { deliveryType } from './types';

export * from './types';

export const deliveriesModule: ModuleManifest = {
  id: 'deliveries',
  name: 'Deliveries',
  version: '1.0.0',
  description: 'Parcels on their way — filed from Amazon, Flipkart and courier texts, updated as they move.',
  icon: 'box',
  color: deliveryType.color!,
  entityTypes: [deliveryType],
};
