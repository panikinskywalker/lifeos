/**
 * Shipping texts → deliveries (M4.2c). Pure: reads what a shop or courier
 * SMS says about an order — who it's from, what, the carrier, tracking /
 * order number, status, and the expected date. Food and quick-commerce
 * "on the way" texts are left out (they're minutes, not parcels).
 */

export type DeliveryStatus = 'ordered' | 'shipped' | 'out_for_delivery' | 'delivered' | 'cancelled' | 'returned';

export interface ParsedDelivery {
  shop: string | null;
  carrier: string | null;
  item: string | null;
  tracking: string | null;
  orderId: string | null;
  status: DeliveryStatus;
  /** ISO day, when the text says when it arrives (or arrived). */
  expected: string | null;
}

const SHOPS: Array<[RegExp, string]> = [
  [/amazon|amzn/i, 'Amazon'], [/flipkart|fkrt/i, 'Flipkart'], [/myntra/i, 'Myntra'], [/ajio/i, 'AJIO'], [/nykaa/i, 'Nykaa'], [/meesho/i, 'Meesho'],
  [/tata ?cliq/i, 'Tata CLiQ'], [/croma/i, 'Croma'], [/decathlon/i, 'Decathlon'], [/firstcry/i, 'FirstCry'], [/lenskart/i, 'Lenskart'], [/pepperfry/i, 'Pepperfry'],
  [/ikea/i, 'IKEA'], [/urban ?ladder/i, 'Urban Ladder'], [/boat/i, 'boAt'], [/apple/i, 'Apple'], [/snitch/i, 'Snitch'], [/bewakoof/i, 'Bewakoof'], [/jiomart/i, 'JioMart'],
];
const CARRIERS: Array<[RegExp, string]> = [
  [/delhivery/i, 'Delhivery'], [/blue ?dart|bluedart/i, 'Blue Dart'], [/ekart/i, 'Ekart'], [/xpress ?bees|xpressbees/i, 'XpressBees'], [/shadowfax/i, 'Shadowfax'],
  [/dtdc/i, 'DTDC'], [/ecom ?express/i, 'Ecom Express'], [/india ?post|speed ?post/i, 'India Post'], [/amazon (?:transportation|shipping)|\bATS\b/i, 'Amazon Shipping'],
  [/dunzo/i, 'Dunzo'], [/porter/i, 'Porter'], [/fedex/i, 'FedEx'], [/\bdhl\b/i, 'DHL'], [/\bups\b/i, 'UPS'], [/smartr/i, 'Smartr'],
];
/** Minutes-long deliveries: not parcels worth a record. */
const QUICK = /swiggy|zomato|blinkit|zepto|instamart|bigbasket now|bb now|eatsure|dominos|domino's/i;

const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** "by Tue, 29 Sep" / "on 29th September" / "Sep 29" / "29/09" / "today" / "tomorrow" / "by Friday" → ISO day. */
function whenIn(t: string, at: number): string | null {
  const now = new Date(at);
  if (/\b(arriving|delivered|delivery|expected)?\s*today\b/i.test(t) || /out for delivery/i.test(t)) return iso(now);
  if (/\btomorrow\b/i.test(t)) return iso(new Date(at + 86_400_000));
  let m = /\b(\d{1,2})(?:st|nd|rd|th)?[\s-]*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i.exec(t) ?? null;
  let day: number | undefined;
  let month: number | undefined;
  if (m) [day, month] = [Number(m[1]), MONTHS[m[2]!.slice(0, 3).toLowerCase()]];
  else if ((m = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})\b/i.exec(t))) [month, day] = [MONTHS[m[1]!.slice(0, 3).toLowerCase()], Number(m[2])];
  else if ((m = /\bby\s+(\d{1,2})[/-](\d{1,2})\b/.exec(t))) [day, month] = [Number(m[1]), Number(m[2]) - 1];
  if (day != null && month != null) {
    let d = new Date(now.getFullYear(), month, day);
    if (d.getTime() < at - 60 * 86_400_000) d = new Date(now.getFullYear() + 1, month, day);
    return iso(d);
  }
  const wd = /\b(?:by|on|arriving|delivered)\s+(sun|mon|tue|wed|thu|fri|sat)[a-z]*\b/i.exec(t);
  if (wd) {
    const target = DAYS.indexOf(wd[1]!.toLowerCase());
    const ahead = (target - now.getDay() + 7) % 7;
    return iso(new Date(at + ahead * 86_400_000));
  }
  return null;
}

