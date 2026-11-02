import type { LifeOSContext } from '@core/registry/context';
import type { DeliveryData } from './types';
import { isoDay } from './lib';

/** What Undo needs to put a delivery back. */
export type DeliveryUndo = { id: string; before: Pick<DeliveryData, 'status' | 'deliveredOn' | 'otp'> };

/** You got it, and no text said so: delivered today, the code cleared. Returns the undo, or null when it already was. */
export function markDelivered(os: LifeOSContext, id: string, now = Date.now()): DeliveryUndo | null {
  const e = os.records.get<DeliveryData>(id);
  if (!e || e.data.status === 'delivered') return null;
  const before = { status: e.data.status, deliveredOn: e.data.deliveredOn, otp: e.data.otp };
  os.records.update(id, { data: { status: 'delivered', deliveredOn: isoDay(now), otp: undefined } }, 'user');
  return { id, before };
}

export function undoDelivered(os: LifeOSContext, u: DeliveryUndo): void {
  os.records.update(u.id, { data: u.before }, 'user');
}
