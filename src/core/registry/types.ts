import type { ComponentType } from 'react'; // type-only: core has no runtime dependency on React (deps.test allows `import type`)
import type { ZodTypeAny } from 'zod';
import type { ObjectRecord, ObjectDef, WidgetSize } from '../domain/types';
import type { CoreEvents, EventName } from '../events/bus';
import type { LifeOSContext } from './context';
import type { MessageParser } from '../filing/contract';
import type { OutboxItem } from '../repo/outboxRepo';

/* ------------------------------------------------------------------ */
/* Plugin API — the ONLY contract between core and a module / board.   */
/* Manifests are plain objects; nothing in core imports a module or a  */
/* board. See docs/PLUGINS.md.                                         */
/* ------------------------------------------------------------------ */


export interface TileProps {
  size: WidgetSize;
  config: Record<string, unknown>;
  ctx: LifeOSContext;
}

export interface QuickAction {
  id: string;
  label: string;
  icon: string;
  /** Route to push, or a handler. */
  route?: string;
  run?: (ctx: LifeOSContext) => void | Promise<void>;
  /** Show in the global "+" menu. */
  global?: boolean;
}

/** Automation trigger a module contributes (beyond the generic entity events). */
export interface TriggerDef {
  id: string;
  module: string;
  label: string;
  description?: string;
  /** Which bus event fires it. */
  event: EventName;
  /** Turn the event payload into the automation context (or null = ignore). */
  toContext: (payload: CoreEvents[EventName]) => AutomationContext | null;
  configFields?: ObjectDef['fields'];
}

export interface AutomationContext {
  entity?: ObjectRecord;
  previous?: ObjectRecord;
  changed?: string[];
  vars: Record<string, unknown>;
}

export interface ActionDef {
  id: string;
  module: string;
  label: string;
  description?: string;
  configFields?: ObjectDef['fields'];
  run: (config: Record<string, unknown>, ctx: AutomationContext, os: LifeOSContext) => Promise<string | void>;
}

