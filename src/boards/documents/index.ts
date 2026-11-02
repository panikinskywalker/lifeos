import type { BoardManifest } from '@core/registry/types';
import { documentsOverview } from './overview';
import { YourFolders } from './folders';
import { DocumentFile } from './file';

/**
 * Companion board of the documents module: its Overview, Your folders (R7c:
 * the phone's folders, indexed, never copied), a Document's file card, and
 * quick actions.
 */
export const documentsBoard: BoardManifest = {
  id: 'documents',
  module: 'documents',
  name: 'Documents',
  icon: 'folder',
  color: 'indigo',
  placement: 'module',
  overview: documentsOverview,
  screens: [{ key: 'folders', title: 'Your folders', component: YourFolders }],
  overrides: [{ object: 'document', record: [{ entityType: 'document', key: 'documents.file', title: 'File', component: DocumentFile, order: 0, placement: 'top' }] }],
  quickActions: [
    { id: 'documents.add', label: 'Document', icon: 'doc.text', route: '/entity/document/new' },
    { id: 'documents.folders', label: 'Your folders', icon: 'folder', route: '/module/documents/folders' },
  ],
};
