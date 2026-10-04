# LifeOS — contracts for modules, boards and automations (agreed 4 Oct 2026; as built in R0)

How to write each tier. The shapes below are the contract; `docs/MODEL.md`
says why. Status: **built in R0** (4 Oct 2026). Where the code differs from the first draft, this file follows the code.

## Folders and the one-way rule

```
src/core        plumbing + the core Objects (link, cycle, event, fact, dump, filing); imports nothing above
  domain/fields.ts   the closed Field type registry      repo/recordRepo.ts  records
  filing/            dumps.ts, messages.ts, parsers/     repo/filingRepo.ts  what filing wrote (To check)
src/modules/<m> one ModuleManifest: Objects, filing, sources, AI tools, triggers, actions; imports @core only
src/boards/<b>  one BoardManifest: overview, tiles, screens, overrides, quick actions; imports @core, @modules, @ui
src/ui          design system, Field renderers, the generic screens (ListScreen, RecordScreen, FormScreen, LinksView); imports @core only
src/screens     app-shell screens (Dump, To check, lock); may use platform
src/platform    app-shell glue (boot, filing runner, notifications, native bridges)
app/            expo-router routes, thin
```

`src/core/deps.test.ts` reads every import and fails the build when a tier
imports upward, a module imports another module or UI, or core imports React
Native at runtime (a type-only React import is allowed). Its allowlist is empty.

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
  fields: Field[];            // the schema; `schemaFor(fields)` derives zod (today every Object still passes its own `schema`; R1+ drop it per module)
  schema: ZodTypeAny;
  links?: LinkWordDef[];      // the link words this Object takes part in
  indexed?: string[];         // Fields that get an expression index
  statuses?: FieldOption[];
  occurredAtField?: string;   // which Field is the record's domain time
  title?(data: T): string; subtitle?(data: T, f: Fmt): string | undefined; searchText?(data: T): string;
  cycleTemplates?(data: T): CycleSeed[];                    // new Vehicle → service, insurance, PUC
  cycleFields?: Record<string, { nextDueAt?: string; lastDoneAt?: string; nextDueMeter?: string }>;
  cycleActiveStatuses?: string[];
  meters?: Array<{ meter: string; field: string; label: string; unit: string }>;
}
```

A record of an Object is an `ObjectRecord<T>` in code (TypeScript already owns
the name `Record`); in UI copy and docs it is just "a record". Likewise an
event is a `LifeEvent` in code (the DOM owns `Event`).

```ts
interface ObjectRecord<T> {
  id: string; object: string; title: string; subtitle?: string | null; data: T;   // `object` is the Object id
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
  sources?: SourceDef[];               // { id, label, modules, permission?, sync(os, since) → { readings?, messages? } }
  triggers?: TriggerDef[];             // automation contributions (no UI)
  actions?: ActionDef[];
  onInstall?(os): void; onStart?(os): void;
}
```

`filing.sentences` / `filing.parsers` and `linkWords` are not on the manifest
yet: the parsers still live in `src/core/filing/parsers` and move into finance
and deliveries in R1 / R7b. AI tool *names* (`create_entity`, `connections`…)
keep their old words for now: they are the contract the model is prompted
with and the golden fixtures are recorded against them; they change in R12
when the local model is tuned.

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
  /** 'bar': the bottom bar (today, upkeep) · 'browse': Browse › Boards · 'module': a module's companion, reached through the module. */
  placement: 'bar' | 'browse' | 'module';
  module?: string;                     // companion boards: the module this is the board of
  overview?: OverviewFn;               // the module's Overview (Browse › module, Today's area card); pure
  tiles?: TileDef[];                   // { type, name, sizes, component } — for Today and grid boards (R8)
  screens?: BoardScreen[];             // 'index' is the home; others at /module/<m>/<key> or /board/<b>/<key>
  overrides?: ObjectOverride[];        // per Object: { object, record?: sections on the Record screen (hero at the top or cards) }
  quickActions?: QuickAction[];        // the global "+" menu
  buttons?: ManualRun[];               // manual-run automations shown on this board (R10)
}
```

Every module has a companion board of the same id in `src/boards/<module>`
holding its overview, screens, quick actions and record sections (the Vehicle
hero, the Delivery OTP). Core UI generates the generic screens — List, Record,
Form, Links, and Metric for numbers — for every Object; a board only overrides.
Module colours are palette names (`'pink'`); the theme resolves them per scheme
(`useTheme().paletteColor`).

## Automations

User-built, stored as data (`automation_rules` + `automation_runs`, extended with
steps and per-step outputs). Code contributes only:
- **triggers** and **actions** from modules (above);
- **step kinds** from core: `create`, `set`, `link`, `roll_cycle`, `post_transaction`,
  `notify`, `ask_model`, `wait`, `branch`, `run_tool`;
- **templates** (`AutomationTemplate { id, name, trigger, conditions, steps }`)
  from modules or boards, offered in the editor.
A manual-run trigger lets a sentence ("run month close") or a board button start one.

## Storage (migrations v11–v13, append-only)

v11 `vocabulary`: `entities` → `records` (column `type` → `object`), `relations`
→ `links`, `timeline_events` → `events`, `entity_tags` → `record_tags`, every
`entity_id` → `record_id`, `entity_type` → `object`; `records_fts` replaces
`entities_fts` (column `object`); `dashboards` dropped. v12 `comments-are-facts`:
every comment becomes a fact with the record as subject; `comments` dropped.
v13 `filings`: `dump_extractions` → `filings`. Backups from before v11 are
mapped on import (`LEGACY_TABLE_NAMES`, `LEGACY_COLUMN_NAMES`). Object changes
(vehicle → asset, routine → habit…) are **not** in R0: each module decides them
in its own milestone.

## Writing a module, in order
1. `types.ts` — ObjectDefs with Fields. 2. parsers with fixtures (R1+: inside
the module). 3. `sources`. 4. `aiTools.ts` with tests. 5. `index.ts` — the
manifest. 6. Register in `src/modules/index.ts`. 7. Open the app: Browse shows
the module with the generic screens. 8. Only now, `src/boards/<module>/index.ts`
(overview, quick actions, record sections, screens) and register it in
`src/boards/index.ts`.
