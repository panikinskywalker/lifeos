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
  /** The trip template (R7g): who is going, as a crm Group (word `group`). */
  groupId?: string;
  /** In the local currency, a person a day: what the days still to come are estimated at. */
  dailyAllowance?: number;
  /** ₹ for one of the local currency, and the day it was taken. */
  fxRate?: number;
  fxDate?: string;
  /** Hidden: the trip this one was started from (word `copied_from`). */
  fromTripId?: string;
  /** The trip's own look, designed per destination ('japan'); empty is plain Noir. */
  look?: string;
  /** Hidden: where an imported trip came from ("tripapp:japan-dec-2026"), so a second import updates it. */
  sourceKey?: string;
}

export const LOOKS = [{ value: 'japan', label: 'Japan' }];

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
  schema: z.object({ destination: z.string().min(1), placeId: z.string().optional(), startDate: z.string().optional(), endDate: z.string().optional(), budget: z.coerce.number().optional(), purpose: z.string().optional(), personIds: z.array(z.string()).optional(), notes: z.string().optional(), localCurrency: z.string().optional(), packed: z.array(z.string()).optional(), groupId: z.string().optional(), dailyAllowance: z.coerce.number().optional(), fxRate: z.coerce.number().optional(), fxDate: z.string().optional(), fromTripId: z.string().optional(), look: z.string().optional(), sourceKey: z.string().optional() }),
  fields: [
    { key: 'destination', label: 'Destination', type: 'text', required: true, placeholder: 'Tokyo, Goa, …' },
    { key: 'startDate', label: 'Starts', type: 'date', summary: true },
    { key: 'endDate', label: 'Ends', type: 'date' },
    { key: 'purpose', label: 'Purpose', type: 'select', options: [{ value: 'leisure', label: 'Leisure' }, { value: 'work', label: 'Work' }, { value: 'family', label: 'Family' }, { value: 'other', label: 'Other' }] },
    { key: 'placeId', label: 'To', type: 'link', linkTo: 'place', linkWord: 'to', description: 'The Place; found from the destination when left empty' },
    { key: 'budget', label: 'Budget', type: 'money', section: 'Planning' },
    { key: 'localCurrency', label: 'Local currency', type: 'select', section: 'Planning', options: ['INR', 'USD', 'EUR', 'GBP', 'JPY', 'AED', 'SGD', 'THB'].map((c) => ({ value: c, label: c })) },
    { key: 'personIds', label: 'Travelling with', type: 'link', linkTo: 'person', linkWord: 'person', section: 'Planning', default: [] },
    { key: 'dailyAllowance', label: 'Daily allowance', type: 'money', section: 'Planning', description: 'A person a day, in the local currency' },
    { key: 'fxRate', label: 'Rate', type: 'number', section: 'Planning', description: '₹ for one of the local currency' },
    { key: 'fxDate', label: 'Rate taken on', type: 'date', section: 'Planning' },
    { key: 'groupId', label: 'Group', type: 'link', linkTo: 'group', linkWord: 'group', section: 'Planning' },
    { key: 'look', label: 'Look', type: 'select', section: 'Planning', options: LOOKS },
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
    { kind: 'part_of', label: 'Stops, flights and stays', inverseLabel: 'Trip', to: ['stop', 'event', 'transaction'], cardinality: 'many' },
  ],
  defaultViews: [{ name: 'Upcoming', definition: { filter: { and: [{ field: 'status', op: 'notIn', value: ['done'] }] }, sort: [{ field: 'data.startDate', dir: 'asc' }] } }],
};

/* ------------------------------------------------------------------ */
/* Stop (the trip template, R7g slice 1)                                */
/* ------------------------------------------------------------------ */

export type StopKind = 'stop' | 'idea' | 'airport';

export interface StopData {
  /** "馬籠"; in the japan look its first character is the stop's mark. */
  localName?: string;
  /** link → Trip, word `part_of`. */
  tripId?: string;
  kind: StopKind;
  /** Its place on the line; ideas and airports have none that matters. */
  order?: number;
  /** link → Place, word `at`: the pin and the address. */
  placeId?: string;
  color?: string;
  poster?: { uri: string; name?: string; mime?: string };
  about?: string;
  /** Hidden: where an imported stop came from. */
  sourceKey?: string;
}

export const STOP_KINDS = [
  { value: 'stop', label: 'Stop on the line' },
  { value: 'idea', label: 'Idea, not decided' },
  { value: 'airport', label: 'Airport' },
];
export const STOP_COLORS = ['green', 'teal', 'indigo', 'persimmon', 'wood', 'plum', 'crimson', 'gold', 'sky', 'slate'];

export const stopType: ObjectDef<StopData> = {
  id: 'stop',
  module: 'travel',
  label: 'Stop',
  labelPlural: 'Stops',
  icon: 'location',
  color: TRAVEL_COLOR,
  schema: z.object({ localName: z.string().optional(), tripId: z.string().optional(), kind: z.enum(['stop', 'idea', 'airport']).default('stop'), order: z.coerce.number().optional(), placeId: z.string().optional(), color: z.string().optional(), poster: z.object({ uri: z.string(), name: z.string().optional(), mime: z.string().optional() }).optional(), about: z.string().optional(), sourceKey: z.string().optional() }),
  fields: [
    { key: 'localName', label: 'Local name', type: 'text', placeholder: '馬籠' },
    { key: 'tripId', label: 'Trip', type: 'link', linkTo: 'trip', linkWord: 'part_of', required: true },
    { key: 'kind', label: 'Kind', type: 'select', required: true, default: 'stop', options: STOP_KINDS, summary: true },
    { key: 'order', label: 'Order on the line', type: 'number' },
    { key: 'placeId', label: 'Place', type: 'link', linkTo: 'place', linkWord: 'at', description: 'The pin; found from the name when left empty' },
    { key: 'color', label: 'Colour', type: 'select', options: STOP_COLORS.map((c) => ({ value: c, label: c.charAt(0).toUpperCase() + c.slice(1) })) },
    { key: 'poster', label: 'Poster', type: 'file' },
    { key: 'about', label: 'About', type: 'longtext' },
  ],
  hidden: true,
  computeSubtitle: (d) => [d.localName, d.kind === 'idea' ? 'Idea' : d.kind === 'airport' ? 'Airport' : d.order != null ? `Stop ${d.order}` : null].filter(Boolean).join(' · ') || undefined,
  searchText: (d) => [d.localName, d.about].filter(Boolean).join(' '),
};
