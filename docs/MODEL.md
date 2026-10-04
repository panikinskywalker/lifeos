# LifeOS — the model (single source of truth)

Started 1 Oct 2026 as the reset. This file says what exists in the app: the
words, the Objects, the modules, the inputs, the screens. Code must match
it; anything in code that is not described here is to be removed. It replaces
`ARCHITECTURE.md`, `GRAPH.md` and section C of `SCOPE.md` once complete.
Built one layer at a time; a layer is marked **agreed** or **proposed**.

## 1. Vocabulary — agreed 1 Oct, Object / Field / Record added 4 Oct

One word per concept. The right-hand column lists words that are retired from
docs, code and UI copy.

| Concept | Word | Retired |
|---|---|---|
| A storage unit: its name, fields, cycles, filing rules (Person, Task, Transaction) | **Object** | kind, type, entity type |
| A column on an Object (phone, birthday, amount) | **Field** | attribute, property, column |
| One row of an Object (Karan is a record of Person) | **Record** | entity, node, item |
| A typed connection between two records | **Link** | relation, edge, connection |
| A chart of a number over time (tile, Metric screen) | **Graph** / chart | — (never the network view) |
| The network picture around a record (its screen) | **Links** | graph view, life graph, links map |
| Something that happened at a time, attached to records | **Event** | timeline event, log |
| One line said in passing, about a record | **Fact** | Notes bullets, comment |
| Long-form text you wrote | **Note** | knowledge note |
| Raw input, verbatim, immutable | **Dump** | one box, talk message |
| Anything recurring on a record | **Cycle** | reminder, scheduled job, subscription-as-field |
| Where data comes from automatically | **Source** | connector, ingest |
| Turning input into records | **Filing** | extraction, ingest, parse |
| What filing isn't sure about | **To check** | review, queue |

Consequences:
- Everything stored is an Object. Core owns Link, Cycle, Event, Fact and Dump as
  Objects; modules own the domain Objects. One link between two records is a
  record of the Link Object.
- An Object is a definition, not necessarily its own table. Core decides storage
  (today: one shared table, Object fields in JSON). Nothing above core depends on it.
- The Link records across every module form one **context graph** (the
  enterprise-context-graph idea at personal scale): records are the nodes, Links
  the labelled edges, each with provenance (source, sentence, when, confidence).
  Filing writes into it, the Links screen draws it, and Talk answers by walking
  it one or two hops out from what search found.
- Comments are Facts (a Fact has a subject record, text, date, source).
- A one-off reminder is a Cycle with a single occurrence.
- A record's timeline is simply the Events linked to it, system ones included
  (created, edited, cycle done) and life ones (met, flew, serviced).

## 2. Objects — proposed; each module's Objects are decided in that module's milestone (layer 6)

Link, Cycle, Event, Fact and Dump are core Objects (Dump, Fact and Event are
also listed under Mind and Agenda below because that is where you browse them).
Every record of any Object has: title, created / updated, archived, tags,
attachments, and can carry links, facts, events, cycles and notes.

### People
| Object | Meaning | Key fields | Filed by |
|---|---|---|---|
| **Person** | Someone in your life | relationship, phone, email, birthday (yearly cycle), company → Organisation link, keep-in-touch cycle | you, dumps, contacts, SMS/UPI payer match |
| **Group** | A set of people (Goa gang, flat, family) | members, kind | you, dumps, splits |
| **Organisation** | A company, shop, bank, payee | kind (employer / shop / payee / bank / brand), UPI ids, category | SMS, mail, dumps, you |

### Things
| Object | Meaning | Key fields | Filed by |
|---|---|---|---|
| **Asset** | Something you own, vehicles included | category (vehicle / device / appliance / …), bought on, price, vendor → Organisation, warranty cycle, meter readings (km, hours) for cycles by meter, serial, location → Place | dumps, you, mail receipts |
| **Document** | ID, policy, contract, certificate | kind, number, issuer → Organisation, issued, expires (cycle), file, about → any record | you, dumps, mail |
| **Delivery** | A parcel on its way | shop → Organisation, carrier, tracking, expected, status, OTP, order → Transaction link | SMS, mail |

