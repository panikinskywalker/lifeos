/**
 * Mail, as core sees it (R1): the headers and the shape test that decides
 * which mail is worth downloading at all — alerts, receipts, shipping,
 * tickets, bookings — so promotions, newsletters and people writing to you
 * never leave the server. What a mail *means* is the modules' business:
 * finance reads receipts and bank alerts, deliveries shipping, travel tickets.
 */

export const domainOf = (addr: string) => addr.toLowerCase().split('@')[1] ?? '';
const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
const pad = (n: number) => String(n).padStart(2, '0');

export interface MailHeader {
  uid: number;
  /** Sender address ("noreply@uber.com"). */
  from: string;
  /** Sender display name ("Uber Receipts"). */
  fromName: string;
  subject: string;
  /** Sent time, ms. */
  date: number;
}

export interface Mail extends MailHeader {
  /** Plain text of the body (HTML already flattened by the reader). */
  text: string;
}

export type MailKind = 'bank' | 'receipt' | 'shipping' | 'flight' | 'stay';

/** Banks and cards that email the same alerts they text. */
const BANK_DOMAINS = /(^|\.)(hdfcbank\.(net|com)|icicibank\.com|sbi\.co\.in|axisbank\.com|kotak\.com|kotakbank\.com|idfcfirstbank\.com|yesbank\.in|indusind\.com|hsbc\.co\.in|sc\.com|americanexpress\.(com|co\.in)|aexp\.com|getonecard\.app|sliceit\.com|federalbank\.co\.in|aubank\.in|bankofbaroda\.(com|co\.in)|canarabank\.com|unionbankofindia\.co\.in|pnb\.co\.in|citi\.com|rblbank\.com)$/;
export const AIRLINE_DOMAINS: Array<[RegExp, string]> = [
  [/goindigo\.in|indigo/i, 'IndiGo'], [/airindia/i, 'Air India'], [/airvistara|vistara/i, 'Vistara'], [/akasaair/i, 'Akasa Air'], [/spicejet/i, 'SpiceJet'],
  [/airindiaexpress/i, 'Air India Express'], [/emirates/i, 'Emirates'], [/qatarairways/i, 'Qatar Airways'], [/etihad/i, 'Etihad'], [/singaporeair/i, 'Singapore Airlines'],
  [/lufthansa/i, 'Lufthansa'], [/britishairways|\bba\.com/i, 'British Airways'], [/united\.com/i, 'United'], [/delta\.com/i, 'Delta'], [/aircanada/i, 'Air Canada'],
];
const TRAVEL_AGENTS = /makemytrip|cleartrip|ixigo|easemytrip|goibibo|yatra|booking\.com|agoda|airbnb|expedia|oyo|trip\.com|skyscanner|hotels\.com/i;
/** Shops, rides, food, subscriptions: receipts worth reading. */
const RECEIPT_SENDERS = /uber|ola|rapido|swiggy|zomato|zepto|blinkit|bigbasket|instamart|amazon|flipkart|myntra|ajio|nykaa|meesho|apple\.com|itunes|google\.com|netflix|spotify|adobe|openai|anthropic|microsoft|notion|figma|canva|dropbox|github|linkedin|youtube|hotstar|jiocinema|sonyliv|zee5|bookmyshow|district|airtel|jio\.com|vodafone|\bvi\b|bescom|tatapower|paytm|phonepe|razorpay|cred\.club|irctc|redbus|urbancompany|cult\.fit|curefit|playo|decathlon|ikea|croma|lenskart|tatacliq|reliancedigital|dunzo|porter/i;

