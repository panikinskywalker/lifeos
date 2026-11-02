import { z } from 'zod';
import type { ObjectDef } from '@core/domain/types';
import { dateField } from '@core/cycles/schedule';

export const DOCUMENTS_COLOR = 'indigo';

/** Where a Document's file lives on the phone (R7c): a pointer into a folder you picked, never a copy. */
export interface DocFile {
  uri: string;
  name: string;
  mime: string;
  size: number;
  /** Last changed, ms. */
  modified: number;
  /** The picked folder it was found in (its uri). */
  folder: string;
  /** Subfolder inside it ('' at the top). */
  path: string;
}

export interface DocumentData {
  kind: string;
  number?: string;
  issuedOn?: string;
  expiresOn?: string;
  issuer?: string;
  notes?: string;
  personId?: string;
  tripId?: string;
  assetId?: string;
  file?: DocFile;
  /** A PDF's text, read on the phone, for search only (up to 20,000 characters). */
  text?: string;
  /** Whether the text has been read (a scan has none). */
  textRead?: boolean;
}

export const KIND_OPTIONS = [
  { value: 'id', label: 'ID / Passport' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'contract', label: 'Contract / Lease' },
  { value: 'receipt', label: 'Receipt / Invoice' },
  { value: 'ticket', label: 'Ticket / Booking' },
  { value: 'medical', label: 'Medical' },
  { value: 'tax', label: 'Tax' },
  { value: 'certificate', label: 'Certificate' },
  { value: 'other', label: 'Other' },
];

const fileSchema = z.object({ uri: z.string(), name: z.string(), mime: z.string(), size: z.number(), modified: z.number(), folder: z.string(), path: z.string() });

/** Document (docs/MODEL.md layer 2, *Things*; Fields agreed 2 Nov with R7c). */
export const documentType: ObjectDef<DocumentData> = {
  id: 'document', module: 'documents', label: 'Document', labelPlural: 'Documents', icon: 'doc.text',
  schema: z.object({ kind: z.string().default('other'), number: z.string().optional(), issuedOn: z.string().optional(), expiresOn: z.string().optional(), issuer: z.string().optional(), notes: z.string().optional(), personId: z.string().optional(), tripId: z.string().optional(), assetId: z.string().optional(), file: fileSchema.optional(), text: z.string().optional(), textRead: z.boolean().optional() }),
  cycleTemplates: (d) => (dateField(d.expiresOn) ? [{ template: 'document.expiry', name: 'Renew', kind: 'fixed', nextDueAt: dateField(d.expiresOn), leadDays: d.kind === 'id' ? 180 : 30 }] : []),
  fields: [
    { key: 'kind', label: 'Type', type: 'select', required: true, summary: true, options: KIND_OPTIONS },
    { key: 'number', label: 'Reference number', type: 'text' },
    { key: 'issuer', label: 'Issuer', type: 'text' },
    { key: 'issuedOn', label: 'Issued', type: 'date', section: 'Validity' },
    { key: 'expiresOn', label: 'Expires', type: 'date', section: 'Validity', summary: true },
    { key: 'personId', label: 'Person', type: 'link', linkTo: 'person', linkWord: 'person', section: 'Links' },
    { key: 'tripId', label: 'Trip', type: 'link', linkTo: 'trip', linkWord: 'trip', section: 'Links' },
    { key: 'assetId', label: 'Asset / vehicle', type: 'link', linkTo: 'asset', linkWord: 'asset', section: 'Links' },
    { key: 'notes', label: 'Notes', type: 'longtext', section: 'Details' },
  ],
  statuses: [{ value: 'new', label: 'New', color: 'yellow' }, { value: 'filed', label: 'Filed' }, { value: 'missing', label: 'Missing', color: 'red' }],
  indexed: ['kind', 'expiresOn'], occurredAtField: 'expiresOn',
  searchText: (d) => [d.number, d.issuer, d.notes, d.file?.name, d.text].filter(Boolean).join(' '),
  defaultViews: [
    { name: 'Expiring soon', icon: 'exclamationmark.triangle', definition: { filter: { and: [{ field: 'data.expiresOn', op: 'notNull' }, { field: 'data.expiresOn', op: 'lte', value: '__DAYS_AHEAD_90__' }] }, sort: [{ field: 'data.expiresOn', dir: 'asc' }] } },
    { name: 'New in your folders', icon: 'folder', definition: { filter: { and: [{ field: 'status', op: 'eq', value: 'new' }] } } },
  ],
};
