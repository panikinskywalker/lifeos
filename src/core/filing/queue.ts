import type { LifeOSContext } from '../registry/context';
import type { Row } from '../db/adapter';
import { bus } from '../events/bus';
import type { ParserRead, QueueStatus, RawMessage } from './contract';

/**
 * The message queue (ingest_queue): every SMS, notification and mail the app
 * saw, kept raw with what happened to it. Core owns the rows; module parsers
 * read and update them through this API. Raw text is cleared 60 days after
 * filing by the retention job (docs/MODEL.md §4).
 */

export type { RawMessage, QueueStatus };

export interface IngestItem {
  id: string;
  source: string;
  from: string;
  receivedAt: number;
  title: string | null;
  text: string;
  /** { parser, read }: which parser understood it and what it read; null when none did. */
  parsed: { parser: string; read: ParserRead } | null;
  status: QueueStatus;
  entityId: string | null;
  note: string | null;
  /** Email only: the mailbox it came from. */
  account: string | null;
}

export interface IngestResult {
  id: string;
  status: QueueStatus;
  entityId?: string | null;
  reason?: string;
}

export const toItem = (r: Row): IngestItem => ({
  id: r.id as string,
  source: r.source as string,
  from: (r.package as string | null) ?? '',
  receivedAt: r.received_at as number,
  title: (r.raw_title as string | null) ?? null,
  text: (r.raw_text as string | null) ?? '',
  parsed: r.parsed ? parsedOf(r.parsed as string) : null,
  status: r.status as QueueStatus,
  entityId: (r.record_id as string | null) ?? null,
  note: (r.error as string | null) ?? null,
  account: r.raw_extra ? ((JSON.parse(r.raw_extra as string) as { account?: string }).account ?? null) : null,
});

/** Rows written before R1 stored the finance read bare ({ kind: 'txn', txn }): they belong to the money parser. */
function parsedOf(json: string): IngestItem['parsed'] {
  const v = JSON.parse(json) as Record<string, unknown>;
  if (v && typeof v.parser === 'string' && v.read) return v as unknown as IngestItem['parsed'];
  if (v && typeof v.kind === 'string') return { parser: 'finance.money', read: v as unknown as ParserRead };
  return null;
}

/** Stable id: the same message imported twice (history re-scan) is one row. */
export function messageId(m: RawMessage): string {
  let h = 5381;
  const s = `${m.source}|${m.from}|${m.receivedAt}|${m.body}`;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return `ing_${m.source}_${m.receivedAt.toString(36)}_${(h >>> 0).toString(36)}`;
}

export function messageItem(os: LifeOSContext, id: string): IngestItem | null {
  const r = os.db.get<Row>(`SELECT * FROM ingest_queue WHERE id=?`, [id]);
  return r ? toItem(r) : null;
}

export function messageList(os: LifeOSContext, opts: { status?: QueueStatus; source?: string; limit?: number } = {}): IngestItem[] {
  const where: string[] = [];
  const p: (string | number)[] = [];
  if (opts.status) (where.push('status=?'), p.push(opts.status));
  if (opts.source) (where.push('source=?'), p.push(opts.source));
  return os.db.all<Row>(`SELECT * FROM ingest_queue ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY received_at DESC LIMIT ?`, [...p, opts.limit ?? 200]).map(toItem);
}

/** What the app did with one message: filed, set aside (and why), or never seen; and the record it made. */
export function messageOutcome(os: LifeOSContext, m: RawMessage): { status: string; note: string | null; record: Record<string, unknown> | null } | null {
  const r = os.db.get<{ status: string; error: string | null; record_id: string | null }>(`SELECT status, error, record_id FROM ingest_queue WHERE id=?`, [messageId(m)]);
  if (!r) return null;
  const e = r.record_id ? os.records.get(r.record_id) : null;
  const d = (e?.data ?? {}) as Record<string, unknown>;
  const record = e ? { type: e.object, title: e.title, ...Object.fromEntries(['amount', 'kind', 'category', 'merchant', 'date', 'status', 'shop', 'carrier'].filter((k) => d[k] !== undefined).map((k) => [k, d[k]])) } : r.record_id ? { deleted: true } : null;
  return { status: r.status, note: r.error, record };
}

export function setQueueItem(os: LifeOSContext, id: string, patch: { status?: QueueStatus; entityId?: string | null; note?: string | null; parsed?: IngestItem['parsed'] | null }) {
  const sets: string[] = ['updated_at=?'];
  const p: unknown[] = [Date.now()];
  if (patch.status) (sets.push('status=?'), p.push(patch.status));
  if (patch.entityId !== undefined) (sets.push('record_id=?'), p.push(patch.entityId));
  if (patch.note !== undefined) (sets.push('error=?'), p.push(patch.note));
  if (patch.parsed !== undefined) (sets.push('parsed=?'), p.push(patch.parsed ? JSON.stringify(patch.parsed) : null));
  os.db.run(`UPDATE ingest_queue SET ${sets.join(', ')} WHERE id=?`, [...(p as never[]), id]);
}

