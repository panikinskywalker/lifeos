import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBetterSqliteAdapter } from '@core/db/betterSqliteAdapter';
import { createLifeOS } from '@core/lifeos';
import { Registry } from '@core/registry/registry';
import type { LifeOSContext } from '@core/registry/context';
import { bus } from '@core/events/bus';
import { fileMessage } from '@core/filing/messages';
import { crmModule } from '@modules/crm';
import { placesModule } from '@modules/places';
import { financeModule } from '@modules/finance';
import { spendInRange } from '../lib';
import { logDone } from '@core/cycles/upkeep';
import { NACH_SIP, answerSip, undoSip } from './sip';
import { SPOTTED_SUB, notSpotted, trackSpotted } from './recurring';
import { closeLine, priceChanges } from '../brain';
import { monthClose } from '../home';

/** Money on its own (docs/MODEL.md, phase D), from Rutvij's own texts (masked). */

let os: LifeOSContext;
beforeEach(async () => {
  bus.clear();
  os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules: [crmModule, placesModule, financeModule], registry: new Registry() });
});
afterEach(() => os.db.close());

const sms = (from: string, body: string, when: string) => fileMessage(os, { source: 'sms', from, body, receivedAt: Date.parse(`${when}T10:00:00`) });
const txs = () => os.records.query<{ kind: string; amount: number; category: string; investmentId?: string; merchant?: string }>('transaction');
const nach = (amount: string, day: string, when: string) => sms('VA-CBSSBI-S', `Dear Customer, Your A/C XXXXX123456 has a debit by NACH of Rs ${amount} on ${day}. Avl Bal Rs 52,000.00. Download YONO - SBI`, when);

describe('NACH to SIP', () => {
  it('a nameless NACH debit for a SIP within 3 days of its day is that SIP, not spending', () => {
    const inv = os.records.create({ object: 'investment', title: 'Parag Parikh Flexi Cap', data: { instrument: 'mutual_fund', invested: 10000, sip: 5000, sipDay: 3 }, status: 'active' });
    nach('5,000.00', '05/11/26', '2026-11-05');
    expect(txs()[0]!.data).toMatchObject({ kind: 'investment', investmentId: inv.id });
    expect(os.records.get<{ invested: number }>(inv.id)!.data.invested).toBe(15000);
    expect(spendInRange(os, '2026-11-01', '2026-11-30')).toBe(0);
    expect(os.filings.ofKind(NACH_SIP)).toHaveLength(0);
  });

  it('any other is asked once; picking a holding moves it to investing and teaches the SIP', () => {
    const inv = os.records.create({ object: 'investment', title: 'Nifty index', data: { instrument: 'mutual_fund', invested: 0 }, status: 'active' });
    nach('2,000.00', '05/10/26', '2026-10-05');
    expect(txs()[0]!.data.kind).toBe('expense');
    const ask = os.filings.ofKind(NACH_SIP)[0]!;
    expect(ask.label).toMatch(/₹2,000.* by NACH on .*5 Oct: a SIP\?/);
    const a = answerSip(os, ask.id, inv.id)!;
    expect(txs()[0]!.data).toMatchObject({ kind: 'investment', category: 'investment', investmentId: inv.id });
    expect(os.records.get(inv.id)!.data).toMatchObject({ invested: 2000, sip: 2000, sipDay: 5 });
    // Next month it files itself.
    nach('2,000.00', '06/11/26', '2026-11-06');
    expect(txs().filter((t) => t.data.kind === 'investment')).toHaveLength(2);
    expect(os.filings.ofKind(NACH_SIP)).toHaveLength(1);
    // Undo puts the first one back.
    undoSip(os, a);
    expect(txs().find((t) => t.id === ask.entityId)!.data.kind).toBe('expense');
  });

  it('"Not a SIP" is remembered for that amount; "New SIP" makes the holding', () => {
    nach('500.00', '06/06/26', '2026-06-06');
    answerSip(os, os.filings.ofKind(NACH_SIP)[0]!.id, 'no');
    nach('500.00', '06/07/26', '2026-07-06');
    expect(os.filings.ofKind(NACH_SIP)).toHaveLength(1);
    nach('1,000.00', '06/07/26', '2026-07-06');
    const ask = os.filings.ofKind(NACH_SIP).find((f) => f.label.includes('1,000'))!;
    answerSip(os, ask.id, 'new');
    expect(os.records.query('investment')[0]!).toMatchObject({ title: 'SIP on the 6th', data: { sip: 1000, sipDay: 6, invested: 1000 } });
  });
});

