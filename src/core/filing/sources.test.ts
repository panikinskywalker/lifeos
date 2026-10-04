import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBetterSqliteAdapter } from '../db/betterSqliteAdapter';
import { createLifeOS } from '../lifeos';
import { Registry } from '../registry/registry';
import type { LifeOSContext } from '../registry/context';
import type { ModuleManifest, SourceDef } from '../registry/types';
import { bus } from '../events/bus';
import { runSource } from './sources';
import { sourceState } from '../sources/deviceData';
import { messageList } from './messages';
import { z } from 'zod';

/** A message source hands core its messages; core files them through the parsers and keeps the source's state. */
const noteType = { id: 'note', module: 'm', label: 'Note', labelPlural: 'Notes', icon: 'x', schema: z.object({ body: z.string(), sourceKey: z.string().optional() }), fields: [], computeTitle: (d: { body: string }) => d.body.slice(0, 20) };
const parser = {
  id: 'm.notes',
  module: 'm',
  untrusted: true,
  read: (_os: LifeOSContext, m: { body: string }) => (m.body.startsWith('note:') ? { kind: 'note', text: m.body.slice(5).trim() } : null),
  file: (os: LifeOSContext, _m: unknown, r: { text?: string }, ctx: { id: string }) => {
    const e = os.records.create({ object: 'note', data: { body: String(r.text) } }, 'assistant');
    os.filings.add({ source: 'sms', sourceRef: ctx.id, kind: 'note', entityId: e.id, label: `Note: ${e.title}` });
    return { status: 'confirmed' as const, entityId: e.id };
  },
};
const fake: SourceDef = {
  id: 'fakesms',
  label: 'Fake',
  modules: ['m'],
  kind: 'messages',
  messageSource: 'sms',
  sync: async () => ({ messages: [{ from: 'XX-FAKE', text: 'note: buy milk', at: 1000 }, { from: 'XX-FAKE', text: 'hello', at: 2000 }], cursor: '2000' }),
};
const readings: SourceDef = {
  id: 'fakehealth',
  label: 'Fake health',
  modules: ['m'],
  kind: 'readings',
  sync: async () => ({ readings: [{ object: 'note', sourceKey: 'hc:1', data: { body: 'steps 8000' } }, { object: 'note', sourceKey: 'hc:1', data: { body: 'steps 8100' } }] }),
};
const mod: ModuleManifest = { id: 'm', name: 'm', version: '1', description: '', icon: 'x', color: 'gray', objects: [noteType as never], filing: { parsers: [parser as never] }, sources: [fake, readings] };

let os: LifeOSContext;
beforeEach(async () => {
  bus.clear();
  os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules: [mod], registry: new Registry() });
});
afterEach(() => os.db.close());

describe('running a Source', () => {
  it('messages go through the parsers; what no parser understood from an untrusted sender is dismissed as such; state is kept', async () => {
    expect(os.registry.sources.has('fakesms')).toBe(true);
    const n = await runSource(os, fake);
    expect(n).toBe(1);
    expect(os.records.query('note').map((e) => e.title)).toEqual(['buy milk']);
    const q = messageList(os);
    expect(q.map((i) => i.status).sort()).toEqual(['confirmed', 'dismissed']);
    expect(q.find((i) => i.status === 'dismissed')!.note).toBe('sender not trusted');
    expect(sourceState(os, 'fakesms')).toMatchObject({ enabled: true, total: 1, cursor: '2000', error: null });
    expect(os.filings.toCheck().map((f) => f.label)).toEqual(['Note: buy milk']);
  });

  it('readings become records once per source key; re-syncing updates instead of duplicating', async () => {
    expect(await runSource(os, readings)).toBe(1);
    expect(os.records.query<{ body: string }>('note').map((e) => e.data.body)).toEqual(['steps 8100']);
    expect(await runSource(os, readings)).toBe(0);
    expect(os.records.query('note')).toHaveLength(1);
  });

  it('a failing source records its error and rethrows', async () => {
    const bad: SourceDef = { ...fake, id: 'bad', sync: async () => { throw new Error('IMAP timed out'); } };
    await expect(runSource(os, bad)).rejects.toThrow('IMAP timed out');
    expect(sourceState(os, 'bad').error).toBe('IMAP timed out');
  });
});
