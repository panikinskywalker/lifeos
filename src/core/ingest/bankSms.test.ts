import { describe, expect, it } from 'vitest';
import { bankOf, looksLikeBankSender, parseBankSms, parsePaymentNotification, type ParsedTxn } from './bankSms';

/** Fixtures in each bank's real shapes (numbers and names changed). */
const FIXTURES: Array<[sender: string, text: string, expect: Partial<ParsedTxn>]> = [
  ['VM-HDFCBK', 'Sent Rs.450.00\nFrom HDFC Bank A/C *1234\nTo SWIGGY\nOn 26/09/26\nRef 426912345678\nNot You?\nCall 18002586161/SMS BLOCK UPI to 7308080808', { amount: 450, direction: 'debit', bank: 'hdfc', last4: '1234', counterparty: 'SWIGGY', channel: 'upi', ref: '426912345678', date: '2026-09-26' }],
  ['AD-HDFCBK', 'Spent Rs.1240 On HDFC Bank Card 5678 At SWIGGY LIMITED On 2026-09-26:13:02:11 Bal Rs.45000.00 Not You? Call 18002586161/SMS BLOCK DC 5678 to 7308080808', { amount: 1240, direction: 'debit', isCard: true, last4: '5678', counterparty: 'SWIGGY LIMITED', channel: 'card', balance: 45000, date: '2026-09-26' }],
  ['VM-HDFCBK', 'Credit Alert!\nRs.2,600.00 credited to HDFC Bank A/c XX1234 on 26-09-26 from VPA priya.s@okaxis (UPI 426912345679)', { amount: 2600, direction: 'credit', last4: '1234', vpa: 'priya.s@okaxis', counterparty: 'priya s', channel: 'upi', date: '2026-09-26' }],
  ['JD-ICICIT-S', 'ICICI Bank Acct XX123 debited for Rs 1,240.00 on 26-Sep-26; SWIGGY credited. UPI:426912345680. Call 18002662 for dispute. SMS BLOCK 123 to 9215676766.', { amount: 1240, direction: 'debit', bank: 'icici', last4: '123', counterparty: 'SWIGGY', date: '2026-09-26', ref: '426912345680' }],
  ['AX-ICICIB', 'INR 3,499.00 spent using ICICI Bank Card XX9012 on 26-Sep-26 on AMAZON PAY IN. Avl Limit: INR 1,20,000.00. If not you, call 1800 2662/SMS BLOCK 9012 to 9215676766', { amount: 3499, direction: 'debit', isCard: true, last4: '9012', balance: 120000, date: '2026-09-26' }],
  ['BZ-SBIINB', 'Dear UPI user A/C X4567 debited by 450.0 on date 26Sep26 trf to SWIGGY Refno 426912345681. If not u? call 1800111109. -SBI', { amount: 450, direction: 'debit', bank: 'sbi', last4: '4567', counterparty: 'SWIGGY', date: '2026-09-26' }],
  ['VK-SBIINB', 'Dear SBI User, your A/c X4567-credited by Rs.50000 on 26Sep26 transfer from ACME PVT LTD Ref No 426912345682 -SBI', { amount: 50000, direction: 'credit', last4: '4567', counterparty: 'ACME PVT LTD' }],
  ['VM-AXISBK', 'INR 799.00 debited\nA/c no. XX7890\n26-09-26, 13:05:10\nUPI/P2M/426912345683/NETFLIX\nNot you? SMS BLOCKUPI Cust ID to 919951860002\nAxis Bank', { amount: 799, direction: 'debit', bank: 'axis', last4: '7890', counterparty: 'NETFLIX', channel: 'upi' }],
  ['VM-KOTAKB', 'Sent Rs.180.00 from Kotak Bank AC X2345 to canoe.blr@ybl on 26-09-26.UPI Ref 426912345684. Not you, https://kotak.com/KBANKT/Fraud', { amount: 180, direction: 'debit', bank: 'kotak', last4: '2345', vpa: 'canoe.blr@ybl' }],
  ['AM-AMEXIN', "Alert: You've spent INR 5,600.00 on your AMEX card ** 31007 at MAKEMYTRIP on 26 September 2026 at 01:05 PM IST. Call 18004191030 if this was not made by you.", { amount: 5600, direction: 'debit', bank: 'amex', isCard: true, counterparty: 'MAKEMYTRIP', date: '2026-09-26' }],
  ['VM-HDFCBK', 'Rs.2000 withdrawn from A/c XX1234 at ATM S1AW0123 on 26-09-26. Avl Bal Rs.12,000', { amount: 2000, direction: 'debit', channel: 'atm', balance: 12000 }],
  ['VM-HDFCBK', 'Rs.450.00 refunded to your HDFC Bank A/c XX1234 by SWIGGY on 27-09-26.', { amount: 450, direction: 'credit', counterparty: 'SWIGGY' }],
  ['JM-ICICIB', 'Payment of Rs 20,000.00 received towards your ICICI Bank Credit Card XX9012. Thank you.', { amount: 20000, direction: 'credit', isCard: true, transfer: true }],
  // The limit is never the amount — even when it comes first or is the only rupee figure.
  ['AX-ICICIB', 'Avl Lmt: INR 1,20,000.00. INR 649.00 spent on ICICI Bank Card XX9012 on 26-Sep-26 at NETFLIX.', { amount: 649, currency: 'INR', counterparty: 'NETFLIX' }],
  ['VM-HDFCBK', 'Available limit Rs 85,000. Spent Rs.1,240 on HDFC Bank Card 5678 at SWIGGY', { amount: 1240 }],
  // Foreign currency: the amount in its currency (the limit in rupees ignored); with the rupee figure when given.
  ['AX-ICICIB', 'USD 45.00 spent using ICICI Bank Card XX9012 on 26-Sep-26 on AMAZON US. Avl Limit: INR 1,20,000.00.', { amount: 45, currency: 'USD', inrAmount: null, counterparty: 'AMAZON US' }],
  ['VM-HDFCBK', 'Spent USD 45.00 (INR 3,760.12) on HDFC Bank Card 5678 at AMAZON US On 2026-09-26', { amount: 45, currency: 'USD', inrAmount: 3760.12 }],
  ['AM-AMEXIN', "Alert: You've spent GBP 12.50 on your AMEX card ** 31007 at PRET A MANGER on 26 September 2026.", { amount: 12.5, currency: 'GBP', counterparty: 'PRET A MANGER' }],
  ['AX-ICICIB', 'JPY 3,200 spent on ICICI Bank Card XX9012 on 26-Sep-26 at LAWSON TOKYO. Avl Lmt INR 1,18,000', { amount: 3200, currency: 'JPY' }],
  ['VM-HDFCBK', 'Spent AED 150.00 On HDFC Bank Card 5678 At DUBAI MALL On 2026-09-26', { amount: 150, currency: 'AED' }],
  ['VM-HDFCBK', 'Spent £8.40 On HDFC Bank Card 5678 At TFL TRAVEL On 2026-09-26', { amount: 8.4, currency: 'GBP' }],
  // Mutual funds: the bank debit is an investment, never a spend or a new "bank account" from the folio.
  ['VM-HDFCBK', 'Rs.5,000.00 debited from A/c XX1234 on 05-09-26 towards Parag Parikh Flexi Cap Fund SIP. Avl Bal Rs.40,000', { amount: 5000, investment: true, fund: 'Parag Parikh Flexi Cap Fund', last4: '1234' }],
  // Plain debit / credit with a balance after.
  ['VM-SBIINB', 'Your A/c X4567 is credited by Rs.1,500.00 on 26Sep26 by UPI from priya@okaxis. Avl Bal Rs 22,345.50 -SBI', { amount: 1500, direction: 'credit', balance: 22345.5 }],
  ['VM-SBIINB', 'Your A/c X4567 is debited by Rs.300.00 on 26Sep26. Avl Bal Rs 22,045.50 -SBI', { amount: 300, direction: 'debit', balance: 22045.5 }],
];

