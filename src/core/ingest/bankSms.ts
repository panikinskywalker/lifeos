/**
 * Bank / card / UPI alerts → transactions (PRODUCT v4 §1.5). Pure: one SMS or
 * notification text in, a parsed transaction (or null) out. A generic parser
 * reads the shapes every Indian bank uses (amount, debit/credit, account or
 * card last digits, merchant / VPA, reference, balance); bank headers only
 * name the institution. OTPs, promos, bill reminders and mandate notices
 * are recognised and skipped. The raw text is always kept by the caller.
 */

export type TxnChannel = 'upi' | 'card' | 'netbanking' | 'atm' | 'wallet' | 'emi' | 'other';

export interface ParsedTxn {
  amount: number;
  direction: 'debit' | 'credit';
  currency: string;
  /** hdfc | icici | sbi | axis | kotak | amex | … or null when only the text says so. */
  bank: string | null;
  channel: TxnChannel;
  /** Last digits of the account or card the money moved on. */
  last4: string | null;
  isCard: boolean;
  /** Who was paid / who paid (a shop, a person, a VPA's name). */
  counterparty: string | null;
  vpa: string | null;
  ref: string | null;
  balance: number | null;
  /** ISO day when the text says it, else null (use the received time). */
  date: string | null;
  /** Money moved between your own accounts (card bill paid, self transfer). */
  transfer: boolean;
  /** When spent in another currency and the message also gives the rupee amount. */
  inrAmount: number | null;
  /** A mutual fund purchase (SIP) or redemption: an investment, not spending. */
  investment: boolean;
  fund: string | null;
}

export type SmsKind = { kind: 'txn'; txn: ParsedTxn } | { kind: 'skip'; reason: 'otp' | 'promo' | 'bill' | 'mandate' | 'declined' | 'info' | 'investment-confirmation' | 'delivery' };

/** DLT sender headers ("VM-HDFCBK", "AX-ICICIT-S", "JD-SBIINB") → bank. */
const HEADERS: Array<[RegExp, string, string]> = [
  [/HDFC/i, 'hdfc', 'HDFC Bank'],
  [/ICICI/i, 'icici', 'ICICI Bank'],
  [/SBI|CBSSBI|SBIPSG|ATMSBI/i, 'sbi', 'SBI'],
  [/AXIS/i, 'axis', 'Axis Bank'],
  [/KOTAK|KMBL/i, 'kotak', 'Kotak'],
  [/AMEX/i, 'amex', 'Amex'],
  [/IDFC/i, 'idfc', 'IDFC FIRST'],
  [/YESB|YESBNK/i, 'yes', 'Yes Bank'],
  [/INDUS/i, 'indusind', 'IndusInd'],
  [/PNB/i, 'pnb', 'PNB'],
  [/BOB|BARODA/i, 'bob', 'Bank of Baroda'],
  [/SCBANK|STANC/i, 'sc', 'Standard Chartered'],
  [/CITI/i, 'citi', 'Citi'],
  [/HSBC/i, 'hsbc', 'HSBC'],
  [/ONECRD|ONECARD/i, 'onecard', 'OneCard'],
  [/AUBANK|AUSFB/i, 'au', 'AU Bank'],
  [/FEDBNK|FEDERAL/i, 'federal', 'Federal Bank'],
  [/CANBNK|CANARA/i, 'canara', 'Canara Bank'],
  [/UNIONB/i, 'union', 'Union Bank'],
  [/PAYTM/i, 'paytm', 'Paytm'],
  [/JUPITER/i, 'jupiter', 'Jupiter'],
  [/SLICE/i, 'slice', 'slice'],
];

export const BANK_NAMES: Record<string, string> = Object.fromEntries(HEADERS.map(([, id, name]) => [id, name]));

/** Which bank a sender header (or the text) names. */
export function bankOf(sender: string | null | undefined, text = ''): string | null {
  const h = (sender ?? '').toUpperCase();
  for (const [re, id] of HEADERS) if (re.test(h)) return id;
  for (const [re, id] of HEADERS) if (new RegExp(`\\b${re.source}`, 'i').test(text) && /bank|card|a\/c|acct/i.test(text)) return id;
  return null;
}

