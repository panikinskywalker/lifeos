import { z } from 'zod';
import type { ModuleManifest } from '@core/registry/types';
import type { EntityTypeDef } from '@core/domain/types';
import { dateField } from '@core/cycles/schedule';

export const INVENTORY_COLOR = 'teal';

export interface ItemData { quantity: number; unit?: string; location?: string; minQuantity?: number; expiresOn?: string; category?: string; notes?: string }
export const itemType: EntityTypeDef<ItemData> = {
  type: 'item', module: 'inventory', label: 'Item', labelPlural: 'Inventory', icon: 'shippingbox',
  schema: z.object({ quantity: z.coerce.number().default(1), unit: z.string().optional(), location: z.string().optional(), minQuantity: z.coerce.number().optional(), expiresOn: z.string().optional(), category: z.string().optional(), notes: z.string().optional() }),
  cycleTemplates: (d) => (dateField(d.expiresOn) ? [{ template: 'item.expiry', name: 'Use or replace', kind: 'fixed', nextDueAt: dateField(d.expiresOn), leadDays: 7 }] : []),
  fields: [
    { key: 'quantity', label: 'Quantity', type: 'number', required: true, defaultValue: 1, summary: true },
    { key: 'unit', label: 'Unit', type: 'text', placeholder: 'pcs, kg, L' },
    { key: 'location', label: 'Location', type: 'text', summary: true, placeholder: 'Kitchen, Garage, Storage box 3' },
    { key: 'category', label: 'Category', type: 'select', options: [{ value: 'pantry', label: 'Pantry' }, { value: 'household', label: 'Household' }, { value: 'medicine', label: 'Medicine' }, { value: 'tools', label: 'Tools' }, { value: 'clothing', label: 'Clothing' }, { value: 'other', label: 'Other' }] },
    { key: 'minQuantity', label: 'Restock when below', type: 'number', section: 'Details' },
    { key: 'expiresOn', label: 'Expires', type: 'date', section: 'Details' },
    { key: 'notes', label: 'Notes', type: 'longtext', section: 'Details' },
  ],
  indexed: ['location', 'category'],
  searchText: (d) => [d.location, d.category, d.notes].filter(Boolean).join(' '),
  defaultViews: [{ name: 'Low stock', icon: 'exclamationmark.triangle', definition: { filter: { and: [{ field: 'data.minQuantity', op: 'notNull' }] }, sort: [{ field: 'data.quantity', dir: 'asc' }] } }],
};

export const inventoryModule: ModuleManifest = {
  id: 'inventory', name: 'Inventory', version: '1.0.0', description: 'What you have, where it is, and when to restock.', icon: 'shippingbox', color: INVENTORY_COLOR,
  entityTypes: [itemType],
  aiTools: [{
    name: 'low_stock', description: 'Inventory items at or below their restock threshold.', input: z.object({}),
    run: async (_i, os) => os.entities.query<ItemData>('item').filter((i) => i.data.minQuantity != null && i.data.quantity <= i.data.minQuantity).map((i) => ({ id: i.id, title: i.title, quantity: i.data.quantity, min: i.data.minQuantity, location: i.data.location })),
  }],
};
