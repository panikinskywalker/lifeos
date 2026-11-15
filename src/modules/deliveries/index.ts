import type { ModuleManifest } from '@core/registry/types';
import { bus } from '@core/events/bus';
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
    // Delivered: its one-time code is no use any more, so it goes now (15 Nov; the daily clean-up catches the rest).
    bus.on('entity.updated', ({ entity }) => {
      const d = entity.data as { status?: string; otp?: string };
      if (entity.object === 'delivery' && d.status === 'delivered' && d.otp) os.records.update(entity.id, { data: { otp: undefined, otpAt: undefined } }, 'system');
    });
  },
};
