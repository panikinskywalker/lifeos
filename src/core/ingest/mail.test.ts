import { describe, expect, it } from 'vitest';
import { mailKind, mailMerchant, parseMail, receiptAmount, type Mail } from './mail';

const at = Date.parse('2026-09-26T10:00:00');
const mail = (from: string, fromName: string, subject: string, text: string, date = at): Mail => ({ uid: 1, from, fromName, subject, text, date });

describe('which mail is read', () => {
  it('receipts, bank alerts, shipping, flights, stays — from the headers alone', () => {
    expect(mailKind({ from: 'noreply@uber.com', fromName: 'Uber Receipts', subject: 'Your Friday evening trip with Uber' })).toBe('receipt');
    expect(mailKind({ from: 'alerts@hdfcbank.net', fromName: 'HDFC Bank InstaAlerts', subject: 'Alert : Update on your HDFC Bank Credit Card' })).toBe('bank');
    expect(mailKind({ from: 'shipment-tracking@amazon.in', fromName: 'Amazon.in', subject: 'Shipped: "boAt Rockerz 255..." and 1 more item' })).toBe('shipping');
    expect(mailKind({ from: 'reservations@customer.goindigo.in', fromName: 'IndiGo', subject: 'Your IndiGo Itinerary - PNR K7XQ2M' })).toBe('flight');
    expect(mailKind({ from: 'noreply@booking.com', fromName: 'Booking.com', subject: 'Your booking is confirmed at Casa Azul Goa' })).toBe('stay');
    expect(mailKind({ from: 'message@adobe.com', fromName: 'Adobe', subject: 'Your Adobe invoice is ready' })).toBe('receipt');
  });
  it('skips promotions, statements, newsletters and people', () => {
    expect(mailKind({ from: 'offers@swiggy.in', fromName: 'Swiggy', subject: 'Flat 60% off on your favourites 🍕' })).toBeNull();
    expect(mailKind({ from: 'estatement@hdfcbank.net', fromName: 'HDFC Bank', subject: 'Your HDFC Bank Credit Card Statement for September' })).toBeNull();
    expect(mailKind({ from: 'news@substack.com', fromName: 'Some Newsletter', subject: 'This week in tech' })).toBeNull();
    expect(mailKind({ from: 'priya@gmail.com', fromName: 'Priya', subject: 'dinner saturday?' })).toBeNull();
  });
});

describe('receipts', () => {
  it('the final total, not the subtotal, tax or a discount', () => {
    expect(receiptAmount('Subtotal ₹420.00\nGST ₹21.00\nDiscount -₹50.00\nTotal ₹391.00\nPaid via UPI')).toEqual({ amount: 391, currency: 'INR' });
    expect(receiptAmount('Item total: Rs. 650\nDelivery: Rs. 30\nGrand Total: Rs. 680')).toEqual({ amount: 680, currency: 'INR' });
    expect(receiptAmount('Amount paid\nUSD 22.99')).toEqual({ amount: 22.99, currency: 'USD' });
    expect(receiptAmount('Thanks for riding. See you soon.')).toBeNull();
  });
  it('merchant as you know it', () => {
    expect(mailMerchant({ from: 'noreply@uber.com', fromName: 'Uber Receipts', subject: '' })).toBe('Uber');
    expect(mailMerchant({ from: 'mail@paypal.com', fromName: 'service@paypal.com', subject: 'Receipt for your payment to Adobe Systems' })).toBe('Adobe');
    expect(mailMerchant({ from: 'billing@thirdwavecoffee.in', fromName: 'Third Wave Coffee Billing', subject: 'Your receipt' })).toBe('Third Wave Coffee');
  });
  it('an Uber receipt → an expense at Uber on the day', () => {
    const r = parseMail(mail('noreply@uber.com', 'Uber Receipts', 'Your Friday evening trip with Uber', 'Thanks for riding, Rutvij\nTotal ₹312.45\nTrip fare ₹290.00\nBooking fee ₹22.45\nPaid with UPI'));
    expect(r).toMatchObject({ kind: 'txn', txn: { amount: 312.45, direction: 'debit', counterparty: 'Uber', date: '2026-09-26' } });
  });
  it('an Adobe invoice is a subscription charge', () => {
    const r = parseMail(mail('message@adobe.com', 'Adobe', 'Your Adobe invoice is ready', 'Creative Cloud Photography plan (20GB)\nBilling period Sep 26 – Oct 25\nTotal amount: ₹1,675.60 (incl. GST)\nCharged to Visa ending 5678'));
    expect(r).toMatchObject({ kind: 'txn', txn: { amount: 1675.6, counterparty: 'Adobe', recurring: true, last4: '5678', brand: { category: 'subscriptions' } } });
  });
  it('a refund is money in', () => {
    const r = parseMail(mail('noreply@swiggy.in', 'Swiggy', 'Refund processed for your order', 'We have refunded the amount.\nRefund amount paid: ₹240.00'));
    expect(r).toMatchObject({ kind: 'txn', txn: { amount: 240, direction: 'credit', counterparty: 'Swiggy' } });
  });
  it('a bank alert email reads like its SMS', () => {
    const r = parseMail(mail('alerts@hdfcbank.net', 'HDFC Bank InstaAlerts', 'Alert : Update on your HDFC Bank Credit Card', 'Dear Customer,\nThank you for using your HDFC Bank Credit Card ending 5678 for Rs 1,240.00 at SWIGGY on 26-09-2026 13:02:11.\nAuthorization code:- 012345'));
    expect(r).toMatchObject({ kind: 'txn', txn: { amount: 1240, counterparty: 'Swiggy', last4: '5678' } });
  });
});

