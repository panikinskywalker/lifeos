import { z } from 'zod';
import type { ObjectDef } from '@core/domain/types';
import { dateField, nextAnnual } from '@core/cycles/schedule';

export const CRM_COLOR = 'pink';

/** Keep in touch (R2): a cadence, stored as its number of days ('30'). */
export const CADENCES = [
  { value: '7', label: 'Every week' },
  { value: '14', label: 'Every 2 weeks' },
  { value: '30', label: 'Every month' },
  { value: '91', label: 'Every 3 months' },
  { value: '182', label: 'Every 6 months' },
  { value: '365', label: 'Every year' },
] as const;

/** Any day count (an old Field value, "every 20 days" from Talk) → the nearest cadence; nothing → off. */
export function snapCadence(v: unknown): string | undefined {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return CADENCES.reduce((best, c) => (Math.abs(Number(c.value) - n) < Math.abs(Number(best.value) - n) ? c : best)).value;
}

export const cadenceLabel = (v: string | undefined) => CADENCES.find((c) => c.value === v)?.label ?? null;

/** A birthday without a year is kept with this year (Notion's placeholders, phone contacts); never shown, no age. */
export const NO_YEAR = 1900;

/** Month, day and year (null when not known) of an ISO birthday. */
export function birthdayParts(iso: string | undefined): { month: number; day: number; year: number | null } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  if (!m) return null;
  const year = Number(m[1]);
  return { month: Number(m[2]), day: Number(m[3]), year: year > NO_YEAR ? year : null };
}

