import { z } from 'zod';
import type { ObjectDef } from '@core/domain/types';
import type { FieldOption, LocationValue } from '@core/domain/fields';
import { orgKindFor, placeKindFor } from './kinds';

/**
 * Places and Organisations (docs/MODEL.md §2 Places, agreed 22 Oct, R3): so
 * a dinner can be *at* a venue, a venue *in* a city, a shop *at* its branch,
 * and a payment *to* an Organisation — instead of those being plain text.
 */

export const PLACE_KINDS: FieldOption[] = [
  { value: 'home', label: 'Home', icon: 'home' },
  { value: 'work', label: 'Work', icon: 'briefcase' },
  { value: 'city', label: 'City', icon: 'map' },
  { value: 'country', label: 'Country', icon: 'map' },
  { value: 'area', label: 'Area', icon: 'pin' },
  { value: 'restaurant', label: 'Restaurant / café / bar', icon: 'food' },
  { value: 'venue', label: 'Venue', icon: 'target' },
  { value: 'gym', label: 'Gym', icon: 'activity' },
  { value: 'shop', label: 'Shop', icon: 'bag' },
  { value: 'stay', label: 'Stay', icon: 'moon' },
  { value: 'airport', label: 'Airport / station', icon: 'plane' },
  { value: 'other', label: 'Other', icon: 'location' },
];

export interface PlaceData {
  kind: string;
  address?: string;
  coordinates?: LocationValue;
  /** The Place it is in (Koramangala in Bengaluru in India); mirrored as a `located_in` Link. */
  parentId?: string;
  mapsUrl?: string;
  notes?: string;
  /** Before R3: folded into `parentId` on first open (lib.foldCityCountry). */
  city?: string;
  country?: string;
}

export const placeType: ObjectDef<PlaceData> = {
  id: 'place',
  module: 'places',
  label: 'Place',
  labelPlural: 'Places',
  icon: 'location',
  color: 'teal',
  schema: z.object({
    kind: z.string().default('other'),
    address: z.string().optional(),
    coordinates: z.object({ lat: z.number(), lng: z.number(), label: z.string().optional() }).optional(),
    parentId: z.string().optional(),
    mapsUrl: z.string().optional(),
    notes: z.string().optional(),
    city: z.string().optional(),
    country: z.string().optional(),
  }),
  fields: [
    { key: 'kind', label: 'Kind', type: 'select', summary: true, options: PLACE_KINDS, default: 'other' },
    { key: 'parentId', label: 'In', type: 'link', linkTo: 'place', linkWord: 'located_in', summary: true, description: 'The area, city or country it is in' },
    { key: 'address', label: 'Address', type: 'text', section: 'Where' },
    { key: 'coordinates', label: 'Map pin', type: 'location', section: 'Where' },
    { key: 'mapsUrl', label: 'Maps link', type: 'contact', contactKind: 'url', section: 'Where' },
    { key: 'notes', label: 'Notes', type: 'longtext', section: 'Notes' },
  ],
  links: [
    { kind: 'located_in', label: 'In', to: 'place', cardinality: 'one' },
    { kind: 'at', label: 'Been here', to: 'any', cardinality: 'many' },
  ],
  indexed: ['kind', 'parentId'],
  searchText: (d) => [d.address, d.notes, d.city, d.country].filter(Boolean).join(' '),
  enrich: (_os, data, { text }) => (data.kind && data.kind !== 'other' ? data : { ...data, kind: placeKindFor(text ?? '') ?? data.kind ?? 'other' }),
};

export const ORG_KINDS: FieldOption[] = [
  { value: 'company', label: 'Employer / company', icon: 'briefcase' },
  { value: 'shop', label: 'Shop / brand', icon: 'bag' },
  { value: 'restaurant', label: 'Restaurant / food', icon: 'food' },
  { value: 'bank', label: 'Bank / card / broker', icon: 'bank' },
  { value: 'service', label: 'Service', icon: 'bolt' },
  { value: 'airline', label: 'Airline / travel', icon: 'plane' },
  { value: 'school', label: 'School / college', icon: 'book' },
  { value: 'club', label: 'Club / gym', icon: 'activity' },
  { value: 'payee', label: 'Payee (not sure yet)', icon: 'user-circle' },
  { value: 'other', label: 'Other', icon: 'briefcase' },
];

export interface OrgData {
  kind: string;
  /** UPI ids this payee has paid or been paid from, comma-separated (finance learns them). */
  upi?: string;
  website?: string;
  phone?: string;
  /** The branch you go to; mirrored as an `at` Link. */
  placeId?: string;
  notes?: string;
}

export const orgType: ObjectDef<OrgData> = {
  id: 'org',
  module: 'places',
  label: 'Organisation',
  labelPlural: 'Organisations',
  icon: 'briefcase',
  color: 'indigo',
  schema: z.object({ kind: z.string().default('other'), upi: z.string().optional(), website: z.string().optional(), phone: z.string().optional(), placeId: z.string().optional(), notes: z.string().optional() }),
  fields: [
    { key: 'kind', label: 'Kind', type: 'select', summary: true, options: ORG_KINDS, default: 'other' },
    { key: 'placeId', label: 'At', type: 'link', linkTo: 'place', linkWord: 'at', summary: true, description: 'The branch or office you go to' },
    { key: 'website', label: 'Website', type: 'contact', contactKind: 'url', section: 'Contact', description: 'Mail from its domain is filed to it' },
    { key: 'phone', label: 'Phone', type: 'contact', contactKind: 'phone', section: 'Contact' },
    { key: 'upi', label: 'UPI ids', type: 'text', section: 'Contact', description: 'Comma-separated; learned from payments' },
    { key: 'notes', label: 'Notes', type: 'longtext', section: 'Notes' },
  ],
  links: [
    { kind: 'payee', label: 'Payments', to: 'transaction', cardinality: 'many' },
    { kind: 'at', label: 'At', to: 'place', cardinality: 'one' },
    { kind: 'from', label: 'Mail', to: 'any', cardinality: 'many' },
  ],
  indexed: ['kind'],
  searchText: (d) => [d.website, d.upi, d.phone, d.notes].filter(Boolean).join(' '),
  enrich: (_os, data, { text }) => (data.kind && data.kind !== 'other' ? data : { ...data, kind: orgKindFor(text ?? '') ?? data.kind ?? 'other' }),
};
