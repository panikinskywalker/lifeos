import type { BoardManifest } from '@core/registry/types';
import { peopleOverview } from './overview';
import { PersonProfile } from './profile';
import { PeopleHome } from './screens';
import { PersonSection } from './sections';

/** Companion board of the crm module (People): the People home and Overview, quick actions, Person · Profile (v3 Noir). */
export const crmBoard: BoardManifest = {
  id: 'crm',
  module: 'crm',
  name: 'People',
  icon: 'person.2',
  color: 'pink',
  placement: 'module',
  overview: peopleOverview,
  screens: [{ key: 'index', title: 'People', component: PeopleHome }],
  quickActions: [{ id: 'crm.addPerson', label: 'Person', icon: 'person', route: '/entity/person/new' }],
  overrides: [
    {
      object: 'person',
      record: [
        { entityType: 'person', key: 'crm.profile', title: 'Profile', component: PersonProfile, order: 0, placement: 'hero' },
        { entityType: 'person', key: 'crm.person', title: 'Keep in touch', component: PersonSection, order: 10, placement: 'top' },
      ],
    },
  ],
};
