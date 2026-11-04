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
  },  {
    version: 7,
    name: 'life-graph',
    up: [
      // Links become the graph's edges (docs/GRAPH.md): where each came from
      // (a dump, a record page, SMS, you), how sure the agent was, and when
      // it holds ("worked at Zomato until 2025").
      `ALTER TABLE relations ADD COLUMN source TEXT`,
      `ALTER TABLE relations ADD COLUMN source_id TEXT`,
      `ALTER TABLE relations ADD COLUMN confidence REAL NOT NULL DEFAULT 1`,
      `ALTER TABLE relations ADD COLUMN valid_from INTEGER`,
      `ALTER TABLE relations ADD COLUMN valid_to INTEGER`,
      `CREATE INDEX IF NOT EXISTS idx_relations_source ON relations(source_id)`,
      // Speaking on a record's page files into that record.
      `ALTER TABLE dumps ADD COLUMN subject_id TEXT`,
      // The To check log: every write the agent made from a dump, with what it
      // replaced (so cancel reverses exactly that, even after a restart), how
      // sure it was, and whether you've ticked it.
      `ALTER TABLE dump_extractions ADD COLUMN relation_id TEXT`,
      `ALTER TABLE dump_extractions ADD COLUMN before TEXT`,
      `ALTER TABLE dump_extractions ADD COLUMN confidence REAL NOT NULL DEFAULT 1`,
      `ALTER TABLE dump_extractions ADD COLUMN flag TEXT`,
      `ALTER TABLE dump_extractions ADD COLUMN checked INTEGER NOT NULL DEFAULT 0`,
      `CREATE INDEX IF NOT EXISTS idx_dump_extractions_check ON dump_extractions(checked, undone, created_at DESC)`,
    ],
  },  {
    version: 8,
    name: 'filing-queue',
    up: [
      // A dump waiting on a provider (rate limit, daily quota, offline) is not
      // failed: it waits until retry_at, and filing resumes where it stopped.
      `ALTER TABLE dumps ADD COLUMN retry_at INTEGER`,
      `ALTER TABLE dumps ADD COLUMN progress TEXT`,
      // Questions asked while no model was free: answered when one is.
      `CREATE TABLE IF NOT EXISTS queued_questions (
        id TEXT PRIMARY KEY,
        text TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'answered', 'failed')),
        answer TEXT,
        answered_at INTEGER,
        retry_at INTEGER,
        attempts INTEGER NOT NULL DEFAULT 0
      )`,
      `CREATE INDEX IF NOT EXISTS idx_queued_questions ON queued_questions(status, created_at)`,
    ],
  },  {
    version: 9,
    name: 'data-sources',
    up: [
      // To check also lists what SMS, notifications and other sources filed:
      // dump_id becomes optional and each row says where it came from.
      `CREATE TABLE dump_extractions_v9 (
        id TEXT PRIMARY KEY,
        dump_id TEXT REFERENCES dumps(id),
        kind TEXT NOT NULL,
        action TEXT NOT NULL DEFAULT 'created' CHECK (action IN ('created', 'updated', 'logged')),
        entity_id TEXT,
        fact_id TEXT,
        label TEXT NOT NULL,
        undone INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        relation_id TEXT,
        before TEXT,
        confidence REAL NOT NULL DEFAULT 1,
        flag TEXT,
        checked INTEGER NOT NULL DEFAULT 0,
        source TEXT NOT NULL DEFAULT 'dump',
        source_ref TEXT
      )`,
      `INSERT INTO dump_extractions_v9 (id, dump_id, kind, action, entity_id, fact_id, label, undone, created_at, relation_id, before, confidence, flag, checked)
         SELECT id, dump_id, kind, action, entity_id, fact_id, label, undone, created_at, relation_id, before, confidence, flag, checked FROM dump_extractions`,
      `DROP TABLE dump_extractions`,
      `ALTER TABLE dump_extractions_v9 RENAME TO dump_extractions`,
      `CREATE INDEX IF NOT EXISTS idx_dump_extractions_dump ON dump_extractions(dump_id)`,
      `CREATE INDEX IF NOT EXISTS idx_dump_extractions_entity ON dump_extractions(entity_id)`,
      `CREATE INDEX IF NOT EXISTS idx_dump_extractions_check ON dump_extractions(checked, undone, created_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_dump_extractions_source ON dump_extractions(source, source_ref)`,
      // Who sends bank/card/UPI texts, and whether to trust them (ticked in You › Data sources › SMS).
      `CREATE TABLE IF NOT EXISTS sms_senders (
        address TEXT PRIMARY KEY,
        bank TEXT,
        trusted INTEGER NOT NULL DEFAULT 0,
        decided INTEGER NOT NULL DEFAULT 0,
        count INTEGER NOT NULL DEFAULT 0,
        first_seen INTEGER NOT NULL,
        last_seen INTEGER NOT NULL,
        sample TEXT
      )`,
      // One row per data source (sms, notifications, health, usage, contacts, calendar, gmail…).
      `CREATE TABLE IF NOT EXISTS source_state (
        id TEXT PRIMARY KEY,
        enabled INTEGER NOT NULL DEFAULT 0,
        last_sync INTEGER,
        cursor TEXT,
        total INTEGER NOT NULL DEFAULT 0,
        error TEXT,
        updated_at INTEGER NOT NULL
      )`,
      // Screen time from Android UsageStats, per day and per app per day.
      `CREATE TABLE IF NOT EXISTS usage_daily (
        day TEXT PRIMARY KEY,
        total_ms INTEGER NOT NULL DEFAULT 0,
        pickups INTEGER,
        first_use INTEGER,
        last_use INTEGER,
        updated_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS usage_app_daily (
        day TEXT NOT NULL,
        package TEXT NOT NULL,
        label TEXT,
        ms INTEGER NOT NULL DEFAULT 0,
        launches INTEGER,
        PRIMARY KEY (day, package)
      )`,
    ],
  },  {
    version: 10,
    name: 'speed',
    up: [
      // "Is this SMS a payment you already filed?" looks up by the record it became.
      `CREATE INDEX IF NOT EXISTS idx_ingest_entity ON ingest_queue(entity_id)`,
      `CREATE INDEX IF NOT EXISTS idx_ingest_received ON ingest_queue(received_at)`,
      `CREATE INDEX IF NOT EXISTS idx_timeline_kind_time ON timeline_events(kind, occurred_at)`,
    ],
  },
  {
    version: 11,
    name: 'vocabulary',
    // docs/MODEL.md §1: the tables say what the app says. entities → records
    // (column type → object), relations → links, timeline_events → events,
    // entity_tags → record_tags, every entity_id → record_id, every
    // entity_type → object. The search index is rebuilt as records_fts with an
    // `object` column (FTS5 cannot rename a column). The old widget dashboards
    // table goes. Indexes keep their names; SQLite rewrites them on rename.
    up: [
      `ALTER TABLE entities RENAME TO records`,
      `ALTER TABLE records RENAME COLUMN type TO object`,
      `ALTER TABLE relations RENAME TO links`,
      `ALTER TABLE timeline_events RENAME TO events`,
      `ALTER TABLE events RENAME COLUMN entity_id TO record_id`,
      `ALTER TABLE entity_tags RENAME TO record_tags`,
      `ALTER TABLE record_tags RENAME COLUMN entity_id TO record_id`,
      `ALTER TABLE attachments RENAME COLUMN entity_id TO record_id`,
      `ALTER TABLE reminders RENAME COLUMN entity_id TO record_id`,
      `ALTER TABLE comments RENAME COLUMN entity_id TO record_id`,
      `ALTER TABLE cycles RENAME COLUMN entity_id TO record_id`,
      `ALTER TABLE meter_readings RENAME COLUMN entity_id TO record_id`,
      `ALTER TABLE ingest_queue RENAME COLUMN entity_id TO record_id`,
      `ALTER TABLE aliases RENAME COLUMN entity_id TO record_id`,
      `ALTER TABLE dump_extractions RENAME COLUMN entity_id TO record_id`,
      `ALTER TABLE custom_field_defs RENAME COLUMN entity_type TO object`,
      `ALTER TABLE saved_views RENAME COLUMN entity_type TO object`,
      `CREATE VIRTUAL TABLE IF NOT EXISTS records_fts USING fts5(
        id UNINDEXED, object UNINDEXED, title, subtitle, body, tokenize='unicode61 remove_diacritics 2'
      )`,
      `INSERT INTO records_fts(id, object, title, subtitle, body) SELECT id, type, title, subtitle, body FROM entities_fts`,
      `DROP TABLE entities_fts`,
      `DROP TABLE IF EXISTS dashboards`,
      `UPDATE changes SET tbl = 'records' WHERE tbl = 'entities'`,
      `UPDATE changes SET tbl = 'links' WHERE tbl = 'relations'`,
    ],
    // Web (wa-sqlite, no FTS5): the same renames with a plain search table.
    fallback: [
      `ALTER TABLE entities RENAME TO records`,
      `ALTER TABLE records RENAME COLUMN type TO object`,
      `ALTER TABLE relations RENAME TO links`,
      `ALTER TABLE timeline_events RENAME TO events`,
      `ALTER TABLE events RENAME COLUMN entity_id TO record_id`,
      `ALTER TABLE entity_tags RENAME TO record_tags`,
      `ALTER TABLE record_tags RENAME COLUMN entity_id TO record_id`,
      `ALTER TABLE attachments RENAME COLUMN entity_id TO record_id`,
      `ALTER TABLE reminders RENAME COLUMN entity_id TO record_id`,
      `ALTER TABLE comments RENAME COLUMN entity_id TO record_id`,
      `ALTER TABLE cycles RENAME COLUMN entity_id TO record_id`,
      `ALTER TABLE meter_readings RENAME COLUMN entity_id TO record_id`,
      `ALTER TABLE ingest_queue RENAME COLUMN entity_id TO record_id`,
      `ALTER TABLE aliases RENAME COLUMN entity_id TO record_id`,
      `ALTER TABLE dump_extractions RENAME COLUMN entity_id TO record_id`,
      `ALTER TABLE custom_field_defs RENAME COLUMN entity_type TO object`,
      `ALTER TABLE saved_views RENAME COLUMN entity_type TO object`,
      `CREATE TABLE IF NOT EXISTS records_fts (id TEXT PRIMARY KEY, object TEXT, title TEXT, subtitle TEXT, body TEXT)`,
      `CREATE INDEX IF NOT EXISTS idx_records_fts_title ON records_fts(title)`,
      `INSERT INTO records_fts(id, object, title, subtitle, body) SELECT id, type, title, subtitle, body FROM entities_fts`,
      `DROP TABLE entities_fts`,
      `DROP TABLE IF EXISTS dashboards`,
      `UPDATE changes SET tbl = 'records' WHERE tbl = 'entities'`,
      `UPDATE changes SET tbl = 'links' WHERE tbl = 'relations'`,
    ],
  },
  {
    version: 12,
    name: 'comments-are-facts',
    // docs/MODEL.md §1: a note typed on a record is a Fact about it. Facts gain
    // the source 'automation' (a CHECK cannot be widened in place, so the table
    // is rebuilt as in v7), every comment becomes a fact with the record as its
    // subject, and the comments table goes.
    up: [
      `CREATE TABLE facts_v12 (
        id TEXT PRIMARY KEY,
        text TEXT NOT NULL,
        subject_id TEXT,
        subject_key TEXT,
        source TEXT NOT NULL CHECK (source IN ('talk', 'notification', 'note', 'correction', 'user', 'dump', 'automation')),
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
      `INSERT INTO facts_v12 SELECT id, text, subject_id, subject_key, source, source_ref, stated_at, confidence, active, superseded_by, created_at, updated_at, deleted_at, version FROM facts`,
      `INSERT INTO facts_v12(id, text, subject_id, source, stated_at, created_at, updated_at, deleted_at)
         SELECT id, body, record_id, CASE author WHEN 'assistant' THEN 'talk' WHEN 'automation' THEN 'automation' ELSE 'user' END, created_at, created_at, updated_at, deleted_at FROM comments`,
      `DROP TABLE facts`,
      `ALTER TABLE facts_v12 RENAME TO facts`,
      `CREATE INDEX IF NOT EXISTS idx_facts_subject ON facts(subject_id, active)`,
      `CREATE INDEX IF NOT EXISTS idx_facts_key ON facts(subject_key, active)`,
      `CREATE INDEX IF NOT EXISTS idx_facts_recent ON facts(active, stated_at DESC)`,
      `DROP TABLE comments`,
      `UPDATE changes SET tbl = 'facts' WHERE tbl = 'comments'`,
    ],
  },
  {
    version: 13,
    name: 'filings',
    // docs/MODEL.md §4: what filing wrote — from a dump or a message — are
    // filings. Same rows, the vocabulary name.
    up: [
      `ALTER TABLE dump_extractions RENAME TO filings`,
      `UPDATE changes SET tbl = 'filings' WHERE tbl = 'dump_extractions'`,
    ],
  },
  {
    version: 14,
    name: 'outbox',
    // docs/MODEL.md layer 4 (R9c.2): changes made in LifeOS for a source that
    // also writes (Turf web), waiting in order until it answers.
    up: [
      `CREATE TABLE IF NOT EXISTS outbox (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        seq INTEGER NOT NULL,
        payload TEXT NOT NULL,
        label TEXT NOT NULL,
        record_id TEXT,
        state TEXT NOT NULL CHECK (state IN ('waiting', 'sent', 'refused')),
        error TEXT,
        result TEXT,
        attempts INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_outbox_source ON outbox(source, state, seq)`,
      `CREATE INDEX IF NOT EXISTS idx_outbox_record ON outbox(record_id)`,
    ],
  },
  {
    version: 15,
    name: 'facts-from-notion',
    // docs/MODEL.md layer 4 (R2b): a bullet or a Last Update? read from your
    // Notion People CRM is a Fact with the source 'notion' (a CHECK cannot be
    // widened in place, so the table is rebuilt as in v12).
    up: [
      `CREATE TABLE facts_v15 (
        id TEXT PRIMARY KEY,
        text TEXT NOT NULL,
        subject_id TEXT,
        subject_key TEXT,
        source TEXT NOT NULL CHECK (source IN ('talk', 'notification', 'note', 'correction', 'user', 'dump', 'automation', 'notion')),
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
      `INSERT INTO facts_v15 SELECT id, text, subject_id, subject_key, source, source_ref, stated_at, confidence, active, superseded_by, created_at, updated_at, deleted_at, version FROM facts`,
      `DROP TABLE facts`,
      `ALTER TABLE facts_v15 RENAME TO facts`,
      `CREATE INDEX IF NOT EXISTS idx_facts_subject ON facts(subject_id, active)`,
      `CREATE INDEX IF NOT EXISTS idx_facts_key ON facts(subject_key, active)`,
      `CREATE INDEX IF NOT EXISTS idx_facts_recent ON facts(active, stated_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_facts_source_ref ON facts(source_ref)`,
    ],
  },
  {
    version: 16,
    name: 'brain',
    // docs/MODEL.md layer 8, slice 3: the nudges a pass filed, what the brain
    // has learned (answers by key, Not this), its Skills, and the Sent to
    // Claude log.
    up: [
      `CREATE TABLE IF NOT EXISTS nudges (
        id TEXT PRIMARY KEY,
        key TEXT NOT NULL,
        module TEXT NOT NULL,
        kind TEXT NOT NULL,
        shape TEXT NOT NULL CHECK (shape IN ('done', 'check', 'ask')),
        pass_id TEXT NOT NULL,
        filing_id TEXT,
        record_id TEXT,
        route TEXT,
        title TEXT NOT NULL,
        line TEXT NOT NULL,
        yes TEXT,
        urgent INTEGER NOT NULL DEFAULT 0,
        payload TEXT,
        undo TEXT,
        state TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'yes', 'no', 'later', 'undone')),
        notified_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_nudges_key ON nudges(key)`,
      `CREATE INDEX IF NOT EXISTS idx_nudges_day ON nudges(module, created_at)`,
      `CREATE INDEX IF NOT EXISTS idx_nudges_filing ON nudges(filing_id)`,
      `CREATE TABLE IF NOT EXISTS brain_learned (
        key TEXT PRIMARY KEY,
        module TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('answer', 'fact', 'not-this', 'held')),
        value TEXT NOT NULL,
        source TEXT NOT NULL CHECK (source IN ('claude', 'you', 'code')),
        uses INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_brain_learned_module ON brain_learned(module, kind)`,
      `CREATE TABLE IF NOT EXISTS brain_skills (
        id TEXT PRIMARY KEY,
        module TEXT NOT NULL,
        name TEXT NOT NULL,
        body TEXT NOT NULL,
        source TEXT NOT NULL CHECK (source IN ('claude', 'you', 'code')),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS brain_sent (
        id TEXT PRIMARY KEY,
        at INTEGER NOT NULL,
        pass TEXT NOT NULL,
        why TEXT NOT NULL,
        model TEXT NOT NULL,
        lines TEXT NOT NULL,
        records INTEGER NOT NULL DEFAULT 0,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        cache_read INTEGER NOT NULL DEFAULT 0,
        cache_write INTEGER NOT NULL DEFAULT 0,
        outcome TEXT NOT NULL,
        error TEXT
      )`,
      `CREATE INDEX IF NOT EXISTS idx_brain_sent_at ON brain_sent(at)`,
    ],
  },
  {
    version: 17,
    name: 'dumps-retention',
    // docs/MODEL.md layer 6 (R15): a dump is deleted 15 days after filing
    // unless it holds Second Brain (a Fact or a Note). The guard that refused
    // every delete now refuses only deleting a dump not filed yet or younger
    // than 15 days, so a bug still can't lose your words early.
    up: [
      `DROP TRIGGER IF EXISTS dumps_never_deleted`,
      `CREATE TRIGGER IF NOT EXISTS dumps_kept_until_filed BEFORE DELETE ON dumps
        WHEN OLD.status NOT IN ('done', 'skipped') OR OLD.created_at > CAST(strftime('%s', 'now') AS INTEGER) * 1000 - 15 * 86400000
        BEGIN SELECT RAISE(ABORT, 'a dump is kept until it is filed and 15 days old'); END`,
    ],
  },
];
