import type { BoardManifest } from '@core/registry/types';
import { notesOverview } from './overview';
import { JournalHome } from './home';
import { EntriesScreen } from './entries';
import { FactsScreen } from './facts';
import { NotePage } from './note';
import { NoteForm } from './form';
import { journalTiles } from './tile';

/**
 * Journal, the knowledge module's board (the Second Brain in docs/MODEL.md
 * layer 2), drawn to the NR-Journal-* artboards (v3 Noir): the home, Entries
 * by month, Facts, the Note page with its Links, the Note form with [[ to
 * link, the Today tiles. The Links screen is the shared /links.
 */
export const knowledgeBoard: BoardManifest = {
  id: 'knowledge',
  module: 'knowledge',
  name: 'Journal',
  icon: 'notebook',
  color: 'purple',
  placement: 'browse',
  overview: notesOverview,
  tiles: journalTiles,
  screens: [
    { key: 'index', title: 'Journal', component: JournalHome },
    { key: 'entries', title: 'Entries', component: EntriesScreen },
    { key: 'facts', title: 'Facts', component: FactsScreen },
  ],
  overrides: [{ object: 'note', form: NoteForm, record: [{ entityType: 'note', key: 'knowledge.note', title: 'Note', component: NotePage, order: 0, placement: 'page', ownLinks: true, fields: ['body'] }] }],
  quickActions: [{ id: 'knowledge.addNote', label: 'Note', icon: 'note.text', route: '/entity/note/new', global: true }],
};