const SKIPS: Array<[sender: string, text: string, reason: string]> = [
  ['VM-HDFCBK', '123456 is your OTP for txn of Rs.450 at SWIGGY on HDFC Bank card xx5678. Valid 5 mins. Do not share.', 'otp'],
  ['VM-HDFCBK', 'Get a pre-approved Personal Loan of Rs.5,00,000 at 10.5%! Apply now: hdfc.bank/pl', 'promo'],
  ['JM-ICICIB', 'Your ICICI Bank Credit Card XX9012 statement is generated. Total Amount Due Rs 32,450.00, Minimum Amount Due Rs 1,630.00, due date 15-Oct-26.', 'bill'],
  ['VM-AXISBK', 'Rs 649 will be debited from A/c XX7890 on 01-10-26 towards NETFLIX mandate. To cancel, visit axisbank.com', 'mandate'],
  ['VM-HDFCBK', 'Txn of Rs.1240 on HDFC Bank Card 5678 at SWIGGY was declined due to insufficient balance.', 'declined'],
  ['CP-CAMSPM', 'Dear Investor, units allotted in Folio No XX7788 for Rs 5000 under Parag Parikh Flexi Cap Fund at NAV 78.12. CAMS', 'investment-confirmation'],
  ['VM-HDFCBK', 'Your HDFC Bank Credit Card XX5678 has an available limit of Rs 1,20,000 as on 26-Sep-26.', 'info'],
];

