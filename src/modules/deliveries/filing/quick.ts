import { parseDeliverySms, type DeliveryStatus, type ParsedDelivery } from './delivery';

/**
 * Quick commerce and shop apps (R7b): Instamart, Zepto and Blinkit texts and
 * notifications (minutes, the shop's own riders), and the Amazon, Flipkart
 * and Myntra apps' notifications (read as their shipping texts). Pure.
 *
 * Written against plausible samples (in quick.test.ts), not real ones yet:
 * a real export only changes the patterns here.
 */

/** Android apps whose notifications deliveries reads, and the shop each is. Swiggy is Instamart only when it says so. */
export const SHOP_APPS: Record<string, string> = {
  'in.amazon.mShop.android.shopping': 'Amazon',
  'com.flipkart.android': 'Flipkart',
  'com.myntra.android': 'Myntra',
  'in.swiggy.android': 'Swiggy',
  'com.zeptoconsumerapp': 'Zepto',
  'com.grofers.customerapp': 'Blinkit',
};

/** Which quick shop a text is from: by its sender, else by its words. Swiggy food is none. */
function quickShop(text: string, from: string): string | null {
  const both = `${from} ${text}`;
  if (/instamart/i.test(both)) return 'Instamart';
  if (/zepto/i.test(both)) return 'Zepto';
  if (/blinkit|grofers/i.test(both)) return 'Blinkit';
  return null;
}

/** Offers and nudges to shop, not an order. */
const PROMO = /\b(sale|offers?|deals?|% off|discount|coupon|cashback|shop now|hurry|free delivery on|order now|last chance|ends tonight)\b/i;

function quickStatus(t: string): DeliveryStatus | null {
  if (/\b(cancel+ed|cancellation)\b/i.test(t)) return 'cancelled';
  if (/\b(has been delivered|is delivered|was delivered|order delivered|delivered!|has arrived|delivered successfully)\b/i.test(t)) return 'delivered';
  if (/\b(on (?:the|its) way|out for delivery|arriving in|reach(?:ing)? you in|will reach you|is nearby|is near you|almost there|picked up your order|eta\b)/i.test(t)) return 'out_for_delivery';
  if (/\b(order (?:placed|confirmed|received)|being packed|packing your order|is packed|preparing your order)\b/i.test(t)) return 'ordered';
  return null;
}

/** "Share OTP 4821", "Delivery PIN: 5531", "4821 is your delivery code". */
function codeIn(t: string): string | null {
  return /\b(?:otp|pin|delivery code|code)\b(?:\s*(?:is|:|-))*\s*(\d{4,6})\b/i.exec(t)?.[1] ?? /\b(\d{4,6})\s+is\s+(?:the|your)\s+(?:otp|pin|code|delivery code)\b/i.exec(t)?.[1] ?? null;
}

const iso = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** An Instamart, Zepto or Blinkit order's text or notification, or null (Swiggy food, offers, anything else). */
export function parseQuickDelivery(text: string, from = '', at = Date.now()): ParsedDelivery | null {
  const t = text.replace(/\s+/g, ' ').trim();
  const shop = quickShop(t, from);
  if (!shop || PROMO.test(t)) return null;
  // A bank's or UPI app's text naming the shop is a payment, not the order.
  if (/\b(debited|credited|spent|paid to|sent to|a\/c|acct|upi ref)\b/i.test(t)) return null;
  const status = quickStatus(t);
  if (!status) return null;
  const orderId = /\border\s*(?:id|no\.?|#)?\s*[:#]?\s*#?([A-Z0-9]{6,20})\b/i.exec(t)?.[1] ?? null;
  const otp = status === 'out_for_delivery' || status === 'ordered' ? codeIn(t) : null;
  return { shop, carrier: null, item: null, tracking: null, orderId: orderId && /\d/.test(orderId) ? orderId : null, status, expected: iso(at), link: null, otp };
}

/** A notification from a shop's app → what it says, or null. Quick shops read as above; Amazon, Flipkart, Myntra as their shipping texts. */
export function parseShopNotification(pkg: string, title: string, text: string, at = Date.now()): ParsedDelivery | null {
  const shop = SHOP_APPS[pkg];
  if (!shop) return null;
  const both = `${title}. ${text}`;
  if (shop === 'Swiggy' || shop === 'Zepto' || shop === 'Blinkit') return parseQuickDelivery(both, shop, at);
  if (PROMO.test(both)) return null;
  return parseDeliverySms(both, shop, at);
}
