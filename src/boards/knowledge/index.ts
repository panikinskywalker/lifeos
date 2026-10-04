import type { BoardManifest } from '@core/registry/types';
import { notesOverview } from './overview';

/** Companion board of the knowledge module: its Overview, quick actions and record overrides. */
export const knowledgeBoard: BoardManifest = {
  id: 'knowledge',
  module: 'knowledge',
  name: 'Second Brain',
  icon: 'brain',
  color: 'purple',
  placement: 'module',
  overview: notesOverview,
  quickActions: [{ id: 'knowledge.addNote', label: 'Note', icon: 'note.text', route: '/entity/note/new', global: true }],
};