### Money
| Object | Meaning | Key fields | Filed by |
|---|---|---|---|
| **Account** | Bank, card, cash, wallet, investment, loan | kind, last-4, currency, opening balance, limit | SMS discovery, you |
| **Transaction** | Money moved | amount, currency (+ INR value), direction (out / in / transfer), when, account, payee → Organisation or Person, category, raw text, source | SMS, notifications, mail, dumps, cycles done |
| **Debt** | I owe / owes me, from a split or a loan | counterpart → Person, amount, from → Transaction, group, settled by → Transaction | dumps, splits |

Not Objects: **Category** is a setting (name, colour, rules, monthly target).
**Subscription** is a Cycle on the Organisation (or Asset) it pays for, with
cost and auto-posted Transaction; the Subscriptions report lists those cycles.
**Budget** is the monthly target on a Category.

### Body
| Object | Meaning | Key fields | Filed by |
|---|---|---|---|
| **Measurement** | One reading of a metric | metric (steps / sleep / heart rate / weight / water / custom), value, unit, when, source | Health Connect, dumps, you |
| **Workout** | A session | type, duration, distance, calories, when, source | Health Connect, dumps |

Screen time is a Measurement too (metric = screen time, with per-app
breakdown in data), filed by Usage access.

### Mind
| Object | Meaning | Key fields | Filed by |
|---|---|---|---|
| **Dump** | What you said, verbatim, immutable | text, when, source (typed / voice / shared), subject record (optional), filing state | you |
| **Note** | Long-form text, markdown, `[[links]]` | kind (idea / journal / meeting / reference), body | you, dumps |
| **Fact** | One line about a record | subject, text, when, source, confidence, active | dumps, you, filing |

### Places
| Object | Meaning | Key fields | Filed by |
|---|---|---|---|
| **Place** | Somewhere you go | kind (home / city / restaurant / gym / …), address, coordinates, parent → Place | dumps, calendar, mail |

### Agenda (module `agenda`; the day / month / year view keeps the name Time)
| Object | Meaning | Key fields | Filed by |
|---|---|---|---|
| **Event** | Something that happened or will | kind (met / call / flight / stay / service / meeting / check-in / created / edited / cycle done …), start, end, roles → records, kind-specific fields | everything |
| **Task** | Something to do | due, done, priority, project → Project, people | dumps, you, mail |
| **Project** | A set of tasks and events with an aim | status, target date, spend (derived) | dumps, you |
| **Trip** | Travel with dates, people and spend | destination → Place, dates, companions, budget, currency | dumps, mail, calendar |
| **Habit** | Something you do on a rhythm, chores included | cadence (daily / weekdays / N per week / every N weeks / weekday), kind (habit / chore), minutes; check-ins are Events; streaks where cadence is daily-ish | dumps, you |

### Field types — proposed 4 Oct

A closed list. Every Field on every Object has one of these types, and each
type carries three things: how it renders (list row, record page, form, tile),
how it queries (filter, sort, aggregate), and how filing fills it from text,
SMS, mail or a device reading. A module's screens are derived from its schema;
it overrides only where the default is wrong (a hero chart on Measurement, the
large OTP on Delivery).

| Type | Example | Render | Query | Notes |
|---|---|---|---|---|
| text | title, Document number | one line | search, equals | |
| long text | Note body | markdown | search | |
| number | steps, quantity | value + unit | sum, avg, buckets | unit on the Field |
| money | Transaction amount | amount + currency | sum by period / category | INR value stored alongside |
| date / datetime | birthday, when | relative + absolute | day / week / month / year buckets | |
| duration | workout length, Habit minutes | h m | sum | |
| select / multi-select | direction, Event kind | chip | group by | options fixed per Object |
| boolean | Task done | tick | count | |
| link | company → Organisation | chip, opens record | related to | to one Object, or to any; stored as a Link record |
| contact | phone, email, URL | tap to call / mail / open | equals | |
| file | Document scan, receipt | thumbnail / preview | has file | |
| location | coordinates on Place | map pin | near | |
| meter | odometer | latest + history | delta | drives cycles by meter |