const subs = () => os.records.query<{ name: string; amount: number; nextBillingAt: string; priceHistory?: Array<{ amount: number; from: string }>; foreign?: { amount: number; currency: string } }>('subscription');
const headsUp = (amount: string, due: string, when: string, cur = 'INR', merchant = 'Adobe Systems Software Ireland Ltd') => sms('JD-ICICIT-T', `Payment of ${cur} ${amount} towards Merchant ${merchant} to be debited from ICICI Bank Credit Card 3007, as per Standing Instruction YNGbfYiyN, is due by ${due}`, when);
const charge = (amount: string, day: string, when: string) => sms('JM-ICICIT-S', `INR ${amount} spent using ICICI Bank Card XX3007 on ${day} on ADOBE SYSTEMS. Avl Limit: INR 2,00,000.00. If not you, call 1800 2662/SMS BLOCK 3007 to 9215676766`, when);

describe('heads-ups before a charge, and price changes', () => {
  it('a heads-up makes or moves the Subscription; it is not a payment', () => {
    headsUp('1516.30', '05/07', '2026-07-03');
    expect(txs()).toHaveLength(0);
    expect(subs()[0]!.data).toMatchObject({ name: 'Adobe', amount: 1516.3, nextBillingAt: '2026-07-05' });
    headsUp('1516.30', '05/08', '2026-08-03');
    expect(subs()).toHaveLength(1);
    expect(subs()[0]!.data.nextBillingAt).toBe('2026-08-05');
  });

  it('a due day with no year past the turn of the year is next year', () => {
    headsUp('299.00', '09/01', '2026-12-30', 'INR', 'Spotify');
    expect(subs()[0]!.data).toMatchObject({ name: 'Spotify', nextBillingAt: '2027-01-09' });
  });

  it('Adobe went from ₹1,516.30 to ₹699.01: noted once, for To check and the brief, with what it means a year', () => {
    const at = (d: string) => Date.parse(`${d}T09:00:00`);
    charge('1,516.30', '05-Jul-26', '2026-07-05');
    expect(priceChanges(os, at('2026-07-06'))).toHaveLength(0);
    headsUp('699.01', '26/08', '2026-08-24');
    const said = priceChanges(os, at('2026-08-24'));
    expect(said.map((c) => c.line)).toEqual(['Adobe went from ₹1,516.30 to ₹699.01 · ₹9,807 less a year']);
    expect(subs()[0]!.data.priceHistory!.map((h) => h.amount)).toEqual([1516.3, 699.01]);
    // The charge at the same price is no change, and the notice keeps its key.
    charge('699.01', '26-Aug-26', '2026-08-26');
    expect(subs()[0]!.data.priceHistory).toHaveLength(2);
    expect(priceChanges(os, at('2026-08-26')).map((c) => c.key)).toEqual(said.map((c) => c.key));
    expect(priceChanges(os, at('2026-09-10'))).toHaveLength(0);
  });

  it('a foreign one compares its own currency, not the rupee rate', () => {
    os.settings.set('fx.rates', { day: '2026-09-15', inrPer: { USD: 84 } });
    headsUp('41.30', '17/09', '2026-09-15', 'USD', 'BlackmagicDesignAsiaPteLtd');
    os.settings.set('fx.rates', { day: '2026-10-15', inrPer: { USD: 88 } });
    headsUp('41.30', '17/10', '2026-10-15', 'USD', 'BlackmagicDesignAsiaPteLtd');
    expect(subs()[0]!.data.priceHistory).toBeUndefined();
    expect(subs()[0]!.data.foreign).toEqual({ amount: 41.3, currency: 'USD' });
  });
});

