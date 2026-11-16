import { AIRLINE_DOMAINS, mailDates, type Mail } from '@core/filing/mail';

/** Flight tickets and stay bookings in mail → parsed (travel filing, R1 / R7d). */

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
  /** The check-in window or start, as the mail says it ("15:00–19:00", "from 14:00"); R7g slice 2. */
  checkInTime?: string | null;
  /** "by 11:00". */
  checkOutTime?: string | null;
  total?: { amount: number; currency: string } | null;
  /** The mail says it is paid already. */
  paid?: boolean;
  /** The last day it can be cancelled for free. */
  cancelBy?: string | null;
}

const hhmm = (h: string, m: string, ap?: string) => {
  let x = Number(h);
  if (ap && /pm/i.test(ap) && x < 12) x += 12;
  if (ap && /am/i.test(ap) && x === 12) x = 0;
  return `${String(x).padStart(2, '0')}:${m}`;
};
const TIME = /(\d{1,2})[:.](\d{2})\s*(am|pm)?/i;
const CUR: Record<string, string> = { '₹': 'INR', inr: 'INR', rs: 'INR', 'rs.': 'INR', '¥': 'JPY', jpy: 'JPY', 'us$': 'USD', $: 'USD', usd: 'USD', '€': 'EUR', eur: 'EUR' };

