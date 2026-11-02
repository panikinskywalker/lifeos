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
  it('dumps: filed ones leave the Dump list and search after 15 days; the row and its provenance stay; unfiled ones stay', () => {
    const now = Date.now();
    const old = os.dumps.add({ body: 'paid the plumber 800', createdAt: now - 16 * DAY });
    const skipped = os.dumps.add({ body: 'plumber thoughts, nothing to file', createdAt: now - 20 * DAY });
    const waiting = os.dumps.add({ body: 'plumber again, waiting on a model', createdAt: now - 30 * DAY });
    const fresh = os.dumps.add({ body: 'plumber comes Tuesday', createdAt: now - 14 * DAY });
    os.filings.add({ dumpId: old.id, kind: 'task', entityId: 'e1', label: 'Pay the plumber' });
    os.dumps.setStatus(old.id, 'done');
    os.dumps.setStatus(skipped.id, 'skipped');
    os.dumps.setStatus(fresh.id, 'done');

    expect(os.dumps.clearOld(15, now)).toBe(2);
    expect(found('plumber').sort()).toEqual([waiting.id, fresh.id].sort());
    expect(os.dumps.recent({ days: 15, now }).map((d) => d.id)).toEqual([fresh.id, waiting.id]);
    // Kept as provenance: the row, and "Dumps that mention it" on the record.
    expect(os.dumps.get(old.id)?.body).toBe('paid the plumber 800');
    expect(os.dumps.forEntity('e1').map((d) => d.id)).toEqual([old.id]);
    // Running again clears nothing new; an index rebuild doesn't bring them back.
    expect(os.dumps.clearOld(15, now)).toBe(0);
    os.dumps.reindex(now);
    expect(found('plumber').sort()).toEqual([waiting.id, fresh.id].sort());
  });

  it('runs the three jobs once a day, counts each and keeps the last 30 runs', () => {
    const now = Date.now();
    const d = os.dumps.add({ body: 'met Karan at the gym', createdAt: now - 20 * DAY });
    os.dumps.setStatus(d.id, 'done');
    const f = os.filings.add({ dumpId: d.id, kind: 'person', entityId: 'p1', label: 'Karan' });
    os.db.run(`UPDATE filings SET created_at=? WHERE id=?`, [now - 20 * DAY, f.id]);

    const first = pruneIfDue(os, now);
    expect(first).toMatchObject({ at: now, toCheckApproved: 1, dumpsCleared: 1, ignoredMessages: 0, rawTexts: 0 });
    expect(os.filings.get(f.id)).toMatchObject({ checked: true, undone: false });
    expect(pruneIfDue(os, now + DAY - 1)).toBeNull();
    expect(pruneIfDue(os, now + DAY)).toMatchObject({ toCheckApproved: 0, dumpsCleared: 0 });
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
