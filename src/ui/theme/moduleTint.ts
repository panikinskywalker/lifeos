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
  knowledge: 'Notes',
  assets: 'Things',
  inventory: 'Inventory',
  places: 'Places',
};

export function shortNameForModule(moduleId: string, fallback: string): string {
  return MODULE_SHORT[moduleId] ?? fallback;
}