/** An ISO birthday from month (1–12), day and an optional year. */
export const birthdayIso = (month: number, day: number, year?: number | null) => `${year && year > NO_YEAR ? year : NO_YEAR}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

/** Split a list Field ("a, b") into its items. */
export const listItems = (s: string | undefined) => (s ?? '').split(',').map((x) => x.trim()).filter(Boolean);

export interface FileValue {
  uri: string;
  name?: string;
  mime?: string;
}

export interface PersonData {
  relationship?: string;
  phone?: string;
  email?: string;
  /** Their UPI ids, comma-separated: a payment from one is theirs for sure. */
  upi?: string;
  birthday?: string;
  /** Works at → Organisation (link "works at"); `company` is the typed text, kept as the fallback. */
  worksAtId?: string;
  company?: string;
  role?: string;
  /** Lives in → Place (link "lives in"); `city` is the typed text, kept as the fallback. */
  livesInId?: string;
  city?: string;
  /** Keep in touch: a cadence in days ('30'), see CADENCES. */
  contactEvery?: string;
  /** Last spoke (ISO day): a call, an Event with them, a payment; the keep-in-touch cycle's last done. */
  lastContactAt?: string;
  photo?: FileValue;
  /** Likes, comma-separated (filter coffee, pottery, RCB): what gift ideas are drawn from; kept in step with Notion's Likes section (R2b). */
  likes?: string;
  /** About (long text). */
  notes?: string;
  /** The phone contact this person was imported from (re-syncs fill gaps). */
  contactId?: string;
}

const split = (s: string | undefined) => (s ?? '').split(/[,\s]+/).map((x) => x.trim()).filter(Boolean);

const file = z.object({ uri: z.string(), name: z.string().optional(), mime: z.string().optional() });

export const personType: ObjectDef<PersonData> = {
  id: 'person',
  module: 'crm',
  label: 'Person',
  labelPlural: 'People',
  icon: 'person',
  schema: z.object({
    relationship: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().optional(),
    upi: z.string().optional(),
    birthday: z.string().optional(),
    worksAtId: z.string().optional(),
    company: z.string().optional(),
    role: z.string().optional(),
    livesInId: z.string().optional(),
    city: z.string().optional(),
    contactEvery: z.preprocess(snapCadence, z.string().optional()),
    lastContactAt: z.string().optional(),
    photo: file.optional(),
    likes: z.string().optional(),
    notes: z.string().optional(),
    contactId: z.string().optional(),
  }),
  cycleFields: { 'person.contact': { lastDoneAt: 'lastContactAt' } },
  cycleTemplates: (d) => [
    ...(d.contactEvery ? [{ template: 'person.contact', name: 'Keep in touch', kind: 'interval' as const, everyN: Number(d.contactEvery), everyUnit: 'day' as const, lastDoneAt: dateField(d.lastContactAt) ?? Date.now() }] : []),
    ...(d.birthday ? [{ template: 'person.birthday', name: 'Birthday', kind: 'fixed' as const, everyN: 1, everyUnit: 'year' as const, nextDueAt: nextAnnual(d.birthday, Date.now()), leadDays: 7 }] : []),
  ],
  fields: [
    { key: 'relationship', label: 'Relationship', type: 'select', summary: true, options: [{ value: 'family', label: 'Family', color: 'red' }, { value: 'friend', label: 'Friend', color: 'orange' }, { value: 'partner', label: 'Partner', color: 'pink' }, { value: 'colleague', label: 'Colleague', color: 'blue' }, { value: 'client', label: 'Client', color: 'indigo' }, { value: 'vendor', label: 'Vendor / Service', color: 'teal' }, { value: 'acquaintance', label: 'Acquaintance', color: 'gray' }] },
    { key: 'photo', label: 'Photo', type: 'file' },
    { key: 'phone', label: 'Phone', type: 'contact', contactKind: 'phone', section: 'Contact' },
    { key: 'email', label: 'Email', type: 'contact', contactKind: 'email', section: 'Contact' },
    { key: 'upi', label: 'UPI IDs', type: 'text', list: true, section: 'Contact', description: 'A payment from one of these is theirs', placeholder: 'priya.s@okicici' },
    { key: 'worksAtId', label: 'Works at', type: 'link', linkTo: 'org', linkWord: 'works at', section: 'Work' },
    { key: 'company', label: 'Company', type: 'text', section: 'Work', description: 'As typed; kept when no Organisation is picked' },
    { key: 'role', label: 'Role', type: 'text', section: 'Work' },
    { key: 'livesInId', label: 'Lives in', type: 'link', linkTo: 'place', linkWord: 'lives in', section: 'Details' },
    { key: 'city', label: 'City', type: 'text', section: 'Details', summary: true, description: 'As typed; kept when no Place is picked' },
    { key: 'birthday', label: 'Birthday', type: 'date', section: 'Details', description: 'The year is optional' },
    { key: 'likes', label: 'Likes', type: 'text', list: true, section: 'Details', placeholder: 'Add a like: food, hobby, team, brand', description: 'Gift ideas before their birthday come from these' },
    { key: 'contactEvery', label: 'Keep in touch', type: 'select', section: 'Details', options: CADENCES.map((c) => ({ value: c.value, label: c.label })), description: 'A nudge when you have not spoken for this long' },
    { key: 'lastContactAt', label: 'Last spoke', type: 'date', section: 'Details', description: 'Moves on its own with calls, meetings and payments' },
    { key: 'notes', label: 'About', type: 'longtext', section: 'Details' },
  ],
  indexed: ['relationship'],
  searchText: (d) => [d.company, d.role, d.city, d.notes, d.email, d.phone, d.upi, d.likes].filter(Boolean).join(' '),
  identity: (d) => ({ upi: split(d.upi), phone: d.phone ? [d.phone] : [], email: d.email ? [d.email] : [] }),
  links: [
    { kind: 'person', label: 'Mentioned in', to: ['transaction', 'trip', 'task', 'event', 'note'], cardinality: 'many' },
    { kind: 'works at', label: 'Works at', to: 'org', cardinality: 'one' },
    { kind: 'lives in', label: 'Lives in', to: 'place', cardinality: 'one' },
  ],
  defaultViews: [
    { name: 'Family', definition: { filter: { and: [{ field: 'data.relationship', op: 'eq', value: 'family' }] }, sort: [{ field: 'title', dir: 'asc' }] } },
    { name: 'Friends', definition: { filter: { and: [{ field: 'data.relationship', op: 'eq', value: 'friend' }] }, sort: [{ field: 'title', dir: 'asc' }] } },
    { name: 'Work', definition: { filter: { and: [{ field: 'data.relationship', op: 'in', value: ['colleague', 'client'] }] }, sort: [{ field: 'title', dir: 'asc' }] } },
  ],
};

export const GROUP_KINDS = [{ value: 'home', label: 'Home' }, { value: 'trip', label: 'Trip' }, { value: 'friends', label: 'Friends' }, { value: 'family', label: 'Family' }, { value: 'work', label: 'Work' }, { value: 'sport', label: 'Sport' }];

export interface GroupData {
  name: string;
  kind?: string;
  memberIds: string[];
  /** How a bill in this group splits unless you say otherwise. */
  defaultSplit?: 'equal' | 'shares';
  placeId?: string;
  photo?: FileValue;
  notes?: string;
}

/** Group (R2): flatmates, a trip crew, family, the Football group. Members also live in group_members (shares, joined / left). */
export const groupType: ObjectDef<GroupData> = {
  id: 'group', module: 'crm', label: 'Group', labelPlural: 'Groups', icon: 'people',
  schema: z.object({ name: z.string().min(1), kind: z.string().optional(), memberIds: z.array(z.string()).default([]), defaultSplit: z.enum(['equal', 'shares']).optional(), placeId: z.string().optional(), photo: file.optional(), notes: z.string().optional() }),
  fields: [
    { key: 'name', label: 'Name', type: 'text', required: true, placeholder: 'Flat 4B, Goa trip, Family' },
    { key: 'kind', label: 'Kind', type: 'select', summary: true, options: GROUP_KINDS },
    { key: 'memberIds', label: 'Members', type: 'link', linkTo: 'person', linkWord: 'member', default: [] },
    { key: 'defaultSplit', label: 'Default split', type: 'select', options: [{ value: 'equal', label: 'Equally' }, { value: 'shares', label: 'By shares' }], description: 'How a bill in this group splits unless you say otherwise' },
    { key: 'placeId', label: 'Place', type: 'link', linkTo: 'place', linkWord: 'at', section: 'Details' },
    { key: 'photo', label: 'Photo', type: 'file', section: 'Details' },
    { key: 'notes', label: 'About', type: 'longtext', section: 'Details' },
  ],
  computeTitle: (d) => d.name,
  computeSubtitle: (d) => `${d.memberIds.length} member${d.memberIds.length === 1 ? '' : 's'} + you`,
};
