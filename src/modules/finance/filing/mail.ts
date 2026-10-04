import { domainOf, mailDates, type Mail, type MailHeader } from '@core/filing/mail';
import { moneyMentions, parseBankSms, type ParsedTxn } from './bankSms';
import { knownMerchant } from './merchants';

/** Receipts, invoices and bank-alert mails → a parsed transaction (finance filing, R1). */

const iso = (at: number) => {
  const d = new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

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


export function receiptTxn(mail: Mail): ParsedTxn | null {
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

