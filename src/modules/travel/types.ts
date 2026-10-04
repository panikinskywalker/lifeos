import { z } from 'zod';
import type { ObjectDef } from '@core/domain/types';

/** Trip record type (no React Native — unit-tested). */

export const TRAVEL_COLOR = 'cyan';

export interface TripData {
  destination: string;
  startDate?: string;
  endDate?: string;
  budget?: number;
  purpose?: string;
  personIds?: string[];
  notes?: string;
  localCurrency?: string;
}

export const tripType: ObjectDef<TripData> = {
  id: 'trip',
  module: 'travel',
  label: 'Trip',
  labelPlural: 'Trips',
  icon: 'airplane',
  schema: z.object({ destination: z.string().min(1), startDate: z.string().optional(), endDate: z.string().optional(), budget: z.coerce.number().optional(), purpose: z.string().optional(), personIds: z.array(z.string()).optional(), notes: z.string().optional(), localCurrency: z.string().optional() }),
  fields: [
    { key: 'destination', label: 'Destination', type: 'text', required: true, placeholder: 'Tokyo, Goa, …' },
    { key: 'startDate', label: 'Start', type: 'date', summary: true },
    { key: 'endDate', label: 'End', type: 'date' },
    { key: 'purpose', label: 'Purpose', type: 'select', options: [{ value: 'leisure', label: 'Leisure' }, { value: 'work', label: 'Work' }, { value: 'family', label: 'Family' }, { value: 'other', label: 'Other' }] },
    { key: 'budget', label: 'Budget', type: 'money', section: 'Planning' },
    { key: 'localCurrency', label: 'Local currency', type: 'select', section: 'Planning', options: ['INR', 'USD', 'EUR', 'GBP', 'JPY', 'AED', 'SGD', 'THB'].map((c) => ({ value: c, label: c })) },
    { key: 'personIds', label: 'Travelling with', type: 'link', linkTo: 'person', linkWord: 'person', section: 'Planning', default: [] },
    { key: 'notes', label: 'Notes', type: 'longtext', section: 'Planning' },
  ],
  occurredAtField: 'startDate',
  statuses: [{ value: 'idea', label: 'Idea', color: 'gray' }, { value: 'planning', label: 'Planning', color: 'orange' }, { value: 'booked', label: 'Booked' }, { value: 'ongoing', label: 'Ongoing', color: 'green' }, { value: 'done', label: 'Done', color: 'gray' }],
  computeTitle: (d) => d.destination,
  computeSubtitle: (d) => (d.startDate ? `${d.startDate}${d.endDate ? ` → ${d.endDate}` : ''}` : undefined),
  searchText: (d) => [d.notes, d.purpose].filter(Boolean).join(' '),
  links: [
    { kind: 'trip', label: 'Expenses & events', to: ['transaction', 'event', 'document', 'note'], cardinality: 'many' },
    { kind: 'person', label: 'People', to: 'person', cardinality: 'many' },
  ],
  defaultViews: [{ name: 'Upcoming', definition: { filter: { and: [{ field: 'status', op: 'notIn', value: ['done'] }] }, sort: [{ field: 'data.startDate', dir: 'asc' }] } }],
};

