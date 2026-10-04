import type { ZodTypeAny } from 'zod';
import type { Field, FieldOption as FieldOptionNew, FieldType as FieldTypeNew, FilterOp as FilterOpNew } from './fields';

/* ------------------------------------------------------------------ */
/* Record envelope (docs/MODEL.md: Object / Field / Record)            */
/* R0 stage A: the vocabulary names exist alongside the old ones; the  */
/* old names are removed in stage C. TypeScript owns `Record`, so a    */
/* record in code is an ObjectRecord; DOM owns `Event`, so a timeline  */
/* event in code is a LifeEvent.                                       */
/* ------------------------------------------------------------------ */

/** One row of an Object: the shared envelope every record carries. */
export interface ObjectRecord<TData = Record<string, unknown>> {
  id: string;
  /** The Object this record belongs to ('person', 'transaction'). */
  object: string;
  title: string;
  subtitle?: string | null;
  data: TData;
  status?: string | null;
  starred: boolean;
  archived: boolean;
  /** Domain time (when the transaction happened, the trip starts...). */
  occurredAt?: number | null;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number | null;
  version: number;
}

export interface EntityRef {
  id: string;
  object: string;
  title: string;
}

/* ------------------------------------------------------------------ */
/* Field definitions — drive forms, filters, AI tools, custom fields   */
/* ------------------------------------------------------------------ */

export type FieldType = FieldTypeNew;

export type FieldOption = FieldOptionNew;
export type { Field };

/* ------------------------------------------------------------------ */
/* Object definition — registered once, used everywhere                 */
/* ------------------------------------------------------------------ */

/** An Object: the definition of a storage unit — name, Fields, cycles. */
export interface ObjectDef<TData = Record<string, unknown>> {
  /** Stable id, e.g. "transaction". Never rename. */
  id: string;
  /** Owning module id. */
  module: string;
  label: string;
  labelPlural: string;
  icon: string;
  color?: string;
  /** Runtime validation for `data`. */
  schema: ZodTypeAny;
  fields: Field[];
  /** Fields whose `data.<key>` get an expression index. */
  indexed?: string[];
  /** Statuses this type supports (drives kanban/board views and filters). */
  statuses?: FieldOption[];
  /** The link words this Object takes part in (pickers, the Links screen). */
  links?: LinkWordDef[];
  /** Which field's value maps into the envelope's occurredAt. */
  occurredAtField?: string;
  /** Derive title/subtitle from data (used when the form has no title input). */
  computeTitle?: (data: TData) => string;
  computeSubtitle?: (data: TData, ctx: { formatCurrency: (n: number, c?: string) => string }) => string | undefined;
  /** Plain-text body for full text search. */
  searchText?: (data: TData) => string;
  /** Default saved views shipped with the type. */
  defaultViews?: SavedViewDef[];
  /** Hide from generic "browse all" screens. */
  hidden?: boolean;
  /** Meters the record tracks (a vehicle's odometer), mirrored into a data field; cycles read the latest reading. */
  meters?: Array<{ meter: string; field: string; label: string; unit: string }>;
  /** Template cycle → data fields it writes back after done/skip/set (keeps "Next billing date" true). Dates as yyyy-MM-dd. */
  cycleFields?: Record<string, { nextDueAt?: string; nextDueMeter?: string; lastDoneAt?: string }>;
  /** Statuses in which the record's cycles are live (Subscription: active). Others drop out of Upkeep. */
  cycleActiveStatuses?: string[];
  /** Default cycles a new record of this type gets (Upkeep), derived from its data. */
  cycleTemplates?: (data: TData) => CycleSeed[];
  /**
   * Fill sensible defaults for a record made from a sentence or a message (the
   * category of a spend from its merchant and text). Returns only the fields to
   * add; never overwrites what was given. Core calls it from its generic tools.
   */
  enrich?: (os: import('../registry/context').LifeOSContext, data: Partial<TData>, context: { text?: string }) => Partial<TData>;
}

