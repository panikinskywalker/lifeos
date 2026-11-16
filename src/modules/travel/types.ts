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

/* ------------------------------------------------------------------ */
/* Thing to do (the trip template, R7g slice 3)                         */
/* ------------------------------------------------------------------ */

export type OutingKind = 'see' | 'eat' | 'do' | 'relax' | 'shop' | 'event';
export type Happening = 'festival' | 'seasonal' | 'closure' | 'crowds' | 'holiday' | 'weather';

export interface OutingData {
  /** link → Trip, word `part_of`: every thing to do is on a trip; a trip-wide event has no stop. */
  tripId?: string;
  /** link → Stop, word `stop` (the same word a stay uses). */
  stopId?: string;
  /** link → Place, word `at`: when it is somewhere on the map. */
  placeId?: string;
  kind: OutingKind;
  /** The day it is planned; an event's first day. */
  day?: string;
  /** An event's last day. */
  until?: string;
  /** A person, in the local currency; 0 is free, empty is not known. */
  cost?: number;
  /** 1 quiet to 5 packed. */
  crowd?: number;
  quietest?: string;
  /** Events: what kind of thing to be aware of. */
  happening?: Happening;
  /** Events: official · past pattern · predicted. */
  sure?: 'official' | 'past' | 'predicted';
  link?: string;
  /** Links to book it. */
  book?: Array<{ label: string; url: string }>;
  photo?: { uri: string; name?: string; mime?: string };
  notes?: string;
  /** Hidden: Claude suggested it (not you). */
  suggested?: boolean;
  /** Hidden: where an imported one came from. */
  sourceKey?: string;
}

export const OUTING_KINDS = [
  { value: 'see', label: 'See', icon: 'eye' },
  { value: 'eat', label: 'Eat', icon: 'food' },
  { value: 'do', label: 'Do', icon: 'activity' },
  { value: 'relax', label: 'Relax', icon: 'drop' },
  { value: 'shop', label: 'Shop', icon: 'bag' },
  { value: 'event', label: 'Event', icon: 'calendar' },
];
export const HAPPENINGS = [
  { value: 'festival', label: 'Festival' },
  { value: 'seasonal', label: 'Seasonal' },
  { value: 'closure', label: 'Closure' },
  { value: 'crowds', label: 'Crowds' },
  { value: 'holiday', label: 'Holiday' },
  { value: 'weather', label: 'Weather' },
];
export const OUTING_STATUSES = [
  { value: 'idea', label: 'Idea', color: 'gray' },
  { value: 'want', label: 'Want to', color: 'orange' },
  { value: 'planned', label: 'Planned', color: 'green' },
  { value: 'done', label: 'Done', color: 'gray' },
];

export const outingType: ObjectDef<OutingData> = {
  id: 'outing',
  module: 'travel',
  label: 'Thing to do',
  labelPlural: 'Things to do',
  icon: 'star',
  color: TRAVEL_COLOR,
  schema: z.object({ tripId: z.string().optional(), stopId: z.string().optional(), placeId: z.string().optional(), kind: z.enum(['see', 'eat', 'do', 'relax', 'shop', 'event']).default('see'), day: z.string().optional(), until: z.string().optional(), cost: z.coerce.number().optional(), crowd: z.coerce.number().min(1).max(5).optional(), quietest: z.string().optional(), happening: z.enum(['festival', 'seasonal', 'closure', 'crowds', 'holiday', 'weather']).optional(), sure: z.enum(['official', 'past', 'predicted']).optional(), link: z.string().optional(), book: z.array(z.object({ label: z.string(), url: z.string() })).optional(), photo: z.object({ uri: z.string(), name: z.string().optional(), mime: z.string().optional() }).optional(), notes: z.string().optional(), suggested: z.boolean().optional(), sourceKey: z.string().optional() }),
  fields: [
    { key: 'kind', label: 'Kind', type: 'select', required: true, default: 'see', options: OUTING_KINDS, summary: true },
    { key: 'tripId', label: 'Trip', type: 'link', linkTo: 'trip', linkWord: 'part_of', required: true },
    { key: 'stopId', label: 'Stop', type: 'link', linkTo: 'stop', linkWord: 'stop' },
    { key: 'placeId', label: 'Place', type: 'link', linkTo: 'place', linkWord: 'at' },
    { key: 'day', label: 'Day', type: 'date', summary: true },
    { key: 'until', label: 'Until', type: 'date', description: 'An event’s last day' },
    { key: 'cost', label: 'Cost each', type: 'money', description: 'In the local currency; 0 is free' },
    { key: 'crowd', label: 'How busy', type: 'number', description: '1 quiet to 5 packed' },
    { key: 'quietest', label: 'Quietest time', type: 'text', placeholder: 'after 15:00' },
    { key: 'happening', label: 'What kind of event', type: 'select', options: HAPPENINGS, section: 'Event' },
    { key: 'sure', label: 'How sure', type: 'select', options: [{ value: 'official', label: 'Official' }, { value: 'past', label: 'Past pattern' }, { value: 'predicted', label: 'Predicted' }], section: 'Event' },
    { key: 'link', label: 'Link', type: 'contact' },
    { key: 'photo', label: 'Photo', type: 'file' },
    { key: 'notes', label: 'Notes', type: 'longtext' },
  ],
  statuses: OUTING_STATUSES,
  hidden: true,
  occurredAtField: 'day',
  computeSubtitle: (d) => [OUTING_KINDS.find((k) => k.value === d.kind)?.label, d.cost === 0 ? 'Free' : null, d.quietest].filter(Boolean).join(' · ') || undefined,
  searchText: (d) => [d.notes, d.quietest].filter(Boolean).join(' '),
};