/** What a stay mail says about times, money and cancellation (R7g slice 2). */
export function stayDetails(t: string, ciWindow: string | null, coWindow: string | null, sentAt: number): Pick<ParsedStay, 'checkInTime' | 'checkOutTime' | 'total' | 'paid' | 'cancelBy'> {
  const range = ciWindow ? /(\d{1,2})[:.](\d{2})\s*(?:–|-|to)\s*(\d{1,2})[:.](\d{2})/.exec(ciWindow) : null;
  const ciTime = ciWindow ? TIME.exec(ciWindow) : null;
  const coTime = coWindow ? TIME.exec(coWindow) : null;
  const money = /\b(?:total(?:\s+(?:price|amount|cost|charge))?|grand total|amount paid|you paid|total amount paid)\b[^\d₹¥$€\n]{0,14}(₹|INR|Rs\.?|¥|JPY|US\$|\$|USD|€|EUR)\s?([\d,]+(?:\.\d{1,2})?)/i.exec(t);
  const cancel = /\bfree cancell?ation\s+(?:until|till|before|by|up to)\s+([^\n]{3,48})/i.exec(t);
  return {
    checkInTime: range ? `${hhmm(range[1]!, range[2]!)}–${hhmm(range[3]!, range[4]!)}` : ciTime ? `from ${hhmm(ciTime[1]!, ciTime[2]!, ciTime[3])}` : null,
    checkOutTime: coTime ? `by ${hhmm(coTime[1]!, coTime[2]!, coTime[3])}` : null,
    total: money ? { amount: Number(money[2]!.replace(/,/g, '')), currency: CUR[money[1]!.toLowerCase()] ?? 'INR' } : null,
    paid: /\b(?:you paid|amount paid|paid in full|payment (?:received|successful))\b/i.test(t) && !/\bpay (?:at|on arrival|at the property)\b/i.test(t),
    cancelBy: cancel ? (mailDates(cancel[1]!, sentAt)[0]?.day ?? null) : null,
  };
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
const isoDay = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** Dates a travel email mentions, in order: "12 Oct 2026", "Sat, 12 Oct", "12-Oct-26", "2026-10-12", "Oct 12, 2026", "12/10/2026". */

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
  // "Bengaluru (BLR) 06:15 → Goa (GOX) 07:35": the first two known codes in brackets.
  if (!from) {
    const codes = [...t.matchAll(/\(([A-Z]{3})\)/g)].map((m) => m[1]!).filter((c, i, all) => AIRPORTS[c] && all.indexOf(c) === i);
    if (codes.length >= 2) (from = codes[0]!), (to = codes[1]!);
  }
  if (!from) {
    const m = /\b([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\s+(?:to|-|–|→)\s+([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\b/.exec(t);
    const a = m ? CITY_CODES.find(([re]) => re.test(m[1]!))?.[1] : undefined;
    const b = m ? CITY_CODES.find(([re]) => re.test(m[2]!))?.[1] : undefined;
    if (a && b && a !== b) (from = a), (to = b);
  }
  // Departure: the first date after "depart"/"departure"/the route, else the first one after the day it was sent, else the first.
  // A booking or issue date is never the flight's.
  const dates = mailDates(t, mail.date).filter((x) => !/\b(?:book(?:ing|ed)(?: date| on)?|issued(?: on)?|date of (?:booking|issue))\W{0,4}(?:\w+,?\s)?$/i.test(t.slice(Math.max(0, x.at - 30), x.at)));
  const dep = /\b(?:depart(?:ure|s|ing)?|onward|travel date|flight date|date of (?:journey|travel))\b/i.exec(t);
  const sent = isoDay(mail.date);
  const d = (dep ? dates.find((x) => x.at > dep.index) : undefined) ?? dates.find((x) => x.day > sent) ?? dates[0];
  if (!d || (!flightNo && !(from && to))) return null;
  const near = t.slice(d.at, d.at + 60);
  const time = /\b([01]?\d|2[0-3])[:.]([0-5]\d)\s*(am|pm|hrs|h)?\b/i.exec(near);
  let hh = time ? Number(time[1]) : null;
  if (time && hh != null && /pm/i.test(time[3] ?? '') && hh < 12) hh += 12;
  if (time && hh === 12 && /am/i.test(time[3] ?? '')) hh = 0;
  return { airline, flightNo: flightNo ? `${flightNo[1]} ${flightNo[2]}` : null, pnr, from, to, date: d.day, time: time ? `${pad(hh!)}:${time[2]}` : null };
}

export function parseStay(mail: Mail): ParsedStay | null {
  const body = mail.text.replace(/\u00a0/g, ' ');
  const t = `${mail.subject}\n${body}`;
  // The date may sit on the next line ("Check-in\nFri, Dec 18"), as Airbnb writes it.
  const ci = /\bcheck-?\s?in\b[\s\S]{0,40}/i.exec(t);
  const co = /\bcheck-?\s?out\b[\s\S]{0,40}/i.exec(t);
  const inDate = ci ? mailDates(ci[0], mail.date)[0] : undefined;
  if (!inDate) return null;
  const outDate = co ? mailDates(co[0], mail.date)[0] : undefined;
  const NAME = "([A-Z][\\w&'.,-]*(?:[ \\t]+[A-Z&][\\w&'.,-]*){0,6})";
  const inText = (text: string) =>
    new RegExp(`\\b(?:[Yy]our (?:stay|booking|reservation) (?:is confirmed )?at|booked at|[Rr]eservation at|[Ww]elcome to|[Hh]otel(?: [Nn]ame)?:|[Pp]roperty:)[ \\t]*${NAME}`).exec(text)?.[1]?.replace(/[.,]+$/, '');
  const name =
    inText(body) ??
    inText(mail.subject) ??
    // Airbnb names the listing, lower case and all: "Reservation confirmed - Sea-view studio in Anjuna".
    /\breservation confirmed(?: for| -| –|:)\s*(.+)$/i.exec(mail.subject)?.[1]?.trim() ??
    /confirm(?:ed|ation)(?:[:\s-]+| at )([A-Z][\w&'.-]*(?:[ \t]+[A-Z&][\w&'.-]*){0,6})/.exec(mail.subject)?.[1] ??
    null;
  if (!name) return null;
  const city = CITY_CODES.find(([re]) => re.test(t))?.[1];
  const place = city ? AIRPORTS[city]! : (/\bin ([A-Z][a-z]+(?: [A-Z][a-z]+)?)$/.exec(name)?.[1] ?? null);
  return { name, checkIn: inDate.day, checkOut: outDate?.day ?? null, place, ...stayDetails(t, ci ? ci[0].slice(0, 80) : null, co ? co[0].slice(0, 80) : null, mail.date) };
}

/* ------------------------------------------------------------------ */
/* One mail → what it means                                             */
/* ------------------------------------------------------------------ */

