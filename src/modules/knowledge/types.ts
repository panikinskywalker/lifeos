import { z } from 'zod';
import type { ObjectDef } from '@core/domain/types';

export const KNOWLEDGE_COLOR = 'purple';

export type NoteData = { body: string; kind?: string; source?: string; projectId?: string; personIds?: string[] };

export const NOTE_KINDS = [
  { value: 'idea', label: 'Idea' },
  { value: 'journal', label: 'Journal' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'reference', label: 'Reference' },
  { value: 'recipe', label: 'Recipe' },
  { value: 'book', label: 'Book / Article' },
];

/** A Note's title when you give none: its first line, marks and brackets dropped, 60 characters. */
export function noteTitle(body: string): string {
  const line = (body ?? '').split('\n').map((l) => l.replace(/^\s*(#+|[-*>]|\d+\.)\s*/, '').replace(/\[\[|\]\]/g, '').replace(/[*_`]/g, '').trim()).find(Boolean) ?? '';
  return line.length > 60 ? `${line.slice(0, 59).trimEnd()}…` : line;
}

/** The line under a Note's title in lists: what follows its first line, or that line when it is all there is. */
export function noteSnippet(body: string, n = 80): string {
  const lines = (body ?? '').split('\n').map((l) => l.replace(/^\s*(#+|[-*>]|\d+\.)\s*/, '').trim()).filter(Boolean);
  return (lines.length > 1 ? lines.slice(1) : lines).join(' · ').replace(/\[\[|\]\]/g, '').slice(0, n);
}

/** Note (docs/MODEL.md layer 2, Mind; R7f). Keys unchanged. */
export const noteType: ObjectDef<NoteData> = {
  id: 'note', module: 'knowledge', label: 'Note', labelPlural: 'Notes', icon: 'note.text',
  schema: z.object({ body: z.string().default(''), kind: z.string().optional(), source: z.string().optional(), projectId: z.string().optional(), personIds: z.array(z.string()).optional() }),
  fields: [
    { key: 'body', label: 'Note', type: 'longtext', required: true, placeholder: 'Write anything. [[Name]] mentions a record.' },
    { key: 'kind', label: 'Kind', type: 'select', summary: true, options: NOTE_KINDS },
    { key: 'source', label: 'Source / URL', type: 'text', section: 'Links' },
    { key: 'projectId', label: 'Project', type: 'link', linkTo: 'project', linkWord: 'project', section: 'Links' },
    { key: 'personIds', label: 'People', type: 'link', linkTo: 'person', linkWord: 'person', section: 'Links', default: [] },
  ],
  computeTitle: (d) => noteTitle(d.body) || 'Note',
  searchText: (d) => `${d.body} ${d.source ?? ''}`,
  computeSubtitle: (d) => noteSnippet(d.body) || undefined,
  defaultViews: [{ name: 'Journal', icon: 'book', definition: { filter: { and: [{ field: 'data.kind', op: 'eq', value: 'journal' }] }, sort: [{ field: 'createdAt', dir: 'desc' }], groupBy: 'month' } }, { name: 'Ideas', icon: 'lightbulb', definition: { filter: { and: [{ field: 'data.kind', op: 'eq', value: 'idea' }] } } }],
};
