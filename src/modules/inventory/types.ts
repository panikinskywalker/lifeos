import { z } from 'zod';
import type { ObjectDef } from '@core/domain/types';
import type { FieldOption } from '@core/domain/fields';

/**
 * Stock and Space (docs/MODEL.md §2 Things, agreed 30 Oct with R7e): what is
 * kept at home that runs out or goes off, and the parts of Home that hold it.
 * The module keeps its id `inventory`; you see it as Home.
 */

export const INVENTORY_COLOR = 'teal';

export const STOCK_SOURCES: FieldOption[] = [
  { value: 'order', label: 'Order' },
  { value: 'receipt', label: 'Receipt' },
  { value: 'you', label: 'You' },
];

export const SHOPS: FieldOption[] = [
  { value: 'blinkit', label: 'Blinkit' },
  { value: 'zepto', label: 'Zepto' },
  { value: 'instamart', label: 'Instamart' },
  { value: 'bigbasket', label: 'BigBasket' },
  { value: 'other', label: 'Other' },
];

export interface StockData {
  /** "100 g", "1 L", "strip of 15". */
  size?: string;
  /** How many you have, in halves; 0 = used up. */
  quantity: number;
  /** The Space it is kept in (link, word `kept_in`). */
  spaceId?: string;
  /** yyyy-MM-dd of the latest purchase. */
  boughtOn?: string;
  /** How long it keeps once bought, in days; empty for things that don't go off. */
  lifeDays?: number;
  /** Whose the life is: LifeOS's estimate, or yours (yours wins from then on). */
  lifeBy?: 'estimated' | 'yours';
  /** Learned: how long one lasts you, in days. */
  rateDays?: number;
  source?: 'order' | 'receipt' | 'you';
  shop?: string;
  /** The latest order's payment (link → Transaction, word `bought_in`). */
  orderId?: string;
  /** What the latest one cost. */
  price?: number;
  /** You put it on the shopping list. */
  onList?: boolean;
  /** "Still good": you looked and it is fine (yyyy-MM-dd). */
  checkedOn?: string;
  /** yyyy-MM-dd it was last used up. */
  usedUpOn?: string;
  notes?: string;
}

export const stockType: ObjectDef<StockData> = {
  id: 'stock',
  module: 'inventory',
  label: 'Stock',
  labelPlural: 'Stock',
  icon: 'box',
  color: INVENTORY_COLOR,
  schema: z.object({
    size: z.string().optional(),
    quantity: z.coerce.number().min(0).default(1),
    spaceId: z.string().optional(),
    boughtOn: z.string().optional(),
    lifeDays: z.coerce.number().positive().optional(),
    lifeBy: z.enum(['estimated', 'yours']).optional(),
    rateDays: z.coerce.number().positive().optional(),
    source: z.enum(['order', 'receipt', 'you']).optional(),
    shop: z.string().optional(),
    orderId: z.string().optional(),
    price: z.coerce.number().optional(),
    onList: z.boolean().optional(),
    checkedOn: z.string().optional(),
    usedUpOn: z.string().optional(),
    notes: z.string().optional(),
  }),
  fields: [
    { key: 'size', label: 'Size', type: 'text', summary: true, placeholder: '100 g, 1 L' },
    { key: 'quantity', label: 'Quantity', type: 'number', required: true, default: 1, summary: true },
    { key: 'spaceId', label: 'Space', type: 'link', linkTo: 'space', linkWord: 'kept_in', summary: true },
    { key: 'boughtOn', label: 'Bought on', type: 'date' },
    { key: 'lifeDays', label: 'Keeps for', type: 'number', unit: 'days', description: 'How long it keeps once bought; empty if it does not go off' },
    { key: 'rateDays', label: 'Lasts you', type: 'number', unit: 'days', section: 'Learned', description: 'Learned from when you buy it and use it up' },
    { key: 'source', label: 'Came from', type: 'select', options: STOCK_SOURCES, section: 'Where from' },
    { key: 'shop', label: 'Shop', type: 'select', options: SHOPS, section: 'Where from' },
    { key: 'orderId', label: 'Order', type: 'link', linkTo: 'transaction', linkWord: 'bought_in', section: 'Where from' },
    { key: 'price', label: 'Price', type: 'money', section: 'Where from' },
    { key: 'onList', label: 'On the list', type: 'boolean' },
    { key: 'notes', label: 'Notes', type: 'longtext', section: 'Details' },
  ],
  indexed: ['spaceId', 'onList'],
  occurredAtField: 'boughtOn',
  searchText: (d) => [d.size, d.shop, d.notes].filter(Boolean).join(' '),
};

/** A Space's icon: from the icon set (src/ui/icons). */
export const SPACE_ICONS: FieldOption[] = [
  { value: 'fridge', label: 'Fridge' },
  { value: 'snow', label: 'Freezer' },
  { value: 'pot', label: 'Kitchen' },
  { value: 'archive', label: 'Cabinet' },
  { value: 'shirt', label: 'Clothes' },
  { value: 'bath', label: 'Bathroom' },
  { value: 'spray', label: 'Cleaning' },
  { value: 'box', label: 'Box' },
];

export interface SpaceData {
  icon?: string;
  order?: number;
  /** stock: Stock lives here · clothes: Assets (R7a). */
  holds?: 'stock' | 'clothes';
}

export const spaceType: ObjectDef<SpaceData> = {
  id: 'space',
  module: 'inventory',
  label: 'Space',
  labelPlural: 'Spaces',
  icon: 'home',
  color: INVENTORY_COLOR,
  hidden: true,
  schema: z.object({ icon: z.string().optional(), order: z.coerce.number().optional(), holds: z.enum(['stock', 'clothes']).optional() }),
  fields: [
    { key: 'icon', label: 'Icon', type: 'select', options: SPACE_ICONS, default: 'box' },
    { key: 'order', label: 'Order', type: 'number' },
    { key: 'holds', label: 'Holds', type: 'select', options: [{ value: 'stock', label: 'Stock' }, { value: 'clothes', label: 'Clothes' }], default: 'stock' },
  ],
};

/** The seven made once (layer 8); Fridge and Kitchen first. */
export const DEFAULT_SPACES: Array<{ title: string } & Required<SpaceData>> = [
  { title: 'Fridge', icon: 'fridge', order: 0, holds: 'stock' },
  { title: 'Kitchen', icon: 'pot', order: 1, holds: 'stock' },
  { title: 'Freezer', icon: 'snow', order: 2, holds: 'stock' },
  { title: 'Cabinets', icon: 'archive', order: 3, holds: 'stock' },
  { title: 'Bathroom', icon: 'bath', order: 4, holds: 'stock' },
  { title: 'Cleaning', icon: 'spray', order: 5, holds: 'stock' },
  { title: 'Clothes', icon: 'shirt', order: 6, holds: 'clothes' },
];
