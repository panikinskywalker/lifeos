/** The parser dataset export: which texts go in, what each row says. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBetterSqliteAdapter } from '@core/db/betterSqliteAdapter';
import { createLifeOS } from '@core/lifeos';
import { Registry } from '@core/registry/registry';
import type { LifeOSContext } from '@core/registry/context';
import type { ModuleManifest } from '@core/registry/types';
import { bus } from '@core/events/bus';
import { fileMessage } from '@core/filing/messages';
import { buildDataset, isOtpText, isPersonalMail, isPersonalSender, queuedMessages } from '@core/filing/dataset';
import { financeParsers } from './finance/filing/parser';
import { deliveriesParsers } from './deliveries/filing/parser';
import { accountType, transactionType } from './finance/types';
import { deliveryType } from './deliveries/types';

const modules: ModuleManifest[] = [
  { id: 'deliveries', name: 'Deliveries', version: '1', description: '', icon: 'x', color: '#000', objects: [deliveryType], filing: { parsers: deliveriesParsers } },
  { id: 'finance', name: 'Finance', version: '1', description: '', icon: 'x', color: '#000', objects: [accountType, transactionType], filing: { parsers: financeParsers } },
];

let os: LifeOSContext;
beforeEach(async () => {
  bus.clear();
  os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules, registry: new Registry() });
});
afterEach(() => os.db.close());

const at = Date.parse('2026-09-26T13:02:00');
const SPENT = 'Spent Rs.1240 On HDFC Bank Card 5678 At SWIGGY On 2026-09-26:13:02:11 Bal Rs.45000.00 Not You? Call 18002586161. Never share your OTP with anyone.';

describe('what counts as an OTP or a personal text', () => {
  it('codes are out; a payment text that says "never share your OTP" stays in', () => {
    expect(isOtpText('482913 is your OTP for login. Valid for 10 min.')).toBe(true);
    expect(isOtpText('Your verification code is 4821')).toBe(true);
    expect(isOtpText(SPENT)).toBe(false);
    expect(isOtpText('Rs.450 debited from A/c XX1234. Do not share OTP, PIN or CVV.')).toBe(false);
  });
  it('phone numbers are people; bank headers and short codes are not', () => {
    expect(isPersonalSender('+919812345678')).toBe(true);
    expect(isPersonalSender('98123 45678')).toBe(true);
    expect(isPersonalSender('AD-HDFCBK-S')).toBe(false);
    expect(isPersonalSender('54300')).toBe(false);
  });
});

describe('buildDataset — every inbox, minus codes and people', () => {
  it('keeps bank, shop and service texts with what each parser read and what the app filed; leaves out codes and friends', () => {
    const filed = { source: 'sms' as const, from: 'AD-HDFCBK', body: SPENT, at };
    fileMessage(os, { source: 'sms', from: filed.from, body: filed.body, receivedAt: filed.at });
    const inbox = [
      filed,
      { source: 'sms' as const, from: 'VM-HDFCBK', body: 'Dear Customer, your account statement for Sep is ready.', at: at + 1000 },
      { source: 'sms' as const, from: 'AX-AMAZON', body: '123456 is your Amazon OTP. Do not share it.', at: at + 2000 },
      { source: 'sms' as const, from: '+919812345678', body: 'Reached home?', at: at + 3000 },
    ];
    const ds = buildDataset(os, inbox, { since: at - 86_400_000, now: at + 5000 });
    expect(ds.counts).toMatchObject({ sms: 2, otp: 1, personal: 1 });
    expect(ds.parsers).toEqual(expect.arrayContaining(['finance.money', 'deliveries.shipping']));
    expect(ds.messages.map((r) => r.from)).toEqual(['VM-HDFCBK', 'AD-HDFCBK']);
    const row = ds.messages[1]!;
    expect(row).toMatchObject({ source: 'sms', text: SPENT, at: '2026-09-26T13:02:00' });
    expect((row.read as Record<string, unknown>)['finance.money']).toMatchObject({ kind: 'txn', txn: { direction: 'debit', amount: 1240, last4: '5678', counterparty: 'Swiggy' } });
    expect(row.app).toMatchObject({ status: 'confirmed', record: { type: 'transaction', amount: 1240, kind: 'expense', merchant: 'Swiggy' } });
    expect(row.corrections).toBeNull();
    // Never seen by the app (arrived after the last sync, or before history): null, not a guess.
    expect(ds.messages[0]!.app).toBeNull();
    expect(JSON.stringify(ds)).not.toContain('Reached home');
    expect(JSON.stringify(ds)).not.toContain('123456');
  });

  it('your corrections ride along: a recategorised payment says what it is now', () => {
    const r = fileMessage(os, { source: 'sms', from: 'AD-HDFCBK', body: SPENT, receivedAt: at });
    os.records.update(r.entityId!, { data: { category: 'groceries' } }, 'user');
    const ds = buildDataset(os, [{ source: 'sms', from: 'AD-HDFCBK', body: SPENT, at }], { since: at - 1000, now: at });
    expect(ds.messages[0]!.corrections).toMatchObject({ now: { category: 'groceries' } });
  });

  it('payment-app notifications and mail the app kept come along, codes and people left out', () => {
    fileMessage(os, { source: 'notification', from: 'com.google.android.apps.nbu.paisa.user', title: 'Payment sent', body: '₹450 paid to Swiggy', receivedAt: at });
    fileMessage(os, { source: 'notification', from: 'com.google.android.apps.nbu.paisa.user', title: 'Code', body: 'Your verification code is 4821', receivedAt: at + 1 });
    const queued = queuedMessages(os, at - 1000);
    expect(queued).toHaveLength(2);
    const ds = buildDataset(os, queued, { since: at - 1000, now: at });
    expect(ds.counts).toMatchObject({ notification: 1, otp: 1 });
    expect(ds.messages[0]).toMatchObject({ source: 'notification', title: 'Payment sent', text: '₹450 paid to Swiggy', app: { status: 'confirmed' } });
    expect(isPersonalMail('priya@gmail.com', 'Priya')).toBe(true);
    expect(isPersonalMail('noreply@uber.com', 'Uber Receipts')).toBe(false);
  });
});
