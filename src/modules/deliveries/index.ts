import type { ModuleManifest } from '@core/registry/types';
import { deliveryType } from './types';
import { deliveriesParsers } from './filing/parser';
import { backfillDeliveries } from './filing/deliveries';
import { deliveriesBrain } from './brain';

export * from './types';
export * from './lib';
export { deliveryCandidates } from './brain';
export { markDelivered, undoDelivered, type DeliveryUndo } from './actions';

export const deliveriesModule: ModuleManifest = {
  id: 'deliveries',
  name: 'Deliveries',
  version: '1.0.0',
  description: 'Parcels and quick-commerce orders on their way: from shop and courier texts, shop apps and mail, with the OTP and the payment.',
  icon: 'box',
  color: deliveryType.color!,
  objects: [deliveryType],
  filing: { parsers: deliveriesParsers },
  brain: deliveriesBrain,
  onStart: (os) => {
    // Once: shipping texts that arrived before deliveries were tracked.
    if (!os.settings.get<boolean>('deliveries.backfilled', false)) {
      backfillDeliveries(os);
      os.settings.set('deliveries.backfilled', true);
    }
  },
};
