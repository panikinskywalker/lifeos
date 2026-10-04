/**
 * Merchant names from bank texts. Card and UPI alerts carry the acquirer's
 * descriptor, not the brand: "PAYPAL *ADOBE", "RAZ*SampleFood",
 * "EAZYDINE0000000", "NEFT-HDFC0001234-PRIYA S", "ADOBE *CREATIVE CLD DUBLIN IE".
 * `cleanMerchant` strips gateway prefixes, reference codes and locations;
 * `knownMerchant` maps the result to a brand, its category and whether it's
 * a subscription.
 */

/** Payment gateways / aggregators that prefix the real merchant ("PYU*SWIGGY"). */
const GATEWAY = /^(?:paypal|pp|raz|rzp|razorpay|pyu|payu|ccavenue|cca|ccav|bd|billdesk|ind|pay|sq|sqr|sp|cf|cashfree|jtpay|easebuzz|phonepe|paytm|gpay|juspay|stripe)\s*\*\s*/i;
/** Rail words and reference prefixes in "Info:" lines ("NEFT-", "UPI/", "BIL*INFT*", "MMT/IMPS/"). */
const RAIL = /^(?:neft|rtgs|imps|upi|mmt|inft|bil|ft|nfs|ach|nach|ecs|pos|vps|vin|ib|mob ?bk|trf|to|by)$/i;
const INDIAN_CITY = /\s+(?:bangalore|bengaluru|mumbai|new delhi|delhi|gurgaon|gurugram|noida|pune|hyderabad|chennai|kolkata|ahmedabad|jaipur|kochi)\b.*$/i;
/** Words that are never who you paid: bank boilerplate caught by a loose pattern. */
const NOT_A_NAME = /^(?:(?:upi|imps|neft|rtgs|rs|inr|customer|clearing|report|ref|info|txn|transaction|pos|atm|cash|branch|beneficiary|remitter|self|paying|cc)$|(?:rs|inr|₹)\.?\s*\d|(?:the (?:beneficiary|account|card|bank|payee)|mobile|a\/?c|acct|account|card|bank|you|your|debit card|credit card|online banking|net ?banking|money transfer|trf|fd)\b)/i;
const BOILERPLATE = /\b(?:not you|if not|report|dispute|customer care|call \d|sms block|avl|bal(?:ance)?|limit|team \w+ bank)\b/i;