### Retired from today's code
| Was | Becomes |
|---|---|
| `vehicle` | Asset, category vehicle, with meter readings |
| `item` (inventory) | dropped; revisit when wanted |
| `routine` | Habit, kind chore |
| `habit_log` | Event, kind check-in |
| `subscription` | Cycle on an Organisation or Asset |
| `budget` | monthly target on a Category setting |
| `goal` | dropped; activity goals are parked in ADHOC |
| `org` with payee / merchant / shop kinds | Organisation, one kind field |
| comments | Facts |
| reminders table | Cycles |

Count: 19 domain Objects, down from 25 kinds plus two side tables.

## 3. Three tiers: core, modules, boards + automations — agreed 4 Oct

### Core (plumbing, no domain data)
Knows what a Record, Link, Fact, Event, Cycle and Dump are and how they are
stored, searched, backed up and undone. Runs the filing pipeline and To check.
Defines the Source contract. Owns the Objects every module uses: Link, Cycle, Event, Fact, Dump.

### Modules (one domain of data each; built, tested and shipped one at a time)
A module declares:
- its **Objects** with fields and the cycles they can carry (layer 2);
- its **filing rules**: how a sentence, SMS, mail or device reading becomes its records;
- the **sources** that feed it (SMS → Money, Health Connect → Body, contacts → People);
- its **AI tools**, read and write (balances, spend by category, streaks, who
  owes whom; log spend, split a bill), with confirm / describe where money or
  people are involved; called by the model in Talk and filing, and by boards;
- nothing visual beyond field definitions; Browse renders a default list /
  record / form for every module, so a module is usable the day it lands.
Rules: a module never imports another module. It reaches other modules' records
only through core Links (a Transaction links to a Person; Finance does not know
what a Person is).

**The modules (decided 4 Oct: all twelve existing data modules stay):**
`finance` (Account, Transaction, Debt, Subscription, Budget, Group) · `crm`
(Person) · `projects` (Task, Project, Goal, Event) · `travel` (Trip) · `assets`
(Asset, Vehicle) · `inventory` (Item) · `documents` (Document) · `health`
(Measurement, Workout) · `habits` (Habit, Habit log, Routine) · `knowledge`
(Note) · `places` (Place, Organisation) · `deliveries` (Delivery). `dashboard`
and `automation` own no data and become boards. Later as wanted: `games`
(matches, teams, scores), … Each module's Objects and Fields are settled in its
own milestone (layer 6), not before.

### Boards (the top tier: what you see on screen)
A screen, or a set of screens, that connects modules into a purpose. It owns screens, tiles,
charts, reports and its own settings, and defines **no Objects**; if it needs a
new Object, that is a new module. It may add filing hints scoped to itself
(e.g. "₹147 in from someone in the Football group is a turf share").
- **Turf**: People (players, Football group) + Money (shares in, who owes) +
  Places (the turf) + Games (matches). One screen: this week's game, who paid,
  who owes, settle up.
- **Today** and **Upkeep**: boards over every module, pinned to the bottom bar.
- **Time**: what happened in a day / month / year, over every module.
- Candidates: Trip planner (Agenda + Money + People + Places), Car (Things +
  Money + Documents), Household (chores + shared bills).

### Automations (the top tier's other half: what the app does on its own)
A Board connects modules for *seeing*; an Automation connects modules for
*doing*. Think UnifyApps / Sprinklr workflows, or Apple Shortcuts. User-built,
from the same building blocks modules expose.
- **Trigger**: anything in any module — a record created or changed, a cycle due
  or done, a message filed, a time, a place reached — or a **manual run** from a
  button on Today / Browse or a sentence in the Dump box ("run month close").
