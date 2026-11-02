import { z } from 'zod';
import type { AiToolDef } from '@core/registry/types';
import { withExtras } from '@core/ai/cards';
import { mentionsIn, notes, whatIKnow } from './brain';
import { NOTE_KINDS, noteSnippet, type NoteData } from './types';

const KINDS = NOTE_KINDS.map((k) => k.value) as [string, ...string[]];

/** The knowledge module's tools for the agent (no React Native; unit-tested). */
export const knowledgeAiTools: AiToolDef[] = [
  {
    name: 'write_note',
    description: 'Write a Note: long-form text worth keeping (an idea, a journal entry, meeting notes, a recipe, a book). Put [[Name]] around people, places and things it mentions, so it links to them. title is optional (the first line otherwise). For one short line about someone, use remember_fact instead.',
    input: z.object({ body: z.string().min(1), title: z.string().optional(), kind: z.enum(KINDS).optional() }),
    run: async (input, os) => {
      const i = input as { body: string; title?: string; kind?: string };
      const n = os.records.create<NoteData>({ object: 'note', title: i.title?.trim() || undefined, data: { body: i.body, kind: i.kind } }, 'assistant');
      const m = mentionsIn(os, i.body, n.id);
      return withExtras(
        { created: n.title, id: n.id, linked: m.filter((x) => x.id).map((x) => x.title), notFound: m.filter((x) => !x.id).map((x) => x.title) },
        { undo: () => os.records.delete(n.id, 'user'), card: { kind: 'record', entityId: n.id, type: 'note', title: n.title, subtitle: n.subtitle ?? undefined } },
      );
    },
  },
  {
    name: 'find_notes',
    description: 'Find your Notes by words in their title or body ("my notes on the Goa trip", "the biryani recipe"), pinned first. kind narrows (idea, journal, meeting, reference, recipe, book). No text lists the latest.',
    input: z.object({ text: z.string().optional(), kind: z.enum(KINDS).optional(), limit: z.number().int().positive().max(50).optional() }),
    run: async (input, os) => {
      const i = input as { text?: string; kind?: string; limit?: number };
      const rows = notes(os, { q: i.text, kind: i.kind, limit: i.limit ?? 10 });
      return withExtras(
        { notes: rows.map((n) => ({ id: n.id, title: n.title, kind: n.data.kind ?? null, text: n.data.body.slice(0, 600), updatedAt: n.updatedAt })) },
        { card: { kind: 'list', title: 'Notes', items: rows.map((n) => ({ entityId: n.id, type: 'note', title: n.title, value: noteSnippet(n.data.body, 40) })) } },
      );
    },
  },
  {
    name: 'what_i_know',
    description: 'Everything the Second Brain holds about someone or something ("what do I know about Karan", "tell me about the flat"): the facts about it, the notes that mention it and what you call it. about is a name or a record id.',
    input: z.object({ about: z.string().min(1) }),
    run: async (input, os) => {
      const k = whatIKnow(os, (input as { about: string }).about);
      const items = [
        ...k.facts.map((f) => ({ title: f.text.replace(/\[\[|\]\]/g, ''), entityId: f.subjectId ?? undefined })),
        ...k.notes.map((n) => ({ entityId: n.id, type: 'note', title: n.title, value: 'note' })),
      ];
      return withExtras(
        { about: k.name, recordId: k.record?.id ?? null, facts: k.facts.map((f) => ({ id: f.id, text: f.text, statedAt: f.statedAt })), notes: k.notes.map((n) => ({ id: n.id, title: n.title, text: String((n.data as { body?: string }).body ?? '').slice(0, 400) })), calledAs: k.aliases.map((a) => a.alias) },
        { card: { kind: 'list', title: `About ${k.name}`, items } },
      );
    },
  },
];
