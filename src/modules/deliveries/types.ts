import { z } from 'zod';
import type { ObjectDef } from '@core/domain/types';

/** A parcel on its way (M4.2c): one record per order, updated by each shipping text. */
export interface DeliveryData {
  shop?: string;
  item?: string;
  carrier?: string;
  tracking?: string;
  orderId?: string;
  status: 'ordered' | 'shipped' | 'out_for_delivery' | 'delivered' | 'cancelled' | 'returned';
  expectedDate?: string;
  deliveredOn?: string;
  /** The tracking page from the shop's / courier's text. */
  trackingUrl?: string;
  /** Code for the delivery agent, and when it came (codes go stale). */
  otp?: string;
  otpAt?: number;
  notes?: string;
}

export const DELIVERY_STATUSES = [
  { value: 'ordered', label: 'Ordered' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'out_for_delivery', label: 'Out for delivery' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'returned', label: 'Returned' },
];

export const deliveryType: ObjectDef<DeliveryData> = {
  id: 'delivery',
  module: 'deliveries',
  label: 'Delivery',
  labelPlural: 'Deliveries',
  icon: 'box',
  color: 'brown',
  schema: z.object({
    shop: z.string().optional(),
    item: z.string().optional(),
    carrier: z.string().optional(),
    tracking: z.string().optional(),
    orderId: z.string().optional(),
    status: z.enum(['ordered', 'shipped', 'out_for_delivery', 'delivered', 'cancelled', 'returned']).default('ordered'),
    expectedDate: z.string().optional(),
    deliveredOn: z.string().optional(),
    trackingUrl: z.string().optional(),
    otp: z.string().optional(),
    otpAt: z.number().optional(),
    notes: z.string().optional(),
  }),
  fields: [
    { key: 'status', label: 'Status', type: 'select', required: true, summary: true, options: DELIVERY_STATUSES },
    { key: 'item', label: 'Item', type: 'text' },
    { key: 'shop', label: 'From', type: 'text', summary: true },
    { key: 'expectedDate', label: 'Expected', type: 'date', summary: true },
    { key: 'otp', label: 'Delivery OTP', type: 'text', summary: true },
    { key: 'trackingUrl', label: 'Tracking link', type: 'text', section: 'Tracking' },
    { key: 'carrier', label: 'Carrier', type: 'text', section: 'Tracking' },
    { key: 'tracking', label: 'Tracking number', type: 'text', section: 'Tracking' },
    { key: 'orderId', label: 'Order ID', type: 'text', section: 'Tracking' },
    { key: 'deliveredOn', label: 'Delivered on', type: 'date', section: 'Tracking' },
    { key: 'notes', label: 'Notes', type: 'longtext', section: 'Details' },
  ],
  computeTitle: (d) => d.item?.trim() || (d.shop ? `${d.shop} order` : 'Delivery'),
  computeSubtitle: (d) => [DELIVERY_STATUSES.find((s) => s.value === d.status)?.label, d.shop, d.status !== 'delivered' && d.expectedDate ? `by ${d.expectedDate.slice(5).split('-').reverse().join('/')}` : null].filter(Boolean).join(' · ') || undefined,
  searchText: (d) => [d.shop, d.item, d.carrier, d.tracking, d.orderId].filter(Boolean).join(' '),
  indexed: ['status', 'expectedDate', 'tracking', 'orderId'],
};