- **Conditions** on the triggering record or on anything looked up.
- **Steps**, chained, each step's output available to the next: create / update
  a record, link, roll a cycle, post a transaction, notify, ask the model, wait,
  branch.
- **Run log** with inputs and outputs per step; retry; run now; enable / disable;
  templates (big spend flag, document expiry, subscription auto-post, contact
  nudge, km-based service, turf share collected → debt settled).
Modules contribute triggers and actions through their Objects and Cycles, never
UI. Core runs the engine (the existing When / If / Then engine with its loop
guard, extended to multi-step with data passing, manual runs and a model step).

Dependency direction, strictly one way: boards and automations → modules → core.
## 4. Inputs: sources and filing — proposed, revised 4 Oct

Three ways in. Only what you say becomes a Dump.

### Readings (structured, from a device or service)
Health Connect, Usage access, contacts, calendar, call log. A reading becomes a
record directly: Measurement, Workout, Event, or fields on a Person. Stamped
with its source and the source's own id, so re-syncing never duplicates. No
model, no To check.

### Messages (text from a source: SMS, payment notifications, mail)
Parsed directly by per-sender parsers on the phone → record (Transaction,
Delivery, Event…). The raw text is kept as a Field on that record, so a misparse
can be corrected and taught; raw text is cleared 60 days after filing, the record
stays. A message no parser understands is a **leftover**: kept, listed in To
check, and offered to the model when one is available. The parsers are trained
over time by per-sender rules plus what you teach: category rules, payee
aliases, trusted senders. The model path for messages should shrink toward zero.

### Dumps (what you type, say or share)
Stored verbatim as a Dump, then filed. Every record, link, fact and event filed
from it keeps the sentence it came from. **Dumps are cleared after 15 days**;
what was filed from them stays, with that sentence as provenance.

### Filing a dump, in order
1. **The sentence parser** on the phone, no network, for everyday sentences
   (did X, spent N on X, X paid me, remind me, add a chore…).
2. **The model**, only for what the parser didn't finish: the free chain, given
   the Objects' schemas as its tools, so it can only fill Fields that exist. Long
   dumps split; progress kept per chunk; never re-files what is already filed.
3. **Identity**: aliases → exact title → same-dump context → fuzzy match, per
   Object. A low-confidence match is a flagged guess, never a silent merge.
   "I / me" is never a record.
4. **Write with provenance**: every write remembers its sentence and what it
   replaced. Undo reverses exactly one write.
5. **Confidence** decides: sure → filed; a guess → filed and shown in To check;
   nothing parsed and no model available → *waiting* with why and when.

States of a dump: filed · partly filed · waiting (why, until when) · needs you ·
failed (bad model output only; never for lack of a provider). Untouched To
check items auto-approve after 15 days.

### Training the message parsers
No model is trained; the parsers are rebuilt against your real texts.
1. **Export** from the phone (You › Data sources › SMS › Export texts for the
   parser): the last 12 months of texts from banks, shops and services, one-time
   codes and personal numbers left out, each with what the parser read, what the
   app filed, and **your corrections** (category changes, "not them" on a payee,
   amounts fixed in To check).
2. **Rebuild on the Mac**: every text is a fixture; corrections are the expected
   answer; misreads become sender rules or merchant cleanups; unread texts are
   the gap list.
3. **Ship**; the next export shows what is still unread.
The same loop applies to mail and payment notifications.

### The Source contract
Each source declares: id, the modules it feeds, the permission it needs,
`sync(since)` returning readings or messages, and its state (enabled, last
sync, count today, last error). You › Data sources lists them with one
"Sync all". Sources: you (typed / voice / share), SMS, payment notifications,
Health Connect, Usage access, contacts, calendar, call log, Gmail (IMAP).

