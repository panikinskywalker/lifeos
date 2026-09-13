/**
 * Versioned, append-only migrations. NEVER edit a shipped migration — add a
 * new one. The schema is deliberately generic: every entity lives in the
 * `entities` envelope with a JSON `data` payload validated by its registered
 * type, so new modules/entity types/fields need no migration. Side tables are
 * universal (timeline, attachments, reminders, tags, relations, comments...)
 * and every row carries what a future sync layer needs (uuid ids, version,
 * updated_at, soft-delete tombstones, a change log).
 */
export interface Migration {
  version: number;
  name: string;
  up: string[];
  /** Alternative statements when `up` fails (platform lacks a feature). */
  fallback?: string[];
}

export const migrations: Migration[] = [
  {
    version: 1,
    name: 'core-envelope',
    up: [
      `CREATE TABLE IF NOT EXISTS entities (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        subtitle TEXT,
        data TEXT NOT NULL DEFAULT '{}',
        status TEXT,
        starred INTEGER NOT NULL DEFAULT 0,
        archived INTEGER NOT NULL DEFAULT 0,
        occurred_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted_at INTEGER,
        version INTEGER NOT NULL DEFAULT 1
      )`,
      `CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(type, deleted_at, updated_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_entities_occurred ON entities(type, occurred_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_entities_status ON entities(type, status)`,

      `CREATE TABLE IF NOT EXISTS relations (
        id TEXT PRIMARY KEY,
        from_id TEXT NOT NULL,
        to_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        meta TEXT NOT NULL DEFAULT '{}',
        created_at INTEGER NOT NULL,
        deleted_at INTEGER,
        version INTEGER NOT NULL DEFAULT 1,
        UNIQUE(from_id, to_id, kind)
      )`,
      `CREATE INDEX IF NOT EXISTS idx_relations_from ON relations(from_id, kind)`,
      `CREATE INDEX IF NOT EXISTS idx_relations_to ON relations(to_id, kind)`,

      `CREATE TABLE IF NOT EXISTS timeline_events (
        id TEXT PRIMARY KEY,
        entity_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT,
        actor TEXT NOT NULL DEFAULT 'user',
        meta TEXT NOT NULL DEFAULT '{}',
        occurred_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_timeline_entity ON timeline_events(entity_id, occurred_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_timeline_time ON timeline_events(occurred_at DESC)`,

      `CREATE TABLE IF NOT EXISTS attachments (
        id TEXT PRIMARY KEY,
        entity_id TEXT NOT NULL,
        name TEXT NOT NULL,
        mime TEXT,
        size INTEGER,
        uri TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'file',
        created_at INTEGER NOT NULL,
        deleted_at INTEGER,
        version INTEGER NOT NULL DEFAULT 1
      )`,
      `CREATE INDEX IF NOT EXISTS idx_attachments_entity ON attachments(entity_id)`,

      `CREATE TABLE IF NOT EXISTS reminders (
        id TEXT PRIMARY KEY,
        entity_id TEXT,
        title TEXT NOT NULL,
        body TEXT,
        due_at INTEGER NOT NULL,
        rrule TEXT,
        next_at INTEGER,
        done_at INTEGER,
        snoozed_until INTEGER,
        notification_id TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted_at INTEGER,
        version INTEGER NOT NULL DEFAULT 1
      )`,
      `CREATE INDEX IF NOT EXISTS idx_reminders_due ON reminders(done_at, next_at)`,
      `CREATE INDEX IF NOT EXISTS idx_reminders_entity ON reminders(entity_id)`,

      `CREATE TABLE IF NOT EXISTS tags (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE COLLATE NOCASE,
        color TEXT,
        created_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS entity_tags (
        entity_id TEXT NOT NULL,
        tag_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY(entity_id, tag_id)
      )`,
      `CREATE INDEX IF NOT EXISTS idx_entity_tags_tag ON entity_tags(tag_id)`,

      `CREATE TABLE IF NOT EXISTS custom_field_defs (
        id TEXT PRIMARY KEY,
        entity_type TEXT NOT NULL,
        key TEXT NOT NULL,
        label TEXT NOT NULL,
        field_type TEXT NOT NULL,
        options TEXT NOT NULL DEFAULT '{}',
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        deleted_at INTEGER,
        UNIQUE(entity_type, key)
      )`,

      `CREATE TABLE IF NOT EXISTS comments (
        id TEXT PRIMARY KEY,
        entity_id TEXT NOT NULL,
        body TEXT NOT NULL,
        author TEXT NOT NULL DEFAULT 'user',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted_at INTEGER,
        version INTEGER NOT NULL DEFAULT 1
      )`,
      `CREATE INDEX IF NOT EXISTS idx_comments_entity ON comments(entity_id, created_at)`,

      `CREATE TABLE IF NOT EXISTS saved_views (
        id TEXT PRIMARY KEY,
        entity_type TEXT NOT NULL,
        name TEXT NOT NULL,
        icon TEXT,
        definition TEXT NOT NULL,
        is_default INTEGER NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted_at INTEGER
      )`,

      `CREATE TABLE IF NOT EXISTS dashboards (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        icon TEXT,
        layout TEXT NOT NULL DEFAULT '[]',
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted_at INTEGER
      )`,

      `CREATE TABLE IF NOT EXISTS automation_rules (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        trigger TEXT NOT NULL,
        conditions TEXT NOT NULL DEFAULT '[]',
        actions TEXT NOT NULL DEFAULT '[]',
        last_run_at INTEGER,
        run_count INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted_at INTEGER
      )`,
      `CREATE TABLE IF NOT EXISTS automation_runs (
        id TEXT PRIMARY KEY,
        rule_id TEXT NOT NULL,
        status TEXT NOT NULL,
        trigger_payload TEXT,
        log TEXT NOT NULL DEFAULT '[]',
        started_at INTEGER NOT NULL,
        finished_at INTEGER
      )`,
      `CREATE INDEX IF NOT EXISTS idx_runs_rule ON automation_runs(rule_id, started_at DESC)`,

      `CREATE TABLE IF NOT EXISTS scheduled_jobs (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        payload TEXT NOT NULL DEFAULT '{}',
        rrule TEXT,
        next_at INTEGER NOT NULL,
        last_at INTEGER,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_jobs_next ON scheduled_jobs(enabled, next_at)`,

      `CREATE TABLE IF NOT EXISTS modules (
        id TEXT PRIMARY KEY,
        version TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        settings TEXT NOT NULL DEFAULT '{}',
        installed_at INTEGER NOT NULL
      )`,

      `CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )`,

      `CREATE TABLE IF NOT EXISTS ai_messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_ai_conv ON ai_messages(conversation_id, created_at)`,

      // Sync-readiness: every local mutation is appended here. A future sync
      // engine replays this log against a remote and clears acknowledged rows.
      `CREATE TABLE IF NOT EXISTS changes (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        tbl TEXT NOT NULL,
        row_id TEXT NOT NULL,
        op TEXT NOT NULL,
        version INTEGER NOT NULL,
        at INTEGER NOT NULL,
        synced_at INTEGER
      )`,
      `CREATE INDEX IF NOT EXISTS idx_changes_unsynced ON changes(synced_at, seq)`,
    ],
  },
  {
    version: 2,
    name: 'full-text-search',
    up: [
      `CREATE VIRTUAL TABLE IF NOT EXISTS entities_fts USING fts5(
        id UNINDEXED, type UNINDEXED, title, subtitle, body, tokenize='unicode61 remove_diacritics 2'
      )`,
    ],
    // wa-sqlite (web) ships without FTS5: fall back to a plain table + LIKE.
    fallback: [
      `CREATE TABLE IF NOT EXISTS entities_fts (id TEXT PRIMARY KEY, type TEXT, title TEXT, subtitle TEXT, body TEXT)`,
      `CREATE INDEX IF NOT EXISTS idx_fts_title ON entities_fts(title)`,
    ],
  },
];
