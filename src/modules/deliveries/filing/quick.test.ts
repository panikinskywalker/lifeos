import { describe, expect, it } from 'vitest';
import { parseDeliverySms } from './delivery';
import { parseQuickDelivery, parseShopNotification } from './quick';

/**
 * Plausible samples, written for R7b (not real texts yet): Instamart, Zepto
 * and Blinkit, the shop apps' notifications, and the four carriers. A real
 * export replaces them (docs/handover/r7b-deliveries.md).
 */

const AT = Date.parse('2026-11-02T18:40:00');
const TODAY = '2026-11-02';

describe('quick commerce: Instamart, Zepto, Blinkit', () => {
  it('texts: placed, on the way with the code, delivered', () => {
    expect(parseQuickDelivery('Your Swiggy Instamart order #INS6142087 is confirmed and being packed.', 'VM-SWIGGY', AT)).toMatchObject({ shop: 'Instamart', status: 'ordered', orderId: 'INS6142087', expected: TODAY });
    expect(parseQuickDelivery('Your Instamart order is on the way and will reach you in 12 mins. Delivery PIN: 5531', 'VM-SWIGGY', AT)).toMatchObject({ shop: 'Instamart', status: 'out_for_delivery', otp: '5531' });
    expect(parseQuickDelivery('Your Zepto order ZP2611084512 has been delivered. Rate your experience in the app.', 'VM-ZEPTON', AT)).toMatchObject({ shop: 'Zepto', status: 'delivered', orderId: 'ZP2611084512', otp: null });
    expect(parseQuickDelivery('Blinkit: Share OTP 4821 with the delivery partner to receive your order. It is on the way!', 'VM-BLINKT', AT)).toMatchObject({ shop: 'Blinkit', status: 'out_for_delivery', otp: '4821' });
    expect(parseQuickDelivery('Your Blinkit order was cancelled. Refund of Rs 437 initiated.', 'VM-BLINKT', AT)).toMatchObject({ shop: 'Blinkit', status: 'cancelled' });
  });

  it('notifications: the app says which shop; Swiggy is Instamart only when it says so', () => {
    expect(parseShopNotification('com.grofers.customerapp', 'Your order is on the way', 'Arriving in 8 minutes', AT)).toMatchObject({ shop: 'Blinkit', status: 'out_for_delivery', expected: TODAY });
    expect(parseShopNotification('com.grofers.customerapp', 'Order delivered', 'Your order has been delivered. Enjoy!', AT)).toMatchObject({ shop: 'Blinkit', status: 'delivered' });
    expect(parseShopNotification('com.zeptoconsumerapp', 'Rahul is on the way 🛵', 'Your order will reach you in 6 mins', AT)).toMatchObject({ shop: 'Zepto', status: 'out_for_delivery' });
    expect(parseShopNotification('com.zeptoconsumerapp', 'Order placed!', 'We are packing your order', AT)).toMatchObject({ shop: 'Zepto', status: 'ordered' });
    expect(parseShopNotification('in.swiggy.android', 'Instamart order arriving', 'Your Instamart order is nearby. Please be ready to collect it.', AT)).toMatchObject({ shop: 'Instamart', status: 'out_for_delivery' });
    expect(parseShopNotification('in.swiggy.android', 'Order delivered', 'Your Instamart order is delivered', AT)).toMatchObject({ shop: 'Instamart', status: 'delivered' });
    expect(parseShopNotification('in.swiggy.android', 'Your food is on the way', 'Rajesh picked up your order from Meghana Foods', AT)).toBeNull();
  });

  it('not orders: offers, payments, food, other apps', () => {
    expect(parseShopNotification('com.zeptoconsumerapp', 'Flat 50% off on fruits', 'Order now, arriving in 10 minutes', AT)).toBeNull();
    expect(parseShopNotification('com.grofers.customerapp', 'Diwali deals are live', 'Get it delivered in minutes. Shop now!', AT)).toBeNull();
    expect(parseQuickDelivery('Rs.437.00 debited from HDFC Bank A/c **1234 to BLINKIT on 02-11-26. UPI Ref 630512345678', 'VM-HDFCBK', AT)).toBeNull();
    expect(parseQuickDelivery('Your Swiggy order is out for delivery!', 'AX-SWIGGY', AT)).toBeNull();
    expect(parseShopNotification('com.whatsapp', 'Mum', 'Your order has been delivered?', AT)).toBeNull();
  });
});

describe('shop apps: Amazon, Flipkart, Myntra', () => {
  it('read as their shipping texts', () => {
    expect(parseShopNotification('in.amazon.mShop.android.shopping', 'Out for delivery', 'Your package with Philips Trimmer BT3221 will be delivered today. Your delivery OTP is 739204.', AT)).toMatchObject({ shop: 'Amazon', item: 'Philips Trimmer BT3221', status: 'out_for_delivery', otp: '739204', expected: TODAY });
    expect(parseShopNotification('in.amazon.mShop.android.shopping', 'Delivered', 'Your package with Philips Trimmer BT3221 has been delivered.', AT)).toMatchObject({ shop: 'Amazon', status: 'delivered' });
    expect(parseShopNotification('com.flipkart.android', 'Shipped!', 'Your order for Nike Revolution 6 has been shipped and will be delivered by Thu, 5 Nov', AT)).toMatchObject({ shop: 'Flipkart', item: 'Nike Revolution 6', status: 'shipped', expected: '2026-11-05' });
    expect(parseShopNotification('com.myntra.android', 'Arriving today', 'Your Myntra order with Roadster Men Slim Fit Jeans is out for delivery. Share OTP 2214 with the agent.', AT)).toMatchObject({ shop: 'Myntra', status: 'out_for_delivery', otp: '2214' });
    expect(parseShopNotification('in.amazon.mShop.android.shopping', 'Great Indian Festival', 'Deals on phones, delivered by tomorrow. Shop now', AT)).toBeNull();
  });
});

describe('carriers: Delhivery, Blue Dart, Ekart, Shadowfax', () => {
  it('each with its tracking number', () => {
    expect(parseDeliverySms('Delhivery: Your Myntra shipment AWB 4823106745121 is out for delivery today. Track: dlv.li/aB3x', 'VM-DLHVRY', AT)).toMatchObject({ carrier: 'Delhivery', shop: 'Myntra', tracking: '4823106745121', status: 'out_for_delivery', link: 'https://dlv.li/aB3x' });
    expect(parseDeliverySms('Blue Dart: Shipment Waybill 75849302114 from Amazon has been picked up and will be delivered by 4 Nov.', 'BZ-BLUDRT', AT)).toMatchObject({ carrier: 'Blue Dart', shop: 'Amazon', tracking: '75849302114', status: 'shipped', expected: '2026-11-04' });
    expect(parseDeliverySms('Ekart: Your Flipkart shipment FMPC2918374655 has been delivered. Thank you!', 'VM-EKARTL', AT)).toMatchObject({ carrier: 'Ekart', shop: 'Flipkart', tracking: 'FMPC2918374655', status: 'delivered' });
    expect(parseDeliverySms('Shadowfax: Your Meesho order is out for delivery. Share OTP 6610 with our rider. Track shadowfax.in/t/9XK2', 'VM-SHDWFX', AT)).toMatchObject({ carrier: 'Shadowfax', shop: 'Meesho', status: 'out_for_delivery', otp: '6610' });
  });
});
