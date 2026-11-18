import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBetterSqliteAdapter } from '../db/betterSqliteAdapter';
import { createLifeOS } from '../lifeos';
import { Registry } from '../registry/registry';
import type { LifeOSContext } from '../registry/context';
import { bus } from '../events/bus';
import { pruneOldData } from '../sources/retention';
import { fileMessage, messageList } from './messages';
import { buildSampleFile, clearSamples, maskText, noteSample, samples } from './samples';
import { isOtpText } from './otp';

const DAY = 86_400_000;
const NOW = Date.now();
let os: LifeOSContext;
beforeEach(async () => {
  bus.clear();
  os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules: [], registry: new Registry() });
});
afterEach(() => os.db.close());

const sms = (from: string, body: string, receivedAt = NOW) => ({ source: 'sms' as const, from, body, receivedAt });

describe('masking', () => {
  it.each([
    ['Sent Rs.450.00 From HDFC Bank A/C *1234 To SWIGGY', 'Sent Rs.450.00 From HDFC Bank A/C *0000 To SWIGGY'],
    ['Spent Rs.1240 On HDFC Bank Card 5678 At SWIGGY', 'Spent Rs.1240 On HDFC Bank Card 0000 At SWIGGY'],
    ['debited from A/c XX1234 on 26-09-26. Avl Bal Rs.12,000', 'debited from A/c XX0000 on 26-09-26. Avl Bal Rs.00,000'],
    ['Avl Limit: INR 1,20,000.00.', 'Avl Limit: INR 0,00,000.00.'],
    ['by UPI from priya@okaxis. Ref 426912345693', 'by UPI from name@okaxis. Ref 000000000000'],
    ['NEFT-HDFCN52026091212345-MEERA NAIR', 'NEFT-HDFCN00000000000000-MEERA NAIR'],
    ['Call 9812345678 now', 'Call 0000000000 now'],
    ['premium for your vehicle number MH12UQ4925 is Rs.846', 'premium for your vehicle number XX00XX0000 is Rs.846'],
    ['Kit dispatched to Plot 15 Beside Orchid 11 Opposite Kavya 5 on 01-09-26 via BLUEDART', 'Kit dispatched to [address] on 01-09-26 via BLUEDART'],
    ['delivered by BLUEDART to pin code 440037.', 'delivered by BLUEDART to pin code 000000.'],
    ['Credit Card Account 4xxx3007 on 09-SEP-26', 'Credit Card Account 0xxx0000 on 09-SEP-26'],
    ['application No D26G23778353S0W5. However', 'application No D00G00000000S0W0. However'],
    ['payment on your ICICI Bank credit card XXXX-8013 has been', 'payment on your ICICI Bank credit card XXXX-0000 has been'],
  ])('%s', (raw, masked) => {
    expect(maskText(raw)).toBe(masked);
  });

  it('keeps amounts, merchants and dates', () => {
    expect(maskText('Rs 3,499 spent at AMAZON on 12-Sep-26')).toBe('Rs 3,499 spent at AMAZON on 12-Sep-26');
  });
});

describe('collecting', () => {
  it('one example per shape and sender; digits aside, a repeat only counts', () => {
    noteSample(os, sms('VM-HDFCBK', 'Sent Rs.450.00 To SWIGGY', NOW));
    noteSample(os, sms('VM-HDFCBK', 'Sent Rs.900.00 To SWIGGY', NOW + 1000));
    noteSample(os, sms('VM-HDFCBK', 'Sent Rs.900.00 To UBER', NOW + 2000));
    noteSample(os, sms('AX-ICICIB', 'Sent Rs.900.00 To UBER', NOW + 3000));
    const all = samples(os);
    expect(all).toHaveLength(3);
    expect(all[0]).toMatchObject({ seen: 2, text: 'Sent Rs.900.00 To SWIGGY' });
  });

  it('reading the same inbox again does not count twice', () => {
    for (let run = 0; run < 2; run++) for (const at of [NOW, NOW + 1000]) noteSample(os, sms('VM-HDFCBK', 'Sent Rs.450.00 To SWIGGY', at));
    expect(samples(os)[0]!.seen).toBe(2);
  });

  it('leaves out codes, people and personal mail, and stores only masked text', () => {
    noteSample(os, sms('AX-AMAZON', '123456 is your Amazon OTP. Do not share it.'));
    noteSample(os, sms('+919812345678', 'Reached home?'));
    noteSample(os, { source: 'email', from: 'priya.shah@gmail.com', title: 'Dinner', body: 'See you at 8', receivedAt: NOW });
    expect(samples(os)).toEqual([]);
    noteSample(os, sms('VM-HDFCBK', 'A/C *1234 debited. Avl Bal Rs.12,000'));
    expect(JSON.stringify(os.db.all('SELECT * FROM message_samples'))).not.toMatch(/1234|12,000/);
  });

  it('keeps the newest 30 shapes of a sender', () => {
    const words = (n: number) => n.toString(2).replace(/0/g, 'a ').replace(/1/g, 'b ');
    for (let i = 1; i <= 35; i++) noteSample(os, sms('AD-SHOP', `Sale ${words(i)}`, NOW + i));
    const all = samples(os);
    expect(all).toHaveLength(30);
    expect(Math.min(...all.map((s) => s.lastAt))).toBe(NOW + 6);
  });

  it('every message the app takes in adds to it; the file says nobody reads it yet; clearing empties it', () => {
    fileMessage(os, sms('VM-AIRTEL', 'Your bill of Rs.799 is due on 28 Oct.'));
    const file = buildSampleFile(os, NOW);
    expect(file).toMatchObject({ format: 'lifeos-message-samples', counts: { samples: 1, unread: 1, seen: 1 } });
    expect(file.samples[0]).toMatchObject({ from: 'VM-AIRTEL', text: 'Your bill of Rs.799 is due on 28 Oct.', read: {} });
    clearSamples(os);
    expect(samples(os)).toEqual([]);
  });
});

