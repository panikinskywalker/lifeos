import type { BoardManifest } from '@core/registry/types';
import { ActivityHome } from './home';
import { ActivityTracker } from './tracker';
import { ActivityEdit } from './edit';

/**
 * Activity (MODEL.md layer 3, *Activity*; R11): a Browse board over core's
 * trackers, the GitHub-style grid of days. Defines no Objects: a tracker is
 * a setting and its days are read from what is already filed. Its Today tile
 * is `ActivityTodayTile` (./tile).
 */
export const activityBoard: BoardManifest = {
  id: 'activity',
  name: 'Activity',
  icon: 'grid',
  color: 'blue',
  placement: 'browse',
  screens: [
    { key: 'index', title: 'Activity', component: ActivityHome },
    { key: 'tracker', title: 'Tracker', component: ActivityTracker },
    { key: 'edit', title: 'Tracker', component: ActivityEdit },
  ],
};
