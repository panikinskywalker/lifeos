import { describe, expect, it } from 'vitest';
import { parseDeliverySms } from './delivery';

const AT = Date.parse('2026-09-26T10:00:00'); // a Saturday

describe('shipping texts', () => {
  it('shops and couriers, each status, the expected day', () => {
    expect(parseDeliverySms('Shipped: boAt Rockerz 255 Pro will be delivered by Tue, 29 Sep. Track: amzn.in/d/abc Order 402-1234567-7654321', 'AX-AMAZON', AT)).toMatchObject({ shop: 'Amazon', item: 'boAt Rockerz 255 Pro', status: 'shipped', expected: '2026-09-29', orderId: '402-1234567-7654321' });
    expect(parseDeliverySms('Out for delivery: boAt Rockerz 255 Pro. Our delivery agent will reach you today. Order 402-1234567-7654321', 'AX-AMAZON', AT)).toMatchObject({ status: 'out_for_delivery', expected: '2026-09-26' });
    expect(parseDeliverySms('Delivered: Your package with boAt Rockerz 255 Pro has been delivered. Order 402-1234567-7654321', 'AX-AMAZON', AT)).toMatchObject({ status: 'delivered', item: 'boAt Rockerz 255 Pro' });
    expect(parseDeliverySms('Your Flipkart order for Nike Revolution 6 has been shipped and is expected to be delivered by Oct 2. Order ID OD128765432109876', 'VM-FLPKRT', AT)).toMatchObject({ shop: 'Flipkart', item: 'Nike Revolution 6', status: 'shipped', expected: '2026-10-02', orderId: 'OD128765432109876' });
    expect(parseDeliverySms('Your shipment AWB 1234567890123 from Myntra is out for delivery today. Delhivery', 'VM-DLHVRY', AT)).toMatchObject({ shop: 'Myntra', carrier: 'Delhivery', tracking: '1234567890123', status: 'out_for_delivery' });
    expect(parseDeliverySms('Blue Dart: Waybill 78123456781 has been delivered to Ryu on 26-Sep.', 'BZ-BLUDRT', AT)).toMatchObject({ carrier: 'Blue Dart', tracking: '78123456781', status: 'delivered' });
    expect(parseDeliverySms('Speed Post article EE123456789IN booked, expected delivery by Friday', 'IP-INDPST', AT)).toMatchObject({ carrier: 'India Post', tracking: 'EE123456789IN', status: 'shipped', expected: '2026-10-02' });
    expect(parseDeliverySms('Your Nykaa order has been cancelled. Refund of Rs 899 will be processed.', 'AX-NYKAA', AT)).toMatchObject({ shop: 'Nykaa', status: 'cancelled' });
  });

  it('tracking link and delivery OTP', () => {
    expect(parseDeliverySms('Shipped: boAt Rockerz 255 Pro will be delivered by Tue, 29 Sep. Track: amzn.in/d/abc12 Order 402-1234567-7654321', 'AX-AMAZON', AT)).toMatchObject({ link: 'https://amzn.in/d/abc12', otp: null });
    expect(parseDeliverySms('Your Myntra shipment is out for delivery. Share OTP 4821 with the agent. Track https://myntr.it/xYz9.', 'VM-MYNTRA', AT)).toMatchObject({ status: 'out_for_delivery', otp: '4821', link: 'https://myntr.it/xYz9' });
    expect(parseDeliverySms('739204 is the OTP for your Flipkart order delivery. Do not share it before receiving the package.', 'VM-FLPKRT', AT)).toMatchObject({ shop: 'Flipkart', status: 'out_for_delivery', otp: '739204' });
    expect(parseDeliverySms('Delivered: Your package with boAt Rockerz 255 Pro has been delivered. OTP 4821 used.', 'AX-AMAZON', AT)).toMatchObject({ status: 'delivered', otp: null });
    expect(parseDeliverySms('Your Amazon.in order has been shipped.', 'AX-AMAZON', AT)!.link).toBeNull();
  });

  it('more real shapes: arriving today, dispatched, courier OTP texts, order confirmed', () => {
    expect(parseDeliverySms('Arriving today: Your Amazon package with Philips Trimmer BT3221. Track: amzn.in/d/x1', 'JD-AMAZON', AT)).toMatchObject({ shop: 'Amazon', status: 'out_for_delivery', expected: '2026-09-26' });
    expect(parseDeliverySms('Your Meesho order for Cotton Kurta Set has been dispatched and will reach you by 30 Sep.', 'VM-MEESHO', AT)).toMatchObject({ shop: 'Meesho', status: 'shipped', expected: '2026-09-30' });
    expect(parseDeliverySms('Ekart: Your Flipkart shipment FMPP1234567890 will be delivered today. Share OTP 4821 with the delivery agent only on receiving it.', 'VM-EKARTL', AT)).toMatchObject({ carrier: 'Ekart', shop: 'Flipkart', status: 'out_for_delivery', tracking: 'FMPP1234567890' });
    expect(parseDeliverySms('XpressBees: Shipment 13579246801357 from AJIO is out for delivery. Agent: 98XXXXXX12', 'VM-XPRESB', AT)).toMatchObject({ carrier: 'XpressBees', shop: 'AJIO', status: 'out_for_delivery' });
    expect(parseDeliverySms('Order Confirmed: Your order for Lenskart Vincent Chase frames has been placed. Order ID 1234567890.', 'VM-LNSKRT', AT)).toMatchObject({ shop: 'Lenskart', status: 'ordered' });
  });

  it('not parcels: food and quick commerce, bank texts, chit-chat', () => {
    expect(parseDeliverySms('Your Swiggy order is out for delivery!', 'AX-SWIGGY', AT)).toBeNull();
    expect(parseDeliverySms('Blinkit: your order will arrive in 9 minutes', 'VM-BLINKT', AT)).toBeNull();
    expect(parseDeliverySms('Rs.450 debited from A/c XX1234 to SWIGGY', 'VM-HDFCBK', AT)).toBeNull();
    expect(parseDeliverySms('Happy birthday! Hope you have a great day', 'AX-FRIEND', AT)).toBeNull();
  });
});
