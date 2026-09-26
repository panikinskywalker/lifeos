import { describe, expect, it } from 'vitest';
import { bankOf, looksLikeBankSender, parseBankSms, parsePaymentNotification, type ParsedTxn } from './bankSms';

/** Fixtures in each bank's real shapes (numbers and names changed). */
const FIXTURES: Array<[sender: string, text: string, expect: Partial<ParsedTxn>]> = [
  ['VM-HDFCBK', 'Sent Rs.450.00\nFrom HDFC Bank A/C *1234\nTo SWIGGY\nOn 26/09/26\nRef 426912345678\nNot You?\nCall 18002586161/SMS BLOCK UPI to 7308080808', { amount: 450, direction: 'debit', bank: 'hdfc', last4: '1234', counterparty: 'Swiggy', channel: 'upi', ref: '426912345678', date: '2026-09-26' }],
  ['AD-HDFCBK', 'Spent Rs.1240 On HDFC Bank Card 5678 At SWIGGY LIMITED On 2026-09-26:13:02:11 Bal Rs.45000.00 Not You? Call 18002586161/SMS BLOCK DC 5678 to 7308080808', { amount: 1240, direction: 'debit', isCard: true, last4: '5678', counterparty: 'Swiggy', channel: 'card', balance: 45000, date: '2026-09-26' }],
  ['VM-HDFCBK', 'Credit Alert!\nRs.2,600.00 credited to HDFC Bank A/c XX1234 on 26-09-26 from VPA priya.s@okaxis (UPI 426912345679)', { amount: 2600, direction: 'credit', last4: '1234', vpa: 'priya.s@okaxis', counterparty: 'priya s', channel: 'upi', date: '2026-09-26' }],
  ['JD-ICICIT-S', 'ICICI Bank Acct XX123 debited for Rs 1,240.00 on 26-Sep-26; SWIGGY credited. UPI:426912345680. Call 18002662 for dispute. SMS BLOCK 123 to 9215676766.', { amount: 1240, direction: 'debit', bank: 'icici', last4: '123', counterparty: 'Swiggy', date: '2026-09-26', ref: '426912345680' }],
  ['AX-ICICIB', 'INR 3,499.00 spent using ICICI Bank Card XX9012 on 26-Sep-26 on AMAZON PAY IN. Avl Limit: INR 1,20,000.00. If not you, call 1800 2662/SMS BLOCK 9012 to 9215676766', { amount: 3499, direction: 'debit', isCard: true, last4: '9012', balance: 120000, date: '2026-09-26' }],
  ['BZ-SBIINB', 'Dear UPI user A/C X4567 debited by 450.0 on date 26Sep26 trf to SWIGGY Refno 426912345681. If not u? call 1800111109. -SBI', { amount: 450, direction: 'debit', bank: 'sbi', last4: '4567', counterparty: 'Swiggy', date: '2026-09-26' }],
  ['VK-SBIINB', 'Dear SBI User, your A/c X4567-credited by Rs.50000 on 26Sep26 transfer from ACME PVT LTD Ref No 426912345682 -SBI', { amount: 50000, direction: 'credit', last4: '4567', counterparty: 'ACME' }],
  ['VM-AXISBK', 'INR 799.00 debited\nA/c no. XX7890\n26-09-26, 13:05:10\nUPI/P2M/426912345683/NETFLIX\nNot you? SMS BLOCKUPI Cust ID to 919951860002\nAxis Bank', { amount: 799, direction: 'debit', bank: 'axis', last4: '7890', counterparty: 'Netflix', channel: 'upi' }],
  ['VM-KOTAKB', 'Sent Rs.180.00 from Kotak Bank AC X2345 to canoe.blr@ybl on 26-09-26.UPI Ref 426912345684. Not you, https://kotak.com/KBANKT/Fraud', { amount: 180, direction: 'debit', bank: 'kotak', last4: '2345', vpa: 'canoe.blr@ybl' }],
  ['AM-AMEXIN', "Alert: You've spent INR 5,600.00 on your AMEX card ** 31007 at MAKEMYTRIP on 26 September 2026 at 01:05 PM IST. Call 18004191030 if this was not made by you.", { amount: 5600, direction: 'debit', bank: 'amex', isCard: true, counterparty: 'MakeMyTrip', date: '2026-09-26' }],
  ['VM-HDFCBK', 'Rs.2000 withdrawn from A/c XX1234 at ATM S1AW0123 on 26-09-26. Avl Bal Rs.12,000', { amount: 2000, direction: 'debit', channel: 'atm', balance: 12000 }],
  ['VM-HDFCBK', 'Rs.450.00 refunded to your HDFC Bank A/c XX1234 by SWIGGY on 27-09-26.', { amount: 450, direction: 'credit', counterparty: 'Swiggy' }],
  ['JM-ICICIB', 'Payment of Rs 20,000.00 received towards your ICICI Bank Credit Card XX9012. Thank you.', { amount: 20000, direction: 'credit', isCard: true, transfer: true }],
  // The limit is never the amount — even when it comes first or is the only rupee figure.
  ['AX-ICICIB', 'Avl Lmt: INR 1,20,000.00. INR 649.00 spent on ICICI Bank Card XX9012 on 26-Sep-26 at NETFLIX.', { amount: 649, currency: 'INR', counterparty: 'Netflix' }],
  ['VM-HDFCBK', 'Available limit Rs 85,000. Spent Rs.1,240 on HDFC Bank Card 5678 at SWIGGY', { amount: 1240 }],
  // Foreign currency: the amount in its currency (the limit in rupees ignored); with the rupee figure when given.
  ['AX-ICICIB', 'USD 45.00 spent using ICICI Bank Card XX9012 on 26-Sep-26 on AMAZON US. Avl Limit: INR 1,20,000.00.', { amount: 45, currency: 'USD', inrAmount: null, counterparty: 'Amazon' }],
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
  // Merchant descriptors: gateways, codes and locations stripped; known brands named as you know them.
  ['VM-HDFCBK', 'Spent Rs.1,675.60 On HDFC Bank Card 5678 At ADOBE SYSTEMS SOFTWARE On 2026-09-12:10:02:11 Bal Rs.45000.00 Not You? Call 18002586161', { amount: 1675.6, counterparty: 'Adobe', recurring: true, brand: { name: 'Adobe', category: 'subscriptions', subscription: true } }],
  ['AX-ICICIB', 'INR 1,675.60 spent using ICICI Bank Card XX9012 on 12-Sep-26 on IND*ADOBE. Avl Limit: INR 1,20,000.00.', { amount: 1675.6, counterparty: 'Adobe' }],
  ['VM-AXISBK', 'Spent INR 1675.60\nAxis Bank Card no. XX4321\n12-09-26 10:02:11 IST\nADOBE *CREATIVE CLD\nAvl Limit: INR 88,000.00\nNot you? SMS BLOCK 4321 to 919951860002', { amount: 1675.6, counterparty: 'Adobe', last4: '4321' }],
  ['VM-HDFCBK', 'Spent USD 22.99 On HDFC Bank Card 5678 At PAYPAL *ADOBE On 2026-09-12', { amount: 22.99, currency: 'USD', counterparty: 'Adobe' }],
  ['VM-AXISBK', 'Spent INR 740.00\nAxis Bank Card no. XX4321\n13-09-26 20:11:05 IST\nThe Chai Room\nAvl Limit: INR 87,260.00', { counterparty: 'The Chai Room' }],
  ['VM-HDFCBK', 'Spent Rs.569 On HDFC Bank Card 5678 At RAZ*Third Wave On 2026-09-13', { counterparty: 'Third Wave' }],
  ['VM-HDFCBK', 'Spent Rs.2,310 On HDFC Bank Card 5678 At BLUETOKAI0004411 On 2026-09-13', { counterparty: 'BLUETOKAI' }],
  ['VM-HDFCBK', 'Rs.262.56 refunded to HDFC Bank Card 5678 by CHAIPOINT Payments BANGALORE IND on 13-09-26', { direction: 'credit', counterparty: 'CHAIPOINT Payments' }],
  // Autopay / e-mandate / standing instruction: the charge is a (recurring) transaction; the heads-up before it is not.
  ['VM-HDFCBK', 'Rs.1675.60 has been debited from your HDFC Bank Credit Card XX5678 towards ADOBE SYSTEMS for e-mandate (SI) on 12-09-26.', { amount: 1675.6, direction: 'debit', counterparty: 'Adobe', recurring: true }],
  ['VM-HDFCBK', 'Your SI on HDFC Bank Credit Card ending 5678 for Adobe Systems Rs.1675.60 has been processed successfully on 12/09/26', { amount: 1675.6, direction: 'debit', counterparty: 'Adobe', recurring: true }],
  ['VM-KOTAKB', 'Rs.1675.60 debited from A/c XX2345 on 12-09-26 for UPI AutoPay to ADOBE SYSTEMS. UPI Ref 426912345690', { amount: 1675.6, direction: 'debit', counterparty: 'Adobe', recurring: true }],
  ['JM-ICICIB', 'Dear Customer, the mandate of INR 499.00 raised by FITPASS SERVICES on 12-Sep-26 is successfully executed. RRN 426912345691 -ICICI Bank', { amount: 499, direction: 'debit', counterparty: 'FITPASS SERVICES', recurring: true }],
  // Transfers: NEFT / RTGS / IMPS references reduced to the name; boilerplate never a name.
  ['JM-ICICIB', 'ICICI Bank Acct XX123 credited:Rs. 42,000.00 on 12-Sep-26. Info NEFT-HDFCN52026091212345-MEERA NAIR. Avl Bal Rs. 90,000.00', { direction: 'credit', counterparty: 'MEERA NAIR' }],
  ['VM-IDFCFB', 'Your A/c XX0987 is debited by INR 8,000.00 on 12/09/26 for NEFT/ IDFBH26255012345/ARJUN MEHTA. Team IDFC FIRST Bank', { direction: 'debit', counterparty: 'ARJUN MEHTA' }],
  ['VM-AXISBK', 'INR 726.00 debited A/c no. XX7890 12-09-26, 10:19:49 UPI/P2A/426912345692/ROHAN DAS Not you? SMS BLOCKUPI Cust ID to 919951860002 Axis Bank', { counterparty: 'ROHAN DAS' }],
  ['VM-HDFCBK', 'Amt Deducted! Rs.12,000.00 from your HDFC Bank A/c XX1234 for NEFT txn via HDFC Bank Online Banking Not you?Call 18002586161', { amount: 12000, direction: 'debit', counterparty: null }],
  ['VM-CANBNK', 'Dear Customer, Acct XXXX4455 Dr. INR 60.00 on 12/09/26 to SHARMA TEA STALL; UPI: 426912345693; Bal INR 4,120.00.Not you?SMS BLOCKUPI to 9901771222-CanaraBank', { direction: 'debit', counterparty: 'SHARMA TEA STALL', balance: 4120 }],
  ['VM-BOBTXN', 'Rs.230.00 Dr. from A/C XXXXXX1234 and Cr. to chaiwala.blr@okicici. Ref:426912345694. AvlBal:Rs618.85. Not you? Call 18005700-BOB', { direction: 'debit', vpa: 'chaiwala.blr@okicici' }],
  ['VM-UNIONB', 'Your SB A/c *0000 Credited for Rs:1500.00 on 12-09-2026 by IMPS ref no 426912345695 Avl Bal Rs:2198.72.Never Share PIN/OTP-Union Bank of India', { amount: 1500, direction: 'credit' }],
  ['VM-HSBCIN', 'HSBC Credit Card xx0000 used at FRESHMENU for INR 480.00 on 12/09/26. Avl limit INR 99,000.00; due INR 5,000.00.', { amount: 480, direction: 'debit', counterparty: 'FRESHMENU' }],
  // Paying off a card is a transfer into it, not income.
  ['VM-SBICRD', 'Dear SBI Cardholder, payment of Rs. 12,345.00 for your SBI Credit Card has been successfully processed. ref no : ABC12DE3FG4HIJ.', { amount: 12345, direction: 'credit', transfer: true }],
];