The pipeline, identity, provenance, To check and the Source contract live in
core. Per-sender parsers and Object schemas belong to the module whose records
they produce.

Deferred: the Second Brain (Notes, Facts, the `mind` module) is worked on later;
Facts still exist as a core Object because filing writes them.

## 5. Surfaces: the five tabs — proposed 4 Oct

Bottom bar: **Today · Upkeep · Dump (centre, raised) · Browse · You**. A bell
in every header opens **To check**. Everything below is either a board, a
module's default surface, or settings.

### Five generic screens, derived from Object schemas
Every module gets these for free from its Field types; it overrides only where
the default is wrong.
1. **Overview** — the module's key numbers (from its AI tools), a trend, what needs you.
2. **List** — rows rendered from the Object's fields; filter, sort, group; search.
3. **Record** — header; fields by type; cycles; events (the timeline); the
   **Links card** (every link grouped by link word, tap to open, add one by
   hand; opens the Links screen); facts; "Tell me about…" to speak an update
   into this record.
4. **Form** — fields by type; links pick records; sensible defaults; used for new and edit.
5. **Metric** — full-screen chart for any number over time: day / week / month /
   year, change vs the previous period, heat map for the year, the records
   underneath. Every tile on every board opens one.

### Today (board)
Tiles from any module, each live from real data, each opening a Metric screen:
My day (events, tasks, dues, deliveries with OTP, bills, in time order with a now
line) · Steps · Sleep · Screen time (+ top apps) · Spend this month vs usual pace ·
Upcoming · People to call · Overdue · On this day · module cards (number + 7-day
trend). Tiles can be added, removed, reordered (You › Home). An empty tile names
the permission it needs and opens You › Data sources. No placeholder numbers.

### Upkeep (board)
Every Cycle from every module by due date: overdue · this week · this month ·
later. Filter chips by module. A 7-day strip with checkable pills. Mark done
(→ Event, next due rolled, optional cost → Transaction) · snooze · skip.
"This month will cost" from cycle costs due.

### Dump (centre)
One box: type, hold to speak, or share into it. A statement is filed; a question
is answered (on-phone answer at once from search and links; a fuller answer
from the model when available). Below: the last 15 days of dumps, each with
what it filed as chips (1 person · 2 facts · 1 task), per-item Undo, and its
state (filed · waiting, why · needs you).

### Browse
**Search across the whole app** on top: every record of every module, facts,
dumps, notes, tags, attachment names, events, cycles, boards and automations by
name, settings screens, and metrics ("steps" opens the Steps metric). One index
(`records_fts` plus a small index of screens and boards); results grouped by
what they are, each opening the thing itself. Then two sections:
- **Boards** — Turf, Time, Spend, Activity, Automations, and every board added
  later; a grid of tiles, yours first, pinned before the rest. Today and Upkeep
  are boards too but sit in the bottom bar, so they are not repeated here.
- **Modules** — the twelve, in their tints, each opening its Overview → Lists →
  Records (as the grid is today).
Then **everything else lives here too**: Memory (facts), Recent, Tags, Reminders,
To check history, Data sources status, the component gallery (dev). If it is a
screen and not a tab, Browse reaches it. Any board can also be pinned to Today as a
tile, and opened by name from the Dump box ("open turf"). A new board is one
folder under `src/boards/<id>` registered in one list, like a module; later a
board may come from a package (the plugin story), which changes nothing here.

### You (settings)
Data sources (each source: permission, enabled, last sync, today's count; SMS
senders; Export texts for the parser; Sync all) · Agent (providers, keys, daily
budget, models) · Categories and rules · Home (Today tiles) · Notifications and
quiet hours · Backup and restore · App lock · Appearance · Locale and currency ·
Component gallery (dev).