/** Tool exposed to the AI assistant (Claude tool-use). */
export interface AiToolDef {
  name: string;
  description: string;
  input: ZodTypeAny;
  run: (input: unknown, os: LifeOSContext) => Promise<unknown>;
  /**
   * Ask the user first (HANDOFF: money and people confirm; everything else
   * auto-runs with Undo). A function decides per input (create_entity asks
   * only for money/people types).
   */
  confirm?: boolean | ((input: any, os: LifeOSContext) => boolean); // eslint-disable-line @typescript-eslint/no-explicit-any
  /** One line for the confirm card: what will happen, in the user's terms ("Split ₹1,800 at Toit: you and Arjun, ₹900 each"). */
  describe?: (input: any, os: LifeOSContext) => string; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export interface EntityDetailSection {
  entityType: string | '*';
  key: string;
  title: string;
  component: ComponentType<{ entity: ObjectRecord<any>; ctx: LifeOSContext; controls?: RecordControls }>; // eslint-disable-line @typescript-eslint/no-explicit-any
  order?: number;
  /**
   * 'hero': replaces the record header (R2: Person · Profile, edge to edge), and gets the header's controls.
   * 'top': above the details card (Stitch stat trio, attention, quick actions). Default: below it.
   */
  placement?: 'hero' | 'top' | 'body';
}

/** What the record header offers, handed to a 'hero' section that draws its own. */
export interface RecordControls {
  back(): void;
  edit(): void;
  more(): void;
  /** Change the record's cover photo. */
  cover(): void;
}

/* ------------------------------------------------------------------ */
/* Boards — the top tier (docs/MODEL.md §3): what you see on screen.   */
/* A board connects modules; it owns tiles, screens and per-Object      */
/* overrides, and defines no Objects. Every module has a companion      */
/* board of the same id holding its overrides.                          */
/* ------------------------------------------------------------------ */

export interface TileDef {
  /** Globally unique, e.g. "finance.spend-this-month". */
  type: string;
  board: string;
  name: string;
  description?: string;
  icon: string;
  sizes: WidgetSize[];
  defaultSize: WidgetSize;
  configFields?: ObjectDef['fields'];
  component: ComponentType<TileProps>;
}

export interface BoardScreen {
  /** Route segment under /board/<boardId>/<key>; "index" is the board's home. */
  key: string;
  title: string;
  component: ComponentType<{ ctx: LifeOSContext; params: Record<string, string> }>;
}

/** Per-Object overrides of the generic screens (List, Record, Form, Metric, Links). */
export interface ObjectOverride {
  object: string | '*';
  /** Extra sections on the Record screen (hero at the top, cards in the body). */
  record?: EntityDetailSection[];
}

/** The Overview screen's content for a module: numbers, charts, what needs you. Pure. */
export type OverviewFn = (os: LifeOSContext, now?: number, opts?: { cardOnly?: boolean }) => import('../dashboard/overview').ModuleOverview;

export interface ManualRun {
  id: string;
  label: string;
  icon: string;
  /** Automation rule id to run, or a route to open. */
  ruleId?: string;
  route?: string;
}

export interface BoardManifest {
  id: string;
  name: string;
  icon: string;
  color: string;
  /** 'bar': pinned in the bottom bar (today, upkeep) · 'browse': a tile in Browse › Boards · 'module': a module's companion, reached through the module. */
  placement: 'bar' | 'browse' | 'module';
  /** The module this board is the companion of (its overrides); absent for cross-module boards (today, turf). */
  module?: string;
  tiles?: TileDef[];
  screens?: BoardScreen[];
  /** Companion boards: the module's Overview (Browse › module, Today's area card). */
  overview?: OverviewFn;
  overrides?: ObjectOverride[];
  quickActions?: QuickAction[];
  buttons?: ManualRun[];
  /**
   * To check cards for filings of this board's own kinds (Turf: an SMS that
   * may pay a share — Yes / Not this; a friend's profile — Review / Later).
   * To check draws them in place of the usual tick / edit / cancel row.
   */
  checkCards?: Record<string, ComponentType<{ filing: import('../repo/filingRepo').Filing }>>;
}

/* ------------------------------------------------------------------ */
/* Sources — where data comes from automatically (docs/MODEL.md §4).   */
/* A module declares the sources that feed it; platform code supplies  */
/* the device access. State (enabled, last sync, count, error) is kept  */
/* by core in source_state. R0 defines the contract; R1+ move today's   */
/* sources (src/platform/sources.ts) onto it.                           */
/* ------------------------------------------------------------------ */

export interface Reading {
  /** The Object the reading becomes a record of (measurement, workout, event…). */
  object: string;
  /** The source's own id for this reading: re-syncing never duplicates. */
  sourceKey: string;
  data: Record<string, unknown>;
  title?: string;
  occurredAt?: number;
}

export interface Message {
  /** Sender: a DLT header, a package name, a mail address. */
  from: string;
  title?: string | null;
  text: string;
  at: number;
  /** Subject, title, attachments — whatever the source adds. */
  meta?: Record<string, unknown>;
}

export interface SourceDef {
  /** 'sms', 'health', 'usage', 'contacts', 'calendar', 'calllog', 'notifications', 'gmail'… */
  id: string;
  label: string;
  /** The modules whose records this source produces. */
  modules: string[];
  /** The permission the user must grant, in their words ("Health Connect", "Usage access"). */
  permission?: string;
  /** Messages go through the parsers; readings become records directly (docs/MODEL.md §4). */
  kind: 'messages' | 'readings';
  /** For message sources: how the queue labels what came from here. */
  messageSource?: 'sms' | 'notification' | 'email';
  /** Can the source be asked for history (first run: the last months as proposals)? */
  history?: boolean;
  /** Is the source usable right now (permission granted, account added)? */
  available?: (os: LifeOSContext) => Promise<boolean>;
  /**
   * Read what is new since the cursor. Message sources return messages (core
   * files them through the parsers) or `filed` when they filed themselves
   * (mail, whose IMAP bookkeeping lives in platform). Readings become records.
   */
  sync: (os: LifeOSContext, since: number | null, opts: { mode: 'live' | 'import' }) => Promise<{ readings?: Reading[]; messages?: Message[]; filed?: number; cursor?: string }>;
  /**
   * Sources that also write (Turf web): send the changes waiting in
   * `os.outbox`, in order, before each sync. Answer each one: sent, refused
   * (with the source's words) or waiting (not answered: offline, a server
   * error; tried again next time). Core marks the outbox; the module undoes
   * what a refused change showed, since it knows what that was.
   */
  send?: (os: LifeOSContext, items: OutboxItem[]) => Promise<SendAnswer[]>;
}

export interface SendAnswer {
  id: string;
  state: 'sent' | 'refused' | 'waiting';
  error?: string;
  result?: unknown;
}

/* ------------------------------------------------------------------ */
/* Modules — one domain of data each: Objects, filing, sources, AI     */
/* tools, triggers, actions. Nothing visual — that is the companion    */
/* board's (docs/MODEL.md §3).                                          */
/* ------------------------------------------------------------------ */

export interface ModuleManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  icon: string;
  /** Accent colour used on module screens, widgets, badges. */
  color: string;
  /** Module ids that must be installed first. */
  dependencies?: string[];
  objects?: ObjectDef<any>[]; // eslint-disable-line @typescript-eslint/no-explicit-any
  triggers?: TriggerDef[];
  actions?: ActionDef[];
  aiTools?: AiToolDef[];
  /** The sources that feed this module (contract above). */
  sources?: SourceDef[];
  /** Filing rules: per-sender message parsers (docs/MODEL.md §4; src/core/filing/contract.ts). */
  filing?: { parsers?: MessageParser[] };
  /** Tools the model gets while filing a dump, bound to the session (provenance, undo): finance's log_spend. */
  filingTools?: (session: import('../graph/tools').GraphSession) => AiToolDef[];
  /** Runs once when installed: seed default views/dashboards/rules. */
  onInstall?: (os: LifeOSContext) => void | Promise<void>;
  /** Runs every app start after install. */
  onStart?: (os: LifeOSContext) => void | Promise<void>;
}
