/**
 * Gmail → records (M4.2b). Pure: an email's sender, subject and text in,
 * what it means out. Only mail that moves money or plans travel is read:
 * bank alerts (same text as the SMS), receipts and invoices, shipping
 * updates, flight tickets and hotel bookings. Everything else — promotions,
 * newsletters, people writing to you — is skipped on the headers alone, so
 * its body is never downloaded.
 */
import { moneyMentions, parseBankSms, type ParsedTxn } from './bankSms';
import { knownMerchant } from './merchants';
import { parseDeliverySms, type ParsedDelivery } from './delivery';

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

const domainOf = (addr: string) => addr.toLowerCase().split('@')[1] ?? '';

/** Banks and cards that email the same alerts they text. */
const BANK_DOMAINS = /(^|\.)(hdfcbank\.(net|com)|icicibank\.com|sbi\.co\.in|axisbank\.com|kotak\.com|kotakbank\.com|idfcfirstbank\.com|yesbank\.in|indusind\.com|hsbc\.co\.in|sc\.com|americanexpress\.(com|co\.in)|aexp\.com|getonecard\.app|sliceit\.com|federalbank\.co\.in|aubank\.in|bankofbaroda\.(com|co\.in)|canarabank\.com|unionbankofindia\.co\.in|pnb\.co\.in|citi\.com|rblbank\.com)$/;
const AIRLINE_DOMAINS: Array<[RegExp, string]> = [
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

/** The amount a receipt says you paid: the strongest "total" line wins; subtotals, taxes and discounts don't. */
export function receiptAmount(text: string): { amount: number; currency: string } | null {
  const t = text.replace(/ /g, ' ');
  const LABELS: RegExp[] = [
    /\b(?:grand total|amount paid|total paid|you paid|paid amount|total amount paid|amount charged|total charged|amount debited|order total|total amount|net amount payable|amount payable|total payable|payment of)\b/gi,
    /\b(?<!sub[- ]?)total\b(?!\s*(?:savings|discount|tax|gst|items?|mrp))/gi,
  ];
  for (const re of LABELS) {
    let best: { amount: number; currency: string } | null = null;
    for (const m of t.matchAll(re)) {
      const after = t.slice(m.index! + m[0].length, m.index! + m[0].length + 40);
      const money = moneyMentions(after.replace(/^[\s:=-]*(?:\(incl[^)]*\))?[\s:=-]*/i, ' '))[0];
      if (money && money.at < 20) best = { amount: money.amount, currency: money.currency }; // the last "total" is the final one
    }
    if (best) return best;
  }
  return null;
}

