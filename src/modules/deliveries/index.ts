import type { ModuleManifest } from '@core/registry/types';
import { deliveryType } from './types';
import { deliveriesParsers } from './filing/parser';
import { backfillDeliveries } from './filing/deliveries';

export * from './types';

export const deliveriesModule: ModuleManifest = {
  id: 'deliveries',
  name: 'Deliveries',
  version: '1.0.0',
  description: 'Parcels on their way — filed from Amazon, Flipkart and courier texts, updated as they move.',
  icon: 'box',
  color: deliveryType.color!,
  objects: [deliveryType],
  filing: { parsers: deliveriesParsers },
  onStart: (os) => {
    // Once: shipping texts that arrived before deliveries were tracked.
    if (!os.settings.get<boolean>('deliveries.backfilled', false)) {
      backfillDeliveries(os);
      os.settings.set('deliveries.backfilled', true);
    }
  },
};
