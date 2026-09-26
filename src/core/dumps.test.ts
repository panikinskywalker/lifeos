import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBetterSqliteAdapter } from './db/betterSqliteAdapter';
import { createLifeOS } from './lifeos';
import { Registry } from './registry/registry';
import type { LifeOSContext } from './registry/context';
import { bus } from './events/bus';

let os: LifeOSContext;
beforeEach(async () => {
  bus.clear();
  os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules: [], registry: new Registry() });
});
afterEach(() => os.db.close());

describe('dumps (PRODUCT v4 §1.3)', () => {
  it('keeps the raw text verbatim and refuses edits or deletes', () => {
    const body = '  made a new friend today, Karan…\n\nworks at Zomato  ';
    const d = os.dumps.add({ body, source: 'voice' });
    expect(os.dumps.get(d.id)).toMatchObject({ body, source: 'voice', status: 'pending', attempts: 0 });
    expect(() => os.db.run(`UPDATE dumps SET body='edited' WHERE id=?`, [d.id])).toThrow(/immutable/);
    expect(() => os.db.run(`DELETE FROM dumps WHERE id=?`, [d.id])).toThrow(/forever/);
    expect(() => os.dumps.add({ body: '   ' })).toThrow();
  });

  it('tracks extraction status and what came out, with undo marks', () => {
    const d = os.dumps.add({ body: 'call the landlord about the leak' });
    expect(os.dumps.pending().map((x) => x.id)).toEqual([d.id]);
    os.dumps.setStatus(d.id, 'failed', 'offline');
    expect(os.dumps.get(d.id)).toMatchObject({ status: 'failed', attempts: 1, error: 'offline' });
    const x = os.dumps.addExtraction({ dumpId: d.id, kind: 'task', entityId: 'e1', label: 'Call the landlord' });
    os.dumps.setStatus(d.id, 'done');
    expect(os.dumps.get(d.id)!.extractedAt).not.toBeNull();
    expect(os.dumps.pending()).toEqual([]);
    expect(os.dumps.forEntity('e1').map((y) => y.id)).toEqual([d.id]);
    os.dumps.markUndone(x.id);
    expect(os.dumps.extractions(d.id)[0]).toMatchObject({ undone: true });
    expect(os.dumps.forEntity('e1')).toEqual([]);
  });

  it('is searchable next to records and survives an index rebuild', () => {
    const d = os.dumps.add({ body: 'the landlord said the plumber comes Tuesday' });
    expect(os.entities.search.search('plumber').map((h) => [h.id, h.type])).toEqual([[d.id, 'dump']]);
    os.entities.search.rebuild([], () => undefined);
    expect(os.entities.search.search('plumber')).toHaveLength(1);
  });

  it('facts can come from a dump (v6 widened the source)', () => {
    const d = os.dumps.add({ body: 'Karan works at Zomato' });
    expect(os.facts.add({ text: 'Karan works at Zomato', source: 'dump', sourceRef: d.id }).source).toBe('dump');
  });
});

describe('search covers what hangs on a record', () => {
  it('notes (comments), tags and attachment names are searchable and follow edits', async () => {
    const { z } = await import('zod');
    const reg = new Registry();
    const o = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), registry: reg, modules: [{ id: 'm', name: 'm', version: '1', description: '', icon: 'x', color: '#000', entityTypes: [{ type: 'thing', module: 'm', label: 'Thing', labelPlural: 'Things', icon: 'box', schema: z.object({}), fields: [] }] }] });
    const e = o.entities.create({ type: 'thing', title: 'Balcony', data: {} });
    const ids = (q: string) => o.entities.search.search(q).map((h) => h.id);
    const c = o.comments.add(e.id, 'the plumber fixed the leak');
    o.tags.apply(e.id, 'renovation');
    o.attachments.add({ entityId: e.id, name: 'quote-marble.pdf', uri: 'file://x', mime: 'application/pdf', size: 1, kind: 'file' });
    expect(ids('plumber')).toEqual([e.id]);
    expect(ids('renovation')).toEqual([e.id]);
    expect(ids('marble')).toEqual([e.id]);
    o.comments.remove(c.id);
    expect(ids('plumber')).toEqual([]);
    expect(o.settings.get('search.indexV2', false)).toBe(true);
    o.db.close();
  });
});
