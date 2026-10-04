import type { LifeOSContext } from '../registry/context';
import { bus } from '../events/bus';

/**
 * The 60-day clean-up (M4.2c, Rutvij's choice): keeps the phone light
 * without losing anything that matters.
 *  - ignored messages (OTPs, promos, untrusted senders, duplicates): deleted
 *  - messages that became records: the record stays, the raw SMS wording goes
 *  - screen time: daily totals stay, the per-app breakdown goes
 *  - synced calendar events that ended: removed (ones you made stay)
 */

const DAY = 86_400_000;

export interface PruneResult {
  ignoredMessages: number;
  rawTexts: number;
  appUsageRows: number;
  calendarEvents: number;
}

export function pruneOldData(os: LifeOSContext, opts: { days?: number; now?: number } = {}): PruneResult {
  const now = opts.now ?? Date.now();
  const cutoff = now - (opts.days ?? 60) * DAY;
  const cutoffDay = new Date(cutoff).toISOString().slice(0, 10);
  const count = (sql: string, p: unknown[]) => os.db.get<{ n: number }>(sql, p as never[])?.n ?? 0;
  const r: PruneResult = { ignoredMessages: 0, rawTexts: 0, appUsageRows: 0, calendarEvents: 0 };
  os.db.transaction(() => {
    r.ignoredMessages = count(`SELECT COUNT(*) AS n FROM ingest_queue WHERE status IN ('dismissed','duplicate','failed') AND received_at < ?`, [cutoff]);
    os.db.run(`DELETE FROM ingest_queue WHERE status IN ('dismissed','duplicate','failed') AND received_at < ?`, [cutoff]);

    r.rawTexts = count(`SELECT COUNT(*) AS n FROM ingest_queue WHERE status IN ('confirmed','proposed') AND received_at < ? AND raw_text <> ''`, [cutoff]);
    os.db.run(`UPDATE ingest_queue SET raw_text='', raw_title=NULL, raw_extra='{}' WHERE status IN ('confirmed','proposed') AND received_at < ? AND raw_text <> ''`, [cutoff]);
    // The copy of the wording on the record's timeline goes too.
    os.db.run(`UPDATE events SET body=NULL WHERE kind IN ('sms','notification') AND occurred_at < ? AND body IS NOT NULL`, [cutoff]);

    r.appUsageRows = count(`SELECT COUNT(*) AS n FROM usage_app_daily WHERE day < ?`, [cutoffDay]);
    os.db.run(`DELETE FROM usage_app_daily WHERE day < ?`, [cutoffDay]);

    const old = os.db.all<{ id: string }>(
      `SELECT id FROM records WHERE object='event' AND json_extract(data,'$.source')='calendar' AND COALESCE(json_extract(data,'$.endAt'), json_extract(data,'$.startAt')) < ?`,
      [cutoff],
    );
    for (const { id } of old) {
      os.db.run(`DELETE FROM links WHERE from_id=? OR to_id=?`, [id, id]);
      os.db.run(`DELETE FROM events WHERE record_id=?`, [id]);
      os.db.run(`DELETE FROM records_fts WHERE id=?`, [id]);
      os.db.run(`DELETE FROM records WHERE id=?`, [id]);
    }
    r.calendarEvents = old.length;
  });
  if (r.ignoredMessages + r.rawTexts + r.appUsageRows + r.calendarEvents) bus.emit('data.changed', { table: 'retention', id: 'prune' });
  return r;
}

/** Once a day at most. */
export function pruneIfDue(os: LifeOSContext, now = Date.now()): PruneResult | null {
  const last = os.settings.get<number>('retention.lastRun', 0);
  if (now - last < DAY) return null;
  const r = pruneOldData(os, { now });
  os.settings.set('retention.lastRun', now);
  return r;
}
