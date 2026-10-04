import type { BoardManifest } from '@core/registry/types';
import { peopleOverview } from './overview';
import { PersonSection } from './sections';

/** Companion board of the crm module (People): Overview, quick actions, the Person hero. */
export const crmBoard: BoardManifest = {
  id: 'crm',
  module: 'crm',
  name: 'People',
  icon: 'person.2',
  color: 'pink',
  placement: 'module',
  overview: peopleOverview,
  quickActions: [{ id: 'crm.addPerson', label: 'Person', icon: 'person', route: '/entity/person/new' }],
  overrides: [{ object: 'person', record: [{ entityType: 'person', key: 'crm.person', title: 'Relationship', component: PersonSection, order: 10, placement: 'top' }] }],
};
