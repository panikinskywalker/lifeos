import { z } from 'zod';
import type { ModuleManifest } from '@core/registry/types';
import type { ObjectRecord } from '@core/domain/types';
import { bus } from '@core/events/bus';
import { CRM_COLOR, groupType, personType, type PersonData } from './types';
import { nextBirthday } from './lib';

export * from './types';
export { nextBirthday };

export const crmModule: ModuleManifest = {
  id: 'crm',
  name: 'People',
  version: '1.0.0',
  description: 'Personal CRM: everyone in your life, with everything linked to them.',
  icon: 'person.2',
  color: CRM_COLOR,
  objects: [personType, groupType],
  onStart: (os) => {
    // A group's member field is mirrored into group_members (default shares for splits, "groups Priya is in").
    const sync = (e: ObjectRecord) => {
      if (e.type === 'group') os.groups.setMembers(e.id, ((e.data as { memberIds?: string[] }).memberIds ?? []).filter(Boolean));
    };
    bus.on('entity.created', ({ entity }) => sync(entity));
    bus.on('entity.updated', ({ entity }) => sync(entity));
  },
  aiTools: [
    {
      name: 'people_to_contact',
      description: 'People overdue for contact (based on their keep-in-touch cadence) and upcoming birthdays in the next 30 days.',
      input: z.object({}),
      run: async (_i, os) => {
        const people = os.records.query<PersonData>('person');
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

