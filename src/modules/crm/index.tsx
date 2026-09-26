import React from 'react';
import { Linking, View } from 'react-native';
import { useRouter } from 'expo-router';
import { z } from 'zod';
import type { ModuleManifest } from '@core/registry/types';
import type { Entity } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import { useLive } from '@ui/hooks';
import { AttentionCard, QuickActions, RowList, Section, StatTrio, Text, useToast } from '@ui/kit';
import { EntityRow } from '@ui/components/EntityRow';
import { bus } from '@core/events/bus';
import { CRM_COLOR, groupType, personType, type PersonData } from './types';
import { peopleOverview } from './overview';

export * from './types';


/**
 * Person (Stitch "Record · Person"): last contact / birthday / shared spend
 * trio, a nudge when you're overdue to get in touch, quick actions (call,
 * message, log contact, IOU) and shared expenses.
 */
function PersonSection({ entity, ctx }: { entity: Entity<any>; ctx: LifeOSContext }) {
  const router = useRouter();
  const toast = useToast();
  const p = entity as Entity<PersonData>;
  const linked = useLive((os) => os.relations.forEntity(entity.id), [entity.id]);
  const spend = useLive((os) => os.entities.aggregate('transaction', { filter: { and: [{ field: 'relation.person', op: 'relatedTo', value: entity.id }, { field: 'data.kind', op: 'eq', value: 'expense' }] } }, { sum: ['data.amount'], count: true }), [entity.id]);
  const contact = useLive((os) => {
    const c = os.cycles.forEntity(entity.id).find((x) => x.template === 'person.contact');
    return c ? { cycle: c, status: os.cycles.status(c) } : null;
  }, [entity.id, entity.version]);
  const txns = linked.filter((r) => r.other.type === 'transaction').slice(0, 5);
  const days = p.data.lastContactAt ? Math.floor((Date.now() - new Date(p.data.lastContactAt).getTime()) / 86400000) : null;
  const overdue = contact?.status.state === 'overdue' || (!!p.data.contactEvery && days != null && days > p.data.contactEvery);
  const bday = p.data.birthday ? nextBirthday(p.data.birthday) : null;
  const first = entity.title.split(' ')[0];
  const logContact = () => {
    const prev = p.data.lastContactAt;
    ctx.entities.update<PersonData>(entity.id, { data: { lastContactAt: new Date().toISOString().slice(0, 10) } });
    toast.show({ message: `Logged contact with ${first}`, icon: 'check', undo: () => void ctx.entities.update<PersonData>(entity.id, { data: { lastContactAt: prev } }) });
  };
  const tel = p.data.phone?.replace(/[^+\d]/g, '');
  return (
    <View style={{ gap: 16 }}>
      <StatTrio
        stats={[
          { label: 'Last contact', value: days == null ? '—' : String(days), unit: days == null ? undefined : days === 1 ? 'day' : 'days', caption: p.data.contactEvery ? `aim: every ${p.data.contactEvery} d` : days == null ? 'not logged' : 'ago', tone: overdue ? 'alert' : undefined, onPress: logContact },
          bday ? { label: 'Birthday', value: String(bday.days), unit: 'days', caption: bday.age ? `turns ${bday.age}` : undefined } : { label: 'Linked', value: String(linked.length), caption: 'records' },
          { label: 'Shared', value: ctx.format.currency(spend['sum_data.amount'] ?? 0), caption: `${spend.count} expense${spend.count === 1 ? '' : 's'}` },
        ]}
      />
      {overdue ? (
        <AttentionCard
          eyebrow="Keep in touch"
          urgent={days != null && !!p.data.contactEvery && days > p.data.contactEvery * 1.5}
          title={days != null ? `${days} days since you last spoke` : `Time to catch up with ${first}`}
          meta={p.data.contactEvery ? `You aim for every ${p.data.contactEvery} days` : undefined}
          primary={tel ? { label: 'Call', icon: 'phone', onPress: () => void Linking.openURL(`tel:${tel}`) } : { label: 'Log contact', icon: 'check', onPress: logContact }}
          secondary={tel ? { label: 'Log contact', icon: 'check', onPress: logContact } : undefined}
        />
      ) : null}
      <QuickActions
        actions={[
          ...(tel ? [{ label: 'Call', icon: 'phone' as const, onPress: () => void Linking.openURL(`tel:${tel}`) }, { label: 'Message', icon: 'comment' as const, onPress: () => void Linking.openURL(`sms:${tel}`) }] : []),
          { label: 'Log contact today', icon: 'check', onPress: logContact },
          { label: 'Add IOU', icon: 'cash', onPress: () => router.push('/entity/debt/new') },
          { label: 'Add expense', icon: 'receipt', onPress: () => router.push('/entity/transaction/new') },
        ]}
      />
      {txns.length ? (
        <Section title="Shared expenses" meta={`${spend.count}`} action="All" onAction={() => router.push({ pathname: '/entity/[type]', params: { type: 'transaction', personId: entity.id } })}>
          <RowList>
            {txns.map((r) => {
              const e = ctx.entities.get(r.other.id);
              return e ? <EntityRow key={e.id} entity={e} /> : null;
            })}
          </RowList>
        </Section>
      ) : null}
      {!linked.length ? (
        <Text variant="caption" color="secondary" style={{ paddingHorizontal: 4 }}>
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
  overview: peopleOverview,
  id: 'crm',
  name: 'People',
  version: '1.0.0',
  description: 'Personal CRM: everyone in your life, with everything linked to them.',
  icon: 'person.2',
  color: CRM_COLOR,
  entityTypes: [personType, groupType],
  onStart: (os) => {
    // A group's member field is mirrored into group_members (default shares for splits, "groups Priya is in").
    const sync = (e: Entity) => {
      if (e.type === 'group') os.groups.setMembers(e.id, ((e.data as { memberIds?: string[] }).memberIds ?? []).filter(Boolean));
    };
    bus.on('entity.created', ({ entity }) => sync(entity));
    bus.on('entity.updated', ({ entity }) => sync(entity));
  },
  quickActions: [{ id: 'crm.addPerson', label: 'Person', icon: 'person', route: '/entity/person/new' }],
  detailSections: [{ entityType: 'person', key: 'crm.person', title: 'Relationship', component: PersonSection, order: 10, placement: 'top' }],
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
