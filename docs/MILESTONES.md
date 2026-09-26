# LifeOS — milestone plan (phase 1, Android)

Each milestone ends with something Rutvij can install on his phone and use. "Done" means: typecheck + tests green, runs on a real Android device, the listed flows work end to end with real data (not seed data), and the screens match `docs/DESIGN.md`.

Order is deliberate: the design system first (so nothing gets built twice), then the concept the whole app hangs on (Cycles/Upkeep), then the agent, then the proactive layer, then ingestion.

---

## M1 — Foundation + design system

**Goal:** the existing core is kept; the UI is rebuilt on the locked design tokens and components so every later screen is assembled, not designed.

- [x] Apply `docs/DESIGN.md` tokens: colours (bone ground, tile, mustard accent, module tints), type scale, radii, spacing. Replace `src/ui/theme/tokens.ts`.
- [x] Inline SVG icon set (`src/ui/icons/`) — one component per icon, stroke-based, no icon fonts. Every icon named in DESIGN.md exists.
- [x] Components: Tile (bento cell, 1×1/2×1/2×2), StatTile, StackedBar, Ring, RowItem, Chip/FilterChip, Sheet, Toast-with-Undo, EmptyState, Segmented, FormField set, RecordHeader, SectionCard.
- [x] Bottom bar: Today · Upkeep · **Talk** (centre, raised) · Browse · You.
- [x] Dark mode tokens and a theme toggle in You.
- [x] Storybook-style gallery screen at `/dev/components` showing every component in both themes (used to review against the Claude Design canvas).
- [x] Core additions needed by later milestones, migrations v3: `cycles`, `meter_readings`, `facts`, `groups` + `group_members`, `notification_rules`, `ingest_queue`. *(Group is an entity type, so v3 adds `group_members` only.)*
- [x] Rebuild the generic screens on the new components: list, record, form, tag page, search.

**Demo:** open app → Today (placeholder tiles) → Browse → a record → edit → dark mode. Icons everywhere.

## M1.5 — Design refresh (Stitch "LifeOS Android design system")

**Goal:** the richer Stitch look on everything already built, without removing any existing feature. Source: `stitch_lifeos_android_design_system.zip` (screens + palette). Kept from our rules: Lucide inline SVG icons (no icon font), no shadow/blur, our dark bottom bar with the raised mic. Each module keeps its own tint, redrawn from the Stitch data palette. Dark mode is derived by us (Stitch is light only).

Phase D1 ships in the next build; D2+ land alongside the milestone that brings their data.

