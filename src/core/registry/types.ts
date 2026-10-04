import type { ComponentType } from 'react'; // type-only: core has no runtime dependency on React (deps.test allows `import type`)
import type { ZodTypeAny } from 'zod';
import type { Entity, EntityTypeDef, WidgetSize } from '../domain/types';
import type { CoreEvents, EventName } from '../events/bus';
import type { LifeOSContext } from './context';

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
  configFields?: EntityTypeDef['fields'];
}

export interface AutomationContext {
  entity?: Entity;
  previous?: Entity;
  changed?: string[];
  vars: Record<string, unknown>;
}

export interface ActionDef {
  id: string;
  module: string;
  label: string;
  description?: string;
  configFields?: EntityTypeDef['fields'];
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
  component: ComponentType<{ entity: Entity<any>; ctx: LifeOSContext }>; // eslint-disable-line @typescript-eslint/no-explicit-any
  order?: number;
  /** 'top': above the details card (Stitch stat trio, attention, quick actions). Default: below it. */
  placement?: 'top' | 'body';
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
  configFields?: EntityTypeDef['fields'];
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
  entityTypes?: EntityTypeDef<any>[]; // eslint-disable-line @typescript-eslint/no-explicit-any
  triggers?: TriggerDef[];
  actions?: ActionDef[];
  aiTools?: AiToolDef[];
  /** Runs once when installed: seed default views/dashboards/rules. */
  onInstall?: (os: LifeOSContext) => void | Promise<void>;
  /** Runs every app start after install. */
  onStart?: (os: LifeOSContext) => void | Promise<void>;
}