const PROMO = /\b(\d{1,2}% off|sale\b|offers?\b|deals?\b|save (?:up to|₹|rs)|win\b|cashback up to|newsletter|webinar|last chance|limited time|exclusive|recommended for you|you might like|new arrivals|flat ₹|coupon|refer (?:and|&) earn|invite|we miss you|come back|rate your|review your|how was your|feedback|survey)\b/i;
const RECEIPT_WORDS = /\b(receipt|invoice|tax invoice|payment (?:received|successful|confirmation|confirmed)|thank(?:s| you) for (?:your )?(?:payment|order|purchase|riding|booking)|order (?:confirmed|confirmation|placed|summary)|your order|you paid|amount (?:paid|charged|debited)|bill (?:paid|payment)|subscription (?:renewed|confirmed|receipt)|renewal|trip with uber|your (?:ride|trip)|charged|refund(?:ed)?|payment of)\b/i;
const SHIPPING_WORDS = /\b(shipped|dispatched|out for delivery|delivered|arriving (?:today|tomorrow)|on (?:its|the) way|in transit|has been handed over|delivery (?:update|attempt))\b/i;
const FLIGHT_WORDS = /\b(e-?ticket|itinerary|boarding pass|web check-?in|flight (?:booking|confirmation|ticket|itinerary)|booking confirm(?:ed|ation)|pnr|your (?:flight|trip) to)\b/i;
const STAY_WORDS = /\b(reservation|booking) (?:is )?confirm(?:ed|ation)|check-?in\b|your (?:stay|booking) at\b/i;

/** From the headers alone: is this mail worth downloading, and what is it? */
export function mailKind(h: Pick<MailHeader, 'from' | 'fromName' | 'subject'>): MailKind | null {
  const domain = domainOf(h.from);
  const who = `${h.fromName} ${h.from}`;
  const s = h.subject;
  if (BANK_DOMAINS.test(domain)) {
    // Banks also send statements and marketing; alerts say so.
    if (/\b(alert|transaction|debited|credited|spent|payment|upi|txn|update on your|withdrawn|received)\b/i.test(s) && !PROMO.test(s) && !/\bstatement\b/i.test(s)) return 'bank';
    return null;
  }
  if (PROMO.test(s) && !RECEIPT_WORDS.test(s) && !FLIGHT_WORDS.test(s)) return null;
  const airline = AIRLINE_DOMAINS.some(([re]) => re.test(who));
  if ((airline || TRAVEL_AGENTS.test(who)) && FLIGHT_WORDS.test(s) && !/\bhotel|stay\b/i.test(s)) return 'flight';
  if (TRAVEL_AGENTS.test(who) && STAY_WORDS.test(s)) return 'stay';
  if (SHIPPING_WORDS.test(s) && !/\bpayment\b/i.test(s)) return 'shipping';
  if (RECEIPT_WORDS.test(s) && (RECEIPT_SENDERS.test(who) || airline || TRAVEL_AGENTS.test(who) || /\b(receipt|invoice)\b/i.test(s))) return 'receipt';
  return null;
}

/* ------------------------------------------------------------------ */
/* Receipts                                                             */
/* ------------------------------------------------------------------ */


export function mailDates(text: string, sentAt: number): Array<{ day: string; at: number }> {
  const out: Array<{ day: string; at: number }> = [];
  const sent = new Date(sentAt);
  const year = (y: string | undefined, m: number, d: number) => {
    if (y) return y.length === 2 ? 2000 + Number(y) : Number(y);
    // No year: the next time that date comes round after the mail was sent.
    const guess = new Date(sent.getFullYear(), m, d);
    return guess.getTime() < sentAt - 2 * 86_400_000 ? sent.getFullYear() + 1 : sent.getFullYear();
  };
  const push = (y: number, m: number, d: number, at: number) => {
    if (m < 0 || m > 11 || d < 1 || d > 31) return;
    out.push({ day: `${y}-${pad(m + 1)}-${pad(d)}`, at });
  };
  for (const m of text.matchAll(/\b(\d{1,2})(?:st|nd|rd|th)?[\s-]+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?[\s,-]*(\d{4}|\d{2}(?!:))?\b/gi)) {
    const mo = MONTHS[m[2]!.toLowerCase()]!;
    push(year(m[3], mo, Number(m[1])), mo, Number(m[1]), m.index!);
  }
  for (const m of text.matchAll(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})?\b/gi)) {
    const mo = MONTHS[m[1]!.toLowerCase()]!;
    push(year(m[3], mo, Number(m[2])), mo, Number(m[2]), m.index!);
  }
  for (const m of text.matchAll(/\b(20\d{2})-(\d{2})-(\d{2})\b/g)) push(Number(m[1]), Number(m[2]) - 1, Number(m[3]), m.index!);
  for (const m of text.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/g)) push(Number(m[3]), Number(m[2]) - 1, Number(m[1]), m.index!);
  return out.sort((a, b) => a.at - b.at);
}

