import type { BoardManifest } from '@core/registry/types';
import { documentsOverview } from './overview';
import { documentsTiles } from './tile';
import { DocumentsHome } from './home';
import { DocumentsList } from './list';
import { YourFolders } from './folders';
import { DocumentPage } from './record';
import { DocumentForm } from './form';

/**
 * Companion board of the documents module (NR-Documents-*): its home, All
 * documents, Your folders (the phone's folders, indexed, never copied), a
 * Document's page with the file card, its form, the Today tile, the Overview
 * and quick actions.
 */
export const documentsBoard: BoardManifest = {
  id: 'documents',
  module: 'documents',
  name: 'Documents',
  icon: 'folder',
  color: 'indigo',
  placement: 'module',
  overview: documentsOverview,
  tiles: documentsTiles,
  screens: [
    { key: 'index', title: 'Documents', component: DocumentsHome },
    { key: 'list', title: 'All documents', component: DocumentsList },
    { key: 'folders', title: 'Your folders', component: YourFolders },
  ],
  overrides: [{ object: 'document', form: DocumentForm, record: [{ entityType: 'document', key: 'documents.page', title: 'Document', component: DocumentPage, order: 0, placement: 'page', ownLinks: true }] }],
  quickActions: [
    { id: 'documents.add', label: 'Document', icon: 'doc.text', route: '/entity/document/new' },
    { id: 'documents.folders', label: 'Your folders', icon: 'folder', route: '/module/documents/folders' },
  ],
};
