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
  {
    version: 3,
    name: 'cycles-facts-groups-ingest',
    up: [
      // A cycle is "this recurs" on any object (vehicle, subscription, item,
      // routine, person, document). kind: interval | fixed | meter | either
      // (time OR meter, whichever first). History lives on the timeline as
      // `cycle.done` events with meta.cycleId.
      `CREATE TABLE IF NOT EXISTS cycles (
        id TEXT PRIMARY KEY,
        entity_id TEXT NOT NULL,
        name TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('interval', 'fixed', 'meter', 'either')),
        every_n INTEGER,
        every_unit TEXT CHECK (every_unit IS NULL OR every_unit IN ('day', 'week', 'month', 'year')),
        meter TEXT,
        meter_every REAL,
        last_done_at INTEGER,
        last_meter REAL,
        next_due_at INTEGER,
        next_due_meter REAL,
        lead_days INTEGER NOT NULL DEFAULT 0,
        overdue TEXT NOT NULL DEFAULT 'remind',
        cost_estimate REAL,
        currency TEXT,
        vendor_id TEXT,
        notes TEXT,
        prefs TEXT NOT NULL DEFAULT '{}',
        template TEXT,
        snoozed_until INTEGER,
        enabled INTEGER NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted_at INTEGER,
        version INTEGER NOT NULL DEFAULT 1
      )`,
      `CREATE INDEX IF NOT EXISTS idx_cycles_entity ON cycles(entity_id, deleted_at)`,
      `CREATE INDEX IF NOT EXISTS idx_cycles_due ON cycles(deleted_at, enabled, next_due_at)`,
      `CREATE INDEX IF NOT EXISTS idx_timeline_cycle ON timeline_events(json_extract(meta, '$.cycleId'), occurred_at DESC)`,

      // Readings of a meter on an object (odometer km, engine hours, uses).
      `CREATE TABLE IF NOT EXISTS meter_readings (
        id TEXT PRIMARY KEY,
        entity_id TEXT NOT NULL,
        meter TEXT NOT NULL DEFAULT 'odometer',
        value REAL NOT NULL,
        unit TEXT,
        read_at INTEGER NOT NULL,
        source TEXT NOT NULL DEFAULT 'user',
        note TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted_at INTEGER,
        version INTEGER NOT NULL DEFAULT 1
      )`,
      `CREATE INDEX IF NOT EXISTS idx_meter_entity ON meter_readings(entity_id, meter, read_at DESC)`,

      // One-line things said in passing ("Dad hates surprises"). Indexed in
      // entities_fts with type 'fact' alongside records and notes. subject_id
      // links an object; subject_key covers non-object subjects
      // ("category:groceries", "merchant:swiggy").
      `CREATE TABLE IF NOT EXISTS facts (
        id TEXT PRIMARY KEY,
        text TEXT NOT NULL,
        subject_id TEXT,
        subject_key TEXT,
        source TEXT NOT NULL CHECK (source IN ('talk', 'notification', 'note', 'correction', 'user')),
        source_ref TEXT,
        stated_at INTEGER NOT NULL,
        confidence REAL NOT NULL DEFAULT 1,
        active INTEGER NOT NULL DEFAULT 1,
        superseded_by TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted_at INTEGER,
        version INTEGER NOT NULL DEFAULT 1
      )`,
      `CREATE INDEX IF NOT EXISTS idx_facts_subject ON facts(subject_id, active)`,
      `CREATE INDEX IF NOT EXISTS idx_facts_key ON facts(subject_key, active)`,
      `CREATE INDEX IF NOT EXISTS idx_facts_recent ON facts(active, stated_at DESC)`,

      // Members of a Group. The Group itself is an entity (type 'group') so
      // it has a record page, timeline and search. member_id is a person
      // entity id, or 'me' for the owner of the phone.
      `CREATE TABLE IF NOT EXISTS group_members (
        id TEXT PRIMARY KEY,
        group_id TEXT NOT NULL,
        member_id TEXT NOT NULL,
        default_share REAL NOT NULL DEFAULT 1,
        joined_at INTEGER,
        left_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted_at INTEGER,
        version INTEGER NOT NULL DEFAULT 1,
        UNIQUE(group_id, member_id)
      )`,
      `CREATE INDEX IF NOT EXISTS idx_group_members_member ON group_members(member_id)`,

      // Allow-list of Android apps whose notifications are read, and which
      // parser handles each (gpay, phonepe, paytm, hdfc, amex, generic).
      `CREATE TABLE IF NOT EXISTS notification_rules (
        id TEXT PRIMARY KEY,
        package TEXT NOT NULL UNIQUE,
        label TEXT NOT NULL,
        parser TEXT NOT NULL DEFAULT 'generic',
        config TEXT NOT NULL DEFAULT '{}',
        enabled INTEGER NOT NULL DEFAULT 1,
        builtin INTEGER NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted_at INTEGER,
        version INTEGER NOT NULL DEFAULT 1
      )`,

      // Raw captured notifications on their way to becoming records.
      `CREATE TABLE IF NOT EXISTS ingest_queue (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL DEFAULT 'notification',
        package TEXT,
        rule_id TEXT,
        received_at INTEGER NOT NULL,
        raw_title TEXT,
        raw_text TEXT NOT NULL,
        raw_extra TEXT NOT NULL DEFAULT '{}',
        parsed TEXT,
        dedupe_key TEXT,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'proposed', 'confirmed', 'dismissed', 'duplicate', 'failed')),
        entity_id TEXT,
        error TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        version INTEGER NOT NULL DEFAULT 1
      )`,
      `CREATE INDEX IF NOT EXISTS idx_ingest_status ON ingest_queue(status, received_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_ingest_dedupe ON ingest_queue(dedupe_key)`,
    ],
  },
  {
    version: 4,
    name: 'agent-aliases-usage',
    up: [
      // Learned names for records: "the car" → Creta, "Dad" → a person. Written
      // when the user picks one of several matches in Talk. alias_norm is the
      // lower-cased, punctuation-free form used for lookup.
      `CREATE TABLE IF NOT EXISTS aliases (
        id TEXT PRIMARY KEY,
        alias TEXT NOT NULL,
        alias_norm TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        uses INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted_at INTEGER,
        version INTEGER NOT NULL DEFAULT 1,
        UNIQUE(alias_norm, entity_id)
      )`,
      `CREATE INDEX IF NOT EXISTS idx_aliases_norm ON aliases(alias_norm, deleted_at)`,
      // Token use per model call, for You › Agent's usage meter. Device-local.
      `CREATE TABLE IF NOT EXISTS ai_usage (
        id TEXT PRIMARY KEY,
        at INTEGER NOT NULL,
        model TEXT NOT NULL,
        purpose TEXT NOT NULL DEFAULT 'chat',
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        conversation_id TEXT
      )`,
      `CREATE INDEX IF NOT EXISTS idx_ai_usage_at ON ai_usage(at)`,
    ],
  },
  {
    version: 5,
    name: 'ai-usage-provider',
    up: [
      // Which provider served each call (groq / gemini / claude …) so monthly
      // caps apply per provider (SCOPE v2 B5).
      `ALTER TABLE ai_usage ADD COLUMN provider TEXT`,
      `CREATE INDEX IF NOT EXISTS idx_ai_usage_provider ON ai_usage(provider, at)`,
    ],
  },
  {
    version: 6,
    name: 'dumps',
    up: [
      // Brain dumps (PRODUCT v4 §1.3): the raw text exactly as typed, spoken
      // or shared, kept forever. The body can never change and a dump can't be
      // deleted — the triggers refuse it even if a bug tries.
      `CREATE TABLE IF NOT EXISTS dumps (
        id TEXT PRIMARY KEY,
        body TEXT NOT NULL,
        source TEXT NOT NULL CHECK (source IN ('typed', 'voice', 'share')),
        created_at INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'failed', 'skipped')),
        attempts INTEGER NOT NULL DEFAULT 0,
        extracted_at INTEGER,
        error TEXT,
        version INTEGER NOT NULL DEFAULT 1
      )`,
      `CREATE INDEX IF NOT EXISTS idx_dumps_recent ON dumps(created_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_dumps_status ON dumps(status, created_at)`,
      `CREATE TRIGGER IF NOT EXISTS dumps_body_immutable BEFORE UPDATE OF body, source, created_at ON dumps
        WHEN NEW.body IS NOT OLD.body OR NEW.source IS NOT OLD.source OR NEW.created_at IS NOT OLD.created_at
        BEGIN SELECT RAISE(ABORT, 'dumps are immutable'); END`,
      `CREATE TRIGGER IF NOT EXISTS dumps_never_deleted BEFORE DELETE ON dumps
        BEGIN SELECT RAISE(ABORT, 'dumps are kept forever'); END`,
      // What was pulled out of each dump: a record created or updated, a fact,
      // a cycle rolled. Undo marks the row and reverses the change.
      `CREATE TABLE IF NOT EXISTS dump_extractions (
        id TEXT PRIMARY KEY,
        dump_id TEXT NOT NULL REFERENCES dumps(id),
        kind TEXT NOT NULL,
        action TEXT NOT NULL DEFAULT 'created' CHECK (action IN ('created', 'updated', 'logged')),
        entity_id TEXT,
        fact_id TEXT,
        label TEXT NOT NULL,
        undone INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_dump_extractions_dump ON dump_extractions(dump_id)`,
      `CREATE INDEX IF NOT EXISTS idx_dump_extractions_entity ON dump_extractions(entity_id)`,
      // Facts may now come from a dump: SQLite can't widen a CHECK in place,
      // so the table is rebuilt with the same columns and indexes.
      `CREATE TABLE facts_v6 (
        id TEXT PRIMARY KEY,
        text TEXT NOT NULL,
        subject_id TEXT,
        subject_key TEXT,
        source TEXT NOT NULL CHECK (source IN ('talk', 'notification', 'note', 'correction', 'user', 'dump')),
        source_ref TEXT,
        stated_at INTEGER NOT NULL,
        confidence REAL NOT NULL DEFAULT 1,
        active INTEGER NOT NULL DEFAULT 1,
        superseded_by TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted_at INTEGER,
        version INTEGER NOT NULL DEFAULT 1
      )`,
      `INSERT INTO facts_v6 SELECT id, text, subject_id, subject_key, source, source_ref, stated_at, confidence, active, superseded_by, created_at, updated_at, deleted_at, version FROM facts`,
      `DROP TABLE facts`,
      `ALTER TABLE facts_v6 RENAME TO facts`,
      `CREATE INDEX IF NOT EXISTS idx_facts_subject ON facts(subject_id, active)`,
      `CREATE INDEX IF NOT EXISTS idx_facts_key ON facts(subject_key, active)`,
      `CREATE INDEX IF NOT EXISTS idx_facts_recent ON facts(active, stated_at DESC)`,
    ],
  },
];
