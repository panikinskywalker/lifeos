import { z } from 'zod';
import type { ModuleManifest } from '@core/registry/types';
import type { ObjectDef } from '@core/domain/types';

export const KNOWLEDGE_COLOR = 'purple';

export interface NoteData { body: string; kind?: string; source?: string; projectId?: string; personIds?: string[] }
export const noteType: ObjectDef<NoteData> = {
  id: 'note', module: 'knowledge', label: 'Note', labelPlural: 'Notes', icon: 'note.text',
  schema: z.object({ body: z.string().default(''), kind: z.string().optional(), source: z.string().optional(), projectId: z.string().optional(), personIds: z.array(z.string()).optional() }),
  fields: [
    { key: 'body', label: 'Note', type: 'longtext', required: true, placeholder: 'Write anything. Markdown-ish is fine.' },
    { key: 'kind', label: 'Kind', type: 'select', summary: true, options: [{ value: 'idea', label: 'Idea' }, { value: 'meeting', label: 'Meeting' }, { value: 'journal', label: 'Journal' }, { value: 'reference', label: 'Reference' }, { value: 'recipe', label: 'Recipe' }, { value: 'book', label: 'Book / Article' }] },
    { key: 'source', label: 'Source / URL', type: 'text', section: 'Links' },
    { key: 'projectId', label: 'Project', type: 'relation', relationTo: 'project', relationKind: 'project', section: 'Links' },
    { key: 'personIds', label: 'People', type: 'relation', relationTo: 'person', relationKind: 'person', section: 'Links', defaultValue: [] },
  ],
  searchText: (d) => `${d.body} ${d.source ?? ''}`,
  computeSubtitle: (d) => d.body.slice(0, 80).replace(/\n/g, ' ') || undefined,
  defaultViews: [{ name: 'Journal', icon: 'book', definition: { filter: { and: [{ field: 'data.kind', op: 'eq', value: 'journal' }] }, sort: [{ field: 'createdAt', dir: 'desc' }], groupBy: 'month' } }, { name: 'Ideas', icon: 'lightbulb', definition: { filter: { and: [{ field: 'data.kind', op: 'eq', value: 'idea' }] } } }],
};

export const knowledgeModule: ModuleManifest = {
  id: 'knowledge', name: 'Second Brain', version: '1.0.0', description: 'Notes, ideas, journal and references — searchable and linked to everything.', icon: 'brain', color: KNOWLEDGE_COLOR,
  dependencies: ['crm', 'projects'], objects: [noteType],
};
