/**
 * Tables included in a backup export, in restore order. Every table the
 * migrations create must appear here or in BACKUP_EXCLUDED (enforced by test).
 */
export const BACKUP_TABLES = [
  'entities',
  'relations',
  'timeline_events',
  'attachments',
  'reminders',
  'tags',
  'entity_tags',
  'custom_field_defs',
  'comments',
  'saved_views',
  'dashboards',
  'automation_rules',
  'scheduled_jobs',
  'settings',
  'cycles',
  'meter_readings',
  'facts',
  'group_members',
  'notification_rules',
  'ingest_queue',
] as const;

/** Rebuilt or re-derived on this device, so not worth carrying in a backup. */
export const BACKUP_EXCLUDED = ['_migrations', 'modules', 'automation_runs', 'ai_messages', 'changes', 'entities_fts'] as const;
