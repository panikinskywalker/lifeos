# Merge of the 2 Nov cloud milestones · hand-over

Branch `claude/merge-r5-r15`, from `m1-design-system` at 0c3a9b3 (v0.0.17).
Ten branches merged, each as a merge commit and then a version commit, with
`npm run typecheck` and `npm test` green after every one. No tags made;
`m1-design-system` itself is untouched: fast-forward it to this branch when
you are happy.

At the end: typecheck clean, **79 test files, 627 tests green**, `npx expo
export --platform web` builds, and the web build was opened route by route
(Today, Browse, Activity, Time, Second Brain, Facts, Health and a metric page,
Travel, Deliveries, Automations, Home, Snap the fridge, Links, Lock & backup,
Agent, Home screen), empty and with the demo data: no page or console errors.

**No migration in any branch.** v16 (`brain`) is still the latest; nothing was
renumbered.

## The versions

| Version | Milestone | From | What it brought |
|---|---|---|---|
| v0.0.18 | R15 Build and ship | `claude/r15-ship` | Database encryption (SQLCipher, a button to move your database, new installs encrypted); the daily clean-up (To check 15 days, dumps out of search after 15 days, raw texts 60 days) with its log; app lock fixes. **Needs a new APK.** |
| v0.0.19 | R12 Mac model first (code side) | `claude/r12-mac-model` | The Mac (Ollama over Tailscale, `qwen3:8b`) first in the chain, the cloud on failure; You › Agent › Your Mac with Test the Mac; budgets cloud only; golden sentences against a mocked Mac. |
| v0.0.20 | R8 Today and Time | `claude/r8-today-time` | Every Today tile a `TileDef` on the board owning its data; Today only lays them out; Time a board at `/time` with On this day. |
| v0.0.21 | R11 Activity and Links | `claude/r11-activity-links` | Activity a Browse board; the Links card on every record (grouped by word, tinted, Remove with Undo); the Links screen's legend; Browse › Links. |
| v0.0.22 | R10 Automations | `claude/r10-automations` | Steps with data passing, Continue only if, Ask Claude, run by hand (board, Run now, "run …" in Talk), the run log per step with Undo and Run again, templates, Every day once a day. |
| v0.0.23 | R6 Health | `claude/r6-health` | Measurement and Workout Fields; Health Connect and screen time as health's sources; a page per metric; this week vs last and vs your usual; four AI tools; the weigh-in nudge. |
| v0.0.24 | R7b Deliveries | `claude/r7b-deliveries` | Shop app notifications, Instamart / Zepto / Blinkit, couriers; shop and payment Links; the OTP screen; Delivered by hand; the *coming up* nudge. |
| v0.0.25 | R7d Travel | `claude/r7d-travel` | Trips from flight and stay mail; spend vs budget; packing from clean clothes; check in, pack, before you go and back home nudges; a trip's Place and Trips here. |
| v0.0.26 | R7f the Second Brain | `claude/r7f-knowledge` | Notes and Facts in one board; `[[mentions]]` as Links; titles from the first line; the fold of name facts; three AI tools. Browse's Memory row is now Facts. |
| v0.0.27 | Layer 8 slices 4 and 6 | `claude/brain-more` | Snap the fridge; Cook tonight's Ask now; candidates from Money, Documents, Projects and Assets; a Cycle due today now nudges. |

**Not merged: `claude/r5-habits`** did not exist on the remote when the merges
ran (checked again before the last merge). R5 stays open in MODEL.md layer 6.
When it lands it will most likely meet R8 (`src/boards/habits/tile.tsx`, the
Habits tile now lives there), brain-more (Upkeep brings a module's Cycles
only when that module has no brain of its own: if habits gains a brain, it
must offer its Cycles through `cycleCandidates(os, now, 'habits')`), and
MODEL.md layer 6.

## Conflicts and how they were settled

No two branches' tests contradicted each other; every conflict kept both
sides.
1. **R11 onto R8, Today** (`app/(tabs)/index.tsx`): R8's version kept (Today
   lays out registered tiles only). R11 had moved the Activity tile out of
   that file into `src/boards/activity/tile.tsx`; R8 had put it on the Today
   board. It now lives on the **Activity board** as its `TileDef` (same id
   `activity`, same two looks, R11's `/board/activity` routes), as R8's
   hand-over planned. The "No trackers yet" line uses R11's wording (R8's had
   an em dash). MODEL.md layer 5's tile table gains an Activity row.
2. **R11 onto R8, registrations**: `src/boards/index.ts` registers Today,
   Time and Activity; `moduleTint.ts` has both `time` and `activity`.
3. **R10 onto R11, MODEL.md layer 6**: both built notes kept, R10 above R11.
4. **R6 onto R8, Health board**: R8's Steps and Sleep tiles kept with R6's
   home and metric pages.