describe('throwaway messages live a week (MODEL layer 4)', () => {
  it('a message that filed nothing goes after 7 days; a newer one stays', () => {
    fileMessage(os, sms('AD-MYNTRA', 'Sale ends tonight', NOW - 8 * DAY));
    fileMessage(os, sms('AD-MYNTRA', 'Sale ends tomorrow', NOW - 6 * DAY));
    expect(pruneOldData(os, { now: NOW }).ignoredMessages).toBe(1);
    expect(messageList(os).map((m) => m.text)).toEqual(['Sale ends tomorrow']);
  });

  it('a sender never keeps a code as its first-seen line, and an old one is cleared', () => {
    fileMessage(os, sms('AX-AMAZON', '123456 is your Amazon OTP.'));
    expect(os.db.get<{ sample: string | null }>(`SELECT sample FROM sms_senders WHERE address='AX-AMAZON'`)?.sample).toBeNull();
    os.db.run(`UPDATE sms_senders SET sample='654321 is your OTP' WHERE address='AX-AMAZON'`);
    pruneOldData(os, { now: NOW });
    expect(os.db.get<{ sample: string | null }>(`SELECT sample FROM sms_senders WHERE address='AX-AMAZON'`)?.sample).toBeNull();
  });

  it('the wording of a filed OTP text goes after a week, or once its parcel is delivered; its record stays', () => {
    const parcel = { id: 'parcel' };
    os.db.run(`INSERT INTO records(id,object,title,data,created_at,updated_at,version) VALUES ('parcel','delivery','Parcel',?,?,?,1)`, [JSON.stringify({ status: 'shipped' }), NOW, NOW]);
    const insert = (id: string, at: number, body: string, record: string | null) =>
      os.db.run(`INSERT INTO ingest_queue(id,source,package,received_at,raw_text,status,record_id,created_at,updated_at) VALUES (?,?,?,?,?,'confirmed',?,?,?)`, [id, 'sms', 'JM-DLVERY', at, body, record, at, at]);
    insert('old', NOW - 8 * DAY, 'OTP 739204 for your parcel', parcel.id);
    insert('fresh', NOW - DAY, 'OTP 111111 for your parcel', parcel.id);
    insert('other', NOW - 8 * DAY, 'Your parcel has shipped', parcel.id);
    pruneOldData(os, { now: NOW });
    const text = (id: string) => os.db.get<{ raw_text: string }>(`SELECT raw_text FROM ingest_queue WHERE id=?`, [id])?.raw_text;
    expect([text('old'), text('fresh'), text('other')]).toEqual(['', 'OTP 111111 for your parcel', 'Your parcel has shipped']);
    os.db.run(`UPDATE records SET data=json_set(data,'$.status','delivered') WHERE id=?`, [parcel.id]);
    pruneOldData(os, { now: NOW });
    expect(text('fresh')).toBe('');
    expect(os.db.get(`SELECT id FROM records WHERE id='parcel'`)).toBeTruthy();
  });

  it('a Delivery keeps its OTP Field for a week at most', () => {
    const insert = (id: string, otpAt: number) =>
      os.db.run(`INSERT INTO records(id,object,title,data,created_at,updated_at,version) VALUES (?,'delivery','Parcel',?,?,?,1)`, [id, JSON.stringify({ otp: '739204', otpAt }), otpAt, otpAt]);
    insert('a', NOW - 8 * DAY);
    insert('b', NOW - 2 * DAY);
    const undo = os.filings.add({ kind: 'delivery', label: 'Parcel', before: { otp: '739204', status: 'shipped' } });
    os.db.run(`UPDATE filings SET created_at=? WHERE id=?`, [NOW - 8 * DAY, undo.id]);
    pruneOldData(os, { now: NOW });
    expect(os.filings.get(undo.id)?.before).toEqual({ status: 'shipped' });
    const otp = (id: string) => (JSON.parse(os.db.get<{ data: string }>(`SELECT data FROM records WHERE id=?`, [id])!.data) as { otp?: string }).otp;
    expect([otp('a'), otp('b')]).toEqual([undefined, '739204']);
  });
});

describe('codes and secrets are never kept', () => {
  it.each([
    '<#> 240393 is your Instagram code. Don\'t share it.',
    'Your Blue Dart Secure Delivery Code is 489874 and its valid for next 30 minutes.',
    '8576 - use this code to log in to ZENIN. Valid for 10 minutes.',
    'Invoice generated for Rs. 989.5.Share DAC 114731 on delivery.',
    '998257 is your code for device registration. Do not share this code.',
    'Password changed successfully. Your User Id is : someone. Password is : Abc+123xyz -IRCTC',
  ])('%s', (body) => {
    expect(isOtpText(body)).toBe(true);
    noteSample(os, sms('AX-SENDER', body));
    expect(samples(os)).toHaveLength(0);
  });

  it('a payment that says never to share your OTP is kept', () => {
    expect(isOtpText('Sent Rs.450.00 From HDFC Bank A/C *1234 To SWIGGY. Never share your OTP with anyone.')).toBe(false);
  });
});
