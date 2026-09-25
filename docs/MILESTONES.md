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
- [ ] Dump screen replaces the Talk tab in the bottom bar: big box, mic, send; toggle *Dump / Talk* at the top; recent dumps below, each with "extracted: 1 person · 2 facts · 1 task" chips and per-item Undo.
- [ ] Background extraction job (scheduler): parser first, then the small-model chain with a strict JSON schema: `{ people[], tasks[], facts[], events[], transactions[], cycleUpdates[], entitiesToCreate[] }`. Every created/updated record links back to the dump. Never blocks the dump; retries when online.
- [ ] Agent "create anything": `create_entity` accepts any registered type with partial data and fills sensible defaults; new tool `create_person_from_mention` (name, company, role, where met, relationship) and `suggest_cycle` (offer keep-in-touch / warranty / renewal). Golden tests: "made a new friend today, Karan, works at Zomato, met at the gym" → Person + fact + link; "bought a Dyson for 32k on the HDFC card, warranty 2 years" → Asset + Transaction + warranty cycle; 6-line rant with one buried task → one task, nothing invented.

### M4.2 — Data sources
- [ ] **Health Connect** (`react-native-health-connect`): permissions screen; daily sync of steps, sleep sessions, heart rate, workouts, weight into `measurements`/`workouts` with source = health_connect; backfill 90 days on first grant; hourly refresh via background task.
- [ ] **UsageStats** (native module + `PACKAGE_USAGE_STATS` onboarding): per-app foreground time, pickups, first unlock, last use, per day; app icons + labels cached; `usage_daily` and `usage_app_daily` tables.
- [ ] **SMS reader** (native module, `READ_SMS` + `RECEIVE_SMS`): sender discovery (DLT-style headers, bank/card keywords) → You › Data sources › SMS with tick-boxes; parsers per bank (HDFC, ICICI, SBI, Axis, Kotak, Amex, plus generic) with fixtures in tests; every parse stores raw text + parsed fields; first-run **history import** with review screen and bulk confirm; live `RECEIVE_SMS` → transaction within seconds; dedupe with notifications by amount + 10-min window.
- [ ] **Notification listener** (from old M5) as the second source; same ingest queue and review UI.
- [ ] You › Data sources: one screen showing each source, its permission state, last sync, count today.

### M4.3 — Today as a dashboard
- [ ] Chart components on the design tokens: Sparkline, Bars (daily/weekly), Ring, StackedBar (exists), HeatMap (habits/steps), Comparison ("vs. yesterday" delta chip). Built with react-native-svg; no chart library that pulls in web deps.
- [ ] Today tiles, all live from real data: Steps (today vs. yesterday + 7-day bars), Sleep (last night + 7-day), Screen time (today total + top 3 apps + 7-day), Spend this month (pace line vs. usual month), Upcoming (next 5 dues/events), Streaks, People to call, Brief (one line from the agent, optional).
- [ ] Every tile → full-screen chart: period switcher day/week/month/year, previous-period comparison, list of underlying records below.
- [ ] Tile layout persisted; add/remove/reorder.
- [ ] Empty states that say which permission to grant, with a button to You › Data sources.

### M4.4 — Almanac (replaces Browse)
- [ ] Almanac tab: search field; sections *People · Things · Money · Body · Mind · Places · Time*; each a list of types with counts.
- [ ] **Time view**: pick a day / month / year → spend by category, dumps, events, health averages, screen time, cycles done, records created. "On this day" row on Today.
- [ ] Facts as browsable records; every record page shows Facts, Dumps that mention it, and backlinks.
- [ ] One FTS index over records + notes + facts + dumps (extend migration; don't rebuild).

**Demo:** fresh install → grant Health Connect, Usage access, SMS → Today fills with real steps/sleep/screen time and months of spend → dump "made a new friend today, Karan…" → Karan appears under Almanac › People with the fact → Almanac › Time › last month shows the whole month.

## M5 — Polish + proactive
- [ ] Morning brief notification (from real data: sleep, steps target, dues, spend pace).
- [ ] Quiet hours; per-source notification toggles; biometric lock; encrypted backup export/import.
- [ ] Habits: check-in, streaks, heat map.
- [ ] Performance pass: Today < 1 s cold, lists virtualised, charts memoised.

---

## After phase 1 (backlog, in rough order)
Supabase sync + web client (iPhone) · Mac screen time helper · Android home-screen widgets · semantic search / embeddings · weekly review & nudges · Developer Mode · calendar/gallery/timeline layouts · OCR · CSV import · photo memory.
