import type { ModuleManifest } from '@core/registry/types';
import { KNOWLEDGE_COLOR, noteType } from './types';
import { knowledgeAiTools } from './aiTools';
import { foldMemory } from './fold';

export * from './types';
export * from './brain';
export { foldMemory } from './fold';
export { knowledgeAiTools } from './aiTools';

/**
 * Knowledge (docs/MODEL.md layer 2 *The Second Brain*, R7f): Notes with
 * [[mentions]] as Links, read beside core's Facts and the names Talk learned.
 * Memory is folded in once, on first open.
 */
export const knowledgeModule: ModuleManifest = {
  id: 'knowledge',
  name: 'Second Brain',
  version: '2.0.0',
  description: 'Notes, the facts you told LifeOS, and what you call things. Searchable, and linked to everything they mention.',
  icon: 'brain',
  color: KNOWLEDGE_COLOR,
  dependencies: ['crm', 'projects'],
  objects: [noteType],
  aiTools: knowledgeAiTools,
  onStart: (os) => {
    if (os.settings.get<boolean>('knowledge.r7f', false)) return;
    foldMemory(os);
    os.settings.set('knowledge.r7f', true);
  },
};
