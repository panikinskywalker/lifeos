import { z } from 'zod';
import type { ObjectDef } from '@core/domain/types';

/**
 * Trip (docs/MODEL.md layer 2, *Trip's Fields*, decided 2 Nov with R7d):
 * going somewhere for a while. It meets Places, Transactions, Events and
 * clothing Assets through Links only.
 */

export const TRAVEL_COLOR = 'cyan';

export interface TripData {
  destination: string;
  /** link → Place, word `to`: matched or made from the destination when saved. */
  placeId?: string;
  startDate?: string;
  endDate?: string;
  budget?: number;
  purpose?: string;
  personIds?: string[];
  notes?: string;
  localCurrency?: string;
  /** Ticked on the packing list, not clothes ("Charger", "Sunscreen"). */
  packed?: string[];
}

export const TRIP_STATUSES = [
  { value: 'idea', label: 'Idea', color: 'gray' },
  { value: 'planning', label: 'Planning', color: 'orange' },
  { value: 'booked', label: 'Booked' },
  { value: 'ongoing', label: 'Ongoing', color: 'green' },
  { value: 'done', label: 'Done', color: 'gray' },
];

export const tripType: ObjectDef<TripData> = {
  id: 'trip',
  module: 'travel',
  label: 'Trip',
  labelPlural: 'Trips',
  icon: 'airplane',
  schema: z.object({ destination: z.string().min(1), placeId: z.string().optional(), startDate: z.string().optional(), endDate: z.string().optional(), budget: z.coerce.number().optional(), purpose: z.string().optional(), personIds: z.array(z.string()).optional(), notes: z.string().optional(), localCurrency: z.string().optional(), packed: z.array(z.string()).optional() }),
  fields: [
    { key: 'destination', label: 'Destination', type: 'text', required: true, placeholder: 'Tokyo, Goa, …' },
    { key: 'startDate', label: 'Starts', type: 'date', summary: true },
    { key: 'endDate', label: 'Ends', type: 'date' },
    { key: 'purpose', label: 'Purpose', type: 'select', options: [{ value: 'leisure', label: 'Leisure' }, { value: 'work', label: 'Work' }, { value: 'family', label: 'Family' }, { value: 'other', label: 'Other' }] },
    { key: 'placeId', label: 'To', type: 'link', linkTo: 'place', linkWord: 'to', description: 'The Place; found from the destination when left empty' },
    { key: 'budget', label: 'Budget', type: 'money', section: 'Planning' },
    { key: 'localCurrency', label: 'Local currency', type: 'select', section: 'Planning', options: ['INR', 'USD', 'EUR', 'GBP', 'JPY', 'AED', 'SGD', 'THB'].map((c) => ({ value: c, label: c })) },
    { key: 'personIds', label: 'Travelling with', type: 'link', linkTo: 'person', linkWord: 'person', section: 'Planning', default: [] },
    { key: 'notes', label: 'Notes', type: 'longtext', section: 'Planning' },
  ],
  occurredAtField: 'startDate',
  statuses: TRIP_STATUSES,
  computeTitle: (d) => d.destination,
  computeSubtitle: (d) => (d.startDate ? `${d.startDate}${d.endDate ? ` → ${d.endDate}` : ''}` : undefined),
  searchText: (d) => [d.notes, d.purpose].filter(Boolean).join(' '),
  links: [
    { kind: 'trip', label: 'Expenses & events', to: ['transaction', 'event', 'document', 'note'], cardinality: 'many' },
    { kind: 'person', label: 'People', to: 'person', cardinality: 'many' },
    { kind: 'to', label: 'To', to: 'place', cardinality: 'one' },
  ],
  defaultViews: [{ name: 'Upcoming', definition: { filter: { and: [{ field: 'status', op: 'notIn', value: ['done'] }] }, sort: [{ field: 'data.startDate', dir: 'asc' }] } }],
};
