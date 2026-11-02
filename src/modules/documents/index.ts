import { z } from 'zod';
import type { AutomationTemplate, ModuleManifest, SourceDef } from '@core/registry/types';
import { documentType, type DocumentData } from './types';
import { folders, rescan } from './folders';
import { documentsBrain } from './brain';

export * from './types';
export * from './folders';
export { documentsBrain, newFiles, FOLDERS_ROUTE } from './brain';

/** Your folders as a source (R7c): each sync is a rescan; it files its own Documents. */
export const foldersSource: SourceDef = {
  id: 'folders',
  label: 'Your folders',
  modules: ['documents'],
  kind: 'readings',
  available: async (os) => !!os.device?.folders && folders(os).length > 0,
  sync: async (os) => ({ filed: (await rescan(os)).added }),
};

/** Document expiry (R10): a reminder 30 days before a new document's expiry. Installed once as a rule. */
const expiryTemplate: AutomationTemplate = {
  id: 'documents.expiry', name: 'Document expiry',
  description: 'A document with an expiry date gets a renewal reminder 30 days before it.',
  trigger: { id: 'core.entity.created', config: { entityType: 'document' } },
  conditions: [{ field: 'data.expiresOn', op: 'notNull' }],
  steps: [{ action: 'core.createReminder', config: { title: 'Renew {{title}}', atField: 'expiresOn', offsetDays: 30 } }],
};

export const documentsModule: ModuleManifest = {
  id: 'documents', name: 'Documents', version: '1.0.0', description: 'Your papers where they already are: folders you pick on the phone, indexed, never copied. Kind, expiry and links on top.', icon: 'folder', color: 'indigo',
  dependencies: ['crm', 'travel', 'assets'], objects: [documentType],
  sources: [foldersSource],
  brain: documentsBrain,
  aiTools: [{
    name: 'expiring_documents', description: 'Documents expiring within N days (default 90).', input: z.object({ days: z.number().optional() }),
    run: async (i, os) => { const days = (i as { days?: number }).days ?? 90; const until = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10); return os.records.query<DocumentData>('document', { filter: { and: [{ field: 'data.expiresOn', op: 'notNull' }, { field: 'data.expiresOn', op: 'lte', value: until }] }, sort: [{ field: 'data.expiresOn', dir: 'asc' }] }).map((d) => ({ id: d.id, title: d.title, kind: d.data.kind, expiresOn: d.data.expiresOn })); },
  }],
  templates: [expiryTemplate],
  onInstall: async (os) => {
    os.automation.rules.save({ name: 'Remind 30 days before a document expires', enabled: true, trigger: expiryTemplate.trigger, conditions: expiryTemplate.conditions, steps: expiryTemplate.steps });
  },
};