/** Who a receipt is from, as you know them ("Uber Receipts" <noreply@uber.com> → Uber). */
export function mailMerchant(h: Pick<MailHeader, 'from' | 'fromName' | 'subject'>): string | null {
  const brand = knownMerchant(`${h.fromName} ${h.from}`) ?? knownMerchant(h.subject);
  if (brand) return brand.name;
  const name = h.fromName
    .replace(/\b(receipts?|invoices?|billing|payments?|orders?|no-?reply|notifications?|support|team|care|alerts?|updates?|india|in)\b/gi, '')
    .replace(/[^\p{L}\p{N}&.' -]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (name.length >= 2) return name;
  const d = domainOf(h.from).split('.').filter((x) => !/^(mail|email|e|info|noreply|no-reply|in|co|com|net|org|app|io)$/.test(x))[0];
  return d ? d.charAt(0).toUpperCase() + d.slice(1) : null;
}

/* ------------------------------------------------------------------ */
/* Flights and stays                                                    */
/* ------------------------------------------------------------------ */

export interface ParsedFlight {
  airline: string | null;
  flightNo: string | null;
  pnr: string | null;
  from: string | null;
  to: string | null;
  /** ISO day of departure. */
  date: string;
  /** Departure time "HH:MM" when given. */
  time: string | null;
}

export interface ParsedStay {
  name: string;
  checkIn: string;
  checkOut: string | null;
  place: string | null;
}

/** Common airports: IATA code → city (a three-letter word that isn't one of these is not a route). */
export const AIRPORTS: Record<string, string> = {
  BLR: 'Bengaluru', DEL: 'Delhi', BOM: 'Mumbai', MAA: 'Chennai', HYD: 'Hyderabad', CCU: 'Kolkata', PNQ: 'Pune', GOI: 'Goa', GOX: 'Goa', COK: 'Kochi', AMD: 'Ahmedabad',
  JAI: 'Jaipur', LKO: 'Lucknow', IXC: 'Chandigarh', TRV: 'Thiruvananthapuram', IXB: 'Bagdogra', GAU: 'Guwahati', PAT: 'Patna', BBI: 'Bhubaneswar', NAG: 'Nagpur', IDR: 'Indore',
  VNS: 'Varanasi', SXR: 'Srinagar', IXL: 'Leh', UDR: 'Udaipur', ATQ: 'Amritsar', IXE: 'Mangaluru', CJB: 'Coimbatore', VTZ: 'Visakhapatnam', IXZ: 'Port Blair', DED: 'Dehradun',
  DXB: 'Dubai', AUH: 'Abu Dhabi', DOH: 'Doha', SIN: 'Singapore', BKK: 'Bangkok', KUL: 'Kuala Lumpur', CMB: 'Colombo', KTM: 'Kathmandu', MLE: 'Malé', HKG: 'Hong Kong',
  LHR: 'London', LGW: 'London', CDG: 'Paris', FRA: 'Frankfurt', AMS: 'Amsterdam', MUC: 'Munich', ZRH: 'Zurich', IST: 'Istanbul', JFK: 'New York', EWR: 'New York',
  SFO: 'San Francisco', LAX: 'Los Angeles', ORD: 'Chicago', SEA: 'Seattle', BOS: 'Boston', YYZ: 'Toronto', YVR: 'Vancouver', SYD: 'Sydney', MEL: 'Melbourne', NRT: 'Tokyo', HND: 'Tokyo',
};
const CITY_CODES: Array<[RegExp, string]> = Object.entries(AIRPORTS).map(([code, city]) => [new RegExp(`\\b${city}\\b`, 'i'), code]);
CITY_CODES.push([/\bBangalore\b/i, 'BLR'], [/\bNew Delhi\b/i, 'DEL'], [/\bBombay\b/i, 'BOM'], [/\bMadras\b/i, 'MAA'], [/\bCalcutta\b/i, 'CCU'], [/\bCochin\b/i, 'COK'], [/\bMangalore\b/i, 'IXE']);

const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
const pad = (n: number) => String(n).padStart(2, '0');

/** Dates a travel email mentions, in order: "12 Oct 2026", "Sat, 12 Oct", "12-Oct-26", "2026-10-12", "Oct 12, 2026", "12/10/2026". */
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

export function parseFlight(mail: Mail): ParsedFlight | null {
  const t = `${mail.subject}\n${mail.text}`.replace(/ /g, ' ');
  const who = `${mail.fromName} ${mail.from}`;
  const airline = AIRLINE_DOMAINS.find(([re]) => re.test(who) || re.test(t))?.[1] ?? null;
  const flightNo = /\b(6E|AI|UK|QP|SG|IX|I5|EK|QR|EY|SQ|LH|BA|UA|DL|AC|G8|TR|FZ|WY|TG|MH|CX)[\s-]?(\d{2,4})\b/.exec(t);
  const pnr = /\b(?:PNR|booking (?:reference|ref\.?|id)|confirmation (?:number|code|no\.?)|reservation code|airline pnr)\s*(?:no\.?|number|is|:|#|-)*\s*([A-Z0-9]{6})\b/i.exec(t)?.[1]?.toUpperCase() ?? null;
  // Route: a pair of airport codes ("BLR → DEL", "BLR-DEL", "BLR to DEL"), else two known cities ("Bengaluru to Delhi").
  let from: string | null = null;
  let to: string | null = null;
  for (const m of t.matchAll(/\b([A-Z]{3})\b\s*(?:-|–|—|→|->|>|to|✈)\s*\b([A-Z]{3})\b/g)) {
    if (AIRPORTS[m[1]!] && AIRPORTS[m[2]!] && m[1] !== m[2]) {
      from = m[1]!;
      to = m[2]!;
      break;
    }
  }
  if (!from) {
    const m = /\b([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\s+(?:to|-|–|→)\s+([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\b/.exec(t);
    const a = m ? CITY_CODES.find(([re]) => re.test(m[1]!))?.[1] : undefined;
    const b = m ? CITY_CODES.find(([re]) => re.test(m[2]!))?.[1] : undefined;
    if (a && b && a !== b) (from = a), (to = b);
  }
  // Departure: the first date after "depart"/"departure"/the route, else the first date in the mail.
  const dates = mailDates(t, mail.date);
  const dep = /\b(?:depart(?:ure|s|ing)?|onward|travel date|flight date|date of (?:journey|travel))\b/i.exec(t);
  const d = (dep ? dates.find((x) => x.at > dep.index) : undefined) ?? dates[0];
  if (!d || (!flightNo && !(from && to))) return null;
  const near = t.slice(d.at, d.at + 60);
  const time = /\b([01]?\d|2[0-3])[:.]([0-5]\d)\s*(am|pm|hrs|h)?\b/i.exec(near);
  let hh = time ? Number(time[1]) : null;
  if (time && hh != null && /pm/i.test(time[3] ?? '') && hh < 12) hh += 12;
  if (time && hh === 12 && /am/i.test(time[3] ?? '')) hh = 0;
  return { airline, flightNo: flightNo ? `${flightNo[1]} ${flightNo[2]}` : null, pnr, from, to, date: d.day, time: time ? `${pad(hh!)}:${time[2]}` : null };
}

export function parseStay(mail: Mail): ParsedStay | null {
  const t = `${mail.subject}\n${mail.text}`.replace(/ /g, ' ');
  const ci = /\bcheck-?\s?in\b[^\n]{0,40}/i.exec(t);
  const co = /\bcheck-?\s?out\b[^\n]{0,40}/i.exec(t);
  const inDate = ci ? mailDates(ci[0], mail.date)[0] : undefined;
  if (!inDate) return null;
  const outDate = co ? mailDates(co[0], mail.date)[0] : undefined;
  const name =
    /\b(?:[Yy]our (?:stay|booking|reservation) (?:is confirmed )?at|booked at|[Rr]eservation at|[Ww]elcome to|[Hh]otel:?)[ \t]+([A-Z][\w&'.,-]*(?:[ \t]+[A-Z&][\w&'.,-]*){0,6})/.exec(t)?.[1]?.replace(/[.,]+$/, '') ??
    /confirm(?:ed|ation)(?:[:\s-]+| at )([A-Z][\w&'.-]*(?:[ \t]+[A-Z&][\w&'.-]*){0,6})/.exec(mail.subject)?.[1] ??
    null;
  if (!name) return null;
  const place = CITY_CODES.find(([re]) => re.test(t))?.[1];
  return { name, checkIn: inDate.day, checkOut: outDate?.day ?? null, place: place ? AIRPORTS[place]! : null };
}

/* ------------------------------------------------------------------ */
/* One mail → what it means                                             */
/* ------------------------------------------------------------------ */

export type MailParse =
  | { kind: 'txn'; txn: ParsedTxn }
  | { kind: 'delivery'; delivery: ParsedDelivery }
  | { kind: 'flight'; flight: ParsedFlight; txn: ParsedTxn | null }
  | { kind: 'stay'; stay: ParsedStay; txn: ParsedTxn | null }
  | { kind: 'skip'; reason: string };

const iso = (at: number) => {
  const d = new Date(at);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

function receiptTxn(mail: Mail): ParsedTxn | null {
  const money = receiptAmount(`${mail.subject}\n${mail.text}`);
  if (!money) return null;
  const merchant = mailMerchant(mail);
  const brand = knownMerchant(merchant) ?? null;
  const refund = /\brefund(?:ed)?\b/i.test(mail.subject);
  const recurring = !!brand?.subscription || /\b(subscription|renew(?:al|ed)|membership|plan)\b/i.test(mail.subject);
  return {
    amount: money.amount,
    direction: refund ? 'credit' : 'debit',
    currency: money.currency,
    inrAmount: null,
    investment: false,
    fund: null,
    bank: null,
    channel: 'other',
    last4: /\b(?:card|a\/c|account|visa|mastercard|rupay|amex)\b[^\n]{0,20}?(?:x+|\*+|ending(?:\s+in)?\s*)(\d{4})\b/i.exec(mail.text)?.[1] ?? null,
    isCard: /\b(?:credit|debit) card\b|\bvisa\b|\bmastercard\b|\brupay\b|\bamex\b/i.test(mail.text),
    counterparty: merchant,
    vpa: null,
    ref: /\b(?:order|invoice|receipt|transaction|booking)\s*(?:id|no\.?|number|#)\s*[:#]?\s*([A-Z0-9-]{6,})\b/i.exec(mail.text)?.[1] ?? null,
    balance: null,
    date: iso(mail.date),
    transfer: false,
    recurring,
    brand,
  };
}

export function parseMail(mail: Mail): MailParse {
  const kind = mailKind(mail);
  if (!kind) return { kind: 'skip', reason: 'not a receipt, booking or alert' };
  if (kind === 'bank') {
    const r = parseBankSms(`${mail.subject}\n${mail.text}`.slice(0, 2000), mail.fromName || mail.from);
    return r.kind === 'txn' ? { kind: 'txn', txn: { ...r.txn, date: r.txn.date ?? iso(mail.date) } } : { kind: 'skip', reason: r.reason };
  }
  if (kind === 'shipping') {
    const d = parseDeliverySms(`${mail.subject}. ${mail.text.slice(0, 1500)}`, `${mail.fromName} ${mail.from}`, mail.date);
    return d ? { kind: 'delivery', delivery: d } : { kind: 'skip', reason: 'shipping mail without an order' };
  }
  if (kind === 'flight') {
    const f = parseFlight(mail);
    if (f) return { kind: 'flight', flight: f, txn: receiptTxn(mail) };
  }
  if (kind === 'stay') {
    const s = parseStay(mail);
    if (s) return { kind: 'stay', stay: s, txn: receiptTxn(mail) };
  }
  const txn = receiptTxn(mail);
  return txn ? { kind: 'txn', txn } : { kind: 'skip', reason: 'no amount found' };
}