### Also in the app (kept — 4 Oct)
- **Links** (the code calls it Graph view; renamed 4 Oct because "graph" means a
  chart): a sixth generic screen and an important one. From any Record (its
  Links card) and from Browse: the network around the record — Karan in the
  middle, lines to Zomato, the gym, the dinner, the payment — 1–2 hops, tinted
  by module, link words on the lines; tap re-centres, long-press opens. Reads
  Link records only, so every module gets it without writing anything. Not to
  be confused with the tiles on Today, which are charts and open Metric.
- **Automations**: a tile in the Browse grid. The list of your automations with
  last run and state; the editor (trigger → conditions → steps, outputs passed
  along); templates; run log per run and per step; run now. Manual-run
  automations can also sit as buttons on Today. See layer 3.
- **Activity**: a core board, a tile in the Browse grid and a Today tile. The
  GitHub-style grid per tracker ("days coded", "days with Zomato", "8,000 steps"),
  rules over messages, payments, records, metrics, habits.
- **Tags**: tag chips on every Record and List; a Tags page from Browse › Recent;
  one page per tag listing its records across modules.
- **Memory**: the Facts list, a row in Browse (by who they are about; edit, forget).
  Stays until the Second Brain work decides what replaces it.
- **Reminders**: its own screen listing one-off Cycles (reminders) by time, from
  Today and You › Notifications. Upkeep shows them too; this is the focused list.
- **Spend**: its own screen from Today's spend tile and the Money overview:
  transactions with sort (date, amount) and filters (category, account, kind,
  date range), spend by category. It is Money's List with its filters pinned.

## 6. Milestones — proposed 4 Oct

Thin slices, each usable on the phone when done. `docs/MILESTONES.md` M1–M4 stay
as history; new work is tracked here. "Done" means: typecheck and tests green,
the slice checked on the S22, the box ticked in the same commit.

### R0 — Make the code say what the model says (no new features)
The restructure. Mechanical, large, and worth doing in one go so nothing is
built twice.
- [ ] Vocabulary in code: entity → record, type → object, relation → link,
  Connections card → Links card, GraphView → Links, comments → facts,
  reminders → one-off cycles. Names in files, tables (append-only migration with
  views for old names), UI copy, tests.
- [ ] **Field types** as a closed registry (layer 2 table): each type with its
  render (row, record, form, tile), query (filter, sort, aggregate) and filing
  (how it is parsed) behaviour. Every Object schema declares Fields by type.
- [ ] **Module manifest split**: a module = Objects + cycles + filing rules +
  sources + AI tools; no screens, widgets or overviews. Boards and
  Automations are separate manifests. The twelve data modules keep their names;
  `dashboard` and `automation` become boards.
- [ ] Dependency rule enforced by a lint test: modules import only core; boards
  and automations import modules and core; core imports nothing above it.
- [ ] Every existing Object moves into its module **unchanged**. Object changes
  (merges, cuts, new Fields) happen in each module's own milestone, after its
  discussion — never in R0.
- [ ] One filing pipeline (layer 4): readings path, messages path, dumps path;
  leftovers; one To check. The three queues become one.
- [ ] Fix the one failing test (`overviews.golden`); every golden test green.
**Done when**: the phone works exactly as before the reset, and `docs/MODEL.md`
describes every file in `src/`.

### Then module by module (each: Objects in the new schema → filing rules and
sources moved in → AI tools with tests → the six generic
screens checked on the phone → overrides only where the default is wrong)
- [ ] **R1 finance** — Account, Transaction, Debt, Subscription, Budget, Group;
  SMS, notification and mail parsers; categories and rules; tools: balances,
  spend by period and category, who owes whom, subscriptions run-rate, net
  worth. Parser dataset export gains corrections. Spend screen on its board.
- [ ] **R2 crm** — Person; contacts source; payee and UPI matching; keep-in-touch
  and birthday cycles; tools: people to call, last met, balances per person.
