import type { ZodTypeAny } from 'zod';

/* ------------------------------------------------------------------ */
/* Entity envelope                                                     */
/* ------------------------------------------------------------------ */

/** The shared envelope every record in LifeOS carries. */
export interface Entity<TData = Record<string, unknown>> {
  id: string;
  type: string;
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
  type: string;
  title: string;
}

/* ------------------------------------------------------------------ */
/* Field definitions — drive forms, filters, AI tools, custom fields   */
/* ------------------------------------------------------------------ */

export type FieldType =
  | 'text'
  | 'longtext'
  | 'number'
  | 'currency'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'select'
  | 'multiselect'
  | 'relation'
  | 'json';

export interface FieldOption {
  value: string;
  label: string;
  color?: string;
}

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  /** For select/multiselect. */
  options?: FieldOption[];
  /** For relation: which entity type(s) may be linked; `relationKind` names the edge. */
  relationTo?: string | string[];
  relationKind?: string;
  /** Show in list rows / cards. */
  summary?: boolean;
  /** Extra hint for the AI assistant and forms. */
  description?: string;
  placeholder?: string;
  /** Default value when creating. */
  defaultValue?: unknown;
  /** Group fields into sections in forms. */
  section?: string;
}

/* ------------------------------------------------------------------ */
/* Entity type definition — registered once, used everywhere           */
/* ------------------------------------------------------------------ */

export interface EntityTypeDef<TData = Record<string, unknown>> {
  /** Stable id, e.g. "transaction". Never rename. */
  type: string;
  /** Owning module id. */
  module: string;
  label: string;
  labelPlural: string;
  icon: string;
  color?: string;
  /** Runtime validation for `data`. */
  schema: ZodTypeAny;
  fields: FieldDef[];
  /** Fields whose `data.<key>` get an expression index. */
  indexed?: string[];
  /** Statuses this type supports (drives kanban/board views and filters). */
  statuses?: FieldOption[];
  /** Named relation kinds this type participates in (for pickers/graph). */
  relations?: RelationKindDef[];
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

export interface RelationKindDef {
  kind: string;
  label: string;
  inverseLabel?: string;
  to: string | string[];
  cardinality?: 'one' | 'many';
}

/* ------------------------------------------------------------------ */
/* Universal filtering + saved views                                   */
/* ------------------------------------------------------------------ */

export type FilterOp =
  | 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte'
  | 'contains' | 'startsWith' | 'in' | 'notIn'
  | 'isNull' | 'notNull' | 'between'
  | 'hasTag' | 'relatedTo';

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

export interface Relation {
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

export interface TimelineEvent {
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

export interface Comment {
  id: string;
  entityId: string;
  body: string;
  author: 'user' | 'assistant' | 'automation';
  createdAt: number;
  updatedAt: number;
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
/* Dashboards & widgets                                                */
/* ------------------------------------------------------------------ */

export type WidgetSize = 'small' | 'medium' | 'large';

export interface WidgetInstance {
  id: string;
  widgetType: string;
  size: WidgetSize;
  config: Record<string, unknown>;
}

export interface Dashboard {
  id: string;
  name: string;
  icon?: string | null;
  layout: WidgetInstance[];
  sortOrder: number;
}
