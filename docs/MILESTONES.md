# LifeOS — milestone plan (phase 1, Android)

Each milestone ends with something Rutvij can install on his phone and use. "Done" means: typecheck + tests green, runs on a real Android device, the listed flows work end to end with real data (not seed data), and the screens match `docs/DESIGN.md`.

Order is deliberate: the design system first (so nothing gets built twice), then the concept the whole app hangs on (Cycles/Upkeep), then the agent, then the proactive layer, then ingestion.

---

## M1 — Foundation + design system

**Goal:** the existing core is kept; the UI is rebuilt on the locked design tokens and components so every later screen is assembled, not designed.

- [x] Apply `docs/DESIGN.md` tokens: colours (bone ground, tile, mustard accent, module tints), type scale, radii, spacing. Replace `src/ui/theme/tokens.ts`.
- [x] Inline SVG icon set (`src/ui/icons/`) — one component per icon, stroke-based, no icon fonts. Every icon named in DESIGN.md exists.
- [x] Components: Tile (bento cell, 1×1/2×1/2×2), StatTile, StackedBar, Ring, RowItem, Chip/FilterChip, Sheet, Toast-with-Undo, EmptyState, Segmented, FormField set, RecordHeader, SectionCard.
- [ ] Bottom bar: Today · Upkeep · **Talk** (centre, raised) · Browse · You.
- [ ] Dark mode tokens and a theme toggle in You.
- [x] Storybook-style gallery screen at `/dev/components` showing every component in both themes (used to review against the Claude Design canvas).
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

**Goal:** the primary input works. The sample sentences in `docs/PRODUCT.md` §8 all pass.

- [ ] Talk screen: thread, composer, hold-to-speak (expo-speech-recognition or Android STT intent), reply cards (record / cycle / list / number / chart) with tap-to-open and Undo.
- [ ] Agent tools (extend `coreModule` aiTools): `resolve_entity` (with disambiguation), `log_event`, `mark_cycle_done`, `set_next_due`, `log_meter`, `split_transaction`, `settle_debt`, `remember_fact`, `recall`, `forget_fact`, `create_routine`, `plan_trip`.
- [ ] Learned aliases table ("the car" → Creta) written when the user confirms a disambiguation.
- [ ] Confirmation policy: money & people tools ask (inline confirm card); others auto-run and return an Undo handle.
- [ ] **Facts** store + Browse › Memory screen; fact mining after every message (second, cheap Haiku call with a strict JSON schema); facts indexed in FTS with records and notes.
- [ ] Retrieval step before every answer: FTS hits over records/notes/facts + resolved entity's timeline/relations + last N turns, packed into the system prompt with a token budget.
- [ ] `[[links]]` in notes/facts → relations; backlinks section on every record.
- [ ] Share-sheet intent (Android `SEND` / `SEND_MULTIPLE`) → Talk with the shared text/link/image attached.
- [ ] Model routing: Haiku default; escalate to Sonnet when the message has ≥2 intents, a plan intent, or the first attempt returned a tool error. Usage meter in You › Agent.
- [ ] Golden tests: each sample sentence against a recorded-response fake provider asserting the exact tool calls and resulting DB state.

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