5. **R7f onto R11**: Browse keeps R11's *Links* row and R7f's *Facts* row (in
   place of Memory); a record section keeps both `ownLinks` (R11) and
   `fields` (R7f). MODEL.md layer 5's Memory line now says Facts, as R7f's
   hand-over asked of the merge.
6. **brain-more onto R10, `src/platform/boot.ts`**: both kept (the device
   bridge with `brain` for boards, and the automations' `modelProvider`); the
   doubled `brainModel` import removed.
7. **No em dashes**: two sentences R8 moved verbatim into
   `src/boards/today/tiles.tsx` lost theirs ("Nothing on today: no events…",
   "Learned from your last 30 days, a little better…"). The "—" shown for a
   missing number (24 places across `src`, from before tonight) is a
   placeholder glyph, not punctuation, and was left; say if it should become
   something else.

## What still needs the phone

**One new APK first.** v0.0.18 turns on SQLCipher, which changes the native
build; every later version shares that fingerprint. Nothing else in this
merge changes native code (the camera for Snap the fridge was already
declared). So:
1. In the installed app: You › Lock & backup › *Export encrypted backup*,
   keep the file off the phone.
2. Build and install the preview APK over the current one (data kept):
   ```bash
   eas build --profile preview --platform android
   ```
3. Then go through each hand-over's *Phone checks*, roughly in this order:
   - `r15-ship.md`: *Try on a copy*, *Encrypt the database*, restart, the
     lock, the next day's clean-up.
   - `r8-today-time.md`: Today looks as before (order, looks, pairs); Time.
   - `r11-activity-links.md`: the Activity board and tile; Links card on a
     generic record, on Task / Project / Event / Group / Stock pages, Person
     with one card only; the Links screen; Browse › Links.
   - `r6-health.md`: Health Connect through Health's own source, pages per
     metric, Log weight, comparisons after two weeks.
   - `r10-automations.md`: your four rules kept; Run Month close, "run month
     close" in the Dump box, a template, Every day firing once.
   - `r7f-knowledge.md`: the fold (Facts count matches the old Memory), a
     note with a mention, Browse › Facts.
   - `r7b-deliveries.md`, `r7d-travel.md`: need real orders and mail; the
     package names in `deliveries/filing/quick.ts` are from memory.
   - `brain-more.md`: Snap the fridge with a real photo and key; a real
     pass with Money, Documents, Projects and Assets data.
   - `r12-mac-model.md`: the Mac steps (Ollama, `qwen3:8b`, Tailscale, the
     golden script), then Test the Mac from the S22.

**Real samples wanted** (You › Data sources › Export for the parser): the
delivery texts and notifications listed in `r7b-deliveries.md`, and the six
travel mails in `r7d-travel.md`. Every parser in those two is written against
plausible samples, not real ones.

**Your decisions**, each listed in its hand-over under *What you must decide*
or *Decisions*: R15 (encrypting on a button, dumps cleared not deleted, the
key in no backup), R12 (`qwen3:8b`, no retry on the Mac, tool names), R8 (tile
ids kept), R11 (old `/activity` routes removed), R10 (by-hand buttons on Today?
wait and branch steps? a budget of their own?), R6 (screen time not a
Measurement; a week is the last 7 days), R7b (quick commerce never nudges),
R7d (new Places for destinations, packing counts, Back home into the wash),
R7f (re-link notes when a record appears later), brain-more (the unusual spend
rule, a floor for renewals, which Events need you). The parked ideas among
them are in `docs/ADHOC.md`, *Parked by the 2 Nov milestones*.

## The R16 docs pass (done here)

- `docs/MODEL.md` layer 6 says what is merged and in which version, notes R5
  as not merged, slice 6's remaining modules, and R16's own state.
- `docs/PLUGINS.md` checked against the code: the module manifest as it is
  (templates, brain), Today's tiles and record sections' `ownLinks` /
  `fields`, the database file and retention, the provider chain.
- `docs/ADHOC.md`: the hand-overs' parked ideas.
- Left of R16: retire `GRAPH.md` and SCOPE §C into MODEL.md; rewrite
  `HANDOFF.md` for the three tiers.

## What is left of the roadmap

- **R5 Habits**: its branch, when pushed (see above).
- **R9b to R9e, Turf web**: the backend's deploy, the switch from Turf Ledger;
  needs your Cloudflare account (`wrangler login`, Access) and the
  `turf-web` repo, which this session cannot reach.
- **R12, the run on the Mac**: code is merged; the golden sentences on a real
  `qwen3:8b` and Test the Mac from the phone are yours.
- **R13 Phone model** and **R14 Your own fine-tune**: not started.
- **R16**: the rest above.
- **Phone checks** for everything from R0 on that says *Phone check pending*,
  and the design artboards each first-pass board waits for (`NR-Time`,
  `NR-Links` / `NR-Activity`, `NR-Automations`, `NR-Health`, `NR-Deliveries`,
  `NR-Travel`, `NR-Knowledge`, the brain's addendum).