describe('spotted subscriptions', () => {
  const pay = (amount: string, day: string, when: string, to = 'CORRIDOR SEVEN') => sms('JM-ICICIT-S', `INR ${amount} spent using ICICI Bank Card XX3007 on ${day} on ${to}. Avl Limit: INR 2,00,000.00. If not you, call 1800 2662/SMS BLOCK 3007 to 9215676766`, when);

  it('three payments a month apart, about the same amount: asked once', () => {
    pay('455.00', '03-Aug-26', '2026-08-03');
    pay('460.00', '02-Sep-26', '2026-09-02');
    expect(os.filings.ofKind(SPOTTED_SUB)).toHaveLength(0);
    pay('455.00', '03-Oct-26', '2026-10-03');
    const ask = os.filings.ofKind(SPOTTED_SUB);
    expect(ask).toHaveLength(1);
    expect(ask[0]!.label).toMatch(/every month: track it\?$/);
    pay('455.00', '03-Nov-26', '2026-11-03');
    expect(os.filings.ofKind(SPOTTED_SUB)).toHaveLength(1);
    const id = trackSpotted(os, ask[0]!.id)!;
    expect(os.records.get(id)!.data).toMatchObject({ amount: 455, nextBillingAt: '2026-11-03', autoPost: false });
    expect(os.links.forEntity(id, 'subscription')).toHaveLength(3);
  });

  it('not a month apart, or a different amount: not asked; "Not a subscription" is remembered', () => {
    pay('455.00', '03-Aug-26', '2026-08-03');
    pay('455.00', '10-Aug-26', '2026-08-10');
    pay('900.00', '10-Sep-26', '2026-09-10');
    expect(os.filings.ofKind(SPOTTED_SUB)).toHaveLength(0);
    pay('299.00', '01-Aug-26', '2026-08-01', 'GYMPASS');
    pay('299.00', '01-Sep-26', '2026-09-01', 'GYMPASS');
    pay('299.00', '01-Oct-26', '2026-10-01', 'GYMPASS');
    notSpotted(os, os.filings.ofKind(SPOTTED_SUB)[0]!.id);
    pay('299.00', '01-Nov-26', '2026-11-01', 'GYMPASS');
    expect(os.filings.ofKind(SPOTTED_SUB)).toHaveLength(1);
  });
});

