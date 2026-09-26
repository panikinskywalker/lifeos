# LifeOS — milestone plan (phase 1, Android)

Each milestone ends with something Rutvij can install on his phone and use. "Done" means: typecheck + tests green, runs on a real Android device, the listed flows work end to end with real data (not seed data), and the screens match `docs/DESIGN.md`.

Order is deliberate: the design system first (so nothing gets built twice), then the concept the whole app hangs on (Cycles/Upkeep), then the agent, then the proactive layer, then ingestion.

---

## M1 — Foundation + design system

**Goal:** the existing core is kept; the UI is rebuilt on the locked design tokens and components so every later screen is assembled, not designed.

- [ ] Apply `docs/DESIGN.md` tokens: colours (bone ground, tile, mustard accent, module tints), type scale, radii, spacing. Replace `src/ui/theme/tokens.ts`.
- [ ] Inline SVG icon set (`src/ui/icons/`) — one component per icon, stroke-based, no icon fonts. Every icon named in DESIGN.md exists.
- [ ] Components: Tile (bento cell, 1×1/2×1/2×2), StatTile, StackedBar, Ring, RowItem, Chip/FilterChip, Sheet, Toast-with-Undo, EmptyState, Segmented, FormField set, RecordHeader, SectionCard.
- [ ] Bottom bar: Today · Upkeep · **Talk** (centre, raised) · Browse · You.
- [ ] Dark mode tokens and a theme toggle in You.
- [ ] Storybook-style gallery screen at `/dev/components` showing every component in both themes (used to review against the Claude Design canvas).
- [ ] Core additions needed by later milestones, migrations v3: `cycles`, `meter_readings`, `facts`, `groups` + `group_members`, `notification_rules`, `ingest_queue`.
- [ ] Rebuild the generic screens on the new components: list, record, form, tag page, search.

**Demo:** open app → Today (placeholder tiles) → Browse → a record → edit → dark mode. Icons everywhere.

## M2 — Cycles, Upkeep, Things, chores

**Goal:** the "filing cabinet with dates" works without the agent.

- [ ] Cycle engine in `src/core/cycles/`: kinds (interval / fixed date / meter / whichever-first), `markDone`, `snooze`, `setNextDue`, `skip`, stats. Unit-tested.
- [ ] Cycle templates per entity type; Vehicle/Subscription/Document/Person/Item/Routine get defaults on create.
- [ ] Meter readings (odometer) on Vehicle; cycles compute from the latest reading.
- [ ] **Routine** entity type (chores) with kind / minutes / weekday preference.
- [ ] Upkeep tab: sections Overdue / This week / This month / Later; filter chips; row actions mark done · snooze · add cost; "this month will cost" header.
- [ ] Upkeep › **This week** strip view.
- [ ] Record page "Cycles" section with history and stats.
- [ ] Cycle-driven reminders through the existing scheduler → local notifications.
- [ ] Subscription auto-post transaction on due (automation template, on by default).
- [ ] Finance: Debt entity, **Group** entity, split sheet on a transaction (equal/exact/percent/shares), balances per person and per group, settle-up.
- [ ] Reports: Month view, Subscriptions run-rate, Net worth over time.

**Demo:** add Creta with odometer, add Jio subscription, add "laundry every 4 days", open Upkeep → mark laundry done → next due rolls; split a dinner 3 ways → Priya owes you.

## M3 — Talk: the agent + second brain

**Goal:** the primary input works. The sample sentences in `docs/PRODUCT.md` §7 all pass. **Cost principle: the LLM is the fallback, not the front door** — most daily sentences are handled by a deterministic parser on-device for free and offline; the model is called only when the parser isn't confident.

- [ ] **Intent parser** in `src/core/agent/parser.ts` (pure, tested): pattern grammar for the top intents — `did/done <object> [today|yesterday|on <date>] [<amount>] [at <vendor>] [<n> km]` · `recharged/renewed <subscription> [<amount>] [for <n> days]` · `<person> paid me [back] <amount>` / `paid <person> <amount>` · `spent <amount> on <thing> [with <people>]` · `split <amount> with <people>` · `remind me to <x> [when]` · `add a chore/routine <x> every <n> <unit>` · `<object> runs out / due on <date>` · `remember [that] <fact>` · `what/when/how much …` (→ query path). Returns `{ intent, slots, confidence }`.
- [ ] **Entity resolver** (shared by parser and LLM tools): fuzzy match on titles + learned aliases + type hints; returns candidates with scores; disambiguation card when top-2 are close.
- [ ] **Router:** parser confidence ≥ 0.85 and all slots resolved → execute directly (no network) and show the same reply card the LLM path would; otherwise → LLM with the parser's partial parse as a hint. Every direct execution is logged so misfires can be reviewed and turned into new patterns.
- [x] **Provider layer** (`src/core/ai/openaiCompat.ts`, `providers.ts`): one OpenAI-compatible implementation covers **Groq** (default, free tier), **Gemini** (its /openai endpoint), OpenRouter and Ollama; Claude keeps its native implementation. **Chain provider** tries them in order and falls through on 429/5xx/network, putting a rate-limited provider on cooldown. Per-provider keys in SecureStore; `withUsageMeter` counts tokens per provider per month and enforces a cap. Settings screen at You › Agent. Tests in `providers.test.ts`. *(landed 25 Sep from the product session — apply the patch with `git am -3`.)*
- [ ] Fact mining and other side jobs use the `small` chain (cheap/fast models).
- [ ] Talk screen: thread, composer, hold-to-speak (Android STT), reply cards (record / cycle / list / number / chart / confirm) with tap-to-open and Undo; a small "offline" pill on cards handled by the parser.
- [ ] Agent tools (extend `coreModule` aiTools): `resolve_entity`, `log_event`, `mark_cycle_done`, `set_next_due`, `log_meter`, `split_transaction`, `settle_debt`, `remember_fact`, `recall`, `forget_fact`, `create_routine`, `plan_trip`. Parser fast-path and LLM call the same tool functions.
- [ ] Learned aliases table ("the car" → Creta) written when the user confirms a disambiguation.
- [ ] Confirmation policy: money & people tools ask (inline confirm card); others auto-run and return an Undo handle — identical on both paths.
- [ ] **Facts** store + Browse › Memory screen. Fact mining: `remember …` sentences are filed by the parser for free; for LLM-handled messages, a second small call with a strict JSON schema extracts residual facts. Facts indexed in FTS with records and notes.
- [ ] Retrieval step before every LLM answer: FTS hits over records/notes/facts + resolved entity's timeline/relations + last N turns, packed with a token budget.
- [ ] `[[links]]` in notes/facts → relations; backlinks section on every record.
- [ ] Share-sheet intent (Android `SEND` / `SEND_MULTIPLE`) → Talk with the shared text/link/image attached.
- [ ] Model routing (when provider is Claude): Haiku default; escalate to Sonnet on ≥2 intents, a plan intent, or a tool error on first attempt. **Usage meter + monthly cap** in You › Agent (tokens and estimated cost per provider; the agent stops calling the model at the cap and says so).
- [ ] Golden tests: each sample sentence asserts (a) whether the parser or the LLM handled it, (b) the exact tool calls, (c) the resulting DB state — against the fake provider.

