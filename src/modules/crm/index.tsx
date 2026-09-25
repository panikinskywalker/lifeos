import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { z } from 'zod';
import type { ModuleManifest } from '@core/registry/types';
import type { Entity, EntityTypeDef } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import { palette } from '@ui/theme/tokens';
import { useLive } from '@ui/hooks';
import { Card, Row, SectionHeader, Stat, Text } from '@ui/components/primitives';
import { EntityRow } from '@ui/components/EntityRow';
import { dateField, nextAnnual } from '@core/cycles/schedule';

export const CRM_COLOR = palette.pink;

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
}

export const personType: EntityTypeDef<PersonData> = {
  type: 'person',
  module: 'crm',
  label: 'Person',
  labelPlural: 'People',
  icon: 'person',
  schema: z.object({ relationship: z.string().optional(), phone: z.string().optional(), email: z.string().optional(), birthday: z.string().optional(), company: z.string().optional(), role: z.string().optional(), city: z.string().optional(), notes: z.string().optional(), contactEvery: z.coerce.number().optional(), lastContactAt: z.string().optional() }),
  cycleFields: { 'person.contact': { lastDoneAt: 'lastContactAt' } },
  cycleTemplates: (d) => [
    ...(d.contactEvery ? [{ template: 'person.contact', name: 'Keep in touch', kind: 'interval' as const, everyN: d.contactEvery, everyUnit: 'day' as const, lastDoneAt: dateField(d.lastContactAt) ?? Date.now() }] : []),
    ...(d.birthday ? [{ template: 'person.birthday', name: 'Birthday', kind: 'fixed' as const, everyN: 1, everyUnit: 'year' as const, nextDueAt: nextAnnual(d.birthday, Date.now()), leadDays: 7 }] : []),
  ],
  fields: [
    { key: 'relationship', label: 'Relationship', type: 'select', summary: true, options: [{ value: 'family', label: 'Family', color: palette.red }, { value: 'friend', label: 'Friend', color: palette.orange }, { value: 'partner', label: 'Partner', color: palette.pink }, { value: 'colleague', label: 'Colleague', color: palette.blue }, { value: 'client', label: 'Client', color: palette.indigo }, { value: 'vendor', label: 'Vendor / Service', color: palette.teal }, { value: 'acquaintance', label: 'Acquaintance', color: palette.gray }] },
    { key: 'phone', label: 'Phone', type: 'text', section: 'Contact' },
    { key: 'email', label: 'Email', type: 'text', section: 'Contact' },
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
  relations: [{ kind: 'person', label: 'Mentioned in', to: ['transaction', 'trip', 'task', 'event', 'note'], cardinality: 'many' }],
  defaultViews: [
    { name: 'Family', definition: { filter: { and: [{ field: 'data.relationship', op: 'eq', value: 'family' }] }, sort: [{ field: 'title', dir: 'asc' }] } },
    { name: 'Friends', definition: { filter: { and: [{ field: 'data.relationship', op: 'eq', value: 'friend' }] }, sort: [{ field: 'title', dir: 'asc' }] } },
    { name: 'Work', definition: { filter: { and: [{ field: 'data.relationship', op: 'in', value: ['colleague', 'client'] }] }, sort: [{ field: 'title', dir: 'asc' }] } },
  ],
};

function PersonSection({ entity, ctx }: { entity: Entity<any>; ctx: LifeOSContext }) {
  const router = useRouter();
  const p = entity as Entity<PersonData>;
  const linked = useLive((os) => os.relations.forEntity(entity.id), [entity.id]);
  const spend = useLive((os) => os.entities.aggregate('transaction', { filter: { and: [{ field: 'relation.person', op: 'relatedTo', value: entity.id }, { field: 'data.kind', op: 'eq', value: 'expense' }] } }, { sum: ['data.amount'], count: true }), [entity.id]);
  const txns = linked.filter((r) => r.other.type === 'transaction').slice(0, 5);
  const days = p.data.lastContactAt ? Math.floor((Date.now() - new Date(p.data.lastContactAt).getTime()) / 86400000) : null;
  const overdue = p.data.contactEvery && days != null && days > p.data.contactEvery;
  const bday = p.data.birthday ? nextBirthday(p.data.birthday) : null;
  return (
    <View style={{ gap: 16 }}>
      <Card style={{ flexDirection: 'row', gap: 20 }}>
        <View style={{ flex: 1 }}>
          <Stat value={days == null ? '—' : `${days}`} unit={days == null ? '' : 'days'} label="Since last contact" small color={overdue ? palette.red : undefined} />
        </View>
        {bday ? (
          <View style={{ flex: 1 }}>
            <Stat value={`${bday.days}`} unit="days" label={`Birthday${bday.age ? ` (turns ${bday.age})` : ''}`} small />
          </View>
        ) : null}
        {spend.count ? (
          <View style={{ flex: 1 }}>
            <Stat value={ctx.format.currency(spend['sum_data.amount'])} label={`${spend.count} shared expenses`} small />
          </View>
        ) : null}
      </Card>
      <Card padded={false}>
        <Row title="Log contact today" subtitle="Resets the keep-in-touch counter" icon="phone" iconColor={CRM_COLOR} last onPress={() => ctx.entities.update<PersonData>(entity.id, { data: { lastContactAt: new Date().toISOString().slice(0, 10) } })} chevron={false} />
      </Card>
      {txns.length ? (
        <View>
          <SectionHeader title="Shared expenses" icon="banknote" color={palette.green} action="All" onAction={() => router.push({ pathname: '/entity/[type]', params: { type: 'transaction', personId: entity.id } })} />
          <Card padded={false}>
            {txns.map((r, i) => {
              const e = ctx.entities.get(r.other.id);
              return e ? <EntityRow key={e.id} entity={e} last={i === txns.length - 1} /> : null;
            })}
          </Card>
        </View>
      ) : null}
      {!linked.length ? (
        <Text variant="footnote" color="tertiary">
          Link transactions, trips, tasks and notes to see them here.
        </Text>
      ) : null}
    </View>
  );
}

function nextBirthday(iso: string): { days: number; age: number | null } | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  const next = new Date(now.getFullYear(), d.getMonth(), d.getDate());
  if (next < now) next.setFullYear(now.getFullYear() + 1);
  const days = Math.ceil((next.getTime() - now.getTime()) / 86400000);
  return { days, age: d.getFullYear() > 1900 ? next.getFullYear() - d.getFullYear() : null };
}

