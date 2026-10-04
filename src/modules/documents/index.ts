import { z } from 'zod';
import type { ModuleManifest } from '@core/registry/types';
import type { ObjectDef } from '@core/domain/types';
import { dateField } from '@core/cycles/schedule';

export const DOCUMENTS_COLOR = 'indigo';

export interface DocumentData { kind: string; number?: string; issuedOn?: string; expiresOn?: string; issuer?: string; notes?: string; personId?: string; tripId?: string; assetId?: string }
export const documentType: ObjectDef<DocumentData> = {
  type: 'document', module: 'documents', label: 'Document', labelPlural: 'Documents', icon: 'doc.text',
  schema: z.object({ kind: z.string().default('other'), number: z.string().optional(), issuedOn: z.string().optional(), expiresOn: z.string().optional(), issuer: z.string().optional(), notes: z.string().optional(), personId: z.string().optional(), tripId: z.string().optional(), assetId: z.string().optional() }),
  cycleTemplates: (d) => (dateField(d.expiresOn) ? [{ template: 'document.expiry', name: 'Renew', kind: 'fixed', nextDueAt: dateField(d.expiresOn), leadDays: d.kind === 'id' ? 180 : 30 }] : []),
  fields: [
    { key: 'kind', label: 'Type', type: 'select', required: true, summary: true, options: [{ value: 'id', label: 'ID / Passport' }, { value: 'insurance', label: 'Insurance' }, { value: 'contract', label: 'Contract / Lease' }, { value: 'receipt', label: 'Receipt / Invoice' }, { value: 'ticket', label: 'Ticket / Booking' }, { value: 'medical', label: 'Medical' }, { value: 'tax', label: 'Tax' }, { value: 'certificate', label: 'Certificate' }, { value: 'other', label: 'Other' }] },
    { key: 'number', label: 'Reference number', type: 'text' },
    { key: 'issuer', label: 'Issuer', type: 'text' },
    { key: 'issuedOn', label: 'Issued', type: 'date', section: 'Validity' },
    { key: 'expiresOn', label: 'Expires', type: 'date', section: 'Validity', summary: true },
    { key: 'personId', label: 'Person', type: 'relation', relationTo: 'person', relationKind: 'person', section: 'Links' },
    { key: 'tripId', label: 'Trip', type: 'relation', relationTo: 'trip', relationKind: 'trip', section: 'Links' },
    { key: 'assetId', label: 'Asset / vehicle', type: 'relation', relationTo: ['asset', 'vehicle'], relationKind: 'asset', section: 'Links' },
    { key: 'notes', label: 'Notes', type: 'longtext', section: 'Details' },
  ],
  indexed: ['kind', 'expiresOn'], occurredAtField: 'expiresOn',
  searchText: (d) => [d.number, d.issuer, d.notes].filter(Boolean).join(' '),
  defaultViews: [{ name: 'Expiring soon', icon: 'exclamationmark.triangle', definition: { filter: { and: [{ field: 'data.expiresOn', op: 'notNull' }, { field: 'data.expiresOn', op: 'lte', value: '__DAYS_AHEAD_90__' }] }, sort: [{ field: 'data.expiresOn', dir: 'asc' }] } }],
};

export const documentsModule: ModuleManifest = {
  id: 'documents', name: 'Documents', version: '1.0.0', description: 'IDs, insurance, contracts and receipts — attach the scan, track the expiry.', icon: 'folder', color: DOCUMENTS_COLOR,
  dependencies: ['crm', 'travel', 'assets'], objects: [documentType],
  aiTools: [{
    name: 'expiring_documents', description: 'Documents expiring within N days (default 90).', input: z.object({ days: z.number().optional() }),
    run: async (i, os) => { const days = (i as { days?: number }).days ?? 90; const until = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10); return os.records.query<DocumentData>('document', { filter: { and: [{ field: 'data.expiresOn', op: 'notNull' }, { field: 'data.expiresOn', op: 'lte', value: until }] }, sort: [{ field: 'data.expiresOn', dir: 'asc' }] }).map((d) => ({ id: d.id, title: d.title, kind: d.data.kind, expiresOn: d.data.expiresOn })); },
  }],
  onInstall: async (os) => {
    os.automation.rules.save({ name: 'Remind 30 days before a document expires', enabled: true, trigger: { id: 'core.entity.created', config: { entityType: 'document' } }, conditions: [{ field: 'data.expiresOn', op: 'notNull' }], actions: [{ id: 'core.createReminder', config: { title: 'Renew {{title}}', atField: 'expiresOn', offsetDays: 30 } }] });
  },
};
