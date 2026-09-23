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
};

export function tintForModule(moduleId: string | undefined): TintKey {
  return (moduleId && MODULE_TINT[moduleId]) || 'documents';
}
