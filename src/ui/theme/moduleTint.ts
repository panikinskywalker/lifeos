import type { TintKey } from './tokens';

/** DESIGN.md module tints by module id. Unknown modules fall back to the neutral stone tint. */
const MODULE_TINT: Record<string, TintKey> = {
  finance: 'finance',
  assets: 'upkeep',
  inventory: 'upkeep',
  crm: 'people',
  projects: 'tasks',
  automation: 'tasks',
  habits: 'health',
  health: 'health',
  knowledge: 'memory',
  travel: 'travel',
  documents: 'documents',
  places: 'travel',
  deliveries: 'upkeep',
  games: 'health',
  turf: 'health',
  time: 'tasks',
  activity: 'tasks',
};

export function tintForModule(moduleId: string | undefined): TintKey {
  return (moduleId && MODULE_TINT[moduleId]) || 'documents';
}

/** Short names for Browse tiles (canvas: Finance, People, Tasks, Health, Notes…). Falls back to the module's name. */
const MODULE_SHORT: Record<string, string> = {
  crm: 'People',
  projects: 'Tasks',
  health: 'Health',
  habits: 'Habits',
  knowledge: 'Journal',
  finance: 'Money',
  assets: 'Things',
  inventory: 'Home',
  places: 'Places',
  games: 'Turf',
};

export function shortNameForModule(moduleId: string, fallback: string): string {
  return MODULE_SHORT[moduleId] ?? fallback;
}

/**
 * Links colours (the NR Links artboards, L7 "Tinted by module"): a record's
 * ring and the line to it take its module's colour. People pink · Places
 * yellow · Money orange · Events and tasks lilac · Trips coral · Body and
 * Turf lime · Things sky · Dumps, notes and facts violet.
 */
const LINK_COLOR: Record<string, string> = {
  crm: '#F4A8CE',
  places: '#F6E27F',
  finance: '#F26B2B',
  projects: '#C9A7F5',
  automation: '#C9A7F5',
  travel: '#FF8A6A',
  health: '#D7F55C',
  habits: '#D7F55C',
  games: '#D7F55C',
  assets: '#A9C4FF',
  inventory: '#A9C4FF',
  deliveries: '#A9C4FF',
  documents: '#A9C4FF',
  knowledge: '#B48CF2',
};

export function linkColorForModule(moduleId: string | null | undefined): string {
  return (moduleId && LINK_COLOR[moduleId]) || '#9FE0B5';
}