describe('bills from due texts', () => {
  const bills = () => subs().filter((s) => (s.data as { bill?: boolean }).bill);
  const msedcl = (body: string, when: string) => sms('JM-MSEDCL-S', body, when);

  it('a due text makes the bill; a payment to the payee for about the amount pays it', () => {
    msedcl('Energy Bill for Cons. 000000000000 of Rs. 830 is due on 16/03/26. View Bill: https://billpdf.mahadiscom.in/BD?k=0000A Pay Bill: https://rpp.mahadiscom.in', '2026-03-02');
    expect(txs()).toHaveLength(0);
    expect(bills()[0]!.data).toMatchObject({ name: 'Electricity', amount: 830, nextBillingAt: '2026-03-16', payee: 'MSEDCL', autoPost: false });
    sms('JM-ICICIT-S', 'ICICI Bank Acct XX637 debited for Rs 830.00 on 10-Mar-26; MSEDCL credited. UPI:612345678901. Call 18002662 for dispute. SMS BLOCK 637 to 9215676766.', '2026-03-10');
    expect(txs()[0]!.data.category).toBe('utilities');
    expect(bills()[0]!.data.nextBillingAt).toBe('2026-04-16');
    expect(os.links.forEntity(bills()[0]!.id, 'subscription')).toHaveLength(1);
  });

  it('the next due text moves the same bill; no due day means 15 days on', () => {
    msedcl('Energy Bill for cons 000000000000 of Rs 1120 is due on 15/12/25.View and pay bill at https://rpp.mahadiscom.in/MH_RPP?k=00A .Ignore if paid', '2025-12-01');
    msedcl('Energy Bill for Cons. 000000000000 of Rs. 830 is due on 16/01/26. View Bill: https://billpdf.mahadiscom.in/BD?k=0000A', '2026-01-02');
    expect(bills()).toHaveLength(1);
    expect(bills()[0]!.data).toMatchObject({ amount: 830, nextBillingAt: '2026-01-16' });
    sms('JX-OCWSLT-S', 'Water Bill for CAN 56050016 of Rs. 194.61 is generated. You can view and pay bill at https://digitideprd.ocwindia.com/OCWSLT/IWxjPRw . NMC-OCW', '2026-01-05');
    expect(bills().find((b) => b.data.name === 'Water')!.data).toMatchObject({ amount: 194.61, nextBillingAt: '2026-01-20' });
  });

  it('tapped Paid, then the bank text for it: one expense, and the bill moves on once', () => {
    msedcl('Energy Bill for Cons. 000000000000 of Rs. 830 is due on 16/03/26. View Bill: https://billpdf.mahadiscom.in/BD?k=0000A', '2026-03-02');
    const bill = bills()[0]!;
    const cycle = os.cycles.forEntity(bill.id)[0]!;
    logDone(os, cycle.id, { cost: 830, asExpense: true, note: 'Paid', at: Date.parse('2026-03-10T09:00:00') });
    const movedTo = os.records.get<{ nextBillingAt: string }>(bill.id)!.data.nextBillingAt;
    sms('JM-ICICIT-S', 'ICICI Bank Acct XX637 debited for Rs 830.00 on 10-Mar-26; MSEDCL credited. UPI:612345678902. Call 18002662 for dispute. SMS BLOCK 637 to 9215676766.', '2026-03-10');
    expect(txs().filter((t) => t.data.kind === 'expense')).toHaveLength(1);
    expect(os.records.get<{ nextBillingAt: string }>(bill.id)!.data.nextBillingAt).toBe(movedTo);
    expect(movedTo > '2026-03-16').toBe(true);
  });

  it('not bills: a payment receipt, a reminder with no amount, a card statement', () => {
    msedcl('Thanks for Online payment of Rs 820.00 dated 28-Feb-26 by UPI towards MSEDCL Energy Bill for consumer no.000000000000', '2026-02-28');
    sms('AX-CBSSBI-S', 'Dear customer, EMI due on 02032026 in A/c XXXXX000000. Please pay in time. Please ignore, if already paid.-SBI', '2026-02-25');
    sms('VM-AXISBK-S', 'Your statement for Axis Bank Credit Card no. XX4321 is generated. Due on: 07-11-26 Total amt: INR  Dr. 12494.57 Min amt due: INR  Dr. 736.00 Pay at axis', '2026-10-20');
    expect(bills()).toHaveLength(0);
    expect(txs()).toHaveLength(0);
  });
});

describe('month close', () => {
  const tx = (amount: number, kind: string, category: string, date: string) => os.records.create({ object: 'transaction', data: { amount, kind, category, date } });
  it('on the 1st to the 3rd: last month against usual, saved, the biggest changes, new subscriptions and price changes', () => {
    for (const m of ['07', '08', '09']) {
      tx(30000, 'expense', 'housing', `2026-${m}-02`);
      tx(6000, 'expense', 'food', `2026-${m}-10`);
    }
    tx(30000, 'expense', 'housing', '2026-10-02');
    tx(9000, 'expense', 'food', '2026-10-10');
    tx(4000, 'expense', 'travel', '2026-10-20');
    tx(100000, 'income', 'salary', '2026-10-01');
    expect(monthClose(os, new Date('2026-11-04T09:00:00'))).toBeNull();
    const c = monthClose(os, new Date('2026-11-01T09:00:00'))!;
    expect(c).toMatchObject({ label: 'October', month: '2026-10', spent: 43000, usual: 36000, income: 100000, saved: 57000 });
    expect(c.changes.map((x) => [x.category, x.delta])).toEqual([['travel', 4000], ['food', 3000]]);
    expect(closeLine(os, Date.parse('2026-11-01T09:00:00'))[0]!.line).toBe('October: spent ₹43,000, ₹7,000 over your usual; saved ₹57,000');
    expect(closeLine(os, Date.parse('2026-11-02T09:00:00'))).toHaveLength(0);
  });

  it('with no months before it, no changes against usual', () => {
    tx(9000, 'expense', 'food', '2026-10-10');
    expect(monthClose(os, new Date('2026-11-01T09:00:00'))).toMatchObject({ usual: null, changes: [] });
  });
});