/** A default cycle from a type's template; `template` keeps it from being added twice. */
export interface CycleSeed {
  template: string;
  name: string;
  kind: 'interval' | 'fixed' | 'meter' | 'either';
  everyN?: number | null;
  everyUnit?: 'day' | 'week' | 'month' | 'year' | null;
  meterEvery?: number | null;
  lastDoneAt?: number | null;
  lastMeter?: number | null;
  nextDueAt?: number | null;
  nextDueMeter?: number | null;
  leadDays?: number;
  costEstimate?: number | null;
  currency?: string | null;
}

export interface LinkWordDef {
  kind: string;
  label: string;
  inverseLabel?: string;
  to: string | string[];
  cardinality?: 'one' | 'many';
}

/* ------------------------------------------------------------------ */
/* Universal filtering + saved views                                   */
/* ------------------------------------------------------------------ */

export type FilterOp = FilterOpNew;

export interface FilterClause {
  /** Envelope field ("title","status","occurredAt","createdAt") or "data.<key>". */
  field: string;
  op: FilterOp;
  value?: unknown;
}

export interface FilterGroup {
  and?: Array<FilterClause | FilterGroup>;
  or?: Array<FilterClause | FilterGroup>;
}

export interface SortSpec {
  field: string;
  dir: 'asc' | 'desc';
}

export interface ViewDefinition {
  filter?: FilterGroup;
  sort?: SortSpec[];
  groupBy?: string;
  layout?: 'list' | 'board' | 'calendar' | 'timeline' | 'grid';
  /** Fields to show as columns/badges. */
  columns?: string[];
  includeArchived?: boolean;
  search?: string;
}

export interface SavedViewDef {
  id?: string;
  name: string;
  icon?: string;
  definition: ViewDefinition;
  isDefault?: boolean;
}

/* ------------------------------------------------------------------ */
/* Side objects                                                        */
/* ------------------------------------------------------------------ */

/** A Link: one typed connection between two records. */
export interface Link {
  id: string;
  fromId: string;
  toId: string;
  kind: string;
  meta: Record<string, unknown>;
  createdAt: number;
  /** Where the link came from (docs/GRAPH.md): dump, record-voice, manual, sms, assistant. */
  source?: string | null;
  sourceId?: string | null;
  confidence?: number;
}

/** An Event: something that happened at a time, attached to a record. (LifeEvent in code: the DOM owns `Event`.) */
export interface LifeEvent {
  id: string;
  entityId: string;
  kind: string; // created | updated | status | comment | attachment | relation | reminder | custom
  title: string;
  body?: string | null;
  actor: 'user' | 'automation' | 'assistant' | 'system';
  meta: Record<string, unknown>;
  occurredAt: number;
  createdAt: number;
}

export interface Attachment {
  id: string;
  entityId: string;
  name: string;
  mime?: string | null;
  size?: number | null;
  uri: string;
  /** 'cover': the record's photo header — at most one live per record. */
  kind: 'file' | 'image' | 'receipt' | 'link' | 'cover';
  createdAt: number;
}

export interface Reminder {
  id: string;
  entityId?: string | null;
  title: string;
  body?: string | null;
  dueAt: number;
  rrule?: string | null;
  nextAt?: number | null;
  doneAt?: number | null;
  snoozedUntil?: number | null;
  notificationId?: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface Tag {
  id: string;
  name: string;
  color?: string | null;
  createdAt: number;
}

export interface CustomFieldDef {
  id: string;
  entityType: string;
  key: string;
  label: string;
  fieldType: FieldType;
  options: { options?: FieldOption[] };
  sortOrder: number;
}

/* ------------------------------------------------------------------ */
/* Tiles (boards)                                                      */
/* ------------------------------------------------------------------ */

export type TileSize = 'small' | 'medium' | 'large';
/** @deprecated R0: TileSize. */
export type WidgetSize = TileSize;
