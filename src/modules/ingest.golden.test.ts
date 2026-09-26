/**
 * Messages → money (M4.2, PRODUCT v4 §5 flows 6–7): bank SMS and payment
 * notifications through the real pipeline on the real finance types.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBetterSqliteAdapter } from '@core/db/betterSqliteAdapter';
import { createLifeOS } from '@core/lifeos';
import { Registry } from '@core/registry/registry';
import type { LifeOSContext } from '@core/registry/context';
import type { ModuleManifest } from '@core/registry/types';
import { bus } from '@core/events/bus';
import { confirmProposed, ingestList, ingestMessage, learnCategory, senders, setSenderTrusted } from '@core/ingest/ingest';
import { extractDump } from '@core/dumps/extract';
import { undoExtraction } from '@core/dumps/extract';
import { accountType, transactionType } from './finance/types';
import { financeAiTools } from './finance/aiTools';
import { personType } from './crm/types';
import { deliveryType } from './deliveries/types';

const modules: ModuleManifest[] = [
  { id: 'crm', name: 'People', version: '1', description: '', icon: 'x', color: '#000', entityTypes: [personType] },
  { id: 'deliveries', name: 'Deliveries', version: '1', description: '', icon: 'x', color: '#000', entityTypes: [deliveryType] },
  { id: 'finance', name: 'Finance', version: '1', description: '', icon: 'x', color: '#000', entityTypes: [accountType, transactionType], aiTools: financeAiTools },
];

let os: LifeOSContext;
beforeEach(async () => {
  bus.clear();
  os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules, registry: new Registry() });
});
afterEach(() => os.db.close());

const at = Date.parse('2026-09-26T13:02:00');
const SWIGGY = 'Spent Rs.1240 On HDFC Bank Card 5678 At SWIGGY On 2026-09-26:13:02:11 Bal Rs.45000.00 Not You? Call 18002586161';
const txs = () => os.entities.query<Record<string, unknown>>('transaction');

describe('bank SMS → transactions', () => {
  it('7 · "spent at SWIGGY" SMS → expense within the same call, categorised Food, on a new HDFC card account, in To check', () => {
    const r = ingestMessage(os, { source: 'sms', from: 'AD-HDFCBK', body: SWIGGY, receivedAt: at });
    expect(r.status).toBe('confirmed');
    const [t] = txs();
    expect(t!.data).toMatchObject({ amount: 1240, kind: 'expense', category: 'food', merchant: 'SWIGGY', date: '2026-09-26' });
    const acc = os.entities.get(t!.data.accountId as string)!;
    expect(acc).toMatchObject({ title: 'HDFC Bank card ••5678', data: { kind: 'credit', last4: '5678', institution: 'HDFC Bank' } });
    expect(os.dumps.toCheck().map((x) => x.label)).toEqual(['Spent ₹1,240 · SWIGGY · ••5678', 'Account: HDFC Bank card ••5678']);
    expect(os.dumps.toCheck()[0]).toMatchObject({ source: 'sms', dumpId: null });
    // The raw text is on the transaction's timeline.
    expect(os.entities.timeline.forEntity(t!.id).some((e) => e.body?.includes('SWIGGY'))).toBe(true);
    // Cancel from To check removes the expense.
    expect(undoExtraction(os, os.dumps.toCheck()[0]!.id)).toBe(true);
    expect(txs()).toEqual([]);
  });

  it('an existing account is found by its last digits', () => {
    const mine = os.entities.create({ type: 'account', title: 'My HDFC', data: { kind: 'credit', institution: 'HDFC Bank', last4: '5678' } });
    ingestMessage(os, { source: 'sms', from: 'AD-HDFCBK', body: SWIGGY, receivedAt: at });
    expect(txs()[0]!.data.accountId).toBe(mine.id);
    expect(os.entities.query('account')).toHaveLength(1);
  });

  it('the same payment as an SMS and a GPay notification is filed once; the second fills in what the first lacked', () => {
    ingestMessage(os, { source: 'notification', from: 'com.google.android.apps.nbu.paisa.user', title: 'Payment successful', body: '₹450 paid to Swiggy', receivedAt: at });
    const r = ingestMessage(os, { source: 'sms', from: 'VM-HDFCBK', body: 'Sent Rs.450.00\nFrom HDFC Bank A/C *1234\nTo SWIGGY\nOn 26/09/26\nRef 426912345678', receivedAt: at + 40_000 });
    expect(r.status).toBe('duplicate');
    expect(txs()).toHaveLength(1);
    expect(os.entities.get(txs()[0]!.data.accountId as string)?.title).toBe('HDFC Bank ••1234');
  });

  it('you said it first ("spent 450 on lunch at Toit"), then the SMS came: matched, not doubled; the account filled in', async () => {
    const d = os.dumps.add({ body: 'spent 450 on lunch at Toit' });
    await extractDump(os, d.id, null);
    expect(txs()).toHaveLength(1);
    const r = ingestMessage(os, { source: 'sms', from: 'VM-HDFCBK', body: 'Sent Rs.450.00 From HDFC Bank A/C *1234 To TOIT BREWPUB On 26/09/26', receivedAt: Date.now() });
    expect(r.status).toBe('confirmed');
    expect(txs()).toHaveLength(1);
    expect(txs()[0]!.data).toMatchObject({ merchant: 'Toit', accountId: expect.any(String) });
    expect(os.dumps.toCheck()[0]!.label).toMatch(/^Matched .* ₹450 to HDFC Bank SMS$/);
  });

  it('OTPs are kept raw but not filed; unknown senders are not trusted until you tick them; a message seen twice is one row', () => {
    expect(ingestMessage(os, { source: 'sms', from: 'VM-HDFCBK', body: '123456 is your OTP for txn of Rs.450 at SWIGGY', receivedAt: at })).toMatchObject({ status: 'dismissed', reason: 'otp' });
    expect(ingestMessage(os, { source: 'sms', from: 'AX-SWIGGY', body: 'Your order of Rs.450 is on the way', receivedAt: at })).toMatchObject({ status: 'dismissed', reason: 'sender not trusted' });
    expect(senders(os).map((s) => [s.address, s.trusted])).toEqual([['VM-HDFCBK', true], ['AX-SWIGGY', false]]);
    setSenderTrusted(os, 'VM-HDFCBK', false);
    expect(ingestMessage(os, { source: 'sms', from: 'VM-HDFCBK', body: 'Sent Rs.99 From HDFC Bank A/C *1234 To X', receivedAt: at + 1 })).toMatchObject({ status: 'dismissed' });
    const again = ingestMessage(os, { source: 'sms', from: 'VM-HDFCBK', body: '123456 is your OTP for txn of Rs.450 at SWIGGY', receivedAt: at });
    expect(again.reason).toBe('seen before');
    expect(ingestList(os)).toHaveLength(3);
  });

  it('6 · first-run history import → proposals → review keeps some → filed; a learned category sticks', () => {
    const history = [
      ['VM-HDFCBK', 'Sent Rs.180.00 From HDFC Bank A/C *1234 To CANOE On 08/09/26', '2026-09-08T21:00:00'],
      ['VM-HDFCBK', 'Sent Rs.2,000.00 From HDFC Bank A/C *1234 To GURU TAILORS On 12/08/26', '2026-08-12T11:00:00'],
      ['VM-HDFCBK', 'Rs.50000 credited to HDFC Bank A/c XX1234 on 01-09-26 from ACME PVT LTD', '2026-09-01T10:00:00'],
    ] as const;
    const ids = history.map(([from, body, when]) => ingestMessage(os, { source: 'sms', from, body, receivedAt: Date.parse(when) }, { mode: 'import' }).id);
    expect(ingestList(os, { status: 'proposed' })).toHaveLength(3);
    expect(txs()).toEqual([]);
    learnCategory(os, 'GURU TAILORS', 'shopping');
    expect(confirmProposed(os, [ids[1]!, ids[2]!], [ids[0]!])).toBe(2);
    expect(txs().map((t) => [t.data.merchant, t.data.kind, t.data.category]).sort()).toEqual([['ACME PVT LTD', 'income', 'other'], ['GURU TAILORS', 'expense', 'shopping']]);
    expect(ingestList(os, { status: 'dismissed' })).toHaveLength(1);
  });
});

describe('learning', () => {
  it('recategorising a transaction teaches the merchant', () => {
    ingestMessage(os, { source: 'sms', from: 'VM-HDFCBK', body: 'Sent Rs.300.00 From HDFC Bank A/C *1234 To GURU TAILORS On 26/09/26', receivedAt: at });
    const t = txs()[0]!;
    expect(t.data.category).toBe('other');
    os.entities.update(t.id, { data: { category: 'shopping' } }, 'user');
    ingestMessage(os, { source: 'sms', from: 'VM-HDFCBK', body: 'Sent Rs.500.00 From HDFC Bank A/C *1234 To GURU TAILORS On 27/09/26', receivedAt: at + 86_400_000 });
    expect(txs().find((x) => x.data.amount === 500)!.data.category).toBe('shopping');
  });
});

describe('feedback round 1: currencies, mutual funds, keyword rules', () => {
  it('a USD card spend is stored in dollars and rupees at the day\'s rate; the limit is never the amount', async () => {
    const { setFxRatesFromInrBase, applyPendingFx } = await import('@core/ingest/fx');
    const body = 'USD 45.00 spent using ICICI Bank Card XX9012 on 26-Sep-26 on AMAZON US. Avl Limit: INR 1,20,000.00.';
    // No rate yet: filed in dollars, flagged, converted when rates arrive.
    ingestMessage(os, { source: 'sms', from: 'AX-ICICIB', body, receivedAt: at });
    expect(txs()[0]!.data).toMatchObject({ amount: 45, originalAmount: 45, originalCurrency: 'USD' });
    expect(os.dumps.toCheck()[0]!.flag).toMatch(/No USD rate yet/);
    setFxRatesFromInrBase(os, '2026-09-26', { USD: 1 / 84, GBP: 1 / 110, JPY: 1 / 0.56, AED: 1 / 22.9 });
    expect(applyPendingFx(os)).toBe(1);
    expect(txs()[0]!.data).toMatchObject({ amount: 3780, fxRate: 84 });
    // With a rate on file: converted at once. When the SMS gives the rupee figure, that wins.
    ingestMessage(os, { source: 'sms', from: 'VM-HDFCBK', body: 'Spent USD 10.00 (INR 861.50) on HDFC Bank Card 5678 at OPENAI On 2026-09-26', receivedAt: at + 3_600_000 });
    expect(txs().find((t) => t.data.merchant === 'OPENAI')!.data).toMatchObject({ amount: 861.5, originalAmount: 10, originalCurrency: 'USD' });
    ingestMessage(os, { source: 'sms', from: 'VM-HDFCBK', body: 'Spent AED 150.00 On HDFC Bank Card 5678 At DUBAI MALL On 2026-09-26', receivedAt: at + 7_200_000 });
    expect(txs().find((t) => t.data.merchant === 'DUBAI MALL')!.data.amount).toBeCloseTo(3435, 0);
  });

  it('a mutual fund SIP is an investment transfer into the fund; the registrar\'s confirmation is skipped; no fake bank account', () => {
    const r = ingestMessage(os, { source: 'sms', from: 'VM-HDFCBK', body: 'Rs.5,000.00 debited from A/c XX1234 on 05-09-26 towards Parag Parikh Flexi Cap Fund SIP. Avl Bal Rs.40,000', receivedAt: at });
    expect(r.status).toBe('confirmed');
    const t = txs()[0]!;
    expect(t.data).toMatchObject({ amount: 5000, kind: 'transfer', category: 'investment' });
    const fund = os.entities.get(t.data.toAccountId as string)!;
    expect(fund).toMatchObject({ title: 'Parag Parikh Flexi Cap Fund', data: { kind: 'investment' } });
    expect(ingestMessage(os, { source: 'sms', from: 'CP-CAMSPM', body: 'Dear Investor, units allotted in Folio No XX7788 for Rs 5000 under Parag Parikh Flexi Cap Fund at NAV 78.12. CAMS', receivedAt: at + 86_400_000 })).toMatchObject({ status: 'dismissed' });
    expect(os.entities.query('account').map((a) => a.title).sort()).toEqual(['HDFC Bank ••1234', 'Parag Parikh Flexi Cap Fund']);
    expect(os.dumps.toCheck().map((x) => x.label)).toContain('Invested ₹5,000 · Parag Parikh Flexi Cap Fund');
  });

  it('your keyword rules win: ZOMATO → food, a word in the message text too', async () => {
    const { setCategoryRules, categoryFor } = await import('@core/ingest/ingest');
    setCategoryRules(os, [{ keyword: 'guru tailors', category: 'shopping' }, { keyword: 'rent', category: 'housing' }]);
    ingestMessage(os, { source: 'sms', from: 'VM-HDFCBK', body: 'Sent Rs.300.00 From HDFC Bank A/C *1234 To GURU TAILORS On 26/09/26', receivedAt: at });
    expect(txs()[0]!.data.category).toBe('shopping');
    expect(categoryFor(os, 'Suresh K', 'Rs 25000 sent to Suresh K for September rent')).toBe('housing');
    expect(categoryFor(os, 'ZOMATO LTD')).toBe('food');
    expect(categoryFor(os, 'Parent')).toBe('other'); // "rent" inside "Parent" is not the word rent
  });
});

describe('deliveries from shipping texts', () => {
  it('one record per order, moved along by each text (never backwards), in Upcoming until delivered', async () => {
    const { upcoming } = await import('@core/dashboard/metrics');
    const t0 = Date.parse('2026-09-26T10:00:00');
    const send = (body: string, dt: number, from = 'AX-AMAZON') => ingestMessage(os, { source: 'sms', from, body, receivedAt: t0 + dt });
    send('Shipped: boAt Rockerz 255 Pro will be delivered by Tue, 29 Sep. Order 402-1234567-7654321', 0);
    const [d] = os.entities.query('delivery');
    expect(d).toMatchObject({ title: 'boAt Rockerz 255 Pro', data: { shop: 'Amazon', status: 'shipped', expectedDate: '2026-09-29', orderId: '402-1234567-7654321' } });
    expect(upcoming(os, 5, t0).map((u) => u.title)).toContain('boAt Rockerz 255 Pro');
    send('Out for delivery: boAt Rockerz 255 Pro. Arriving today. Order 402-1234567-7654321', 3 * 86_400_000);
    send('Your order with boAt Rockerz 255 Pro has been shipped', 3 * 86_400_000 + 60_000); // late, out-of-order text
    expect(os.entities.get(d!.id)!.data).toMatchObject({ status: 'out_for_delivery', expectedDate: '2026-09-29' });
    send('Delivered: Your package with boAt Rockerz 255 Pro has been delivered. Order 402-1234567-7654321', 3 * 86_400_000 + 3_600_000);
    expect(os.entities.query('delivery')).toHaveLength(1);
    expect(os.entities.get(d!.id)!.data).toMatchObject({ status: 'delivered', deliveredOn: '2026-09-29' });
    expect(upcoming(os, 5, t0).map((u) => u.title)).not.toContain('boAt Rockerz 255 Pro');
    // A courier text for a different order is a new record; food delivery is ignored.
    send('Your shipment AWB 1234567890123 from Myntra is out for delivery today. Delhivery', 0, 'VM-DLHVRY');
    send('Your Swiggy order is out for delivery!', 0, 'AX-SWIGGY');
    expect(os.entities.query('delivery').map((x) => x.data.shop).sort()).toEqual(['Amazon', 'Myntra']);
    expect(os.dumps.toCheck().filter((x) => x.kind === 'delivery').length).toBeGreaterThanOrEqual(3);
  });
});

describe('60-day clean-up', () => {
  it('drops ignored messages, raw wording of filed ones, old per-app screen time and past calendar events — records stay', async () => {
    const { pruneOldData } = await import('@core/sources/retention');
    const { saveUsageDays } = await import('@core/sources/deviceData');
    const old = Date.now() - 70 * 86_400_000;
    ingestMessage(os, { source: 'sms', from: 'VM-HDFCBK', body: '123456 is your OTP', receivedAt: old });
    ingestMessage(os, { source: 'sms', from: 'VM-HDFCBK', body: 'Sent Rs.450.00 From HDFC Bank A/C *1234 To SWIGGY On 26/07/26', receivedAt: old + 1 });
    ingestMessage(os, { source: 'sms', from: 'VM-HDFCBK', body: 'Sent Rs.90.00 From HDFC Bank A/C *1234 To CHAI POINT', receivedAt: Date.now() });
    const d70 = new Date(old).toISOString().slice(0, 10);
    saveUsageDays(os, [{ day: d70, totalMs: 3_600_000, apps: [{ package: 'a', ms: 3_600_000 }] }]);
    const r = pruneOldData(os);
    expect(r).toMatchObject({ ignoredMessages: 1, rawTexts: 1, appUsageRows: 1 });
    expect(txs()).toHaveLength(2); // the expenses themselves stay
    expect(ingestList(os).map((i) => i.text)).toEqual(['Sent Rs.90.00 From HDFC Bank A/C *1234 To CHAI POINT', '']);
    expect(os.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM usage_daily`)!.n).toBe(1); // the day's total stays
  });
});

describe('payees: one record per person or shop you pay', () => {
  it('two payments to John land on your John; "JOHN D" is a flagged guess until you confirm; shops become one payee each', async () => {
    const { confirmPayee, rejectPayee } = await import('@core/ingest/payee');
    const { placeType, orgType } = await import('./places/types');
    void placeType;
    os.registry.entityTypes.set('org', orgType as never);
    const john = os.entities.create({ type: 'person', title: 'John Doe', data: {} });
    const send = (body: string, dt: number) => ingestMessage(os, { source: 'sms', from: 'VM-HDFCBK', body, receivedAt: at + dt });
    const payeeOf = (txId: string) => os.relations.forEntity(txId).find((r) => r.relation.kind === 'person' || r.relation.kind === 'payee');
    send('Sent Rs.1,300.00 From HDFC Bank A/C *1234 To JOHN D On 26/09/26', 0);
    const t1 = txs()[0]!;
    const r1 = payeeOf(t1.id)!;
    expect(r1.other.id).toBe(john.id);
    expect(r1.relation.confidence).toBeCloseTo(0.85);
    expect(os.dumps.toCheck().find((x) => x.kind === 'transaction')!.flag).toBe('We think “JOHN D” is John Doe');
    // Yes → certain, and "JOHN D" + the UPI ID now mean John.
    confirmPayee(os, r1.relation.id);
    send('Sent Rs.500.00 From HDFC Bank A/C *1234 To JOHN D On 27/09/26', 86_400_000);
    const t2 = txs().find((t) => t.data.amount === 500)!;
    expect(payeeOf(t2.id)).toMatchObject({ other: { id: john.id }, relation: { confidence: 1 } });
    expect(os.relations.forEntity(john.id).filter((r) => r.other.type === 'transaction')).toHaveLength(2);
    // A shop: one payee record however many times you pay it.
    send('Sent Rs.180.00 From HDFC Bank A/C *1234 To CANOE CAFE On 26/09/26', 2 * 86_400_000);
    send('Sent Rs.220.00 From HDFC Bank A/C *1234 To CANOE CAFE On 28/09/26', 3 * 86_400_000);
    expect(os.entities.query('org').map((o) => [o.title, (o.data as { kind: string }).kind])).toEqual([['Canoe Cafe', 'shop']]);
    // Not them → the payment gets its own payee under the name the SMS used.
    send('Sent Rs.90.00 From HDFC Bank A/C *1234 To JOHN On 29/09/26', 4 * 86_400_000);
    const t4 = txs().find((t) => t.data.amount === 90)!;
    expect(payeeOf(t4.id)!.relation.confidence).toBeLessThan(1);
    rejectPayee(os, payeeOf(t4.id)!.relation.id);
    expect(payeeOf(t4.id)!.other.title).toBe('John');
    expect(payeeOf(t4.id)!.other.type).toBe('org');
  });
});