describe('shipping, flights, stays', () => {
  it('a shipping email → a delivery', () => {
    const r = parseMail(mail('shipment-tracking@amazon.in', 'Amazon.in', 'Shipped: "boAt Rockerz 255..." and 1 more item', 'Your package with boAt Rockerz 255 Pro has been shipped. Arriving Tuesday, 29 September. Order #408-1234567-1234567'));
    expect(r).toMatchObject({ kind: 'delivery', delivery: { shop: 'Amazon', status: 'shipped', orderId: '408-1234567-1234567' } });
  });
  it('an IndiGo ticket → flight BLR → GOI on the day, with the fare', () => {
    const r = parseMail(
      mail('reservations@customer.goindigo.in', 'IndiGo', 'Your IndiGo Itinerary - PNR K7XQ2M', 'Booking confirmed\nPNR: K7XQ2M\nFlight 6E 2134\nBLR → GOI\nDeparture: Sat, 10 Oct 2026, 06:15 hrs\nArrival 07:30 hrs\nTotal fare: ₹5,842'),
    );
    expect(r).toMatchObject({ kind: 'flight', flight: { airline: 'IndiGo', flightNo: '6E 2134', pnr: 'K7XQ2M', from: 'BLR', to: 'GOI', date: '2026-10-10', time: '06:15' }, txn: { amount: 5842, counterparty: 'IndiGo' } });
  });
  it('city names work when there are no codes; no route and no flight number is not a flight', () => {
    const r = parseMail(mail('noreply@makemytrip.com', 'MakeMyTrip', 'Flight booking confirmed - Bengaluru to Delhi', 'Your flight from Bengaluru to Delhi on 14 Nov 2026 at 9:40 PM is confirmed.\nAirline PNR: QZ81TR\nAmount paid: ₹7,120'));
    expect(r).toMatchObject({ kind: 'flight', flight: { from: 'BLR', to: 'DEL', date: '2026-11-14', time: '21:40', pnr: 'QZ81TR' } });
    expect(parseMail(mail('noreply@makemytrip.com', 'MakeMyTrip', 'Your e-ticket', 'Amount paid: ₹120 for seat selection')).kind).toBe('txn');
  });
  it('a hotel booking → a stay with its dates and place', () => {
    const r = parseMail(mail('noreply@booking.com', 'Booking.com', 'Your booking is confirmed at Casa Azul Goa', 'Your stay at Casa Azul Goa\nCheck-in: Sat 10 Oct 2026 from 14:00\nCheck-out: Mon 12 Oct 2026 until 11:00\nTotal price ₹9,400\nAnjuna, Goa'));
    expect(r).toMatchObject({ kind: 'stay', stay: { name: 'Casa Azul Goa', checkIn: '2026-10-10', checkOut: '2026-10-12', place: 'Goa' }, txn: { amount: 9400 } });
  });
});
