import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBetterSqliteAdapter } from './db/betterSqliteAdapter';
import { createLifeOS } from './lifeos';
import { Registry } from './registry/registry';
import type { LifeOSContext } from './registry/context';
import { bus } from './events/bus';
import { pruneIfDue, retentionLog, runRetention } from './sources/retention';

const DAY = 86_400_000;
let os: LifeOSContext;
beforeEach(async () => {
  bus.clear();
  os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules: [], registry: new Registry() });
});
afterEach(() => os.db.close());

const found = (q: string) => os.records.search.search(q, { types: ['dump'] }).map((h) => h.id);

describe('retention (MODEL layer 6, R15)', () => {
  it('dumps: filed ones go after 15 days unless a Fact or a Note came from them; unfiled ones stay', () => {
    const now = Date.now();
    const old = os.dumps.add({ body: 'paid the plumber 800', createdAt: now - 16 * DAY });
    const skipped = os.dumps.add({ body: 'plumber thoughts, nothing to file', createdAt: now - 20 * DAY });
    const waiting = os.dumps.add({ body: 'plumber again, waiting on a model', createdAt: now - 30 * DAY });
    const fresh = os.dumps.add({ body: 'plumber comes Tuesday', createdAt: now - 14 * DAY });
    const fact = os.dumps.add({ body: 'the plumber is called Ramesh', createdAt: now - 40 * DAY });
    const note = os.dumps.add({ body: 'plumber tips for the monsoon', createdAt: now - 40 * DAY });
    const undoneFact = os.dumps.add({ body: 'plumber lives in Thane', createdAt: now - 40 * DAY });
    const task = os.filings.add({ dumpId: old.id, kind: 'task', entityId: 'e1', label: 'Pay the plumber' });
    const f = os.facts.add({ text: 'The plumber is Ramesh', source: 'dump', sourceRef: fact.id });
    os.filings.add({ dumpId: fact.id, kind: 'fact', factId: f.id, label: 'The plumber is Ramesh' });
    os.filings.add({ dumpId: note.id, kind: 'note', entityId: 'n1', label: 'Monsoon tips' });
    os.filings.markUndone(os.filings.add({ dumpId: undoneFact.id, kind: 'fact', factId: 'f-gone', label: 'Thane' }).id);
    for (const d of [old, fresh, fact, note, undoneFact]) os.dumps.setStatus(d.id, 'done');
    os.dumps.setStatus(skipped.id, 'skipped');

    expect(os.dumps.deleteOld(15, now)).toBe(3);
    expect([old, skipped, undoneFact].map((d) => os.dumps.get(d.id))).toEqual([null, null, null]);
    expect([waiting, fresh, fact, note].every((d) => os.dumps.get(d.id))).toBe(true);
    expect(found('plumber').sort()).toEqual([waiting.id, fresh.id, fact.id, note.id].sort());
    // What it filed stays, without the link to the dump.
    expect(os.filings.get(task.id)).toMatchObject({ dumpId: null, label: 'Pay the plumber', entityId: 'e1' });
    // The Dump list: the last 15 days and anything not filed yet.
    expect(os.dumps.recent({ days: 15, now }).map((d) => d.id)).toEqual([fresh.id, waiting.id]);
    expect(os.dumps.deleteOld(15, now)).toBe(0);
  });

  it('the database still refuses deleting a dump not filed yet or younger than 15 days', () => {
    const young = os.dumps.add({ body: 'filed today' });
    os.dumps.setStatus(young.id, 'done');
    const unfiled = os.dumps.add({ body: 'not filed', createdAt: Date.now() - 30 * DAY });
    for (const d of [young, unfiled]) expect(() => os.db.run(`DELETE FROM dumps WHERE id=?`, [d.id])).toThrow(/kept until it is filed/);
  });

  it('runs the three jobs once a day, counts each and keeps the last 30 runs', () => {
    const now = Date.now();
    const d = os.dumps.add({ body: 'met Karan at the gym', createdAt: now - 20 * DAY });
    os.dumps.setStatus(d.id, 'done');
    const f = os.filings.add({ dumpId: d.id, kind: 'person', entityId: 'p1', label: 'Karan' });
    os.db.run(`UPDATE filings SET created_at=? WHERE id=?`, [now - 20 * DAY, f.id]);

    const first = pruneIfDue(os, now);
    expect(first).toMatchObject({ at: now, toCheckApproved: 1, dumpsDeleted: 1, ignoredMessages: 0, rawTexts: 0 });
    expect(os.filings.get(f.id)).toMatchObject({ checked: true, undone: false });
    expect(pruneIfDue(os, now + DAY - 1)).toBeNull();
    expect(pruneIfDue(os, now + DAY)).toMatchObject({ toCheckApproved: 0, dumpsDeleted: 0 });
    expect(retentionLog(os).map((r) => r.at)).toEqual([now + DAY, now]);

    for (let i = 0; i < 40; i++) runRetention(os, now + (i + 2) * DAY);
    expect(retentionLog(os)).toHaveLength(30);
    expect(retentionLog(os)[0].at).toBe(now + 41 * DAY);
  });

  it('To check: untouched for 15 days is ticked; undone or recent ones are left', () => {
    const now = Date.now();
    const a = os.filings.add({ kind: 'task', label: 'old' });
    const b = os.filings.add({ kind: 'task', label: 'undone' });
    const c = os.filings.add({ kind: 'task', label: 'recent' });
    os.db.run(`UPDATE filings SET created_at=? WHERE id IN (?,?)`, [now - 16 * DAY, a.id, b.id]);
    os.filings.markUndone(b.id);
    expect(runRetention(os, now).toCheckApproved).toBe(1);
    expect(os.filings.toCheck().map((x) => x.id)).toEqual([c.id]);
  });
});