/** A descriptor → a readable merchant name, or null when nothing name-like is left. */
export function cleanMerchant(raw: string | null | undefined): string | null {
  if (!raw) return null;
  // Card descriptors pad fields with runs of spaces: "SAMPLEVENDOR, INC        NEW YORK       US".
  let s = raw.trim().split(/ {3,}|\t/)[0]!.replace(/\s+/g, ' ').trim();
  // Cut bank boilerplate that a loose pattern ran into.
  s = s.replace(/\s*(?:Not you\??|If not you|SMS BLOCK|Avl\.? ?(?:Bal|Lmt|Limit)|Available (?:bal|limit)|UPI Ref|Ref(?:erence)? No|RRN|Call \d).*$/i, '');
  s = s.replace(/^(?:[xX*]+\d+\s+to\s+|M\/S\.?\s+|VPA\s+|(?:Mr|Mrs|Ms|Miss|Shri|Smt|Dr)\.?\s+)/i, '');
  s = s.replace(/\s+via\s+(?:upi|imps|neft|rtgs)\b.*$/i, '');
  // Reference-shaped descriptors: split on / * - and keep the parts that read like a name.
  const g = GATEWAY.exec(s);
  if (g) s = s.slice(g[0].length);
  if (/^(?:neft|rtgs|imps|upi|mmt|bil|inft|ft|mob ?bk)\b/i.test(s)) {
    // "NEFT-HDFC0001234-PRIYA S", "BIL*INFT*FFF0000000*": the part that reads like a name.
    const named = s.split(/\s*[/*]\s*|\s*-\s*/).map((p) => p.trim()).filter((p) => p && !RAIL.test(p) && !isCode(p));
    s = (named.find((p) => /[a-z]{3}/i.test(p) && /\s/.test(p)) ?? named[named.length - 1] ?? '').replace(/^(?:upi|neft|rtgs|imps)\s+/i, '');
  } else if (s.includes('*')) {
    s = s.split('*')[0]!; // "ADOBE *CREATIVE CLD" — the brand comes first
  }
  s = s.replace(/^(?:[A-Z]{4}0[A-Z0-9]{6,}|[A-Z0-9]*\d{6,}[A-Z0-9]*)[-\s]+/i, ''); // IFSC / ref code in front
  s = s.replace(/[-\s]*[xX]*\d{4,}$/, ''); // trailing reference / terminal digits ("EAZYDINE0000000")
  s = s.replace(INDIAN_CITY, '');
  s = s.replace(/\s+(?:[a-z]{2})?IND?$/, ''); // trailing "IN" / "IND" / "kaIN" (state + country)
  s = s.replace(/,?\s+(?:(?:pvt|private)\.?\s*)?(?:inc|llc|ltd|limited|pvt|private)\.?$/i, '');
  s = s.replace(/^(?:to|at|on|from|by)\s+/i, '').replace(/[\s.;,:*-]+$/, '').replace(/^[\s.;,:*-]+/, '').trim();
  if (!s || (s.match(/[a-z]/gi)?.length ?? 0) < 2 || /^\d[\d\s-]*$/.test(s) || NOT_A_NAME.test(s) || BOILERPLATE.test(s)) return null;
  if (/^[\w.-]+@[a-z]+$/i.test(s)) s = s.split('@')[0]!.replace(/[._-]+/g, ' ');
  return s.slice(0, 40);
}

/** A reference, IFSC or number rather than a name. */
function isCode(p: string): boolean {
  if (/^[A-Z]{4}0[A-Z0-9]{5,}$/i.test(p)) return true; // IFSC-based UTR
  return !/\s/.test(p) && /\d/.test(p);
}

export interface KnownMerchant {
  name: string;
  category: string;
  /** Charged on a schedule (a subscription), so a debit from it is a renewal. */
  subscription?: boolean;
}

/** Brands as they appear in descriptors → the name you know them by. Order matters: specific before general. */
const BRANDS: Array<[RegExp, KnownMerchant]> = [
  // Subscriptions: software, streaming, cloud, memberships.
  [/\badobe\b/i, { name: 'Adobe', category: 'subscriptions', subscription: true }],
  [/\bnetflix\b/i, { name: 'Netflix', category: 'subscriptions', subscription: true }],
  [/\bspotify\b/i, { name: 'Spotify', category: 'subscriptions', subscription: true }],
  [/\byoutube\s*(?:premium|music)?\b|google\s*\*?\s*youtube/i, { name: 'YouTube Premium', category: 'subscriptions', subscription: true }],
  [/google\s*\*?\s*(?:one|storage|cloud|workspace|gsuite)|\bgoogle\s*one\b/i, { name: 'Google One', category: 'subscriptions', subscription: true }],
  [/google\s*\*?\s*(?:play|playstore)|\bgoogle play\b/i, { name: 'Google Play', category: 'subscriptions', subscription: true }],
  [/apple\.com\s*\/?\s*bill|\bitunes\b|\bicloud\b|\bapple\s*(?:services|media|music|one|tv)\b/i, { name: 'Apple', category: 'subscriptions', subscription: true }],
  [/\bprime\s*video\b|\bamazon\s*prime\b|\bprimevideo\b|\bamzn\s*prime/i, { name: 'Amazon Prime', category: 'subscriptions', subscription: true }],
  [/\baudible\b/i, { name: 'Audible', category: 'subscriptions', subscription: true }],
  [/\bkindle\s*unlimited\b/i, { name: 'Kindle Unlimited', category: 'subscriptions', subscription: true }],
  [/\b(?:jio\s*)?hotstar\b|\bdisney\s*\+?\s*hotstar\b|\bnovi\s*digital\b/i, { name: 'JioHotstar', category: 'subscriptions', subscription: true }],
  [/\bjio\s*cinema\b/i, { name: 'JioCinema', category: 'subscriptions', subscription: true }],
  [/\bsony\s*liv\b|\bsonyliv\b/i, { name: 'SonyLIV', category: 'subscriptions', subscription: true }],
  [/\bzee\s*5\b/i, { name: 'ZEE5', category: 'subscriptions', subscription: true }],
  [/\bmicrosoft\b|\bmsft\b|\boffice\s*365\b|\bxbox\b/i, { name: 'Microsoft', category: 'subscriptions', subscription: true }],
  [/\bopenai\b|\bchatgpt\b/i, { name: 'ChatGPT', category: 'subscriptions', subscription: true }],
  [/\banthropic\b|\bclaude\.ai\b/i, { name: 'Claude', category: 'subscriptions', subscription: true }],
  [/\bnotion\b/i, { name: 'Notion', category: 'subscriptions', subscription: true }],
  [/\bfigma\b/i, { name: 'Figma', category: 'subscriptions', subscription: true }],
  [/\bcanva\b/i, { name: 'Canva', category: 'subscriptions', subscription: true }],
  [/\bdropbox\b/i, { name: 'Dropbox', category: 'subscriptions', subscription: true }],
  [/\blinkedin\b/i, { name: 'LinkedIn', category: 'subscriptions', subscription: true }],
  [/\bgithub\b/i, { name: 'GitHub', category: 'subscriptions', subscription: true }],
  [/\bcursor\b|\banysphere\b/i, { name: 'Cursor', category: 'subscriptions', subscription: true }],
  [/\bmedium\.com\b/i, { name: 'Medium', category: 'subscriptions', subscription: true }],
  [/\bcoursera\b/i, { name: 'Coursera', category: 'subscriptions', subscription: true }],
  [/\bduolingo\b/i, { name: 'Duolingo', category: 'subscriptions', subscription: true }],
  [/\bcult\.?\s*fit\b|\bcurefit\b/i, { name: 'cult.fit', category: 'subscriptions', subscription: true }],
  [/\btimes\s*prime\b/i, { name: 'Times Prime', category: 'subscriptions', subscription: true }],
  [/\bswiggy\s*one\b/i, { name: 'Swiggy One', category: 'subscriptions', subscription: true }],
  [/\bzomato\s*gold\b/i, { name: 'Zomato Gold', category: 'subscriptions', subscription: true }],
  // Everyday brands whose descriptors are hard to read.
  [/\bswiggy\b|\bbundl\s*tech/i, { name: 'Swiggy', category: 'food' }],
  [/\bzomato\b/i, { name: 'Zomato', category: 'food' }],
  [/\binstamart\b/i, { name: 'Instamart', category: 'groceries' }],
  [/\bblinkit\b|\bgrofers\b/i, { name: 'Blinkit', category: 'groceries' }],
  [/\bzepto\b|\bkiranakart\b/i, { name: 'Zepto', category: 'groceries' }],
  [/\bbigbasket\b|\bsupermarket\s*grocery\s*supplies/i, { name: 'BigBasket', category: 'groceries' }],
  [/\buber\b/i, { name: 'Uber', category: 'transport' }],
  [/\bola\s*(?:cabs|money)?\b|\bani\s*technologies\b/i, { name: 'Ola', category: 'transport' }],
  [/\brapido\b|\broppen\b/i, { name: 'Rapido', category: 'transport' }],
  [/\bamazon\b|\bamzn\b/i, { name: 'Amazon', category: 'shopping' }],
  [/\bflipkart\b/i, { name: 'Flipkart', category: 'shopping' }],
  [/\bmyntra\b/i, { name: 'Myntra', category: 'shopping' }],
  [/\bairtel\b|\bbharti\s*(?:airtel|hexacom)\b/i, { name: 'Airtel', category: 'utilities' }],
  [/\breliance\s*jio\b|\bjio\s*(?:prepaid|postpaid|fiber)\b/i, { name: 'Jio', category: 'utilities' }],
  [/\bmakemytrip\b|\bmmt\s*travel/i, { name: 'MakeMyTrip', category: 'travel' }],
  [/\bindigo\b|\binterglobe\b/i, { name: 'IndiGo', category: 'travel' }],
  [/\birctc\b/i, { name: 'IRCTC', category: 'transport' }],
  [/\bbookmyshow\b|\bbigtree\b/i, { name: 'BookMyShow', category: 'entertainment' }],
];

/** The brand behind a merchant descriptor (or the whole message), if it's one we know. */
export function knownMerchant(merchant: string | null | undefined, text = ''): KnownMerchant | null {
  if (merchant) for (const [re, k] of BRANDS) if (re.test(merchant)) return k;
  if (text) for (const [re, k] of BRANDS) if (k.subscription && re.test(text)) return k;
  return null;
}

/** An autopay / e-mandate / standing-instruction debit that has gone through (not a heads-up about one). */
export const RECURRING = /\b(e-?mandate|mandate|auto-?pay|autodebit|auto debit|standing instruction|\bsi\b|recurring|subscription|renewal|nach|ecs)\b/i;
