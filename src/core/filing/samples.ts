import type { LifeOSContext } from '../registry/context';
import { bus } from '../events/bus';
import type { RawMessage } from './contract';
import { isPersonalMail, isPersonalSender, parserViews } from './dataset';
import { isOtpText } from './otp';

/**
 * Message samples (docs/MODEL.md layer 4): one masked example of each shape of
 * message, per sender, kept so better parsers can be written against them. Masked
 * before it is stored, so the 60-day rule for raw text does not apply. It leaves
 * the phone only through the share sheet.
 */

const MAX_PER_SENDER = 30;
const MAX_TEXT = 4000;
/** `module` for a message some parser knows and has nothing to file from. */
export const SKIPPED = 'skipped';

const zeros = (s: string) => s.replace(/\d/g, '0');

/** Hides what identifies you and keeps the shape; amounts, merchants and names stay, the parsers read them. */
export function maskText(text: string): string {
  return text
    .replace(/[\w.+-]+@(?=[a-z])/gi, 'name@')
    // Where a card or welcome kit was sent: your address.
    .replace(/\b((?:dispatched|delivered)\s+to\s+)(?!you\b|your\b)([^.\n]{8,90}?)(\s+(?:on|via|by)\s)/gi, '$1[address]$3')
    .replace(/\b(pin ?code|pincode)(\s*(?:no\.?|:)?\s*)(\d{6})\b/gi, (_m, a: string, b: string, c: string) => `${a}${b}${zeros(c)}`)
    .replace(/\b[A-Z]{2}[ -]?\d{1,2}[ -]?[A-Z]{1,3}[ -]?\d{4}\b/g, 'XX00XX0000') // a number plate
    .replace(/\b\d[xX*]{2,}\d{3,}\b/g, zeros) // "4xxx3007"
    .replace(/\b(?=[A-Za-z0-9]*\d)(?=[A-Za-z0-9]*[A-Za-z])[A-Za-z0-9]{10,}\b/g, zeros) // application, file and reference ids
    .replace(/(?<![A-Za-z0-9])[xX*]+\d{3,}/g, zeros)
    .replace(/\b([xX*]{2,}-)(\d{3,})\b/g, (_m, a: string, b: string) => `${a}${zeros(b)}`) // "XXXX-8013"
    .replace(/\b(a\/c|acct?|account|card)((?:\s+(?:no\.?|number|ending(?:\s+in)?))?\s*)(\d{3,})/gi, (_m, a: string, b: string, c: string) => `${a}${b}${zeros(c)}`)
    .replace(/\b((?:avl\.?\s*|available\s+)?(?:bal(?:ance)?|lmt|limit)\b\D{0,12})(\d[\d,]*(?:\.\d+)?)/gi, (_m, a: string, b: string) => `${a}${zeros(b)}`)
    .replace(/\d{9,}/g, zeros);
}

/** Two messages of one shape differ only in their digits. */
const shapeOf = (masked: string) => masked.toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ').trim();

function sampleId(source: string, sender: string, shape: string): string {
  let h = 5381;
  const s = `${source}|${sender}|${shape}`;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return `smp_${(h >>> 0).toString(36)}_${s.length.toString(36)}`;
}

function kept(m: RawMessage): boolean {
  if (m.source === 'sms' && isPersonalSender(m.from)) return false;
  if (m.source === 'email' && isPersonalMail(m.from, String(m.meta?.fromName ?? m.title ?? ''))) return false;
  return !isOtpText(`${m.title ?? ''} ${m.body}`);
}

/** Who reads a message today: a module, SKIPPED, or null for nobody. */
function readerOf(os: LifeOSContext, m: RawMessage): string | null {
  const views = parserViews(os, m) as Record<string, { kind?: string }>;
  const ids = Object.keys(views);
  const live = ids.find((id) => views[id]!.kind !== 'skip' && views[id]!.kind !== 'error');
  if (live) return os.registry.parsers.get(live)?.module ?? null;
  return ids.some((id) => views[id]!.kind === 'skip') ? SKIPPED : null;
}

/** Take one message in: a new shape is stored masked, a known one only counts. Re-reading the inbox does not count twice. */
export function noteSample(os: LifeOSContext, m: RawMessage) {
  if (!kept(m)) return;
  const text = maskText(m.body).slice(0, MAX_TEXT);
  const title = m.title ? maskText(m.title) : null;
  const id = sampleId(m.source, m.from, shapeOf(`${title ?? ''} ${text}`));
  const known = os.db.get<{ first_at: number; last_at: number }>(`SELECT first_at, last_at FROM message_samples WHERE id=?`, [id]);
  if (known) {
    if (m.receivedAt > known.last_at) os.db.run(`UPDATE message_samples SET seen=seen+1, last_at=?, text=?, title=? WHERE id=?`, [m.receivedAt, text, title, id]);
    else if (m.receivedAt < known.first_at) os.db.run(`UPDATE message_samples SET seen=seen+1, first_at=? WHERE id=?`, [m.receivedAt, id]);
    return;
  }
  const module = readerOf(os, { ...m, title, body: text });
  os.db.run(`INSERT INTO message_samples(id,source,sender,title,text,module,first_at,last_at) VALUES (?,?,?,?,?,?,?,?)`, [id, m.source, m.from, title, text, module, m.receivedAt, m.receivedAt]);
  os.db.run(`DELETE FROM message_samples WHERE sender=? AND id NOT IN (SELECT id FROM message_samples WHERE sender=? ORDER BY last_at DESC LIMIT ?)`, [m.from, m.from, MAX_PER_SENDER]);
  bus.emit('data.changed', { table: 'message_samples', id });
}

export interface Sample {
  id: string;
  source: RawMessage['source'];
  sender: string;
  title: string | null;
  text: string;
  module: string | null;
  seen: number;
  firstAt: number;
  lastAt: number;
}

export function samples(os: LifeOSContext): Sample[] {
  return os.db
    .all<{ id: string; source: Sample['source']; sender: string; title: string | null; text: string; module: string | null; seen: number; first_at: number; last_at: number }>(`SELECT * FROM message_samples ORDER BY seen DESC, last_at DESC`)
    .map((r) => ({ id: r.id, source: r.source, sender: r.sender, title: r.title, text: r.text, module: r.module, seen: r.seen, firstAt: r.first_at, lastAt: r.last_at }));
}

export const sampleCount = (os: LifeOSContext) => os.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM message_samples`)?.n ?? 0;

export function clearSamples(os: LifeOSContext) {
  os.db.run(`DELETE FROM message_samples`);
  bus.emit('data.changed', { table: 'message_samples', id: 'all' });
}

/** The file to send: every example with what each parser reads in it today, read afresh so a better parser shows. */
export function buildSampleFile(os: LifeOSContext, now = Date.now()) {
  const all = samples(os);
  return {
    format: 'lifeos-message-samples' as const,
    version: 1,
    exportedAt: new Date(now).toISOString(),
    parsers: [...os.registry.parsers.keys()],
    counts: { samples: all.length, unread: all.filter((s) => !s.module).length, seen: all.reduce((n, s) => n + s.seen, 0) },
    samples: all.map((s) => ({
      i: s.id,
      source: s.source,
      from: s.sender,
      title: s.title ?? undefined,
      text: s.text,
      seen: s.seen,
      firstSeen: new Date(s.firstAt).toISOString(),
      lastSeen: new Date(s.lastAt).toISOString(),
      read: parserViews(os, { source: s.source, from: s.sender, title: s.title, body: s.text, receivedAt: s.lastAt }),
    })),
  };
}
