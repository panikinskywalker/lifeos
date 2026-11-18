import type { BoardManifest } from '@core/registry/types';
import { SplitwiseScreen } from './home';

/**
 * Splitwise (docs/MODEL.md, Splitwise and settling up): a Browse board over
 * Money's shares and People. Sign in, link your people, map groups, see what
 * Splitwise says. Defines no Objects; the sync itself is finance's.
 */
export const splitwiseBoard: BoardManifest = {
  id: 'splitwise',
  name: 'Splitwise',
  icon: 'link',
  color: 'teal',
  placement: 'browse',
  // Shown while Money is (docs/MODEL.md, Modules shown); a tile in Browse › Boards, not Money's card.
  shownWith: 'finance',
  screens: [{ key: 'index', title: 'Splitwise', component: SplitwiseScreen }],
};