/** A sender that looks like a bank/card/UPI service: a DLT header, or a short code whose texts talk money. */
export function looksLikeBankSender(sender: string, sampleText = ''): boolean {
  const s = sender.trim().toUpperCase();
  if (/^\+?\d{10,}$/.test(s)) return false; // a person's phone number
  const dlt = /^[A-Z]{2}-[A-Z0-9]{4,8}(-[A-Z])?$/.test(s) || /^[A-Z0-9]{5,9}$/.test(s);
  if (!dlt) return false;
  return !!bankOf(s) || /(debited|credited|spent|a\/c|acct|avl bal|upi|card ending|withdrawn)/i.test(sampleText);
}

/** Every money mention: "Rs.450", "INR 1,240.00", "USD 45.00", "$45", "£12.50", "¥3,200", "AED 150", "45.00 USD". */
const MONEY = /(?:(INR|Rs\.?|₹|USD|US\$|\$|GBP|£|JPY|JP¥|¥|AED|Dhs\.?)\s?([\d,]+(?:\.\d{1,2})?))|(?:\b([\d,]+(?:\.\d{1,2})?)\s?(INR|USD|GBP|JPY|AED)\b)/gi;
const CURRENCY: Record<string, string> = { inr: 'INR', rs: 'INR', 'rs.': 'INR', '₹': 'INR', usd: 'USD', 'us$': 'USD', $: 'USD', gbp: 'GBP', '£': 'GBP', jpy: 'JPY', 'jp¥': 'JPY', '¥': 'JPY', aed: 'AED', dhs: 'AED', 'dhs.': 'AED' };
/** Words right before a figure that make it not the transaction: a limit, a balance, a due. */
const NOT_THE_AMOUNT = /(?:\b(?:avl|avbl|available|avail|total|credit|cr|card|clear|ledger|min(?:imum)?|outstanding|o\/s)\b[\s.:]*)?\b(?:lmt|limit|bal|balance|outstanding|due|amount due|amt due|dues)\b[^\d\n]{0,14}$/i;

interface Money { amount: number; currency: string; at: number }

export function moneyMentions(t: string): Money[] {
  const out: Money[] = [];
  for (const m of t.matchAll(MONEY)) {
    const cur = CURRENCY[(m[1] ?? m[4] ?? '').toLowerCase()] ?? 'INR';
    const amount = Number((m[2] ?? m[3] ?? '').replace(/,/g, ''));
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const before = t.slice(Math.max(0, m.index! - 40), m.index!);
    if (NOT_THE_AMOUNT.test(before)) continue;
    out.push({ amount, currency: cur, at: m.index! });
  }
  return out;
}

const MF = /\b(mutual fund|mutual funds|\bmf\b|folio|\bnav\b|units? (?:allotted|allocated|redeemed|purchased)|\bsip\b|systematic investment|cams|kfin|kfintech|\bamc\b|elss)/i;
const MF_REGISTRAR = /\b(cams|kfin|kfintech|units? (?:allotted|allocated)|folio (?:no|number)|nav of|nav as on)\b/i;
const num = (s: string) => Number(s.replace(/,/g, ''));
const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
const pad = (n: number) => String(n).padStart(2, '0');
const yr = (y: string) => (y.length === 2 ? 2000 + Number(y) : Number(y));

/** "26-09-26", "26/09/2026", "26-Sep-26", "26Sep26", "2026-09-26", "26 September 2026". */
function findDate(t: string): string | null {
  let m = /\b(20\d{2})-(\d{2})-(\d{2})\b/.exec(t);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /\b(\d{1,2})[-/ ]?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[-/ ,]*(\d{2,4})\b/i.exec(t);
  if (m) return `${yr(m[3]!)}-${pad(MONTHS[m[2]!.toLowerCase()]! + 1)}-${pad(Number(m[1]))}`;
  m = /\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/.exec(t);
  if (m && Number(m[2]) <= 12) return `${yr(m[3]!)}-${pad(Number(m[2]))}-${pad(Number(m[1]))}`;
  return null;
}

const clean = (s: string) =>
  s
    .replace(/\s+/g, ' ')
    .replace(/^(?:VPA|UPI|to|at|on)\s+/i, '')
    .replace(/[\s.;,:-]+$/, '')
    .trim();