export const crmModule: ModuleManifest = {
  id: 'crm',
  name: 'People',
  version: '1.0.0',
  description: 'Personal CRM: everyone in your life, with everything linked to them.',
  icon: 'person.2',
  color: CRM_COLOR,
  entityTypes: [personType],
  quickActions: [{ id: 'crm.addPerson', label: 'Person', icon: 'person', route: '/entity/person/new' }],
  detailSections: [{ entityType: 'person', key: 'crm.person', title: 'Relationship', component: PersonSection, order: 10 }],
  aiTools: [
    {
      name: 'people_to_contact',
      description: 'People overdue for contact (based on their keep-in-touch cadence) and upcoming birthdays in the next 30 days.',
      input: z.object({}),
      run: async (_i, os) => {
        const people = os.entities.query<PersonData>('person');
        const today = Date.now();
        return {
          overdue: people
            .filter((p) => p.data.contactEvery && (!p.data.lastContactAt || (today - new Date(p.data.lastContactAt).getTime()) / 86400000 > p.data.contactEvery))
            .map((p) => ({ id: p.id, name: p.title, lastContact: p.data.lastContactAt ?? null, every: p.data.contactEvery })),
          birthdays: people.map((p) => ({ id: p.id, name: p.title, next: p.data.birthday ? nextBirthday(p.data.birthday) : null })).filter((x) => x.next && x.next.days <= 30),
        };
      },
    },
  ],
};
