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
  list?: boolean;                      // text: comma-separated, shown and typed as chips (R2: UPI IDs, Likes)
  pattern?: RegExp; patternHint?: string; // text list: what each item must look like ("{item}" in the hint)
  onCreateOption?: (label) => FieldOption | null; // select: options you add ("New…"; finance categories, crm relationships)
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
  sources?: SourceDef[];               // see Sources below
  filing?: { parsers?: MessageParser[] };
  filingTools?: (session: GraphSession) => AiToolDef[];
  aiTools?: AiToolDef[];               // unchanged: { name, description, input: zod, run, confirm?, describe? }; read and write
  sources?: SourceDef[];               // see Sources below
  filing?: { parsers?: MessageParser[] };
  filingTools?: (session: GraphSession) => AiToolDef[];
  triggers?: TriggerDef[];             // automation contributions (no UI)
  actions?: ActionDef[];
  onInstall?(os): void; onStart?(os): void;
}
```

### Filing (R1, as built)

```ts
// src/core/filing/contract.ts
interface MessageParser {
  id: string; module: string;             // 'finance.money', 'deliveries.shipping', 'travel.bookings'
  priority?: number;                      // lower runs first (shipping 10, bookings 20, money 30)
  untrusted?: boolean;                    // reads SMS from senders you have not trusted (couriers, shops)
  proposes?: boolean;                     // first-run history as proposals for the review screen
  sender?(from, body): { name?, trusted? } | null;   // names bank senders, trusts them by default
  label?(m: RawMessage): string | null;   // "HDFC Bank SMS", "GPay" in To check
  read(os, m: RawMessage): ParserRead | null;        // what it understood, as JSON ({ kind: 'skip', reason } = mine, nothing to file)
  file(os, m, read, ctx: FileContext): FileOutcome;  // records with provenance (os.filings); ctx.related links a ticket's payment to its flight
}
```

Core keeps the queue (`src/core/filing/queue.ts`), sender trust and dispatch
(`messages.ts`): every parser that read something files, in priority order;
no parser → a dismissed leftover. A module declares `filing: { parsers }` and,
for tools the model gets while filing a dump, `filingTools(session)` (finance:
`log_spend`; places: `file_place`). `ObjectDef.enrich(os, data, { text })` fills defaults for a record
made from a sentence (finance: the category; places: a Place's or
Organisation's kind from its name), so core's generic tools never import a
module; core's `upsertNode` calls it for every record it makes from a name (R3).

Places (R3) files without a source of its own: it listens for Events created
or edited with a `location` (whoever wrote them: projects' calendar source,
travel's booking parser, a dump) and links them *at* a Place, and its mail
parser `places.mail` runs last (priority 90) so it can mark what the other
parsers filed from a mail as *sent by* the Organisation whose website matches
the sender; when it is the only reader the mail stays a dismissed leftover.

### Sources (R1, as built)

```ts
interface SourceDef {
  id: string; label: string; modules: string[]; permission?: string;
  kind: 'messages' | 'readings'; messageSource?: 'sms' | 'notification' | 'email';
  history?: boolean; available?(os): Promise<boolean>;
  sync(os, since, { mode }): Promise<{ messages?: Message[]; readings?: Reading[]; filed?: number; cursor?: string }>;
  /** Sources that also write (R9c.2): send what waits in os.outbox, in order. */
  send?(os, items: OutboxItem[]): Promise<Array<{ id: string; state: 'sent' | 'refused' | 'waiting'; error?: string; result?: unknown }>>;
}
```

A module's `sync` reads the phone through `os.device` (the `DeviceBridge` in
`src/core/registry/context.ts`: sms, notifications, mail — platform fills it at
boot) and never imports platform code. `runSource` in `src/core/filing/sources.ts`
files messages through the parsers in batches, upserts readings by `sourceKey`
(the Object's schema must keep that field) and records the source's state.
Finance declares sms, notifications and gmail; crm declares contacts and
calllog (R2: `os.device.contacts` reads the phone's contacts, `os.device.callLog`
the calls; both are `readings` sources that file their own records and report
`filed`); projects declares calendar (R4: `os.device.calendar.read(from, to)`
hands over the phone's events, a month back and two ahead, and the module files
them as Events); usage and health stay in platform until R6.

crm also declares `notion` (R2b): a `readings` source that also writes, to a
copy of your Notion People CRM only (`src/modules/crm/notion/client.ts`:
`assertWritable` and a request-level guard refuse the original). Token in
`os.device.secrets` (`notion.token`); target, cursor and the per-Person last
agreed values in settings (`crm.notion.*`); changes wait in `os.outbox`, one
item per Person. Migration **v15** `facts-from-notion` lets a Fact's source be
`notion`.

**Who a sender is** (R2). `ObjectDef.identity?(data) → { upi?, phone?, email? }`
says how a record is known from outside (crm's Person: its UPI IDs, phone and
email). Core's `whoIs(os, { upi, phone, email }, objects?)`
(`src/core/identity.ts`) returns the one record it is, and by what: a UPI id on
the record, a UPI id learned as an alias in `os.aliases` (shared with Turf's
"learn a sender once"), the mobile number inside a UPI id, the email; an
ambiguous phone or email is no match. Finance's `payeeFor` asks it first; a
module that matches payments never imports crm.

`os.device.secrets` (get / set) is the phone's secure store for tokens a
source needs; never settings, never a backup. Games declares `turf` (R9c.1):
a `readings` source that fetches Turf web's `GET /api/sync?since=N` with the
phone's key (`Authorization: Bearer tw_…`) and applies the page itself
(`applyTurfSync`: Person / Place matching, the Football group, payment entries
as Events, tombstones archived, Debts recomputed), so it reports `filed` rather
than handing back readings. Its cursor is Turf web's change number, kept by
the module (`turf.rev`); core's time-based `since` is not used.

**Sources that also write** (R9c.2). A change made in LifeOS for such a source
is added to `os.outbox` (`src/core/repo/outboxRepo.ts`, table `outbox`,
migration v14, in backups) with its own id, a label in your words, the record
it is about and a payload only the module reads. `runSource` sends what waits
for the source (`sendWaiting`) before it syncs: the module's `send` answers
each item sent, refused (with the source's words) or waiting; core marks the
outbox; unanswered items keep their place, and a throw (offline) leaves every
one waiting with the reason. The module shows the change at once and undoes
it on a refusal, since only it knows what it showed. Games: `recordPayment` /
`markPaid` queue a Turf web `PATCH /api/data` `{ action: 'payment' }` and add a
*sending* payment Event; `send` posts them to `POST /api/actions`; the synced
payment row carrying the same `action_id` replaces the sending Event.
Every other games change (`games/changes.ts`: attendance, stats, score,
captain, player of the match, new and edited matches) is applied to the
records at once and queued with an `undo` (the records as they were, the
records it made), which a refusal restores. A new match is made with the
source key `turf:games:local-<change id>`; when Turf web answers with its id,
`remapLocalMatch` re-keys it and its shares, and `resolveLocal` fills the
real id into changes queued after it (the batch is cut until it is known).
`runSource` does not sync while changes still wait after sending, so a
change shown here is never overwritten by the source's older copy.
Turf web's pure rules live beside the module's code as copies, each naming the
Turf web version and file it came from (`rules.ts`, `ratings.ts`,
`balance.ts`, `kits.ts`); they decide what LifeOS shows at once and offline,
and Turf web's answer on the next sync wins.

AI tool *names* (`create_entity`, `connections`…) keep their old words for
now: they are the contract the model is prompted with and the golden fixtures
are recorded against them; they change in R12 when the local model is tuned.

Gone from the module: `screens`, `widgets`, `quickActions`, `detailSections`,
`overview`, `defaultWidgets`. `aiTools` stay as they are: a module's read and
write tools, with `confirm` and `describe`, called by whichever model is first
in the chain (the local Ajax-like model, then the Mac model, then cloud). Boards
may call a module's read tools directly as functions. Core keeps its generic
tools (`create_record`, `set_fields`, `link`, `record_event`, `search`…),
driven by Object schemas.

## The brain (MODEL.md layer 8, slice 3; built 31 Oct)

```ts
// src/core/brain/contract.ts
type NudgeKind = 'running out' | 'going off' | 'due' | 'coming up';
type NudgeShape = 'done' | 'check' | 'ask';            // filing kinds nudge-done · nudge-check · nudge-ask
type Plain = string | number | boolean | null | string[];