function counterpartyOf(t: string): { name: string | null; vpa: string | null } {
  const vpa = /\b([a-z0-9._-]{2,}@[a-z]{2,})\b/i.exec(t)?.[1]?.toLowerCase() ?? null;
  const patterns: RegExp[] = [
    /UPI\/(?:P2[AM]|CR|DR)\/\d+\/([^/\n]+?)(?:\/|\n|$)/i, // UPI/P2M/4269…/NETFLIX
    /\bInfo:?\s*(?:UPI\/)?([A-Za-z][^\n.;]{1,40}?)(?:\.(?=\s|$)|;|\n|$)/i,
    /\bon\s+\d{1,2}[-\s/]?[A-Za-z]{3}[-\s/]?\d{2,4}\s+(?:on|at)\s+([A-Za-z0-9][A-Za-z0-9 &'._*-]{1,40}?)(?:\.(?=\s|$)|\n|$)/i, // ICICI: "on 26-Sep-26 on AMAZON US."
    /\bat\s+([A-Za-z0-9][A-Za-z0-9 &'._*-]{1,40}?)\s+(?:on|dated|via|using|at\s+\d|\.(?=\s|$)|Avl|Bal)\b/i,
    /\bat\s+([A-Za-z0-9][A-Za-z0-9 &'._*-]{1,40}?)(?:\.(?=\s|$)|\n|$)/i,
    /;\s*([A-Za-z][A-Za-z0-9 &'._-]{1,40}?)\s+credited\b/i, // ICICI: "…; SWIGGY credited."
    /\b(?:trf|transfer(?:red)?)\s+(?:to|from)\s+([A-Za-z][A-Za-z0-9 &'._-]{1,40}?)(?:\s+Ref|\s+on\b|\.(?=\s|$)|\n|$)/i,
    /\bfrom\s+(?:VPA\s+)?([A-Za-z][A-Za-z0-9 &'._@-]{1,40}?)(?:\s*\(|\s+on\b|\s+Ref|\.(?=\s|$)|\n|$)/i,
    /\bto\s+(?:VPA\s+)?([A-Za-z][A-Za-z0-9 &'._@-]{1,40}?)(?:\s+on\b|\s+Ref|\s+UPI|\.(?=\s|$)|\n|$)/i,
    /\bby\s+([A-Za-z][A-Za-z0-9 &'._-]{1,40}?)(?:\s+on\b|\s+Ref|\.(?=\s|$)|\n|$)/i,
    /\btowards\s+([A-Za-z][A-Za-z0-9 &'._-]{1,40}?)(?:\s+on\b|\.(?=\s|$)|\n|$)/i,
  ];
  for (const re of patterns) {
    const m = re.exec(t);
    if (!m) continue;
    let name = clean(m[1]!);
    if (/^(your|a\/?c|acct|account|card|hdfc|icici|sbi|axis|kotak|bank|you|the)\b/i.test(name) || /^x+\d+$/i.test(name)) continue;
    if (name.includes('@')) name = name.split('@')[0]!.replace(/[._-]+/g, ' ');
    if (name.length >= 2) return { name: name.slice(0, 40), vpa };
  }
  return { name: vpa ? vpa.split('@')[0]!.replace(/[._-]+/g, ' ') : null, vpa };
}

/** Read one bank / card / UPI alert. */
export function parseBankSms(text: string, sender?: string | null): SmsKind {
  const t = text.replace(/\r/g, '');
  const lower = t.toLowerCase();
  if (/\b(otp|one[- ]time password|verification code|passcode)\b/.test(lower)) return { kind: 'skip', reason: 'otp' };
  if (/\b(declined|failed|unsuccessful|could not be processed|reversal pending)\b/.test(lower) && !/\b(reversed|refund)/.test(lower)) return { kind: 'skip', reason: 'declined' };
  if (/\b(pre-?approved|offer|cashback up to|apply now|eligible for|loan of|win |congratulations|limit increase|upgrade)\b/.test(lower) && !/\b(debited|credited|spent|sent|received)\b/.test(lower)) return { kind: 'skip', reason: 'promo' };
  if (/\b(is due|due on|due date|minimum amount due|total amount due|statement (?:generated|for)|bill (?:of|for) .* (?:generated|is))\b/.test(lower) && !/\b(debited|credited|spent|received|paid)\b/.test(lower)) return { kind: 'skip', reason: 'bill' };
  if (/\b(will be debited|mandate|autopay (?:request|set)|e-?mandate|si (?:registered|request)|standing instruction)\b/.test(lower) && !/\b(has been debited|was debited|is debited|got debited)\b/.test(lower)) return { kind: 'skip', reason: 'mandate' };

  // Mutual funds: the registrar's "units allotted / folio" confirmation repeats the bank debit — skip it; the debit is the investment.
  const mf = MF.test(t);
  const hasAccount = /(?:a\/?c|acct|account)\s*(?:no\.?)?\s*[:\s]*[xX*]+\s*\d{3,6}/i.test(t);
  if (mf && MF_REGISTRAR.test(t) && !hasAccount) return { kind: 'skip', reason: 'investment-confirmation' };

  const mentions = moneyMentions(t);
  const fallback = /\b(?:debited|credited)\s+(?:by|with|for)\s+([\d,]+(?:\.\d{1,2})?)\b/i.exec(t);
  if (!mentions.length && !fallback) return { kind: 'skip', reason: 'info' };
  // A foreign spend often comes with its rupee amount ("USD 45.00 (INR 3,760.12)"): keep both.
  const foreign = mentions.find((m) => m.currency !== 'INR');
  const inr = mentions.find((m) => m.currency === 'INR');
  const main = foreign ?? inr ?? { amount: num(fallback![1]!), currency: 'INR', at: fallback!.index };
  const amount = main.amount;
  const currency = main.currency;
  const inrAmount = foreign && inr && inr.at > foreign.at && inr.at - foreign.at < 60 ? inr.amount : null;

  const creditWords = /\b(credited|received|deposited|refund(?:ed)?|reversed|cashback (?:of|credited)|added to|payment (?:of .* )?received)\b/i;
  const debitWords = /\b(debited|spent|withdrawn|sent|paid|purchase|charged|debit(?:ed)?|txn of|transferred to|used for|made a (?:payment|transaction))\b/i;
  const ci = t.search(creditWords);
  const di = t.search(debitWords);
  if (ci < 0 && di < 0) return { kind: 'skip', reason: 'info' };
  // "debited … ; SWIGGY credited" (ICICI) is a debit: the first word decides.
  const direction: 'debit' | 'credit' = di >= 0 && (ci < 0 || di < ci) ? 'debit' : 'credit';

  const isCard = /\b(credit card|debit card|card (?:no\.?|ending|xx|x+|\*+)|card\s*[x*]{0,4}\d{4}|using (?:your )?(?:\w+ )?card|on (?:your )?(?:\w+ )?card|amex card)\b/i.test(t);
  const last4 =
    /(?:a\/?c|acct|account|card|ac)(?:\s*(?:no\.?|number|ending(?:\s+in)?|with))?\s*[:\s]*(?:[xX*]+|\.\.)?\s*(\d{3,6})\b/i.exec(t)?.[1]?.slice(-4) ??
    // A bare "XX1234" is an account — unless it's a mutual fund folio number.
    (mf ? null : /\b[xX*]{2,}(\d{3,6})\b/.exec(t)?.[1]?.slice(-4)) ??
    null;
  const upi = /\bupi\b|@[a-z]{2,}\b|\bvpa\b/i.test(t);
  const channel: TxnChannel = /\batm\b|withdrawn/i.test(t) ? 'atm' : upi ? 'upi' : isCard ? 'card' : /\b(neft|imps|rtgs|net ?banking|ib)\b/i.test(t) ? 'netbanking' : /\bemi\b/i.test(t) ? 'emi' : /wallet/i.test(t) ? 'wallet' : 'other';
  const bal = /(?:\b(?:avl|avbl|available|a\/c|clear)\.?\s*)?\b(?:bal(?:ance)?|lmt|limit)[:\s.]*(?:is\s*)?(?:INR|Rs\.?|₹)\s?([\d,]+(?:\.\d{1,2})?)/i.exec(t);
  const ref = /(?:upi\s*ref(?:\s*no)?|ref(?:erence)?\s*(?:no|number)?|utr|rrn|txn\s*(?:id|no)|upi)[:\s#.]*\b([A-Z0-9]{8,})\b/i.exec(t)?.[1] ?? null;
  const { name, vpa } = counterpartyOf(t);
  const transfer = direction === 'credit' && isCard && /\b(payment|received towards|thank you for (?:your )?payment)\b/i.test(t);
  const fund = mf ? (/\b(?:in|of|for|towards|to)\s+([A-Z][A-Za-z0-9&.' -]{2,50}?(?:Mutual Fund|Fund|MF|Scheme))\b/i.exec(t)?.[1]?.trim() ?? /\b([A-Z][A-Za-z&]+(?:\s[A-Z][A-Za-z&]+){0,3})\s+(?:Mutual Fund|MF)\b/.exec(t)?.[1]?.trim() ?? null) : null;
  return {
    kind: 'txn',
    txn: {
      amount,
      direction,
      currency,
      inrAmount,
      investment: mf,
      fund,
      bank: bankOf(sender, t),
      channel,
      last4,
      isCard,
      counterparty: name,
      vpa,
      ref,
      balance: bal ? num(bal[1]!) : null,
      date: findDate(t),
      transfer,
    },
  };
}

/** UPI / payment app notifications (GPay, PhonePe, Paytm, CRED, bank apps): title + text. */
export const PAYMENT_APPS: Record<string, string> = {
  'com.google.android.apps.nbu.paisa.user': 'Google Pay',
  'com.phonepe.app': 'PhonePe',
  'net.one97.paytm': 'Paytm',
  'com.dreamplug.androidapp': 'CRED',
  'in.org.npci.upiapp': 'BHIM',
  'com.snapwork.hdfc': 'HDFC Bank',
  'com.csam.icici.bank.imobile': 'iMobile',
  'com.sbi.lotusintouch': 'YONO SBI',
  'com.axis.mobile': 'Axis Mobile',
  'com.msf.kbank.mobile': 'Kotak',
  'com.americanexpress.android.acctsvcs.in': 'Amex',
};

/** UPI apps (short "₹450 paid to Swiggy" texts); every other listed app is a bank app that posts its SMS text. */
const UPI_APPS = new Set(['com.google.android.apps.nbu.paisa.user', 'com.phonepe.app', 'net.one97.paytm', 'com.dreamplug.androidapp', 'in.org.npci.upiapp']);

export function parsePaymentNotification(pkg: string, title: string, text: string): SmsKind {
  const both = `${title}\n${text}`;
  if (!UPI_APPS.has(pkg)) return parseBankSms(both, PAYMENT_APPS[pkg] ?? pkg);
  // "₹450 paid to Swiggy" / "Paid ₹450 to SWIGGY" / "You paid ₹450 to Swiggy" / "Received ₹2,600 from Priya"
  const m = /(?:(paid|sent|received|you received|you paid)\s+)?(?:INR|Rs\.?|₹)\s?([\d,]+(?:\.\d{1,2})?)\s*(paid|sent|received)?\s*(?:to|from)\s+([^\n.•]{2,40})/i.exec(both);
  if (m) {
    const verb = (m[1] ?? m[3] ?? '').toLowerCase();
    const direction = /received/.test(verb) || /\bfrom\b/i.test(m[0]) ? 'credit' : 'debit';
    return {
      kind: 'txn',
      txn: { amount: num(m[2]!), direction, currency: 'INR', inrAmount: null, investment: false, fund: null, bank: null, channel: 'upi', last4: /[xX*]{2,}(\d{3,4})/.exec(both)?.[1] ?? null, isCard: false, counterparty: clean(m[4]!), vpa: /\b([a-z0-9._-]{2,}@[a-z]{2,})\b/i.exec(both)?.[1] ?? null, ref: null, balance: null, date: null, transfer: false },
    };
  }
  // Bank apps post the same text as their SMS.
  return parseBankSms(both, PAYMENT_APPS[pkg] ?? pkg);
}

/** Same money movement seen twice (SMS + app notification, or two SMS): amount, direction, within 10 minutes. */
export function dedupeKey(t: Pick<ParsedTxn, 'amount' | 'direction'>, at: number): string {
  return `${t.direction}:${t.amount.toFixed(2)}:${Math.floor(at / (10 * 60_000))}`;
}
