import type { ObjectRecord } from '@core/domain/types';
import type { DeliveryData } from './types';

/** What every screen and the brain agree on about a delivery (R7b). */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Quick commerce: minutes, the shop's own riders; never a nudge. */
export const QUICK_SHOPS = new Set(['Instamart', 'Zepto', 'Blinkit']);
export const isQuick = (d: Pick<DeliveryData, 'shop'>) => !!d.shop && QUICK_SHOPS.has(d.shop);

/** The four steps a delivery moves through; cancelled and returned close it. */
export const STEPS = ['ordered', 'shipped', 'out_for_delivery', 'delivered'] as const;
export const STAGE: Record<DeliveryData['status'], number> = { ordered: 0, shipped: 1, out_for_delivery: 2, delivered: 3, cancelled: 4, returned: 4 };
export const STATUS_WORD: Record<DeliveryData['status'], string> = { ordered: 'Ordered', shipped: 'Shipped', out_for_delivery: 'Out for delivery', delivered: 'Delivered', cancelled: 'Cancelled', returned: 'Returned' };

/**
 * Still on its way: not delivered, cancelled or returned. A quick-commerce
 * order that has heard nothing for 6 hours has come (its last notification
 * was missed), so it drops out without a record change.
 */
export function onTheWay(e: Pick<ObjectRecord<DeliveryData>, 'data' | 'updatedAt'>, now = Date.now()): boolean {
  if (STAGE[e.data.status] >= 3) return false;
  return !(isQuick(e.data) && now - e.updatedAt > 6 * HOUR);
}

/** The OTP to show: while it is on its way, and not after 3 days (codes go stale). */
export function otpOf(e: Pick<ObjectRecord<DeliveryData>, 'data' | 'updatedAt'>, now = Date.now()): string | null {
  const d = e.data;
  if (!d.otp || !onTheWay(e, now)) return null;
  return !d.otpAt || now - d.otpAt < 3 * DAY ? d.otp : null;
}

/** yyyy-MM-dd in local time. */
export const isoDay = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Arriving today: expected today, or out for delivery in the last day (an old one whose last text was missed is not). */
export function arrivesToday(e: Pick<ObjectRecord<DeliveryData>, 'data' | 'updatedAt'>, now = Date.now()): boolean {
  if (!onTheWay(e, now)) return false;
  return e.data.expectedDate === isoDay(now) || (e.data.status === 'out_for_delivery' && now - e.updatedAt < DAY);
}
