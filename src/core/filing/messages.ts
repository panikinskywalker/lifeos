import type { LifeOSContext } from '../registry/context';
import { bus } from '../events/bus';
import type { FileContext, FileOutcome, MessageParser, ParserRead, RawMessage } from './contract';
import type { Mail } from './mail';
import { findTwin, hasMessageFor, messageId, messageItem, messageList, messageOutcome, seeSender, senders, setDedupeKey, setQueueItem, setSenderTrusted, sourceLabel, toItem, type IngestItem, type IngestResult } from './queue';

export type { FileContext, FileOutcome, MessageParser, ParserRead, RawMessage, IngestItem, IngestResult };
export { findTwin, messageId, messageItem, messageList, messageOutcome, seeSender, senders, setDedupeKey, setQueueItem, setSenderTrusted, sourceLabel, toItem, hasMessageFor };

/**
 * Messages → records (docs/MODEL.md §4, the messages path). Every SMS,
 * payment notification and mail is kept raw in the queue, offered to the
 * modules' parsers in priority order, and filed by the ones that understand
 * it — live ones at once (To check + Undo), first-run history as proposals
 * for the review screen. A message no parser understands is a leftover,
 * dismissed with the reason.
 */

function parsersFor(os: LifeOSContext, m: RawMessage, trusted: boolean): MessageParser[] {
  return [...os.registry.parsers.values()]
    .filter((p) => m.source !== 'sms' || trusted || p.untrusted)
    .sort((a, b) => (a.priority ?? 50) - (b.priority ?? 50));
}

function senderHint(os: LifeOSContext, m: RawMessage) {
  for (const p of os.registry.parsers.values()) {
    const h = p.sender?.(m.from, m.body);
    if (h) return h;
  }
  return null;
}

/** Run every parser that read something, in order; the first outcome is the row's. */
function fileReads(os: LifeOSContext, m: RawMessage, id: string, mode: 'live' | 'import', reads: Array<{ parser: MessageParser; read: ParserRead }>): IngestResult {
  const ctx: FileContext = { id, mode, related: [] };
  let primary: FileOutcome | null = null;
  for (const { parser, read } of reads) {
    const out = parser.file(os, m, read, ctx);
    if (out.related?.length) ctx.related.push(...out.related);
    if (!primary || (primary.status !== 'confirmed' && out.status === 'confirmed')) primary = out;
  }
  const o = primary ?? { status: 'dismissed' as const, note: 'nothing to file' };
  setQueueItem(os, id, { status: o.status, entityId: o.entityId ?? null, note: o.note ?? null });
  return { id, status: o.status, entityId: o.entityId ?? null, reason: o.note ?? undefined };
}

/**
 * Take in one message. `mode: 'live'` files it now; `mode: 'import'` (first-run
 * history) proposes it for the review screen when the parser supports that.
 */
export function fileMessage(os: LifeOSContext, m: RawMessage, opts: { mode?: 'live' | 'import' } = {}): IngestResult {
  const mode = opts.mode ?? 'live';
  const id = messageId(m);
  const existing = messageItem(os, id);
  if (existing) return { id, status: existing.status, entityId: existing.entityId, reason: 'seen before' };
  const now = Date.now();
  os.db.run(`INSERT INTO ingest_queue(id,source,package,received_at,raw_title,raw_text,status,created_at,updated_at) VALUES (?,?,?,?,?,?,'pending',?,?)`, [id, m.source, m.from, m.receivedAt, m.title ?? null, m.body, now, now]);
  return dispatch(os, m, id, mode);
}

function dispatch(os: LifeOSContext, m: RawMessage, id: string, mode: 'live' | 'import'): IngestResult {
  let trusted = true;
  if (m.source === 'sms') trusted = seeSender(os, m, senderHint(os, m)).trusted;
  const reads: Array<{ parser: MessageParser; read: ParserRead }> = [];
  for (const parser of parsersFor(os, m, trusted)) {
    const read = parser.read(os, m);
    if (read) reads.push({ parser, read });
  }
  if (!reads.length) {
    const note = m.source === 'sms' && !trusted ? 'sender not trusted' : 'no parser understood it';
    setQueueItem(os, id, { status: 'dismissed', note });
    return { id, status: 'dismissed', reason: note };
  }
  const first = reads[0]!;
  setQueueItem(os, id, { parsed: { parser: first.parser.id, read: first.read } });
  const live = reads.filter((r) => r.read.kind !== 'skip');
  if (!live.length) {
    const note = first.read.reason ?? 'nothing to file';
    setQueueItem(os, id, { status: 'dismissed', note });
    return { id, status: 'dismissed', reason: note };
  }
  if (mode === 'import' && live[0]!.parser.proposes) {
    setQueueItem(os, id, { parsed: { parser: live[0]!.parser.id, read: live[0]!.read }, status: 'proposed' });
    return { id, status: 'proposed' };
  }
  return fileReads(os, m, id, mode, live);
}

/** File one proposed (reviewed) row with the parser that read it. */
export function fileItem(os: LifeOSContext, id: string): IngestResult {
  const item = messageItem(os, id);
  if (!item) return { id, status: 'failed' };
  if (item.status === 'confirmed') return { id, status: 'confirmed', entityId: item.entityId };
  const parser = item.parsed ? os.registry.parsers.get(item.parsed.parser) : undefined;
  if (!parser || !item.parsed || item.parsed.read.kind === 'skip') {
    setQueueItem(os, id, { status: 'failed', note: parser ? 'nothing to file' : 'its parser is not installed' });
    return { id, status: 'failed' };
  }
  const m: RawMessage = { source: item.source as RawMessage['source'], from: item.from, account: item.account, title: item.title, body: item.text, receivedAt: item.receivedAt };
  return fileReads(os, m, id, 'import', [{ parser, read: item.parsed.read }]);
}

/** First-run review: file the proposals you kept; the rest are dismissed. */
export function confirmProposed(os: LifeOSContext, keep: string[], dismiss: string[] = []): number {
  let n = 0;
  os.db.transaction(() => {
    for (const id of keep) if (fileItem(os, id).status === 'confirmed') n++;
    for (const id of dismiss) setQueueItem(os, id, { status: 'dismissed', note: 'dismissed in review' });
  });
  bus.emit('data.changed', { table: 'ingest_queue', id: 'review' });
  return n;
}

/**
 * Take in one email from a connected mailbox. Each module's parser reads the
 * part it knows (a receipt, a shipping update, a ticket); a ticket's payment
 * links to the flight through ctx.related. Every record names the mailbox.
 */
export function fileMail(os: LifeOSContext, mail: Mail, account: string): IngestResult {
  const text = mail.text.slice(0, 6000);
  const m: RawMessage = { source: 'email', from: mail.from, account, title: mail.subject, body: text, receivedAt: mail.date, meta: { fromName: mail.fromName, uid: mail.uid } };
  const id = messageId({ ...m, body: `${account}|${mail.uid}|${mail.subject}` });
  const existing = messageItem(os, id);
  if (existing) return { id, status: existing.status, entityId: existing.entityId, reason: 'seen before' };
  const now = Date.now();
  os.db.run(
    `INSERT INTO ingest_queue(id,source,package,received_at,raw_title,raw_text,raw_extra,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,'pending',?,?)`,
    [id, 'email', mail.from, mail.date, mail.subject, text, JSON.stringify({ account, fromName: mail.fromName, uid: mail.uid }), now, now],
  );
  return dispatch(os, m, id, 'live');
}
