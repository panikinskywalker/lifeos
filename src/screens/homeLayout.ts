import type { LifeOSContext } from '@core/registry/context';
import type { TileDef } from '@core/registry/types';

/**
 * Today's layout (docs/MODEL.md layer 5, *What Today is made of*): which of
 * the tiles boards register are shown, in what order, in which look. Today
 * reads nothing else.
 */

/** The default order; a tile a board adds later goes at the end. Ids are the tiles' `type`. */
export const TILE_ORDER = ['myday', 'turf', 'progress', 'activity', 'habits', 'steps', 'sleep', 'spend', 'done', 'areas', 'upcoming', 'screen', 'people', 'home', 'overdue', 'onthisday'];

export interface TileSetting {
  id: string;
  hidden?: boolean;
}

/** Every registered tile, default order first. */
export function todayTiles(os: LifeOSContext): TileDef[] {
  const all = [...os.registry.tiles.values()];
  const rank = (t: TileDef) => (TILE_ORDER.includes(t.type) ? TILE_ORDER.indexOf(t.type) : TILE_ORDER.length);
  return all.map((t, i) => ({ t, i })).sort((a, b) => rank(a.t) - rank(b.t) || a.i - b.i).map((x) => x.t);
}

/** Your layout: saved order and switches; tiles added since keep their default place. */
export function homeLayout(os: LifeOSContext): TileSetting[] {
  const order = todayTiles(os).map((t) => t.type);
  const saved = os.settings.get<TileSetting[]>('today.tiles', []).filter((x) => order.includes(x.id));
  const out = [...saved];
  for (const id of order) {
    if (out.some((x) => x.id === id)) continue;
    // A tile Today has no place for goes at the end; the others just after the tile that comes before them by default.
    if (!TILE_ORDER.includes(id)) {
      out.push({ id });
      continue;
    }
    const before = order.slice(0, order.indexOf(id)).reverse().find((b) => out.some((x) => x.id === b));
    out.splice(before ? out.findIndex((x) => x.id === before) + 1 : 0, 0, { id });
  }
  return out;
}

export function saveHomeLayout(os: LifeOSContext, next: TileSetting[]) {
  os.settings.set('today.tiles', next);
}

/** Which modules get an area card (default: all that have an overview). */
export function homeAreas(os: LifeOSContext): string[] {
  const all = [...os.registry.modules.values()].filter((m) => os.registry.overviewFor(m.id)).map((m) => m.id);
  const saved = os.settings.get<string[] | null>('today.areas', null);
  return saved ? saved.filter((id) => all.includes(id)) : all;
}

export function setHomeAreas(os: LifeOSContext, ids: string[]) {
  os.settings.set('today.areas', ids);
}

/** A tile's looks: the options of its `style` select Field (the first is the default). */
export function tileLooks(def: TileDef | undefined) {
  return def?.configFields?.find((f) => f.key === 'style')?.options ?? [];
}

/** A tile's config as You › Home screen left it (today: its look). */
export function tileConfig(os: LifeOSContext, id: string): Record<string, unknown> {
  const looks = tileLooks(os.registry.tiles.get(id));
  if (!looks.length) return {};
  const saved = os.settings.get<Record<string, string>>('today.styles', {})[id];
  return { style: looks.some((o) => o.value === saved) ? saved : looks[0]!.value };
}

export function setTileStyle(os: LifeOSContext, id: string, value: string) {
  os.settings.set('today.styles', { ...os.settings.get<Record<string, string>>('today.styles', {}), [id]: value });
}