**D1 — foundation (this build)**
- [x] Tokens: Stitch palette (cream surface + 5 container levels, gold primary #755B00 / mustard #F3C84B, sage, steel, rose/lavender/sky/mint data colours), module tints from it, derived dark theme; DESIGN.md updated.
- [x] Type: Plus Jakarta Sans via expo-font, 600-weight scale, UPPERCASE micro labels, tabular metrics.
- [x] Components restyled: nested container levels, status pills, section labels; gallery fixed (Expo Go crash) and updated.
- [x] Record cover photo: pick from gallery/camera, stored on the phone, shown as a photo header on the record page (Vehicle, Place, Trip, Person, Item…); remove/replace.
- [x] Agent & API key screen moved onto the kit.

**D2 — data components (with M2)**
- [x] Charts kit: sparkline, line chart (dotted grid), stacked column chart, target progress bar, day timeline; stat trio; "Attention required" card; quick-action chips.
- [x] Record pages (Vehicle, Subscription, Person) take the Stitch layouts using cycles, meter readings and splits.
- [x] Upkeep + This week in the Stitch style; Finance month view with the new charts.

**D3 — Talk (with M3):** agent thread cards (nested stat slabs, source badges), prompt chips, pill composer, voice capture sheet. ✅ *(done with M3's Talk screen; voice uses the system recogniser's own sheet)*

**D4 — Today → now M4.3:** Today bento as in "Today · calm bento editorial": brief, finance, cycles, habits, tasks, trip, pending SMS tiles; Health engine screens.

**D5 — Ingestion → now M4.2:** proposed transaction card from a UPI notification; bank/SMS permission screens.

## M2 — Cycles, Upkeep, Things, chores

**Goal:** the "filing cabinet with dates" works without the agent.

- [x] Cycle engine in `src/core/cycles/`: kinds (interval / fixed date / meter / whichever-first), `markDone`, `snooze`, `setNextDue`, `skip`, stats. Unit-tested.
- [x] Cycle templates per entity type; Vehicle/Subscription/Document/Person/Item/Routine get defaults on create.
- [x] Meter readings (odometer) on Vehicle; cycles compute from the latest reading.
- [x] **Routine** entity type (chores) with kind / minutes / weekday preference.
- [x] Upkeep tab: sections Overdue / This week / This month / Later; filter chips; row actions mark done · snooze · add cost; "this month will cost" header.
- [x] Upkeep › **This week** strip view.
- [x] Record page "Cycles" section with history and stats.
- [x] Cycle-driven reminders through the existing scheduler → local notifications.
- [x] Subscription auto-post transaction on due (automation template, on by default).
- [x] Finance: Debt entity, **Group** entity, split sheet on a transaction (equal/exact/percent/shares), balances per person and per group, settle-up.
- [x] Reports: Month view, Subscriptions run-rate, Net worth over time.

**Demo:** add Creta with odometer, add Jio subscription, add "laundry every 4 days", open Upkeep → mark laundry done → next due rolls; split a dinner 3 ways → Priya owes you.

## M3 — Talk: the agent + second brain

**Goal:** the primary input works. The sample sentences in `docs/PRODUCT.md` §7 all pass. **Cost principle: the LLM is the fallback, not the front door** — most daily sentences are handled by a deterministic parser on-device for free and offline; the model is called only when the parser isn't confident.

- [x] **Intent parser** in `src/core/agent/parser.ts` (pure, tested): pattern grammar for the top intents — `did/done <object> [today|yesterday|on <date>] [<amount>] [at <vendor>] [<n> km]` · `recharged/renewed <subscription> [<amount>] [for <n> days]` · `<person> paid me [back] <amount>` / `paid <person> <amount>` · `spent <amount> on <thing> [with <people>]` · `split <amount> with <people>` · `remind me to <x> [when]` · `add a chore/routine <x> every <n> <unit>` · `<object> runs out / due on <date>` · `remember [that] <fact>` · `what/when/how much …` (→ query path). Returns `{ intent, slots, confidence }`. *(Built as `src/core/ai/parser.ts`; returns a plan of tool calls or null — no numeric confidence yet, see Router.)*
- [x] **Entity resolver** (shared by parser and LLM tools): fuzzy match on titles + learned aliases + type hints; returns candidates with scores; disambiguation card when top-2 are close. *(`resolveCandidates` / `clearMatch` in `lifeTools.ts`.)*
- [ ] **Router:** parser confidence ≥ 0.85 and all slots resolved → execute directly (no network) and show the same reply card the LLM path would; otherwise → LLM with the parser's partial parse as a hint. Every direct execution is logged so misfires can be reviewed and turned into new patterns. *(Partly: parser-or-model works; not yet: numeric confidence, passing the partial parse to the model as a hint, and the misfire log.)*
- [x] **Provider layer** (`src/core/ai/openaiCompat.ts`, `providers.ts`): one OpenAI-compatible implementation covers **Groq** (default, free tier), **Gemini** (its /openai endpoint), OpenRouter and Ollama; Claude keeps its native implementation. **Chain provider** tries them in order and falls through on 429/5xx/network, putting a rate-limited provider on cooldown. Per-provider keys in SecureStore; `withUsageMeter` counts tokens per provider per month and enforces a cap. Settings screen at You › Agent. Tests in `providers.test.ts`. *(Ported 25 Sep from `lifeos-provider-chain.patch`; since then: retired-model recovery, free-tier token budget.)*
- [x] Fact mining and other side jobs use the `small` chain (cheap/fast models).
- [ ] Talk screen: thread, composer, hold-to-speak (Android STT), reply cards (record / cycle / list / number / chart / confirm) with tap-to-open and Undo; a small "offline" pill on cards handled by the parser. *(All but the offline pill.)*
- [x] Agent tools (extend `coreModule` aiTools): `resolve_entity`, `log_event`, `mark_cycle_done`, `set_next_due`, `log_meter`, `split_transaction`, `settle_debt`, `remember_fact`, `recall`, `forget_fact`, `create_routine`, `plan_trip`. Parser fast-path and LLM call the same tool functions.
- [x] Learned aliases table ("the car" → Creta) written when the user confirms a disambiguation.
- [x] Confirmation policy: money & people tools ask (inline confirm card); others auto-run and return an Undo handle — identical on both paths.
- [x] **Facts** store + Browse › Memory screen. Fact mining: `remember …` sentences are filed by the parser for free; for LLM-handled messages, a second small call with a strict JSON schema extracts residual facts. Facts indexed in FTS with records and notes.
- [x] Retrieval step before every LLM answer: FTS hits over records/notes/facts + resolved entity's timeline/relations + last N turns, packed with a token budget.
- [x] `[[links]]` in notes/facts → relations; backlinks section on every record.
- [x] Share-sheet intent (Android `SEND` / `SEND_MULTIPLE`) → Talk with the shared text/link/image attached.
- [x] Model routing (when provider is Claude): Haiku default; escalate to Sonnet on ≥2 intents, a plan intent, or a tool error on first attempt. **Usage meter + monthly cap** in You › Agent (tokens and estimated cost per provider; the agent stops calling the model at the cap and says so).
- [x] Golden tests: each sample sentence asserts (a) whether the parser or the LLM handled it, (b) the exact tool calls, (c) the resulting DB state — against the fake provider. *(Flows 1–5, 8, 9 in `golden.test.ts`, with and without a model.)*

**Demo:** say the sample sentences in order with the phone in airplane mode — the simple ones file instantly; turn data on — the multi-step ones go through the model. Zero taps except the money/people confirmations.

## M3.5 — Free-tier agent (SCOPE v2 B5, 25 Sep)

**Goal:** Talk costs nothing by default. Common sentences never leave the phone; everything else goes to free providers first, Claude only if you add it.

- [x] Provider chain: OpenAI-compatible adapter (Groq, Gemini, OpenRouter, Ollama, custom) beside Claude; per-provider keys in SecureStore; fall through on rate limits / outages / bad keys, with cooldown. Ported from `lifeos-provider-chain.patch`.
- [x] Usage meter per provider + monthly token cap; the agent stops calling a provider at its cap.
- [x] Parser first: deterministic on-device intent parser for the common sentences; the LLM only when it isn't confident. Golden sentences 1–5, 9 pass with no provider at all.
- [x] You › Agent: provider order, keys, models (main / small / escalation), caps, usage; Talk works (parser only) with no key.

## M4 — Reframe: data-first (replaces the old M4)

**Why:** after M1–M3 the app was an agent with a filing cabinet. `docs/PRODUCT.md` v4 says what it must be: a personal data dashboard + an almanac, fed automatically. This milestone turns the existing build into that. Nothing from M1–M3 is thrown away; the shell, the entity core, cycles, splits and the agent all stay.

### M4.0 — Audit first (half a day, no new code)
- [x] Walk every screen on a real phone against PRODUCT.md v4 §5 golden flows. Write `docs/AUDIT.md`: what exists, what's missing, what's wrong. Rutvij reviews before M4.1 starts. *(Audit written from the code; the phone walk is deferred until the M4 build, per Rutvij 26 Sep.)*

### M4.1 — Dump (the centre button)
- [x] `dump` entity: raw text, source (typed / voice / share), createdAt, immutable body; `extractions` side table (dumpId → entityId/factId, kind, undone flag). *(Own tables `dumps` + `dump_extractions` (migration v6) rather than an entity type, so the database itself refuses edits and deletes; dumps are in search, backups and Talk's retrieval.)*
- [x] Dump screen replaces the Talk tab in the bottom bar: big box, mic, send; toggle *Dump / Talk* at the top; recent dumps below, each with "extracted: 1 person · 2 facts · 1 task" chips and per-item Undo. *(Centre button is a brain. Shared text becomes a dump; a shared file opens Talk to attach it. Dumps the parser can't read wait for a key and say so.)*
- [x] Background extraction job (scheduler): parser first, then the small-model chain with a strict JSON schema: `{ people[], tasks[], facts[], events[], transactions[], cycleUpdates[], entitiesToCreate[] }`. Every created/updated record links back to the dump. Never blocks the dump; retries when online. *(`src/core/dumps/extract.ts`; runs after each save, on foreground, from the background task, and retries after failures — `src/platform/dumpExtraction.ts`.)*
- [x] Agent "create anything": `create_entity` accepts any registered type with partial data and fills sensible defaults; new tool `create_person_from_mention` (name, company, role, where met, relationship) and `suggest_cycle` (offer keep-in-touch / warranty / renewal). Golden tests: "made a new friend today, Karan, works at Zomato, met at the gym" → Person + fact + link; "bought a Dyson for 32k on the HDFC card, warranty 2 years" → Asset + Transaction + warranty cycle; 6-line rant with one buried task → one task, nothing invented. *(`src/core/ai/createAnything.ts`; golden tests in `src/modules/dumps.golden.test.ts`, run through the dump extractor with a recorded model.)*

### M4.1b — Life graph + one input (Jarvis) — see `docs/GRAPH.md`
**Why:** M4.1's extractor only knew fixed lists (people, tasks, facts, purchases). Rutvij's intent: say anything and it files, updates and links everything itself, like Jarvis — built on a personal knowledge graph (enterprise-search style). Decisions (26 Sep): never ask, money included — To check + Undo instead; one box for statements and questions; loose details go to Notes as tidy bullets; best-match identity with flagged guesses; To check behind a bell; flights and any other activity are events with a kind inside a trip when there is one; free models only.
- [x] Graph model: migration for edge provenance (source, source id, confidence, valid time); Place and Organisation types; `event` generalised (kind, role edges instead of person/trip fields, kind-specific fields for flights); edge vocabulary. *(Migration v7; `src/core/graph/edges.ts`; Place + Organisation in `src/modules/places`; event `kind` + flight fields. Old person/trip fields on events keep working.)*
- [x] Graph tools for the agent: resolve, upsert_node, set_attributes, add_note_line (Notes as a maintained bullet list), log_event (kind, time, roles), link, create_task — each write logged with provenance. *(`src/core/graph/tools.ts`: upsert_node, set_attributes (fields, else Notes bullets), record_event (kind, when, roles; travel joins a trip), link, create_task, log_spend. Each write logged with what it replaced; `reverseWrite` cancels exactly one.)*
- [x] Identity resolution: aliases → fuzzy by type → context (current page, same dump); confidence; low-confidence flagged. *(`resolveNode`: this page / same dump → aliases + exact title → fuzzy ≥ 0.8 as a flagged guess; "new friend X" creates and flags a possible duplicate; "I/me" never becomes a record.)*
- [x] Dump pipeline on the agent: parser first, then the free chain with the graph tools; long dumps split; golden tests — Kendal + birthday; "her favourite colour is pink" on her page; the flight day with Kendal (flight in a trip, Kendal linked to both); a rant with one task; a dinner at a new place with two people. *(`src/core/dumps/extract.ts`: parser first, then a tool loop on the free main chain with the graph tools + `log_done`; long dumps chunked; partly filed dumps are never re-filed. Golden tests in `src/modules/dumps.golden.test.ts`.)*
- [x] To check: bell with count in the header; list of everything filed and unticked, guesses first; tick / edit / cancel (cancel reverses exactly that write). *(`app/check.tsx`, `src/screens/ToCheckBell.tsx`; grouped by what you said; Tick all.)*
- [x] One box on the centre tab: statement vs question routing; questions answered from the graph (retrieval walks edges); the Dump/Talk toggle removed. *(`src/screens/OneBox.tsx`; `classifyInput` in `src/core/ai/route.ts`; questions use read-only tools + the `connections` graph tool; retrieval lists each record's connections with dates. The raised brain listens and sends.)*
- [x] Record pages: mic to speak updates into this record; Connections section grouped by edge word. *("Tell me about …" bar (`src/screens/SayCard.tsx`) files a dump with this record as its subject; the Related card became Connections, grouped by link word, events dated with who/where.)*
- [x] Graph view around a record: a small force-directed network (react-native-svg + d3-force) centred on the record, 1–2 hops, tinted by module, edge words on the lines; tap a node to re-centre, long-press to open it. On record pages and from the Almanac. *(`src/ui/components/GraphView.tsx` + `egoGraph` in `src/core/graph/read.ts`; a Graph card on record pages opens `/graph/[id]` (direct / two steps out); in the component gallery. Almanac entry point comes with M4.4.)*

### M4.1c — Never lose a thing: the filing queue (26 Sep)
**Why:** free tiers run out (Groq 200k tokens/day, Gemini per-minute and daily quotas, 503 spikes). Today a dump that can't be filed is retried for ~20 minutes then marked failed; a half-filed dump stays half-filed; a question just errors. Decisions (26 Sep): on-phone answer + queued full answer for questions; the parser files what it can right away; queued filings surface only through the bell.
- [x] Search covers everything: record Notes (comments), tags and attachment names go into the same index; existing ones backfilled once.
- [x] Waiting ≠ failed: rate limits, quota, 503 and offline put a dump in *Waiting to file* (with why and roughly when) and never count toward giving up; only bad model output does. Dumps never end up failed for lack of a provider.
- [x] Provider limits remembered: "try again in 7h" / daily quota / cooldowns stored per provider (and per model); the queue skips a provider until then and wakes at the earliest free time (foreground, background task, timer).
- [x] Resume, don't restart: filing progress per chunk, so a dump cut off halfway continues from the next chunk; the model is told what's already filed.
- [x] Parser inside dumps: the everyday sentences in a longer dump are filed on the phone right away; the model files the rest later without doubling them.
- [x] Questions without a model: an on-phone answer (search + connections + dates, no model) straight away, and the full answer queued and shown when it lands.
- [x] Budget: per-provider daily usage in You › Agent; when a free budget runs low, new dumps go first and the older backlog waits. *(Today's tokens vs Groq's ~200k free allowance, a Resting-until note with Try now; queue goes newest-first at ≥ 80% or resting. Groq defaults moved to openai/gpt-oss-120b / -20b.)*

### M4.2 — Data sources
- [x] **Health Connect** (`react-native-health-connect`): permissions screen; daily sync of steps, sleep sessions, heart rate, workouts, weight into `measurements`/`workouts` with source = health_connect; backfill 90 days on first grant; hourly refresh via background task. *(Built: `modules/lifeos-device` HealthReader + `saveHealthDays`; 90-day backfill; syncs on foreground/background. Phone check pending.)*
- [x] **UsageStats** (native module + `PACKAGE_USAGE_STATS` onboarding): per-app foreground time, pickups, first unlock, last use, per day; app icons + labels cached; `usage_daily` and `usage_app_daily` tables. *(Built: UsageReader from usage events, usage_daily / usage_app_daily. Phone check pending.)*
- [x] **SMS reader** (native module, `READ_SMS` + `RECEIVE_SMS`): sender discovery (DLT-style headers, bank/card keywords) → You › Data sources › SMS with tick-boxes; parsers per bank (HDFC, ICICI, SBI, Axis, Kotak, Amex, plus generic) with fixtures in tests; every parse stores raw text + parsed fields; first-run **history import** with review screen and bulk confirm; live `RECEIVE_SMS` → transaction within seconds; dedupe with notifications by amount + 10-min window. *(Built: parsers + fixtures (`src/core/ingest`), history import → review screen, live receiver, dedupe with notifications and with things you said. Phone check pending.)*
- [x] **Notification listener** (from old M5) as the second source; same ingest queue and review UI. *(Built: PaymentNotificationListener, allow-listed payment/bank apps only. Phone check pending.)*
- [x] You › Data sources: one screen showing each source, its permission state, last sync, count today. *(Built: `app/settings/sources.tsx`, SMS senders, SMS review.)*

### M4.2b — Connectors: phone + Google (26 Sep)
**Why:** Jarvis should know what your phone and Google already know. Every source plugs into one framework (source → filing queue → identity resolution → graph → To check); deterministic parsers first, free models through the queue for the rest.
- [ ] Connector framework: a `Connector` contract (id, permissions, sync(since) → items), per-source state (enabled, last sync, count, error) and You › Connected sources.
- [ ] Contacts: match People by name/phone and fill phone, email, birthday; never bulk-create.
- [ ] Calendar (on-device): events with their people and places linked; deduped on re-sync.
- [ ] Call log (dev build): updates each person's last contact and keep-in-touch cycle.
- [x] ~~Google sign-in (OAuth, testing mode, token in SecureStore) — Rutvij sets up the Google Cloud client once.~~ Gmail accounts by app password instead (decided 26 Sep: no Cloud project, no weekly re-sign-in, any number of accounts). *(IMAP read-only on the phone (`MailReader.kt`, JavaMail); You › Data sources › Gmail adds / syncs / removes accounts; passwords in SecureStore; last 90 days on first sync, then only new mail; synced with the other sources. Needs the new build; phone check pending.)*
- [x] Gmail: receipts, tickets and bookings only; known senders parsed on the phone (airlines, Uber, Swiggy, Amazon…), the rest via the queue → flights in trips, expenses linked. *(`src/core/ingest/mail.ts` + `ingestMail`: picked from headers alone (promos, statements, people skipped, never downloaded); bank alert mails read like their SMS; receipts → expenses (final total, brand, subscriptions), matched to the SMS for the same payment either way; shipping → deliveries; tickets → a flight in its trip (check-in mails update it); hotel bookings → a stay across its nights. Every record names the mailbox it came from (note, timeline, To check). Mail with no known shape is skipped for now, not sent to the model queue. Phone check pending.)*
- [x] Google Calendar: same as the phone calendar, deduped against it. *(Decided 26 Sep: not a separate connector — the phone's calendar already syncs every Google account, and the Calendar source reads and dedupes it.)*
- [ ] Drive: titles and text searchable; linked when they mention a person or trip. *(Not now — 26 Sep.)*

### M4.2c — Feedback round 1 (26 Sep, from using it on the S22)
Decisions: foreign spends stored in their currency and converted at that day's rate (INR totals); mutual funds are investments, never spend or bank accounts; 60-day clean-up of ignored messages, raw text of filed messages, per-app screen time and past calendar events; To check auto-approves after 15 days; deliveries are records that update; Health is one page per metric.
- [x] SMS amounts: limits / balances / dues never taken as the amount; tighter debit vs credit; USD / GBP / JPY / AED (+ INR) with the day's rate; mutual funds as investment transfers (registrar confirmations skipped); ATM = cash transfer. *(Rates from open.er-api.com once a day; merchant matching is whole-word now.)*
- [x] Category keywords in settings (e.g. ZOMATO → Food), checked before the built-in list and what you've taught it. *(You › Categories; "Apply to past transactions".)*
- [x] Spend: sort (date, amount) and filters (category, account, kind, date range); spend by category. *(`app/spend.tsx` + `src/modules/finance/spend.ts`; from Today's spend tile and Finance.)*
- [x] Deliveries from shipping SMS: one record per order (shop, carrier, tracking, expected date, status) updated by later texts; in Upcoming until delivered. *(`src/core/ingest/delivery.ts`, `src/modules/deliveries`; shops + couriers; food / quick commerce skipped.)*
- [x] Health: one page per metric (Steps, Sleep, Heart rate, Weight, Workouts); "Measurements" no longer shown as a category. *(`src/screens/HealthHome.tsx`; heart rate added as a metric; sleep: Samsung Health must share Sleep with Health Connect.)*
- [x] To check: untouched items auto-approve after 15 days.
- [x] 60-day clean-up job. *(`src/core/sources/retention.ts`, once a day.)*
- [x] Payees: one record per person / shop you pay or get paid by; every payment links to it (a Person when the name or UPI ID matches someone in People — a guess is flagged in To check and on the payment with Yes / Not them); a payee's page shows its payments and total. *(`src/core/ingest/payee.ts`; past payments linked once on start.)*
- [x] Speed: measure and fix the slow screens. *(Screens refresh at most every 300 ms instead of on every change; SMS imports in batches of 200 per transaction with breaks; senders and duplicate checks are single lookups (+ indexes, migration v10); Today computes upkeep once. Data sources got Sync all.)*
- [x] Merchants from real Indian bank texts: card descriptors cleaned (`PAYPAL *ADOBE`, `RAZ*…`, `EAZYDINE0000000`, city / country tails), NEFT / RTGS / IMPS references reduced to the name, bank boilerplate never a name, Axis multi-line card alerts, HSBC / Canara / BOB / Union shapes, card bill payments as transfers. Known brands named as you know them (Adobe, Netflix, Swiggy…) with their category. Autopay / e-mandate / SI charges are filed (the heads-up before one is skipped) as Subscriptions, and each joins one Subscription record (made on the first charge; amount and next date kept current; replaces an auto-posted bill for the same renewal). *(`src/core/ingest/merchants.ts`; checked against ~150 real formats.)*

### M4.3 — Today as a dashboard
- [x] Chart components on the design tokens: Sparkline, Bars (daily/weekly), Ring, StackedBar (exists), HeatMap (habits/steps), Comparison ("vs. yesterday" delta chip). Built with react-native-svg; no chart library that pulls in web deps. *(MiniBars, DeltaChip (good/bad per metric), HeatMap added; Sparkline, LineChart, ColumnChart, Ring, StackedBar already existed. All in the gallery.)*
- [x] Today tiles, all live from real data: Steps (today vs. yesterday + 7-day bars), Sleep (last night + 7-day), Screen time (today total + top 3 apps + 7-day), Spend this month (pace line vs. usual month), Upcoming (next 5 dues/events), Streaks, People to call, Brief (one line from the agent, optional). *(Steps, Sleep, Screen time (+ top 3 apps), Spend pace vs usual month, Upcoming, People to call, Overdue. Streaks wait for habit check-ins (M5); the Brief comes with M5's morning brief.)*
- [x] Every tile → full-screen chart: period switcher day/week/month/year, previous-period comparison, list of underlying records below. *(`app/metric/[id].tsx`: day/week/month/year, change vs previous period, heat map for the year, the records underneath.)*
- [x] Tile layout persisted; add/remove/reorder. *(Edit tiles sheet; saved in settings.)*
- [x] Empty states that say which permission to grant, with a button to You › Data sources. *(Each metric names its source and opens You › Data sources.)*

### M4.4 — Almanac (replaces Browse)
- [x] Almanac tab: search field; sections *People · Things · Money · Body · Mind · Places · Time*; each a list of types with counts. *(`src/core/almanac/almanac.ts`; Body lists its measures (steps, sleep, heart rate, weight) with this week's value; Mind has Dumps (all, searchable, by month) and Facts; each section shows what changed lately. The old module grid moved to You › Modules.)*
- [x] **Time view**: pick a day / month / year → spend by category, dumps, events, health averages, screen time, cycles done, records created. "On this day" row on Today. *(`app/almanac/time.tsx`; month opens as a calendar (dumped / event dots, spend shading) — tap a day; year as twelve months; "On this day" (a month, six months and years ago) is a Today tile, shown only when there's something, and a row on the Almanac.)*
- [x] Facts as browsable records; every record page shows Facts, Dumps that mention it, and backlinks. *(Facts: Almanac › Mind › Facts (Memory, by who they're about). Record pages: "Mentioned in" (notes linking here + facts) and a new Dumps card — dumps that filed into the record or name it.)*
- [x] One FTS index over records + notes + facts + dumps (extend migration; don't rebuild). *(Already in place from M3 / M4.1 / M4.1c: `entities_fts` holds records with their notes, tags and attachment names, facts (type `fact`) and dumps (type `dump`); Almanac search, Mind › Dumps search and record pages all read it.)*

**Demo:** fresh install → grant Health Connect, Usage access, SMS → Today fills with real steps/sleep/screen time and months of spend → dump "made a new friend today, Karan…" → Karan appears under Almanac › People with the fact → Almanac › Time › last month shows the whole month.

## M5 — Polish + proactive
- [ ] Morning brief notification (from real data: sleep, steps target, dues, spend pace).
- [ ] Quiet hours; per-source notification toggles; biometric lock; encrypted backup export/import.
- [ ] Habits: check-in, streaks, heat map.
- [ ] Performance pass: Today < 1 s cold, lists virtualised, charts memoised.

---

## After phase 1 (backlog, in rough order)
Whole-life graph view with filters (people only · this year · around a trip) · Supabase sync + web client (iPhone) · Mac screen time helper · Android home-screen widgets · semantic search / embeddings · weekly review & nudges · Developer Mode · calendar/gallery/timeline layouts · OCR · CSV import · photo memory.