const SKIPS: Array<[sender: string, text: string, reason: string]> = [
  ['VM-HDFCBK', '123456 is your OTP for txn of Rs.450 at SWIGGY on HDFC Bank card xx5678. Valid 5 mins. Do not share.', 'otp'],
  ['VM-HDFCBK', 'Get a pre-approved Personal Loan of Rs.5,00,000 at 10.5%! Apply now: hdfc.bank/pl', 'promo'],
  ['JM-ICICIB', 'Your ICICI Bank Credit Card XX9012 statement is generated. Total Amount Due Rs 32,450.00, Minimum Amount Due Rs 1,630.00, due date 15-Oct-26.', 'bill'],
  ['VM-AXISBK', 'Rs 649 will be debited from A/c XX7890 on 01-10-26 towards NETFLIX mandate. To cancel, visit axisbank.com', 'mandate'],
  ['VM-HDFCBK', 'Txn of Rs.1240 on HDFC Bank Card 5678 at SWIGGY was declined due to insufficient balance.', 'declined'],
  ['CP-CAMSPM', 'Dear Investor, units allotted in Folio No XX7788 for Rs 5000 under Parag Parikh Flexi Cap Fund at NAV 78.12. CAMS', 'investment-confirmation'],
  ['VM-HDFCBK', 'Your HDFC Bank Credit Card XX5678 has an available limit of Rs 1,20,000 as on 26-Sep-26.', 'info'],
  ['VM-HDFCBK', 'Your A/c XX1234 will be debited Rs.1675.60 on 12-09-26 towards ADOBE SYSTEMS under e-mandate. To opt out, visit hdfc.bank/si', 'mandate'],
  ['VM-HDFCBK', 'E-mandate for ADOBE SYSTEMS of up to Rs.5,000 registered successfully on HDFC Bank Credit Card XX5678.', 'mandate'],
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
    expect(parsePaymentNotification('com.google.android.apps.nbu.paisa.user', 'Autopay successful', '₹649 paid to Netflix')).toMatchObject({ kind: 'txn', txn: { amount: 649, counterparty: 'Netflix', recurring: true } });
    expect(parsePaymentNotification('com.snapwork.hdfc', 'HDFC Bank', 'Sent Rs.450.00 From HDFC Bank A/C *1234 To SWIGGY On 26/09/26')).toMatchObject({ kind: 'txn', txn: { amount: 450, last4: '1234' } });
  });
});
