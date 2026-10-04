import { z } from 'zod';
import type { ObjectDef } from '@core/domain/types';

/**
 * Places and organisations as nodes of the life graph (docs/GRAPH.md): so a
 * flight can go *from* one place *to* another, a dinner can be *at* a venue,
 * and a person can *work at* a company — instead of those being plain text.
 */

export interface PlaceData { kind: string; city?: string; country?: string; address?: string; notes?: string }
export const placeType: ObjectDef<PlaceData> = {
  type: 'place', module: 'places', label: 'Place', labelPlural: 'Places', icon: 'location', color: 'teal',
  schema: z.object({ kind: z.string().default('other'), city: z.string().optional(), country: z.string().optional(), address: z.string().optional(), notes: z.string().optional() }),
  fields: [
    { key: 'kind', label: 'Kind', type: 'select', summary: true, options: [{ value: 'country', label: 'Country' }, { value: 'city', label: 'City' }, { value: 'venue', label: 'Venue' }, { value: 'restaurant', label: 'Restaurant / café' }, { value: 'airport', label: 'Airport' }, { value: 'home', label: 'Home' }, { value: 'work', label: 'Workplace' }, { value: 'other', label: 'Other' }] },
    { key: 'city', label: 'City', type: 'text', summary: true },
    { key: 'country', label: 'Country', type: 'text' },
    { key: 'address', label: 'Address', type: 'text', section: 'Details' },
    { key: 'notes', label: 'Notes', type: 'longtext', section: 'Details' },
  ],
};

export interface OrgData { kind: string; website?: string; notes?: string; /** UPI IDs this payee has paid or been paid from. */ upi?: string }
export const orgType: ObjectDef<OrgData> = {
  type: 'org', module: 'places', label: 'Organisation', labelPlural: 'Organisations', icon: 'briefcase', color: 'indigo',
  schema: z.object({ kind: z.string().default('other'), website: z.string().optional(), notes: z.string().optional(), upi: z.string().optional() }),
  fields: [
    { key: 'kind', label: 'Kind', type: 'select', summary: true, options: [{ value: 'payee', label: 'Payee' }, { value: 'company', label: 'Company' }, { value: 'shop', label: 'Shop / brand' }, { value: 'restaurant', label: 'Restaurant' }, { value: 'airline', label: 'Airline' }, { value: 'bank', label: 'Bank' }, { value: 'school', label: 'School / college' }, { value: 'club', label: 'Club / gym' }, { value: 'other', label: 'Other' }] },
    { key: 'website', label: 'Website', type: 'text', section: 'Details' },
    { key: 'upi', label: 'UPI ID', type: 'text', section: 'Details' },
    { key: 'notes', label: 'Notes', type: 'longtext', section: 'Details' },
  ],
  links: [{ kind: 'payee', label: 'Payments', to: 'transaction', cardinality: 'many' }],
};
