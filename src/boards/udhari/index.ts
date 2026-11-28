import type { BoardManifest } from '@core/registry/types';
import { UdhariActivity, UdhariAdd, UdhariGroups, UdhariHome } from './home';
import { SplitwiseScreen } from './splitwise';

/**
 * Udhari (docs/MODEL.md, Splitwise and settling up; NR-Udhari-Home): a Browse
 * board over Money's shares, Bills and People. Who owes whom first, then
 * groups and what moved, with Splitwise kept in step underneath (sign in, link
 * people, map groups). Defines no Objects; the sync itself is finance's.
 */
export const udhariBoard: BoardManifest = {
  id: 'udhari',
  name: 'Udhari',
  icon: 'link',
  color: 'teal',
  placement: 'browse',
  // Shown while Money is (docs/MODEL.md, Modules shown); a tile in Browse › Boards, not Money's card.
  shownWith: 'finance',
  // Its own bar (docs/MODEL.md, The bar inside a board): People · Groups · + Add an expense · Activity · Splitwise.
  bar: {
    tabs: [
      { screen: 'index', label: 'People', icon: 'people' },
      { screen: 'groups', label: 'Groups', icon: 'list' },
      { screen: 'activity', label: 'Activity', icon: 'history' },
      { screen: 'splitwise', label: 'Splitwise', icon: 'repeat' },
    ],
    action: { label: 'Add an expense', icon: 'plus', screen: 'add' },
  },
  screens: [
    { key: 'index', title: 'Udhari', component: UdhariHome },
    { key: 'groups', title: 'Groups', component: UdhariGroups },
    { key: 'activity', title: 'Activity', component: UdhariActivity },
    { key: 'splitwise', title: 'Splitwise', component: SplitwiseScreen },
    { key: 'add', title: 'Add an expense', component: UdhariAdd },
  ],
};
