import type { LifeOSContext } from '../registry/context';

/**
 * The message parser contract (docs/MODEL.md §4 — messages are parsed directly
 * by per-sender parsers; docs/PLUGINS.md). A module declares parsers on its
 * manifest (`filing.parsers`); core keeps the queue, sender trust and dispatch
 * and never knows what a bank text or a shipping mail is.
 *
 *   read(m)  → what the parser understood, as plain JSON (stored on the queue
 *              row so a first-run proposal can be filed later), or null when
 *              the message is not its business, or { kind: 'skip', reason }.
 *   file(m, read, ctx) → write records with provenance (os.filings) and say
 *              what happened. Several parsers may file the same mail (a ticket
 *              with its payment): each sees what the others made in ctx.related.
 */

export interface RawMessage {
  source: 'sms' | 'notification' | 'email';
  /** SMS sender ("VM-HDFCBK"), the app's package name, or the email's sender address. */
  from: string;
  /** Email only: the mailbox it was read from ("rutvij@gmail.com") — named on everything it files. */
  account?: string | null;
  title?: string | null;
  body: string;
  receivedAt: number;
  /** Mail: fromName, uid. Whatever the source adds. */
  meta?: Record<string, unknown>;
}

export interface ParserRead {
  /** 'skip' means "mine, but nothing to file" (with `reason`); anything else is the parser's own kind. */
  kind: string;
  reason?: string;
  [k: string]: unknown;
}

export type QueueStatus = 'pending' | 'proposed' | 'confirmed' | 'dismissed' | 'duplicate' | 'failed';

export interface FileContext {
  /** The queue row (ingest_queue id): the provenance ref for os.filings. */
  id: string;
  /** 'live' files now (To check + Undo); 'import' is first-run history, already reviewed by the time file() runs. */
  mode: 'live' | 'import';
  /** Records other parsers filed from the same message, with the link word to use ("paid_for", "part_of"). */
  related: Array<{ id: string; word: string }>;
}

export interface FileOutcome {
  status: QueueStatus;
  entityId?: string | null;
  note?: string | null;
  /** What this parser made that later parsers may link to. */
  related?: Array<{ id: string; word: string }>;
}

export interface MessageParser {
  /** 'finance.money', 'deliveries.shipping', 'travel.bookings'. */
  id: string;
  module: string;
  /** Lower runs first. Shops and couriers (deliveries) before money, so a shipping text is never read as spend. */
  priority?: number;
  /** Reads SMS from senders you have not trusted (couriers, shops). Money parsers leave those alone. */
  untrusted?: boolean;
  /** Supports first-run history as proposals for the review screen (money does; shipping files straight away). */
  proposes?: boolean;
  /** What to call a sender and whether to trust it by default: feeds the SMS senders list. */
  sender?: (from: string, body: string) => { name?: string | null; trusted?: boolean } | null;
  /** Apps whose notifications this parser reads (Home: Blinkit's delivery); the notifications source listens to them too. */
  packages?: string[];
  /** A short label for a message's origin in To check ("HDFC Bank SMS", "GPay"). */
  label?: (m: RawMessage) => string | null;
  read: (os: LifeOSContext, m: RawMessage) => ParserRead | null;
  file: (os: LifeOSContext, m: RawMessage, read: ParserRead, ctx: FileContext) => FileOutcome;
}
