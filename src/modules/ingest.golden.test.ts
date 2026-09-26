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

const modules: ModuleManifest[] = [
  { id: 'crm', name: 'People', version: '1', description: '', icon: 'x', color: '#000', entityTypes: [personType] },
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