describe('bank SMS', () => {
  for (const [sender, text, want] of FIXTURES) {
    it(`${sender}: ${text.slice(0, 48).replace(/\n/g, ' ')}…`, () => {
      const r = parseBankSms(text, sender);
      expect(r.kind).toBe('txn');
      expect(r.kind === 'txn' ? r.txn : null).toMatchObject(want);
    });
  }
  it('skips OTPs, promos, bills, mandates and declines', () => {
    for (const [sender, text, reason] of SKIPS) expect([text.slice(0, 30), parseBankSms(text, sender)]).toEqual([text.slice(0, 30), { kind: 'skip', reason }]);
  });
  it('recognises bank senders, not people', () => {
    expect(looksLikeBankSender('VM-HDFCBK')).toBe(true);
    expect(looksLikeBankSender('JD-SBIINB-S')).toBe(true);
    expect(looksLikeBankSender('AX-FOOBAR', 'Rs 200 debited from a/c xx12')).toBe(true);
    expect(looksLikeBankSender('AX-SWIGGY', 'Your order is on the way')).toBe(false);
    expect(looksLikeBankSender('+919845012345', 'debited')).toBe(false);
    expect(bankOf('VM-HDFCBK')).toBe('hdfc');
  });
});

describe('payment app notifications', () => {
  it('Google Pay, PhonePe, Paytm', () => {
    expect(parsePaymentNotification('com.google.android.apps.nbu.paisa.user', 'Payment successful', '₹450 paid to Swiggy')).toMatchObject({ kind: 'txn', txn: { amount: 450, direction: 'debit', counterparty: 'Swiggy', channel: 'upi' } });
    expect(parsePaymentNotification('com.phonepe.app', 'Money received', 'Received ₹2,600 from Priya Sharma')).toMatchObject({ kind: 'txn', txn: { amount: 2600, direction: 'credit', counterparty: 'Priya Sharma' } });
    expect(parsePaymentNotification('net.one97.paytm', 'Paid Rs.180 to Canoe', 'From Paytm UPI')).toMatchObject({ kind: 'txn', txn: { amount: 180, direction: 'debit', counterparty: 'Canoe' } });
    expect(parsePaymentNotification('com.snapwork.hdfc', 'HDFC Bank', 'Sent Rs.450.00 From HDFC Bank A/C *1234 To SWIGGY On 26/09/26')).toMatchObject({ kind: 'txn', txn: { amount: 450, last4: '1234' } });
  });
});
