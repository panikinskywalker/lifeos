import type { LifeOSContext } from '@core/registry/context';

/** Everything Today can show, in its default order (You › Home screen turns each on / off and moves it). */
export type TileId = 'myday' | 'progress' | 'activity' | 'habits' | 'steps' | 'sleep' | 'spend' | 'done' | 'areas' | 'upcoming' | 'screen' | 'people' | 'overdue' | 'onthisday';

export const TILES: Record<TileId, { label: string; line: string; wide: boolean }> = {
  myday: { label: 'My day', line: 'Today in time order: events, tasks, things due, deliveries', wide: true },
  progress: { label: 'Progress', line: 'Rings: steps, sleep, screen time, habits, tasks, spend vs your goals', wide: true },
  activity: { label: 'Activity', line: 'GitHub-style grids: days worked, workouts, steps, your own trackers', wide: true },
  habits: { label: 'Habits', line: 'Tick today’s habits, with their streaks', wide: true },
  steps: { label: 'Steps', line: 'Today and the last 7 days', wide: false },
  sleep: { label: 'Sleep', line: 'Last night and the last 7 days', wide: false },
  spend: { label: 'Spend this month', line: 'Pace against your usual month', wide: true },
  done: { label: 'Done today', line: 'What you’ve spent, logged and ticked off so far', wide: true },
  areas: { label: 'Areas', line: 'A card per part of life with its number and trend', wide: true },
  upcoming: { label: 'Upcoming', line: 'The next two weeks', wide: true },
  screen: { label: 'Screen time', line: 'Today, top apps, 7 days', wide: true },
  people: { label: 'People to call', line: 'Keep-in-touch and birthdays', wide: false },
  overdue: { label: 'Overdue', line: 'Upkeep that’s late', wide: false },
  onthisday: { label: 'On this day', line: 'A month, six months, years ago', wide: true },
};

export const TILE_ORDER = Object.keys(TILES) as TileId[];

export interface TileSetting {
  id: TileId;
  hidden?: boolean;
}

/** Your layout: saved order and switches; tiles added since keep their default place. */
export function homeLayout(os: LifeOSContext): TileSetting[] {
  const saved = os.settings.get<TileSetting[]>('today.tiles', []).filter((x) => TILES[x.id]);
  const out = [...saved];
  for (const id of TILE_ORDER) {
    if (out.some((x) => x.id === id)) continue;
    // Just after the tile that comes before it by default.
    const before = TILE_ORDER.slice(0, TILE_ORDER.indexOf(id)).reverse().find((b) => out.some((x) => x.id === b));
    out.splice(before ? out.findIndex((x) => x.id === before) + 1 : 0, 0, { id });
  }
  return out;
}

export function saveHomeLayout(os: LifeOSContext, next: TileSetting[]) {
  os.settings.set('today.tiles', next);
}

/** Which modules get an area card (default: all that have an overview). */
export function homeAreas(os: LifeOSContext): string[] {
  const all = [...os.registry.modules.values()].filter((m) => m.overview).map((m) => m.id);
  const saved = os.settings.get<string[] | null>('today.areas', null);
  return saved ? saved.filter((id) => all.includes(id)) : all;
}

export function setHomeAreas(os: LifeOSContext, ids: string[]) {
  os.settings.set('today.areas', ids);
}
