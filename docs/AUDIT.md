# LifeOS — audit against PRODUCT.md v4 (M4.0, 26 Sep 2026)

> **Note, 4 Oct 2026:** this is a dated snapshot. The Almanac tab it audits against was dropped from the product on 4 Oct; Browse stays. See `docs/MODEL.md`.

Built from the code on branch `m1-design-system` (M1–M3.5 done, 137 tests green). The phone walk is Rutvij's half: the checklist at the end lists what to look at on the device.

**Legend:** ✅ exists and fits v4 · 🟡 exists, needs reshaping · ❌ missing

## 1. Golden flows (§5)

| # | Flow | State | What's there | What's missing / wrong |
|---|------|-------|--------------|------------------------|
| 1 | Today = steps, sleep, screen time, spend, upcoming as charts, < 1 s | 🟡 | Today has Brief (placeholder copy "arrives in M4"), Overdue, Habits, Running out, Spent this month (stacked bar). Chart kit exists: sparkline, line, stacked column, ring, progress, day timeline. | No device data at all: no steps, sleep or screen time sources. Brief tile is placeholder text, which v4 forbids. No "vs. yesterday" deltas, no spend pace line. |
| 2 | Tap steps → full chart, day/week/month/year, vs. previous period | ❌ | Finance month report and Health module screens have charts. | No full-screen chart screen with a period switcher and comparison. No tile opens one. |
| 3 | Dump "made a new friend today, Karan, works at Zomato, met at the gym" → Person + fact + link | ❌ | Person type has company/role/relationship. Facts store and `remember_fact` exist. The model *could* do it through Talk with `create_entity` + `remember_fact`. | No Dump at all: no raw-dump record, no extraction job, no link back. Parser doesn't handle it. No golden test. |
| 4 | "bought a Dyson for 32k on the HDFC card, warranty 2 years" → Asset + Transaction + warranty cycle | 🟡 | Asset type with `warrantyUntil` already creates a warranty cycle. Transactions and accounts exist. | Nothing turns the sentence into all three linked records; "2 years" → date conversion lives nowhere; no golden test. |
| 5 | 6-line rant with one buried task → task only, rant kept verbatim | ❌ | Task type (Projects). | Needs Dump + extraction with a strict "don't invent" schema. |
| 6 | First run SMS import → review → Money shows months of history | ❌ | `ingest_queue` and `notification_rules` tables (v3), unused. | No SMS reading (no native module, no `READ_SMS` permission), no parsers, no review screen. |
| 7 | New SMS "debited INR 1,240 at SWIGGY" → transaction in seconds, Food | ❌ | Parser's category map already knows Swiggy → food. | No `RECEIVE_SMS` receiver, no bank-SMS parser. |
| 8 | Talk: food this month vs. last / when did I last meet Karan / what did I dump about the landlord | 🟡 | `aggregate`, `finance_summary`, timeline, `recall`, retrieval over records + notes + facts. | Month-vs-month is two calls the model must think to make; "last met" relies on timeline events that nothing logs; dumps aren't indexed (they don't exist). |
| 9 | Almanac › Time › March 2026 → spend, dumps, events, health averages | ❌ | Browse = module grid + Memory + Recent; search screen. | No Almanac sections (People · Things · Money · Body · Mind · Places · Time), no Time view. No Place or Book types (Mind, Places are empty). |
| 10 | "Did the car service, 6,400 at Hyundai" → event + transaction + cycle rolled | ✅ | Parser handles it offline with confirm on the money, Undo, cycle rolled; golden test #1. | — |

## 2. Information architecture (§4)

| Area | State | Notes |
|------|-------|-------|
| Bottom bar: Today · Upkeep · **Dump** · Almanac · You | 🟡 | Currently Today · Upkeep · **Talk** · **Browse** · You. Two tabs to swap; the bar component itself fits. |
| Dump screen with Dump/Talk toggle | 🟡 | Talk screen is complete (thread, cards, confirm, Undo, voice, share-in) and becomes the *Talk* half. The Dump half is new. |
| Upkeep | ✅ | Unchanged in v4. |
| Almanac | 🟡 | Browse's search, Memory and Recent carry over; sections and Time are new. |
| You › Data sources | ❌ | You has Agent, Data (backup), Locale, theme. No sources screen. |
| Facts on the subject's page | 🟡 | Facts exist with a Memory screen; record pages show backlinks but not facts about that record. |
| One FTS index over records + notes + facts + dumps | 🟡 | Records, notes and facts are indexed; dumps don't exist yet. |

## 3. What's wrong (not just missing)

1. **Today shows placeholder copy** ("Brief — arrives in M4" plus three static bullets). v4 rule: no placeholder numbers or copy; an empty state that names the missing permission instead.
2. **Talk is framed as the centre of the app** (tab, bottom-bar mic, onboarding copy). v4 demotes it to a toggle in Dump.
3. **Measurements are typed by hand** (steps, sleep, weight as records). Health Connect data should land in the same `measurement`/`workout` records with `source = health_connect`, and not be retyped.
4. **Free-tier agent reliability**: in the last session Groq hit its free per-minute limit on one message, and Gemini's default model had been retired. Both are fixed (leaner requests, model auto-switch, `gemini-flash-latest`), but not yet confirmed on the phone. Dump extraction will lean on this chain heavily, so it needs to hold up.

## 4. Prerequisites and decisions before M4.1

1. **Expo Go stops being enough.** Health Connect, UsageStats, SMS and the notification listener are native modules. From M4.2 on, every test needs a **development build** (`expo-dev-client`, built with EAS since this Mac has no Android SDK), installed once and then hot-reloaded like Expo Go. M4.1 (Dump) still works in Expo Go.
2. **HANDOFF rule 7 says `npx expo run:android`**, which needs Android Studio + SDK 35 on this Mac (not installed). The alternative is EAS cloud builds (~15 min each, already set up under the `lifeoryu` account). **Pick one.**
3. **Open from PRODUCT §7:** which watch/app writes to Health Connect, and which banks send you SMS. Parsers ship generic first either way; real fixtures need a few sample SMS (amounts/last-4 can be masked).
4. **New types v4 implies:** Place (Places), Book/Media (Mind). They're small, but they're new entity types. Proposal: add them in M4.4 with Almanac.

## 5. Proposed order inside M4 (unchanged from MILESTONES, with notes)

- **M4.1 Dump:** golden tests for flows 3–5 first (fake provider), then `dump` + `extractions` (migration v6), extraction job, then the Dump screen with the Talk toggle, then the bar swap. Works in Expo Go.
- **M4.2 Sources:** dev-build switch first, then You › Data sources shell, then SMS (fixtures before UI), notifications, Health Connect, UsageStats.
- **M4.3 Today:** Comparison chip + HeatMap + full-screen chart screen, then tiles as their sources land; remove the placeholder Brief.
- **M4.4 Almanac:** sections over existing types, Time view, facts/dumps on record pages, FTS for dumps.

## 6. Phone walk — please check these

1. Today: does anything look like a fake number? Is it fast?
2. Talk: "did laundry", "spent 450 on lunch", "add a new vehicle" (should open the form with no model call), then one free-form question with Groq/Gemini keys set. Does anything still error?
3. Browse → each module → a record → edit: anything broken or confusing?
4. Upkeep: mark something done, then Undo.
5. You › Agent: does "Show available models" list models for both Groq and Gemini?
6. Anything you expected from v4 that isn't in this audit.
