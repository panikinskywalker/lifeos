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
- [x] Core additions needed by later milestones, migrations v3: `cycles`, `meter_readings`, `facts`, `groups` + `group_members`, `notification_rules`, `ingest_queue`. *(Group is an entity type, per M2 and PRODUCT §4, so v3 adds `group_members` only — no separate `groups` table.)*
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

**D4 — Today (with M4):** Today bento as in "Today · calm bento editorial": brief, finance, cycles, habits, tasks, trip, pending SMS tiles; Health engine screens.

**D5 — Ingestion (with M5):** proposed transaction card from a UPI notification; bank/SMS permission screens.

## M2 — Cycles, Upkeep, Things, chores

**Goal:** the "filing cabinet with dates" works without the agent.

- [x] Cycle engine in `src/core/cycles/`: kinds (interval / fixed date / meter / whichever-first), `markDone`, `snooze`, `setNextDue`, `skip`, stats. Unit-tested.
- [x] Cycle templates per entity type; Vehicle/Subscription/Document/Person/Item/Routine get defaults on create. *(Routine's template ships with the Routine type below; existing records are backfilled once on boot.)*
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

**Goal:** the primary input works. The sample sentences in `docs/PRODUCT.md` §8 all pass.

- [x] Talk screen: thread, composer, hold-to-speak (expo-speech-recognition or Android STT intent), reply cards (record / cycle / list / number / chart) with tap-to-open and Undo. *(Voice via the Android STT intent — tap the mic in the composer, or the raised mic while on Talk.)*
- [x] Agent tools (extend `coreModule` aiTools): `resolve_entity` (with disambiguation), `log_event`, `mark_cycle_done`, `set_next_due`, `log_meter`, `split_transaction`, `settle_debt`, `remember_fact`, `recall`, `forget_fact`, `create_routine`, `plan_trip`. *(Fact tools ship with the Facts store below. Also added: `upkeep_status`, `balances`.)*
- [x] Learned aliases table ("the car" → Creta) written when the user confirms a disambiguation.
- [x] Confirmation policy: money & people tools ask (inline confirm card); others auto-run and return an Undo handle. *(The card itself is drawn by the Talk screen.)*
- [x] **Facts** store + Browse › Memory screen; fact mining after every message (second, cheap Haiku call with a strict JSON schema); facts indexed in FTS with records and notes.
- [x] Retrieval step before every answer: FTS hits over records/notes/facts + resolved entity's timeline/relations + last N turns, packed into the system prompt with a token budget.
- [x] `[[links]]` in notes/facts → relations; backlinks section on every record.
- [ ] Share-sheet intent (Android `SEND` / `SEND_MULTIPLE`) → Talk with the shared text/link/image attached.
- [x] Model routing: Haiku default; escalate to Sonnet when the message has ≥2 intents, a plan intent, or the first attempt returned a tool error. Usage meter in You › Agent.
- [x] Golden tests: each sample sentence against a recorded-response fake provider asserting the exact tool calls and resulting DB state. *(PRODUCT §7 flows 1–5, 8, 9 in `src/modules/golden.test.ts`; 6 and 7 arrive with M5 and M4.)*

**Demo:** say the eight sentences in order; every one files correctly with zero taps except the two money/people confirmations.

## M4 — Today + morning brief

**Goal:** the app tells you before you ask.

- [ ] Today bento: Brief tile (agent-written, cached daily), Overdue tile, Due-today list, Chores checklist, Spend-this-month StackedBar, Running-out (subscriptions <7 days), People-to-call, Habits ring; drag-to-reorder; sizes.
- [ ] Brief generator job (scheduler, background task) at the chosen time → notification + tile.
- [ ] Widget gallery (add/remove tiles from any module).
- [ ] Quiet hours; per-module notification toggles.
- [ ] Habits & Health: check-in, streaks, heat map, Measurement trend chart.
- [ ] Biometric app lock; encrypted backup export/import.

**Demo:** wake up → brief notification → open Today → tap chores → done.

## M5 — Notification ingestion

**Goal:** payments file themselves.

- [ ] Android `NotificationListenerService` (Expo config plugin / native module) with an allow-list of package names.
- [ ] Parser rules for GPay, PhonePe, Paytm, HDFC Bank, Amex + generic fallback (amount, direction, merchant/VPA, last-4).
- [ ] Ingest queue → proposed Transaction cards on Today and Talk; confirm / edit / "that was dinner with Arjun, split it".
- [ ] Merchant learning (VPA/merchant → category) and dedupe (same amount within 10 min).
- [ ] You › Notification sources screen; battery/permission onboarding.
- [ ] Automation trigger `notification.matched` for user rules.

**Demo:** pay by GPay → 5 s later a card appears → confirm → transaction linked to the merchant, category learned.

---

## After phase 1 (backlog, in rough order)
Supabase sync + web client (iPhone) · Android home-screen widgets · semantic search / embeddings · weekly review & nudges · Developer Mode · calendar/gallery/timeline layouts · OCR · Health Connect · CSV import · photo memory.
