import type { BrainDef, Candidate, Nudge } from '@core/brain/contract';
import type { LifeOSContext } from '@core/registry/context';
import type { DeliveryData } from './types';
import { arrivesToday, isQuick, isoDay, otpOf, STATUS_WORD } from './lib';

/**
 * What deliveries brings the brain (docs/MODEL.md layer 8, *coming up*): a
 * parcel arriving today, urgent when it has an OTP so the code is ready when
 * the agent rings. Quick commerce never (it is minutes). The OTP itself never
 * leaves the phone: the line says it is on the delivery, which the card opens.
 */

export function deliveryCandidates(os: LifeOSContext, now = Date.now()): Candidate[] {
  const today = isoDay(now);
  return os.records
    .query<DeliveryData>('delivery', {}, { limit: 500 })
    .filter((e) => !isQuick(e.data) && arrivesToday(e, now))
    .map((e) => {
      const otp = otpOf(e, now);
      const from = e.data.shop ?? e.data.carrier;
      const out = e.data.status === 'out_for_delivery';
      return {
        key: `deliveries:today:${e.id}:${today}:${otp ? 'otp' : out ? 'out' : 'due'}`,
        kind: 'coming up',
        shape: 'ask',
        subjectId: e.id,
        title: e.title,
        line: `${e.title}${from && !e.title.startsWith(from) ? ` from ${from}` : ''} ${out ? 'is out for delivery' : 'arrives today'}${otp ? ': the OTP is on it' : ''}`,
        record: { parcel: e.title, shop: e.data.shop ?? null, carrier: e.data.carrier ?? null, status: STATUS_WORD[e.data.status], expected: e.data.expectedDate ?? null, has_otp: !!otp },
        urgent: !!otp,
        rank: otp ? 0 : out ? 1 : 2,
        yes: e.data.trackingUrl ? 'Track' : 'Open',
        payload: { deliveryId: e.id },
      } satisfies Candidate;
    });
}

export const deliveriesBrain: BrainDef = {
  candidates: deliveryCandidates,
  act(os, verb, nudge: Nudge) {
    const { deliveryId } = (nudge.payload ?? {}) as { deliveryId?: string };
    const d = deliveryId ? os.records.get<DeliveryData>(deliveryId) : null;
    if (!d || verb !== 'yes') return null;
    return { open: d.data.trackingUrl ?? `/entity/delivery/${d.id}` };
  },
  skills: [{ name: 'Deliveries', body: 'A parcel arriving today matters today only. Never write or ask for a delivery code: say it is ready on the delivery. Name the thing, not the order number.' }],
};
