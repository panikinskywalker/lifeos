import type { ComponentType } from 'react';
import type { ZodTypeAny } from 'zod';
import type { Entity, EntityTypeDef, WidgetSize } from '../domain/types';
import type { CoreEvents, EventName } from '../events/bus';
import type { LifeOSContext } from './context';

/* ------------------------------------------------------------------ */
/* Plugin API — the ONLY contract between core and a module.           */
/* A module is a plain object; nothing in core imports a module.       */
/* ------------------------------------------------------------------ */

export interface WidgetDef {
  /** Globally unique, e.g. "finance.spend-this-month". */
  type: string;
  module: string;
  name: string;
  description?: string;
  icon: string;
  sizes: WidgetSize[];
  defaultSize: WidgetSize;
  /** JSON-schema-ish config the dashboard editor renders. */
  configFields?: EntityTypeDef['fields'];
  component: ComponentType<WidgetProps>;
}

export interface WidgetProps {
  size: WidgetSize;
  config: Record<string, unknown>;
  ctx: LifeOSContext;
}

export interface ModuleScreen {
  /** Route segment under /module/<moduleId>/<key>; "index" is the module home. */
  key: string;
  title: string;
  component: ComponentType<{ ctx: LifeOSContext; params: Record<string, string> }>;
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
  /** Mutating tools require the user's confirmation when `confirm` is set. */
  confirm?: boolean;
}

export interface EntityDetailSection {
  entityType: string | '*';
  key: string;
  title: string;
  component: ComponentType<{ entity: Entity<any>; ctx: LifeOSContext }>; // eslint-disable-line @typescript-eslint/no-explicit-any
  order?: number;
}

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
  screens?: ModuleScreen[];
  widgets?: WidgetDef[];
  quickActions?: QuickAction[];
  triggers?: TriggerDef[];
  actions?: ActionDef[];
  aiTools?: AiToolDef[];
  detailSections?: EntityDetailSection[];
  /** Runs once when installed: seed default views/dashboards/rules. */
  onInstall?: (os: LifeOSContext) => void | Promise<void>;
  /** Runs every app start after install. */
  onStart?: (os: LifeOSContext) => void | Promise<void>;
  /** Default widgets added to the home dashboard on install. */
  defaultWidgets?: Array<{ type: string; size?: WidgetSize; config?: Record<string, unknown> }>;
}