function statusOf(t: string): DeliveryStatus | null {
  if (/\b(has been |was |successfully )?delivered\b/i.test(t) && !/\bwill be delivered|to be delivered|expected|by\b.*\bdelivered\b.*\bby/i.test(t.replace(/delivered by/i, 'expected by'))) return 'delivered';
  if (/out for delivery|arriving today|with (?:our |the )?delivery (?:agent|partner|executive)/i.test(t)) return 'out_for_delivery';
  if (/\b(cancel+ed|cancellation)\b/i.test(t)) return 'cancelled';
  if (/\b(returned|return (?:picked|received|initiated)|rto)\b/i.test(t)) return 'returned';
  if (/\b(shipped|dispatched|in transit|picked up|on the way|reached .* hub|arriving|will be delivered|expected delivery)\b/i.test(t)) return 'shipped';
  if (/\b(order (?:placed|confirmed|received)|we'?ve received your order|thank(?:s| you) for (?:your )?(?:order|shopping))\b/i.test(t)) return 'ordered';
  return null;
}

/** A shop's or courier's shipping text, or null. */
export function parseDeliverySms(text: string, sender = '', at = Date.now()): ParsedDelivery | null {
  const t = text.replace(/\s+/g, ' ').trim();
  if (QUICK.test(`${sender} ${t}`)) return null;
  if (/\b(otp|one time password)\b/i.test(t) && !/deliver/i.test(t)) return null;
  const status = statusOf(t);
  if (!status) return null;
  const shop = SHOPS.find(([re]) => re.test(sender) || re.test(t))?.[1] ?? null;
  const carrier = CARRIERS.find(([re]) => re.test(sender) || re.test(t))?.[1] ?? null;
  if (!shop && !carrier && !/\b(order|shipment|parcel|package|consignment|awb|tracking)\b/i.test(t)) return null;
  const tracking = /\b(?:awb|tracking(?: id| no\.?| number)?|waybill|consignment(?: no\.?)?|shipment(?: id| no\.?)?)[:\s#]*([A-Z0-9]{8,20})\b/i.exec(t)?.[1] ?? /\b([A-Z]{2}\d{9}IN)\b/.exec(t)?.[1] ?? null;
  const orderId = /\border(?: id| no\.?| number| #)?[:\s#]*((?:\d{3}-\d{7}-\d{7})|(?:OD\d{10,})|(?:[A-Z0-9]{2,}-?[A-Z0-9]{6,}))\b/i.exec(t)?.[1] ?? null;
  // "Your package with boAt Airdopes 141… has been", "order for Nike Revolution 6 has been shipped", "Shipped: boAt Rockerz 255"
  let item =
    /\b(?:package|order|shipment|parcel)\s+(?:with|for|containing|of)\s+(.{3,60}?)(?:\s+(?:has|is|will|was|from|and|\.\.\.|…)|[,.;](?:\s|$))/i.exec(t)?.[1] ??
    /\b(?:shipped|delivered|out for delivery|arriving today|dispatched):\s*(.{3,60}?)(?:\s+(?:will|has|is|from)|[,.;](?:\s|$)|\s+Track)/i.exec(t)?.[1] ??
    null;
  if (item) item = item.replace(/\s*(?:\.{2,}|…).*$/, '').replace(/^(?:your|the)\s+/i, '').trim();
  if (item && /^(?:\d+ items?|items?|an? (?:item|order|package))$/i.test(item)) item = null;
  return { shop, carrier, item: item || null, tracking, orderId, status, expected: whenIn(t, at) };
}