interface Ask { key: string; slot: string; prompt: string; record?: Record<string, Plain> }
interface Candidate {
  key: string;                    // stable while it is the same notice; filed once ('crm:bday:<id>:2026')
  kind: NudgeKind; shape: NudgeShape;
  subjectId?: string | null;      // the record the card and the brief line open
  route?: string;                 // or a screen ('/board/turf/dues')
  title: string;
  line: string;                   // code's own words: used when Claude is not asked
  record: Record<string, Plain>;  // the only thing that leaves the phone
  urgent?: boolean; rank?: number;   // urgent first, then lower rank
  yes?: string;                   // the main verb (ask: 'Send in WhatsApp'; check: 'Right')
  asks?: Ask[];                   // slots Claude fills with it (gift ideas, the wish)
  payload?: unknown;              // read only by the module's act
}
interface BrainDef {
  candidates(os, now): Candidate[];
  asks?(os, now): Ask[];          // fills that are not nudges (Home's Cook tonight)
  /** apply (done shape, at filing; returns what undo needs) · yes · no (Not this) · undo. May return { open: url }. */
  act?(os, verb: 'apply' | 'yes' | 'no' | 'undo', nudge: Nudge): unknown;
  skills?: Array<{ name: string; body: string }>;   // the module's starting rules
}
ModuleManifest.brain?: BrainDef
```

Core (`src/core/brain/`): `runPass(os, { pass, model, now })` gathers every
module's candidates plus core's Upkeep ones (due Cycles of modules without a
`brain`), drops keys already filed or turned down, keeps the per-module limit,
asks Claude once (the learned store answers what it can; nothing new, no call),
files a `nudges` row and a filing per nudge (`source: 'brain'`,
`sourceRef: <pass id>`, `kind: nudge-<shape>`), stores the fills, logs the send
and notifies up to three a day. Claude is reached through `BrainModel`
(`src/core/ai/brainModel.ts`: the Messages API over fetch, the system prompt
cached with `cache_control`); tests pass a mock. Stores: `os.brain.learned`,
`os.brain.skills`, `os.brain.nudges`, `os.brain.sent` (migration v16, all in
backups). A board reads a fill with `os.brain.learned.get(key)`, the key made
by the module's exported helper (crm `giftIdeasKey`, `wishKey`; inventory
`dishAsk`).

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
  overrides?: ObjectOverride[];        // per Object: { object, form?: the Object's form (new and edit; R2), record?: sections on the Record screen — placement 'page' draws the whole page, 'hero' replaces the header (both get RecordControls: back, edit, more, cover, link, tags, attach; 'page' also gets `say`), 'top' above the details, else cards }
  checkCards?: Record<string, ComponentType<{ filing }>>; // To check cards for filing kinds (Turf's SMS questions; crm's 'payee-who')
  quickActions?: QuickAction[];        // the global "+" menu
  buttons?: ManualRun[];               // manual-run automations shown on this board (R10)
  checkCards?: Record<string, ComponentType<{ filing: Filing }>>; // To check cards for its own filing kinds
}
```

A board can put its own questions in **To check**: a module adds a filing of
its own `kind` (`os.filings.add`), and the board's `checkCards[kind]` is drawn
for it in place of the usual tick / edit / cancel row (`app/check.tsx`). Turf:
`turf-payment-ask` (an SMS that may pay a share — Yes / Not this),
`turf-payment` (a share recorded from an SMS — Undo), `turf-submission` (a
friend's profile — Review / Later).

A board screen's query parameters must not be called `id`: the route
`/board/[id]/[page]` already uses `id` for the board, so `?id=` never reaches
the screen (Turf uses `?game=`, `?player=`, `?venue=`, `?sub=`).

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
