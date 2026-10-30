import { z } from 'zod';
import type { ModuleManifest } from '@core/registry/types';
import type { ObjectRecord } from '@core/domain/types';
import { bus } from '@core/events/bus';
import { resolveCandidates } from '@core/ai/lifeTools';
import { withExtras } from '@core/ai/cards';
import { whoIs } from '@core/identity';
import { CRM_COLOR, groupType, personType, type PersonData } from './types';
import { nextBirthday } from './lib';
import { crmSources } from './sources';
import { foldPeople, linkWorkAndHome } from './folds';
import { onLinkAdded, refreshLastSpoke } from './lastSpoke';
import { lastMet, peopleToCall } from './people';
import { applyRelationships } from './relationships';
import { listenForNotion } from './notion';

export * from './types';
export { nextBirthday };
export { importContacts, personForContact, resyncContacts, applyCallLog } from './contacts';
export { touchLastSpoke, refreshLastSpoke } from './lastSpoke';
export { peopleToCall, lastMet, daysSince, type ToCall, type LastMet } from './people';
export { linkWorkAndHome, foldPeople } from './folds';
export { contactsSource, callLogSource } from './sources';
export * from './notion';
export { addRelationship, updateRelationship, customRelationships, BUILTIN_RELATIONSHIPS, RELATIONSHIP_COLORS } from './relationships';

/** A person by id, or by a name said in Talk. */
function personFor(os: Parameters<NonNullable<ModuleManifest['onStart']>>[0], who: string) {
  const byId = os.records.get(who);
  if (byId?.object === 'person') return byId;
  const [best] = resolveCandidates(os, who, ['person']);
  return best && best.score >= 0.6 ? os.records.get(best.id) : null;
}

export const crmModule: ModuleManifest = {
  id: 'crm',
  name: 'People',
  version: '1.1.0',
  description: 'Everyone in your life: who to call, birthdays, when you last spoke, and everything linked to them.',
  icon: 'person.2',
  color: CRM_COLOR,
  objects: [personType, groupType],
  sources: crmSources,
  onStart: (os) => {
    applyRelationships(os);
    // A group's member field is mirrored into group_members (default shares for splits, "groups Priya is in").
    const sync = (e: ObjectRecord) => {
      if (e.object === 'group') os.groups.setMembers(e.id, ((e.data as { memberIds?: string[] }).memberIds ?? []).filter(Boolean));
    };
    bus.on('entity.created', ({ entity }) => {
      sync(entity);
      if (entity.object === 'person') linkWorkAndHome(os, entity as ObjectRecord<PersonData>);
    });
    bus.on('entity.updated', ({ entity, changed }) => {
      sync(entity);
      if (entity.object === 'person' && changed.some((k) => k === 'data.company' || k === 'data.city')) linkWorkAndHome(os, entity as ObjectRecord<PersonData>, changed);
    });
    // A payment or an Event with someone moves their last spoke.
    bus.on('relation.added', ({ relation }) => onLinkAdded(os, relation));
    // Notion (R2b): a change here about a Person waits to go to your People CRM's copy.
    listenForNotion(os);
    if (!os.settings.get<boolean>('crm.r2.folded', false)) {
      foldPeople(os);
      refreshLastSpoke(os);
      os.settings.set('crm.r2.folded', true);
    } else {
      // Events whose time has passed since the last start (a calendar meeting) count now; payments count as they are linked.
      refreshLastSpoke(os, { only: ['event'] });
    }
  },
  aiTools: [
    {
      name: 'people_to_call',
      description: 'People to call or message: keep-in-touch cadences due within a week or overdue, and birthdays in the next two weeks, soonest first.',
      input: z.object({ withinDays: z.number().optional(), birthdayDays: z.number().optional() }),
      run: async (input, os) => {
        const i = input as { withinDays?: number; birthdayDays?: number };
        const list = peopleToCall(os, { withinDays: i.withinDays, birthdayDays: i.birthdayDays ?? 14, limit: 20 });
        const rows = list.map((p) => ({ id: p.id, name: p.name, why: p.why, reason: p.reason, late: p.late, lastSpoke: p.lastSpoke, birthday: p.reason === 'birthday' ? (os.records.get<PersonData>(p.id)?.data.birthday ? nextBirthday(os.records.get<PersonData>(p.id)!.data.birthday!) : null) : undefined }));
        return withExtras({ people: rows }, { card: { kind: 'list', title: 'People to call', items: rows.map((r) => ({ entityId: r.id, type: 'person', title: r.name, value: r.why })) } });
      },
    },
    {
      name: 'last_met',
      description: 'When you last met or spoke to someone: last spoke, days ago, the last call, meeting / Event and payment with them, and their keep-in-touch cadence.',
      input: z.object({ person: z.string().describe('Person id or name') }),
      run: async (input, os) => {
        const p = personFor(os, (input as { person: string }).person);
        if (!p) return { error: 'No such person' };
        const m = lastMet(os, p.id)!;
        return withExtras(m, { card: { kind: 'number', label: `Last spoke to ${m.name}`, value: m.daysAgo == null ? '—' : m.daysAgo === 0 ? 'today' : `${m.daysAgo} d ago`, caption: m.keepInTouch ?? 'no keep-in-touch set' } });
      },
    },
    {
      name: 'who_is',
      description: 'Who a payment sender is: a UPI id, a phone number or an email → the Person (or Organisation) it belongs to, by their UPI ids, a sender learned before, the phone number, the email.',
      input: z.object({ upi: z.string().optional(), phone: z.string().optional(), email: z.string().optional() }),
      run: async (input, os) => {
        const hit = whoIs(os, input as { upi?: string; phone?: string; email?: string });
        return hit ? { id: hit.record.id, title: hit.record.title, object: hit.record.object, by: hit.by } : { id: null };
      },
    },
  ],
};