**Demo:** say the sample sentences in order with the phone in airplane mode — the simple ones file instantly; turn data on — the multi-step ones go through the model. Zero taps except the money/people confirmations.

## M4 — Reframe: data-first (replaces the old M4)

**Why:** after M1–M3 the app was an agent with a filing cabinet. `docs/PRODUCT.md` v4 says what it must be: a personal data dashboard + an almanac, fed automatically. This milestone turns the existing build into that. Nothing from M1–M3 is thrown away; the shell, the entity core, cycles, splits and the agent all stay.

### M4.0 — Audit first (half a day, no new code)
- [ ] Walk every screen on a real phone against PRODUCT.md v4 §5 golden flows. Write `docs/AUDIT.md`: what exists, what's missing, what's wrong. Rutvij reviews before M4.1 starts.

### M4.1 — Dump (the centre button)
- [ ] `dump` entity: raw text, source (typed / voice / share), createdAt, immutable body; `extractions` side table (dumpId → entityId/factId, kind, undone flag).
- [ ] Dump screen replaces the Talk tab in the bottom bar: big box, mic, send; toggle *Dump / Talk* at the top; recent dumps below, each with "extracted: 1 person · 2 facts · 1 task" chips and per-item Undo.
- [ ] Background extraction job (scheduler): parser first, then the small-model chain with a strict JSON schema: `{ people[], tasks[], facts[], events[], transactions[], cycleUpdates[], entitiesToCreate[] }`. Every created/updated record links back to the dump. Never blocks the dump; retries when online.
- [ ] Agent "create anything": `create_entity` accepts any registered type with partial data and fills sensible defaults; new tool `create_person_from_mention` (name, company, role, where met, relationship) and `suggest_cycle` (offer keep-in-touch / warranty / renewal). Golden tests: "made a new friend today, Karan, works at Zomato, met at the gym" → Person + fact + link; "bought a Dyson for 32k on the HDFC card, warranty 2 years" → Asset + Transaction + warranty cycle; 6-line rant with one buried task → one task, nothing invented.

### M4.2 — Data sources
- [ ] **Health Connect** (`react-native-health-connect`): permissions screen; daily sync of steps, sleep sessions, heart rate, workouts, weight into `measurements`/`workouts` with source = health_connect; backfill 90 days on first grant; hourly refresh via background task.
- [ ] **UsageStats** (native module + `PACKAGE_USAGE_STATS` onboarding): per-app foreground time, pickups, first unlock, last use, per day; app icons + labels cached; `devices` and `usage_app_daily` tables (device = this phone).
- [ ] **Screen time across devices** (PRODUCT.md §1.6):
  - `tools/mac-agent/screentime.py` + `com.lifeos.screentime.plist` (launchd, hourly). **First**: open the Mac's Screen Time store read-only (copy the sqlite files to /tmp before reading — they're locked), print the schema, and confirm which tables hold per-device / per-app usage (expected: ZUSAGEBLOCK, ZUSAGECATEGORY, ZUSAGETIMEDITEM, ZCOREDEVICE in `RMAdminStore-Local.sqlite`, synced devices in `RMAdminStore-Cloud.sqlite`); commit the findings to `tools/mac-agent/SCHEMA.md` before writing the exporter. Emit the last 7 days as inbox lines for every device found. Push to the Gist with a token from `~/.config/lifeos/env`. README with the Full Disk Access step.
  - Inbox reader in the app: You › Data sources › Inbox (URL + token), hourly background fetch + on-open; parses JSON lines; tolerant text parser for the office-Mac format (fixture from Rutvij); upsert on (device, date, app); "as of" per device.
  - Today tile "Screen time" = all devices summed, stacked bar per device; tap → week view, per-device colours, top apps merged by name with per-device split.
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