- [ ] **R3 places** — Place, Organisation; from calendar, mail and dumps.
- [ ] **R4 projects** — Task, Project, Goal, Event; calendar source.
- [ ] **R5 habits** — Habit, Habit log, Routine; check-ins; streaks; chores in
  Upkeep; Upkeep re-hung on cycles from every module.
- [ ] **R6 health** — Measurement, Workout; Health Connect and Usage access
  sources; one page per metric; Metric screen comparisons.
- [ ] **R7a assets** — Asset, Vehicle (meters); warranty, service and km cycles.
- [ ] **R7b deliveries** — Delivery; shipping parsers; OTP; tracking.
- [ ] **R7c documents** — Document; expiry cycles; files.
- [ ] **R7d travel** — Trip; spend vs budget; flights and stays from mail.
- [ ] **R7e inventory** — Item; quantity, restock.
- [ ] **R7f knowledge** (later) — Note, Fact as the Second Brain; Memory replaced.

### Boards and automations
- [ ] **R8 Today and Time** — Today tiles re-hung on module tools and core queries only; Time
  board from On this day; the route moves from `app/almanac/time.tsx` to
  `app/time.tsx`.
- [ ] **R9 Turf** — the first user board: this week's game, who paid, who owes,
  settle up; a `games` module if it needs a Game Object. Proves the tier.
- [ ] **R10 Automations** — multi-step with data passing, manual run from a
  button or a sentence, model step, run log per step; templates.
- [ ] **R11 Activity and Links** — Activity board over trackers; Links screen and
  card everywhere, tinted by module.

### The model
- [ ] **R12 Mac model first** — Ollama over Tailscale as the first provider; a
  7–9B open model; golden sentences pass; cloud only on failure; budget applies
  to cloud only.
- [ ] **R13 Phone model** — a 1–3B quantised model on the S22 for offline
  filing of everyday dumps; chain: phone → Mac → cloud.
- [ ] **R14 Your own fine-tune** — dumps + what filing did + corrections exported
  as the training set; fine-tune evaluated on the golden tests before it enters
  the chain.

### Around it
- [ ] **R15 Build and ship** — standalone dev / preview build with OTA updates
  (ADHOC), app lock, database encryption; retention jobs (dumps 15 days, raw
  texts 60 days, To check auto-approve 15 days).
- [ ] **R16 Docs** — `ARCHITECTURE.md`, `GRAPH.md` and SCOPE §C retired into
  this file; `HANDOFF.md` rewritten for the three tiers.

Suggested order: R0 → R1 → R2 → R3 → R8 → R9 → R4 → R5 → R12 → R6 → R7a–e →
R10 → R11 → R13 → R15 → R14 → R7f → R16. Finance, People, Places and the Turf
board early, so the structure is proved on the thing you actually want.


## 7. The agent: a model LifeOS owns — proposed 4 Oct

Reference: PewDiePie's Ajax for Odysseus (a fine-tuned Qwen 3.5 9B as the
always-on local agent). We want the model, not their workspace UI: a small open
model that runs for Rutvij and is integrated as LifeOS's brain, with cloud
providers as fallback only.

- **Job**: turn sentences into filing tool calls over the Objects (layer 4,
  step 2), and answer questions from the context graph. Nothing else.
- **Where it runs, in two steps**: (1) on the Mac over Tailscale through the
  existing Ollama provider — a 7–9B model, no quota, nothing leaves the network;
  (2) a 1–3B quantised model on the phone for offline filing.
- **Provider chain becomes**: phone model → Mac model → free cloud (Groq,
  Gemini) → Claude. Cloud is reached only for what the local models fail on,
  and the daily budget in You › Agent applies to cloud only.
- **Tuned on your data, same loop as the parsers**: the export gains your dumps
  with what filing did and what you corrected in To check; that set is the
  fine-tune for your own model. Golden tests (the sentences in PRODUCT.md §5)
  are the acceptance bar for any model in the chain.
- **Not wanted**: Odysseus's chat / email / calendar screens. LifeOS already has
  the records; the model serves them.

