import { z } from 'zod';
import type { ObjectDef } from '@core/domain/types';
import { dateField, nextAnnual } from '@core/cycles/schedule';

export const CRM_COLOR = 'pink';

export interface PersonData {
  relationship?: string;
  phone?: string;
  email?: string;
  birthday?: string;
  company?: string;
  role?: string;
  city?: string;
  notes?: string;
  contactEvery?: number;
  lastContactAt?: string;
  /** The phone contact this person was imported from (re-syncs fill gaps). */
  contactId?: string;
  /** Their UPI ID(s), comma-separated — how payments are matched to them. */
  upi?: string;
}

export const personType: ObjectDef<PersonData> = {
  type: 'person',
  module: 'crm',
  label: 'Person',
  labelPlural: 'People',
  icon: 'person',
  schema: z.object({ relationship: z.string().optional(), phone: z.string().optional(), email: z.string().optional(), birthday: z.string().optional(), company: z.string().optional(), role: z.string().optional(), city: z.string().optional(), notes: z.string().optional(), contactEvery: z.coerce.number().optional(), lastContactAt: z.string().optional(), contactId: z.string().optional(), upi: z.string().optional() }),
  cycleFields: { 'person.contact': { lastDoneAt: 'lastContactAt' } },
  cycleTemplates: (d) => [
    ...(d.contactEvery ? [{ template: 'person.contact', name: 'Keep in touch', kind: 'interval' as const, everyN: d.contactEvery, everyUnit: 'day' as const, lastDoneAt: dateField(d.lastContactAt) ?? Date.now() }] : []),
    ...(d.birthday ? [{ template: 'person.birthday', name: 'Birthday', kind: 'fixed' as const, everyN: 1, everyUnit: 'year' as const, nextDueAt: nextAnnual(d.birthday, Date.now()), leadDays: 7 }] : []),
  ],
  fields: [
    { key: 'relationship', label: 'Relationship', type: 'select', summary: true, options: [{ value: 'family', label: 'Family', color: 'red' }, { value: 'friend', label: 'Friend', color: 'orange' }, { value: 'partner', label: 'Partner', color: 'pink' }, { value: 'colleague', label: 'Colleague', color: 'blue' }, { value: 'client', label: 'Client', color: 'indigo' }, { value: 'vendor', label: 'Vendor / Service', color: 'teal' }, { value: 'acquaintance', label: 'Acquaintance', color: 'gray' }] },
    { key: 'phone', label: 'Phone', type: 'text', section: 'Contact' },
    { key: 'email', label: 'Email', type: 'text', section: 'Contact' },
    { key: 'upi', label: 'UPI ID', type: 'text', section: 'Contact' },
    { key: 'city', label: 'City', type: 'text', section: 'Contact', summary: true },
    { key: 'company', label: 'Company', type: 'text', section: 'Work' },
    { key: 'role', label: 'Role', type: 'text', section: 'Work' },
    { key: 'birthday', label: 'Birthday', type: 'date', section: 'Details' },
    { key: 'contactEvery', label: 'Keep in touch every (days)', type: 'number', section: 'Details', description: 'Surfaces a nudge when overdue' },
    { key: 'lastContactAt', label: 'Last contact', type: 'date', section: 'Details' },
    { key: 'notes', label: 'Notes', type: 'longtext', section: 'Details' },
  ],
  indexed: ['relationship'],
  searchText: (d) => [d.company, d.role, d.city, d.notes, d.email, d.phone].filter(Boolean).join(' '),
  links: [{ kind: 'person', label: 'Mentioned in', to: ['transaction', 'trip', 'task', 'event', 'note'], cardinality: 'many' }],
  defaultViews: [
    { name: 'Family', definition: { filter: { and: [{ field: 'data.relationship', op: 'eq', value: 'family' }] }, sort: [{ field: 'title', dir: 'asc' }] } },
    { name: 'Friends', definition: { filter: { and: [{ field: 'data.relationship', op: 'eq', value: 'friend' }] }, sort: [{ field: 'title', dir: 'asc' }] } },
    { name: 'Work', definition: { filter: { and: [{ field: 'data.relationship', op: 'in', value: ['colleague', 'client'] }] }, sort: [{ field: 'title', dir: 'asc' }] } },
  ],
};

/** Group (PRODUCT §4): flatmates, a trip crew, family — splits and balances run per group. Members also live in group_members. */
export const groupType: ObjectDef<{ name: string; kind?: string; memberIds: string[]; notes?: string }> = {
  type: 'group', module: 'crm', label: 'Group', labelPlural: 'Groups', icon: 'people',
  schema: z.object({ name: z.string().min(1), kind: z.string().optional(), memberIds: z.array(z.string()).default([]), notes: z.string().optional() }),
  fields: [
    { key: 'name', label: 'Name', type: 'text', required: true, placeholder: 'Flat 4B, Goa trip, Family' },
    { key: 'kind', label: 'Kind', type: 'select', summary: true, options: [{ value: 'home', label: 'Home' }, { value: 'trip', label: 'Trip' }, { value: 'friends', label: 'Friends' }, { value: 'family', label: 'Family' }, { value: 'work', label: 'Work' }] },
    { key: 'memberIds', label: 'Members', type: 'relation', relationTo: 'person', relationKind: 'member', defaultValue: [] },
    { key: 'notes', label: 'Notes', type: 'longtext', section: 'Details' },
  ],
  computeTitle: (d) => d.name,
  computeSubtitle: (d) => `${d.memberIds.length} member${d.memberIds.length === 1 ? '' : 's'} + you`,
};
