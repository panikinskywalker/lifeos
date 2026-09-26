import { createHash } from 'node:crypto';
import { createBetterSqliteAdapter } from './betterSqliteAdapter';
import { BACKUP_EXCLUDED, BACKUP_TABLES } from './backupTables';
import { migrate } from './migrate';
import { migrations } from './migrations';

const fresh = () => {
  const db = createBetterSqliteAdapter(':memory:');
  migrate(db);
  return db;
};
const columns = (db: ReturnType<typeof fresh>, table: string) => db.all<{ name: string }>(`PRAGMA table_info(${table})`).map((c) => c.name);
const now = Date.now();

/**
 * Hash of every shipped migration. Migrations are append-only: when adding
 * v4, append its hash here — never change an existing line.
 */
const SHIPPED: Record<number, string> = {
  1: '03d437bf',
  2: 'd0eb8697',
  3: 'a6ed1728',
  4: 'adca6343',
  5: 'd265f3de',
  6: '7cb74766',
  7: 'd75fea7a',
  8: '57ec5447',
};
const hash = (m: (typeof migrations)[number]) => createHash('sha256').update(JSON.stringify(m)).digest('hex').slice(0, 8);

describe('migrations', () => {
  it('are contiguous from 1 and never edited once shipped', () => {
    expect(migrations.map((m) => m.version)).toEqual(migrations.map((_, i) => i + 1));
    for (const m of migrations) expect({ v: m.version, hash: hash(m) }).toEqual({ v: m.version, hash: SHIPPED[m.version] });
  });

  it('bring a fresh database to the latest version, and re-running is a no-op', () => {
    const db = fresh();
    const latest = migrations[migrations.length - 1]!.version;
    expect(db.get<{ v: number }>('SELECT MAX(version) v FROM _migrations')?.v).toBe(latest);
    expect(migrate(db)).toEqual({ from: latest, to: latest });
  });

  it('v3 creates the cycle, meter, fact, group, notification and ingest tables', () => {
    const db = fresh();
    expect(columns(db, 'cycles')).toEqual(expect.arrayContaining(['entity_id', 'kind', 'every_n', 'every_unit', 'meter', 'meter_every', 'last_done_at', 'next_due_at', 'next_due_meter', 'lead_days', 'cost_estimate', 'vendor_id', 'prefs', 'snoozed_until', 'version', 'deleted_at']));
    expect(columns(db, 'meter_readings')).toEqual(expect.arrayContaining(['entity_id', 'meter', 'value', 'read_at', 'source']));
    expect(columns(db, 'facts')).toEqual(expect.arrayContaining(['text', 'subject_id', 'subject_key', 'source', 'stated_at', 'confidence', 'active', 'superseded_by']));
    expect(columns(db, 'group_members')).toEqual(expect.arrayContaining(['group_id', 'member_id', 'default_share']));
    expect(columns(db, 'notification_rules')).toEqual(expect.arrayContaining(['package', 'label', 'parser', 'enabled']));
    expect(columns(db, 'ingest_queue')).toEqual(expect.arrayContaining(['package', 'raw_text', 'parsed', 'dedupe_key', 'status', 'entity_id']));
    expect(db.all('SELECT name FROM sqlite_master WHERE name = ?', ['groups'])).toEqual([]);
  });

  it('upgrades a v2 database without touching existing data', () => {
    const db = createBetterSqliteAdapter(':memory:');
    migrate(db, migrations.filter((m) => m.version <= 2));
    db.run(`INSERT INTO entities(id, type, title, data, created_at, updated_at) VALUES ('e1', 'vehicle', 'Creta', '{"odometer":35120}', ?, ?)`, [now, now]);
    db.run(`INSERT INTO timeline_events(id, entity_id, kind, title, occurred_at, created_at) VALUES ('t1', 'e1', 'created', 'Created', ?, ?)`, [now, now]);
    expect(migrate(db)).toEqual({ from: 2, to: migrations[migrations.length - 1]!.version });
    expect(db.get<{ title: string; data: string }>(`SELECT title, data FROM entities WHERE id = 'e1'`)).toEqual({ title: 'Creta', data: '{"odometer":35120}' });
    expect(db.get<{ n: number }>('SELECT COUNT(*) n FROM timeline_events')?.n).toBe(1);
  });

  it('enforces cycle kinds, fact sources, ingest statuses and one membership per group', () => {
    const db = fresh();
    const cycle = (kind: string) => db.run(`INSERT INTO cycles(id, entity_id, name, kind, created_at, updated_at) VALUES (?, 'e1', 'Service', ?, ?, ?)`, [kind + now, kind, now, now]);
    for (const k of ['interval', 'fixed', 'meter', 'either']) expect(() => cycle(k)).not.toThrow();
    expect(() => cycle('weekly')).toThrow();
    expect(() => db.run(`INSERT INTO cycles(id, entity_id, name, kind, every_unit, created_at, updated_at) VALUES ('c9', 'e1', 'x', 'interval', 'fortnight', ?, ?)`, [now, now])).toThrow();
    expect(() => db.run(`INSERT INTO facts(id, text, source, stated_at, created_at, updated_at) VALUES ('f1', 'Dad hates surprises', 'gossip', ?, ?, ?)`, [now, now, now])).toThrow();
    expect(() => db.run(`INSERT INTO ingest_queue(id, received_at, raw_text, status, created_at, updated_at) VALUES ('i1', ?, 'Paid ₹719', 'maybe', ?, ?)`, [now, now, now])).toThrow();
    db.run(`INSERT INTO group_members(id, group_id, member_id, created_at, updated_at) VALUES ('m1', 'g1', 'me', ?, ?)`, [now, now]);
    expect(() => db.run(`INSERT INTO group_members(id, group_id, member_id, created_at, updated_at) VALUES ('m2', 'g1', 'me', ?, ?)`, [now, now])).toThrow();
  });

  it('finds cycle history on the timeline through the cycleId index', () => {
    const db = fresh();
    db.run(`INSERT INTO timeline_events(id, entity_id, kind, title, meta, occurred_at, created_at) VALUES ('t1', 'e1', 'cycle.done', 'Serviced', '{"cycleId":"c1","cost":6400}', ?, ?)`, [now, now]);
    db.run(`INSERT INTO timeline_events(id, entity_id, kind, title, meta, occurred_at, created_at) VALUES ('t2', 'e1', 'edited', 'Edited', '{}', ?, ?)`, [now, now]);
    const q = `SELECT id FROM timeline_events WHERE json_extract(meta, '$.cycleId') = ? ORDER BY occurred_at DESC`;
    expect(db.all<{ id: string }>(q, ['c1']).map((r) => r.id)).toEqual(['t1']);
    const plan = db.all<{ detail: string }>(`EXPLAIN QUERY PLAN ${q}`, ['c1']).map((r) => r.detail).join(' ');
    expect(plan).toContain('idx_timeline_cycle');
  });

  it('backs up every table, or says why not', () => {
    const db = fresh();
    const tables = db.all<{ name: string }>(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'entities_fts_%'`).map((r) => r.name);
    const covered = new Set<string>([...BACKUP_TABLES, ...BACKUP_EXCLUDED]);
    expect(tables.filter((t) => !covered.has(t))).toEqual([]);
    expect(BACKUP_TABLES.filter((t) => !tables.includes(t))).toEqual([]);
  });
});
