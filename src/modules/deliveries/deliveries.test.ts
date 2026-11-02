import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBetterSqliteAdapter } from '@core/db/betterSqliteAdapter';
import { createLifeOS } from '@core/lifeos';
import { Registry } from '@core/registry/registry';
import type { LifeOSContext } from '@core/registry/context';
import { bus } from '@core/events/bus';
import { fileMessage } from '@core/filing/messages';
import { financeModule } from '../finance';
import { placesModule } from '../places';
import { deliveriesModule, deliveryCandidates, markDelivered, onTheWay, otpOf, undoDelivered, type DeliveryData } from '.';
import { deliveriesBrain } from './brain';

/** R7b through the real pipeline: finance files the payments, deliveries links them; places holds the shops. Plausible samples. */

const HOUR = 3_600_000;
const T0 = Date.parse('2026-11-02T09:00:00');
let os: LifeOSContext;
beforeEach(async () => {
  bus.clear();
  os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules: [placesModule, financeModule, deliveriesModule], registry: new Registry() });
});
afterEach(() => os.db.close());

const sms = (from: string, body: string, at: number) => fileMessage(os, { source: 'sms', from, body, receivedAt: at });
const note = (from: string, title: string, body: string, at: number) => fileMessage(os, { source: 'notification', from, title, body, receivedAt: at });
const deliveries = () => os.records.query<DeliveryData>('delivery', { sort: [{ field: 'createdAt', dir: 'asc' }] });
const txs = () => os.records.query('transaction');
const AMAZON_APP = 'in.amazon.mShop.android.shopping';
const BLINKIT_APP = 'com.grofers.customerapp';
const GPAY = 'com.google.android.apps.nbu.paisa.user';

describe('a parcel and its links', () => {
  it('paid, then shipped: the shop is an Organisation, the order is the payment, both as Links', () => {
    sms('VM-HDFCBK', 'Spent Rs.1499 On HDFC Bank Card 5678 At AMAZON On 2026-11-01:21:14:02 Bal Rs.45000.00 Not You? Call 18002586161', T0 - 12 * HOUR);
    sms('AX-AMAZON', 'Shipped: Philips Trimmer BT3221 will be delivered by Wed, 4 Nov. Track: amzn.in/d/7Gx2 Order 403-5512345-1234567', T0);
    const [d] = deliveries();
    const [tx] = txs();
    expect(d!.data).toMatchObject({ shop: 'Amazon', status: 'shipped', paymentId: tx!.id, expectedDate: '2026-11-04' });
    expect(os.records.get(d!.data.shopId!)).toMatchObject({ object: 'org', title: 'Amazon' });
    expect(os.links.forEntity(d!.id, 'bought_in').map((r) => r.other.id)).toEqual([tx!.id]);
    expect(os.links.forEntity(d!.id, 'vendor').map((r) => r.other.title)).toEqual(['Amazon']);
    // The next Amazon order is its own, with its own shop link to the same Organisation, and no payment of the first's.
    sms('AX-AMAZON', 'Shipped: Prestige Kettle 1.5L will be delivered by Thu, 5 Nov. Order 403-7788990-7654321', T0 + HOUR);
    const second = deliveries()[1]!;
    expect(second.data.shopId).toBe(d!.data.shopId);
    expect(second.data.paymentId).toBeUndefined();
  });

  it('paid after the text (cash on delivery, a late SMS): the payment finds the open delivery', () => {
    sms('VM-FLPKRT', 'Your Flipkart order for Nike Revolution 6 has been shipped. Order ID OD128765432109876', T0);
    note(GPAY, 'Payment successful', '₹2,899 paid to Flipkart', T0 + 30 * 60_000);
    const [d] = deliveries();
    expect(d!.data.paymentId).toBe(txs()[0]!.id);
    // A refund from the shop is never an order's payment.
    sms('VM-FLPKRT', 'Your Flipkart order for Puma Socks has been shipped. Order ID OD128765432100000', T0 + 2 * HOUR);
    sms('VM-HDFCBK', 'Rs.499.00 credited to HDFC Bank A/c XX1234 from FLIPKART on 02-11-26. Refund', T0 + 3 * HOUR);
    expect(deliveries()[1]!.data.paymentId).toBeUndefined();
  });

  it('the app’s notifications move it along; the OTP shows while it is on its way, never after', () => {
    note(AMAZON_APP, 'Out for delivery', 'Your package with Philips Trimmer BT3221 will be delivered today. Your delivery OTP is 739204.', T0);
    let d = deliveries()[0]!;
    expect(d.data).toMatchObject({ shop: 'Amazon', status: 'out_for_delivery', otp: '739204' });
    expect(otpOf(d, T0 + HOUR)).toBe('739204');
    expect(otpOf(d, T0 + 4 * 24 * HOUR)).toBeNull();
    note(AMAZON_APP, 'Delivered', 'Your package with Philips Trimmer BT3221 has been delivered.', T0 + 3 * HOUR);
    d = os.records.get<DeliveryData>(d.id)!;
    expect(d.data).toMatchObject({ status: 'delivered', deliveredOn: '2026-11-02' });
    expect(d.data.otp).toBeUndefined();
    expect(deliveries()).toHaveLength(1);
  });
});

