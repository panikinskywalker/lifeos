# LifeOS — contracts for modules, boards and automations (R0, agreed 4 Oct 2026)

How to write each tier. The shapes below are the contract; `docs/MODEL.md`
says why. Status: **agreed 4 Oct 2026** — implemented by R0.

## Folders and the one-way rule

```
src/core        plumbing + the core Objects (link, cycle, event, fact, dump); imports nothing above
src/modules/<m> one ModuleManifest: Objects, filing, sources, AI tools, triggers, actions; imports @core only
src/boards/<b>  one BoardManifest: tiles, screens, overrides; imports @core, @modules, @ui
src/ui          design system, Field type renderers, the six generic screens; imports @core only
src/platform    app-shell glue (boot, notifications, native bridges)
app/            expo-router routes, thin
```

A test (`src/core/deps.test.ts`) reads imports and fails the build when a tier
imports upward or a module imports another module.

## Field types (core, closed)

```ts
type FieldType =
  | 'text' | 'longtext' | 'number' | 'money' | 'date' | 'datetime' | 'duration'
  | 'select' | 'multiselect' | 'boolean' | 'link' | 'contact' | 'file'
  | 'location' | 'meter';

/** One per FieldType, registered in core. The UI has one renderer per type for row / record / form / tile. */
interface FieldTypeDef<T> {
  type: FieldType;
  parse(text: string, ctx: ParseCtx): T | undefined;          // filing: from a sentence / SMS / mail
  format(value: T, ctx: FormatCtx): string;                   // row and record text
  query: { ops: FilterOp[]; aggregate?: Array<'sum' | 'avg' | 'min' | 'max' | 'count'>; buckets?: boolean };
  zod(field: Field): ZodTypeAny;                              // validation, derived per Field
}

interface Field {
  key: string; label: string; type: FieldType;
  required?: boolean; summary?: boolean; section?: string; description?: string; default?: unknown;
  unit?: string;                       // number, duration, meter
  currency?: 'fixed' | 'perRecord';    // money
  options?: FieldOption[];             // select, multiselect
  linkTo?: string | string[] | 'any';  // link: Object id(s)
  linkWord?: string;                   // link: the Link's word ("works at", "paid")
  contactKind?: 'phone' | 'email' | 'url';
}
```

Today's `currency` → `money`, `relation` → `link`, `json` → removed (use real
Fields). New: `duration`, `contact`, `file`, `location`, `meter`.

## Object (replaces EntityTypeDef)

```ts
interface ObjectDef<T = Record<string, unknown>> {
  id: string;                 // 'person' — stable, never renamed
  module: string;
  label: string; labelPlural: string; icon: string;
  fields: Field[];            // the schema; zod is derived from it (a module may tighten with `refine`)
  indexed?: string[];         // Fields that get an expression index
  statuses?: FieldOption[];
  occurredAtField?: string;   // which Field is the record's domain time
  title?(data: T): string; subtitle?(data: T, f: Fmt): string | undefined; searchText?(data: T): string;
  cycles?: {
    templates?(data: T): CycleSeed[];                       // new Vehicle → service, insurance, PUC
    writeBack?: Record<string, { nextDueAt?: string; lastDoneAt?: string; nextDueMeter?: string }>;
    activeStatuses?: string[];
  };
  refine?(schema: ZodObject): ZodTypeAny;
}
```

A record of an Object is an `ObjectRecord<T>` in code (TypeScript already owns
the name `Record`); in UI copy and docs it is just "a record".

```ts
interface ObjectRecord<T> {
  id: string; object: string; title: string; subtitle?: string | null; data: T;
  status?: string | null; starred: boolean; archived: boolean;
  occurredAt?: number | null; createdAt: number; updatedAt: number; deletedAt?: number | null; version: number;
}
```

## Module

```ts
interface ModuleManifest {
  id: string; name: string; version: string; description: string; icon: string; color: string;
  objects: ObjectDef[];
  linkWords?: LinkWordDef[];           // { word, inverse, from: ObjectId[], to: ObjectId[] | 'any' }
  filing?: {
    sentences?: SentenceRule[];        // on-phone parser patterns → tool calls, with confidence
    parsers?: MessageParser[];         // per-sender: { id, matches(msg), parse(msg) → filed records + confidence }
  };
  sources?: SourceDef[];               // { id, label, modules, permission?, sync(os, since) → { readings?, messages? } }
  aiTools?: AiToolDef[];               // unchanged: { name, description, input: zod, run, confirm?, describe? }; read and write
  triggers?: TriggerDef[];             // automation contributions (no UI)
  actions?: ActionDef[];
  onInstall?(os): void; onStart?(os): void;
}
```

Gone from the module: `screens`, `widgets`, `quickActions`, `detailSections`,
`overview`, `defaultWidgets`. `aiTools` stay as they are: a module's read and
write tools, with `confirm` and `describe`, called by whichever model is first
in the chain (the local Ajax-like model, then the Mac model, then cloud). Boards
may call a module's read tools directly as functions. Core keeps its generic
tools (`create_record`, `set_fields`, `link`, `record_event`, `search`…),
driven by Object schemas.

## Board

```ts
interface BoardManifest {
  id: string; name: string; icon: string; color: string;
  /** Pinned in the bottom bar (today, upkeep) or a tile in Browse (everything else). */
  placement: 'bar' | 'browse';
  tiles?: TileDef[];                   // { id, name, sizes, component } reading module tools / core queries — for Today and grid boards
  screens?: ScreenDef[];               // routes under /board/<id>/<key>
  overrides?: ObjectOverride[];        // per Object: { object, record?: { hero?, sections? }, list?: { row? }, overview?: { blocks? } }
  buttons?: ManualRun[];               // manual-run automations shown on this board
}
```

Every module has a companion board of the same id in `src/boards/<module>`
holding its overrides (the Measurement hero chart, the Delivery OTP). Core UI
generates the six generic screens — Overview, List, Record, Form, Metric, Links
— for every Object; a board only overrides.

## Automations

User-built, stored as data (`automation_rules` + `automation_runs`, extended with
steps and per-step outputs). Code contributes only:
- **triggers** and **actions** from modules (above);
- **step kinds** from core: `create`, `set`, `link`, `roll_cycle`, `post_transaction`,
  `notify`, `ask_model`, `wait`, `branch`, `run_tool`;
- **templates** (`AutomationTemplate { id, name, trigger, conditions, steps }`)
  from modules or boards, offered in the editor.
A manual-run trigger lets a sentence ("run month close") or a board button start one.

## Storage (migration v11, append-only)

Tables renamed to the vocabulary: `entities` → `records` (column `type` →
`object`), `relations` → `links`, `timeline_events` → `events`. `comments` rows
become `facts`; `reminders` rows become one-off `cycles`; both old tables
dropped after copy. Object cuts from MODEL layer 2 are data migrations in the
same version (vehicle → asset, routine → habit, habit_log → event, subscription
→ cycle, budget → category setting, org kinds → organisation). `entities_fts`
is rebuilt once as `records_fts`.

## Writing a module, in order
1. `objects.ts` — ObjectDefs with Fields. 2. `filing/` — sentence rules and
parsers with fixtures. 3. `sources.ts`. 4. `aiTools.ts` with tests.
5. `index.ts` — the manifest. 6. Register in `src/modules/index.ts`.
7. Open the app: Browse shows the module with its six generic screens.
8. Only now, `src/boards/<module>/` for overrides.
