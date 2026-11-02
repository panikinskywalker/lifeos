import type { BoardManifest } from '@core/registry/types';
import { notesOverview } from './overview';
import { FactsScreen, SecondBrain } from './home';
import { NoteBody, NoteForm } from './note';

/**
 * The Second Brain (the knowledge module's board; docs/MODEL.md layer 2 *The
 * Second Brain*, R7f): a board in Browse › Boards. Notes and Facts with one
 * search (Memory opens its Facts half), the Note page with its [[mentions]]
 * as links, and the Note form with Mention. A first pass from the kit; the
 * NR-Knowledge-* artboards replace it.
 */
export const knowledgeBoard: BoardManifest = {
  id: 'knowledge',
  module: 'knowledge',
  name: 'Second Brain',
  icon: 'brain',
  color: 'purple',
  placement: 'browse',
  overview: notesOverview,
  screens: [
    { key: 'index', title: 'Second Brain', component: SecondBrain },
    { key: 'facts', title: 'Facts', component: FactsScreen },
  ],
  overrides: [{ object: 'note', form: NoteForm, record: [{ entityType: 'note', key: 'knowledge.body', title: 'Note', component: NoteBody, order: 0, placement: 'top', fields: ['body'] }] }],
  quickActions: [{ id: 'knowledge.addNote', label: 'Note', icon: 'note.text', route: '/entity/note/new', global: true }],
};
