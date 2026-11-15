import type { LifeOSContext } from '@core/registry/context';
import { refileMessage } from '@core/filing/messages';

/**
 * Read my texts again (docs/MODEL.md, Messages): the money parser reads every
 * kept message once more and files it as today's rules would. A payment it
 * filed itself is replaced; one you edited, split or linked by hand is kept,
 * and so is its message. Undo puts the old payments back.
 */

export const REREAD_KEY = 'finance.reread';
const PARSER = 'finance.money';

export interface Reread {
  at: number;
  /** Messages read again. */
  read: number;
  /** Payments taken out (soft deleted, restored by Undo). */
  removed: string[];
  /** Payments filed now (deleted by Undo). */
  filed: string[];
  /** Payments kept because you changed them. */
  kept: number;
}

const touchedByYou = (os: LifeOSContext, id: string) => !!os.db.get(`SELECT 1 AS x FROM events WHERE record_id=? AND actor='user' LIMIT 1`, [id]);

export function rereadTexts(os: LifeOSContext): Reread {
  const start = Date.now();
  const out: Reread = { at: start, read: 0, removed: [], filed: [], kept: 0 };
  const rows = os.db.all<{ id: string; record_id: string | null; parsed: string | null }>(
    `SELECT id, record_id, parsed FROM ingest_queue WHERE source IN ('sms','notification','email') AND raw_text <> '' AND status IN ('confirmed','duplicate','dismissed','failed') ORDER BY received_at`,
  );
  // Money's messages: what it filed, read, or a payment came from.
  const mine = rows.filter((r) => {
    const rec = r.record_id ? os.records.get(r.record_id) : undefined;
    return rec?.object === 'transaction' || (r.parsed ?? '').includes(`"parser":"${PARSER}"`) || (!r.parsed && !r.record_id);
  });
  const keep = new Set<string>();
  os.db.transaction(() => {
    for (const r of mine) {
      const rec = r.record_id ? os.records.get(r.record_id) : undefined;
      if (rec && rec.object === 'transaction' && touchedByYou(os, rec.id)) keep.add(r.id);
    }
    const again = mine.filter((r) => !keep.has(r.id));
    out.kept = new Set(mine.filter((r) => keep.has(r.id)).map((r) => r.record_id)).size;
    // Old dedupe keys would make a new payment a "duplicate" of one about to go.
    for (const r of again) os.db.run(`UPDATE ingest_queue SET dedupe_key=NULL WHERE id=?`, [r.id]);
    for (const r of again) {
      const rec = r.record_id ? os.records.get(r.record_id) : undefined;
      if (rec && rec.object === 'transaction' && !out.removed.includes(rec.id)) {
        os.records.delete(rec.id, 'system');
        out.removed.push(rec.id);
      }
    }
    for (const r of again) {
      const res = refileMessage(os, r.id, PARSER);
      out.read++;
      if (res.status === 'confirmed' && res.entityId && os.records.get(res.entityId)?.object === 'transaction' && !out.filed.includes(res.entityId)) out.filed.push(res.entityId);
    }
    // The re-read's own notes are not news: only its questions stay in To check.
    os.db.run(`UPDATE filings SET checked=1 WHERE created_at >= ? AND flag IS NULL`, [start]);
  });
  os.settings.set(REREAD_KEY, out);
  return out;
}

/** Undo: the new payments go, the old ones come back. */
export function undoReread(os: LifeOSContext): boolean {
  const r = os.settings.get<Reread | null>(REREAD_KEY, null);
  if (!r) return false;
  os.db.transaction(() => {
    for (const id of r.filed) if (os.records.get(id)) os.records.delete(id, 'user');
    for (const id of r.removed) os.records.restore(id, 'user');
  });
  os.settings.set(REREAD_KEY, null);
  return true;
}
