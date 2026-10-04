/**
 * Tables included in a backup export, in restore order. Every table the
 * migrations create must appear here or in BACKUP_EXCLUDED (enforced by test).
 */
export const BACKUP_TABLES = [
  'records',
  'links',
  'events',
  'attachments',
  'reminders',
  'tags',
  'record_tags',
  'custom_field_defs',
  'saved_views',
  'automation_rules',
  'scheduled_jobs',
  'settings',
  'cycles',
  'meter_readings',
  'facts',
  'group_members',
  'notification_rules',
  'ingest_queue',
  'aliases',
  'dumps',
  'filings',
  'queued_questions',
  'sms_senders',
  'source_state',
  'usage_daily',
  'usage_app_daily',
] as const;

/** Rebuilt or re-derived on this device, so not worth carrying in a backup. */
/** `dashboards`: the old widget dashboards, unused since R0; the table stays until migration v11 drops it. */
export const BACKUP_EXCLUDED = ['_migrations', 'modules', 'automation_runs', 'ai_messages', 'changes', 'records_fts', 'ai_usage', 'dashboards'] as const;

/** Backups written before migration v11 (4 Oct 2026) use the old names; importAll maps them. */
export const LEGACY_TABLE_NAMES: Record<string, string> = { entities: 'records', relations: 'links', timeline_events: 'events', entity_tags: 'record_tags', filings: 'filings' };
export const LEGACY_COLUMN_NAMES: Record<string, Record<string, string>> = {
  records: { type: 'object' },
  events: { entity_id: 'record_id' },
  record_tags: { entity_id: 'record_id' },
  attachments: { entity_id: 'record_id' },
  reminders: { entity_id: 'record_id' },
  cycles: { entity_id: 'record_id' },
  meter_readings: { entity_id: 'record_id' },
  ingest_queue: { entity_id: 'record_id' },
  aliases: { entity_id: 'record_id' },
  filings: { entity_id: 'record_id' },
  custom_field_defs: { entity_type: 'object' },
  saved_views: { entity_type: 'object' },
};
