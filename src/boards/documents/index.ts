import type { BoardManifest } from '@core/registry/types';
import { documentsOverview } from './overview';

/** Companion board of the documents module: its Overview, quick actions and record overrides. */
export const documentsBoard: BoardManifest = {
  id: 'documents',
  module: 'documents',
  name: 'Documents',
  icon: 'folder',
  color: 'indigo',
  placement: 'module',
  overview: documentsOverview,
  quickActions: [{ id: 'documents.add', label: 'Document', icon: 'doc.text', route: '/entity/document/new' }],
};