/** A key other messages about the same thing will share ("debit:1240.00"); findTwin looks it up within a window. */
export function setDedupeKey(os: LifeOSContext, id: string, key: string) {
  os.db.run(`UPDATE ingest_queue SET dedupe_key=? WHERE id=?`, [key, id]);
}

/** Another message with the same dedupe key within `window` ms, already filed, proposed or marked duplicate. */
export function findTwin(os: LifeOSContext, id: string, key: string, at: number, window: number): { id: string; recordId: string | null } | null {
  const twin = os.db.get<{ id: string; record_id: string | null }>(
    `SELECT id, record_id FROM ingest_queue WHERE dedupe_key=? AND id<>? AND received_at BETWEEN ? AND ? AND status IN ('confirmed','proposed','duplicate') ORDER BY received_at LIMIT 1`,
    [key, id, at - window, at + window],
  );
  return twin ? { id: twin.id, recordId: twin.record_id ?? null } : null;
}

/** Is this record already accounted for by a message (any source but mail)? Used to tell "you said it" from "a message said it". */
export function hasMessageFor(os: LifeOSContext, recordId: string, exceptSource?: string): boolean {
  const r = exceptSource
    ? os.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM ingest_queue WHERE record_id=? AND source<>?`, [recordId, exceptSource])
    : os.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM ingest_queue WHERE record_id=?`, [recordId]);
  return (r?.n ?? 0) > 0;
}

/* ------------------------------------------------------------------ */
/* Senders (SMS)                                                        */
/* ------------------------------------------------------------------ */

export interface SmsSender {
  address: string;
  bank: string | null;
  trusted: boolean;
  /** You've ticked or unticked it (otherwise trust was guessed). */
  decided: boolean;
  count: number;
  lastSeen: number;
  sample: string | null;
}

const toSender = (r: Row): SmsSender => ({ address: r.address as string, bank: (r.bank as string | null) ?? null, trusted: r.trusted === 1, decided: r.decided === 1, count: r.count as number, lastSeen: r.last_seen as number, sample: (r.sample as string | null) ?? null });

export function senders(os: LifeOSContext): SmsSender[] {
  return os.db.all<Row>(`SELECT * FROM sms_senders ORDER BY trusted DESC, count DESC`).map(toSender);
}

export function setSenderTrusted(os: LifeOSContext, address: string, trusted: boolean) {
  os.db.run(`UPDATE sms_senders SET trusted=?, decided=1 WHERE address=?`, [trusted ? 1 : 0, address]);
  bus.emit('data.changed', { table: 'sms_senders', id: address });
}

/** Note a sender; its trust is guessed from the parsers' hints (a bank header = trusted) until you decide. */
export function seeSender(os: LifeOSContext, m: RawMessage, hint: { name?: string | null; trusted?: boolean } | null): SmsSender {
  os.db.run(
    `INSERT INTO sms_senders(address,bank,trusted,count,first_seen,last_seen,sample) VALUES (?,?,?,1,?,?,?)
     ON CONFLICT(address) DO UPDATE SET count=count+1, last_seen=MAX(last_seen, excluded.last_seen), bank=COALESCE(bank, excluded.bank),
       trusted=CASE WHEN decided=1 THEN trusted ELSE MAX(trusted, excluded.trusted) END, sample=COALESCE(sample, excluded.sample)`,
    [m.from, hint?.name ?? null, hint?.trusted ? 1 : 0, m.receivedAt, m.receivedAt, m.body.slice(0, 200)],
  );
  return toSender(os.db.get<Row>(`SELECT * FROM sms_senders WHERE address=?`, [m.from])!);
}

/** "HDFC Bank SMS", "GPay", "Email · rutvij@gmail.com": the parsers name the sender when they know it. */
export function sourceLabel(os: LifeOSContext, m: { source: string; from: string; account?: string | null; title?: string | null; body?: string; receivedAt?: number }): string {
  if (m.source === 'email') return `Email · ${m.account ?? 'Gmail'}`;
  const raw: RawMessage = { source: m.source as RawMessage['source'], from: m.from, account: m.account, title: m.title, body: m.body ?? '', receivedAt: m.receivedAt ?? 0 };
  for (const p of os.registry.parsers.values()) {
    const l = p.label?.(raw);
    if (l) return l;
  }
  if (m.source === 'notification') return m.from;
  const bank = os.db.get<{ bank: string | null }>(`SELECT bank FROM sms_senders WHERE address=?`, [m.from])?.bank;
  return bank ? `${bank} SMS` : `SMS from ${m.from}`;
}