describe('quick commerce', () => {
  it('a Blinkit order in minutes: one record from placed to delivered, its UPI payment linked; the next order is new', () => {
    note(BLINKIT_APP, 'Order placed', 'Your order is being packed', T0);
    note(GPAY, 'Payment successful', '₹437 paid to Blinkit', T0 + 60_000);
    note(BLINKIT_APP, 'Your order is on the way', 'Arriving in 8 minutes. Share OTP 4821 with the delivery partner', T0 + 5 * 60_000);
    let [d] = deliveries();
    expect(d!.data).toMatchObject({ shop: 'Blinkit', status: 'out_for_delivery', otp: '4821', paymentId: txs()[0]!.id, expectedDate: '2026-11-02' });
    expect(d!.title).toBe('Blinkit order');
    note(BLINKIT_APP, 'Order delivered', 'Your order has been delivered. Enjoy!', T0 + 14 * 60_000);
    [d] = deliveries();
    expect(d!.data.status).toBe('delivered');
    note(BLINKIT_APP, 'Order placed', 'Your order is being packed', T0 + 26 * HOUR);
    expect(deliveries().map((x) => x.data.status)).toEqual(['delivered', 'ordered']);
  });

  it('one whose last notification was missed stops being on its way after 6 hours', () => {
    note('com.zeptoconsumerapp', 'Rahul is on the way', 'Your order will reach you in 6 mins', T0);
    const d = deliveries()[0]!;
    expect(onTheWay(d, d.updatedAt + HOUR)).toBe(true);
    expect(onTheWay(d, d.updatedAt + 7 * HOUR)).toBe(false);
  });
});

describe('the brain: a parcel arriving today', () => {
  it('coming up, urgent with an OTP, which never leaves the phone; quick commerce and later days are not nudges', () => {
    note(AMAZON_APP, 'Out for delivery', 'Your package with Philips Trimmer BT3221 will be delivered today. Your delivery OTP is 739204. Track amzn.in/d/7Gx2', T0);
    sms('VM-FLPKRT', 'Your Flipkart order for Nike Revolution 6 has been shipped and will be delivered by Thu, 5 Nov. Order ID OD128765432109876', T0);
    note(BLINKIT_APP, 'Your order is on the way', 'Arriving in 8 minutes. Share OTP 4821 with the delivery partner', T0);
    const c = deliveryCandidates(os, T0 + HOUR);
    expect(c.map((x) => [x.title, x.kind, x.shape, x.urgent, x.yes])).toEqual([['Philips Trimmer BT3221', 'coming up', 'ask', true, 'Track']]);
    expect(c[0]!.line).toBe('Philips Trimmer BT3221 from Amazon is out for delivery: the OTP is on it');
    expect(JSON.stringify([c[0]!.line, c[0]!.record])).not.toContain('739204');
    expect(c[0]!.line).not.toMatch(/[\u2014\u2013]/);
    const nudge = { payload: c[0]!.payload } as Parameters<NonNullable<typeof deliveriesBrain.act>>[2];
    expect(deliveriesBrain.act!(os, 'yes', nudge)).toEqual({ open: 'https://amzn.in/d/7Gx2' });
    // Flipkart's comes on the 5th.
    expect(deliveryCandidates(os, Date.parse('2026-11-05T08:00:00')).map((x) => [x.title, x.urgent])).toEqual([['Nike Revolution 6', false]]);
  });
});

describe('by hand', () => {
  it('Delivered marks it and clears the code; Undo puts it back', () => {
    note(AMAZON_APP, 'Out for delivery', 'Your package with Philips Trimmer BT3221 will be delivered today. Your delivery OTP is 739204.', T0);
    const id = deliveries()[0]!.id;
    const u = markDelivered(os, id, T0 + HOUR)!;
    expect(os.records.get<DeliveryData>(id)!.data).toMatchObject({ status: 'delivered', deliveredOn: '2026-11-02' });
    expect(markDelivered(os, id)).toBeNull();
    undoDelivered(os, u);
    expect(os.records.get<DeliveryData>(id)!.data).toMatchObject({ status: 'out_for_delivery', otp: '739204' });
  });
});
