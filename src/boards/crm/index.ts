import type { BoardManifest } from '@core/registry/types';
import { peopleOverview } from './overview';
import { crmTiles } from './tile';
import { PersonPage } from './profile';
import { GroupPage } from './group';
import { PeopleHome } from './screens';
import { PeopleList } from './lists';
import { PersonForm } from './form';
import { WhoIsCard } from './whois';
import { NotionConflictCard, NotionMatchCard } from './notion';

/**
 * Companion board of the crm module (People), drawn to the NR-People-*
 * artboards (v3 Noir): the People home, the People and Groups list, the
 * Person and Group pages (each the whole record page), the person form, the
 * "Who is this?" card and the two Notion cards in To check, the Overview,
 * quick actions.
 */
export const crmBoard: BoardManifest = {
  id: 'crm',
  module: 'crm',
  name: 'People',
  icon: 'person.2',
  color: 'pink',
  placement: 'module',
  overview: peopleOverview,
  tiles: crmTiles,
  screens: [
    { key: 'index', title: 'People', component: PeopleHome },
    { key: 'list', title: 'Everyone', component: PeopleList },
  ],
  quickActions: [{ id: 'crm.addPerson', label: 'Person', icon: 'person', route: '/entity/person/new' }],
  overrides: [
    { object: 'person', form: PersonForm, record: [{ entityType: 'person', key: 'crm.person', title: 'Person', component: PersonPage, order: 0, placement: 'page' }] },
    { object: 'group', record: [{ entityType: 'group', key: 'crm.group', title: 'Group', component: GroupPage, order: 0, placement: 'page' }] },
  ],
  checkCards: { 'payee-who': WhoIsCard, 'notion-match': NotionMatchCard, 'notion-conflict': NotionConflictCard },
};
