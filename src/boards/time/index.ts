import type { BoardManifest } from '@core/registry/types';
import { TimeScreen } from './screen';
import { timeTiles } from './tile';

export { TimeScreen } from './screen';

/**
 * Time (docs/MODEL.md layers 3 and 5, R8): what happened in a day, a month or
 * a year, over every module, from core's almanac. Its home is `/time`
 * (`app/time.tsx`) and Browse › Boards; On this day is its tile on Today.
 */
export const timeBoard: BoardManifest = {
  id: 'time',
  name: 'Time',
  icon: 'calendar',
  color: 'blue',
  placement: 'browse',
  screens: [{ key: 'index', title: 'Time', component: TimeScreen }],
  tiles: timeTiles,
};
