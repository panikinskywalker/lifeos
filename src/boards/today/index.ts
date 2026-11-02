import type { BoardManifest } from '@core/registry/types';
import { todayTiles } from './tiles';

/**
 * Today (docs/MODEL.md layer 5): a board over every module, pinned to the
 * bottom bar (`app/(tabs)/index.tsx` lays out the Morning brief and every
 * board's tiles). This board holds the tiles over core: My day, Progress,
 * Activity, Done today, Areas, Upcoming, Screen time, Overdue.
 */
export const todayBoard: BoardManifest = {
  id: 'today',
  name: 'Today',
  icon: 'sun',
  color: 'orange',
  placement: 'bar',
  tiles: todayTiles,
};
