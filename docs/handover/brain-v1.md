# Handover: the brain's first pass (branch `claude/brain-v1`)

Built 31 Oct 2026 from `m1-design-system` at 617c509 (v0.0.11). MODEL.md layer 8,
slice 3, plus the Morning brief on Today. No version bump, no CHANGELOG edit,
no PR. `npm run typecheck`, `npm test` (56 files, 457 tests) and
`npx expo export --platform web` pass. Nothing has been run on the phone.

## What was built

**The contract** (MODEL.md layer 8 *The contract*, PLUGINS.md *The brain*):
`ModuleManifest.brain` is a `BrainDef`: `candidates(os, now)` (plain
`Candidate`s, typed in `src/core/brain/contract.ts`), optional `asks` (slots
Claude fills), `act` (apply · yes · no · undo) and starting `skills`. Three
filing kinds in To check: `nudge-done`, `nudge-check`, `nudge-ask`. No module
imports another.

**Core** (`src/core/brain/`):
- `runPass`: gathers every module's candidates plus core's Upkeep ones, drops
  keys already filed, turned down (Not this) or held back today, keeps two per
  module a day (one once a module's nudges are turned down 3 times in 14 days
  and more often than acted on), asks Claude once, files a `nudges` row and a
  filing per nudge, keeps the fills, logs the send, notifies up to three a day
  (urgent first; inside quiet hours they wait for the end, and stay in the
  notification plan). Without a key, over budget, or on a failed call, the
  nudges are still filed in code's own words.
- `src/core/ai/brainModel.ts`: Claude over fetch (as the existing provider: no
  SDK in React Native). The system prompt (house rules and Skills) is cached
  with `cache_control`; the answer is constrained by a JSON schema
  (`output_config.format`); effort is set (`medium`); server-side fallbacks
  are on (`fallbacks: "default"`, beta header `server-side-fallback-2026-07-01`,
  not for Haiku); a refusal or a cut-off answer is an error.
- The learned store (`brain_learned`): answers by the key the module makes
  (gift ideas for these Likes, this year's wish, a dish from these things),
  facts Claude says to keep, Not this, held. A key it holds is never asked
  again; a pass with nothing new calls no one.
- Skills (`brain_skills`): house rules are code; each module seeds one, Claude
  may add, yours are never overwritten. Exported as Markdown (Copy as Markdown).
- The Sent to Claude log (`brain_sent`): when, why, model, what left line by
  line (records only: never a phone number, message, mail or photo), tokens,
  cache reads and writes, outcome.
- The daily budget (tokens a day, default 40k; cache reads count a tenth),
  checked before each call.
- Migration **v16** `brain` (four tables, all in backups); `UsagePurpose` gains
  `brain`; `os.brain` on the context.
- `passDue`: the morning pass from 7:00, the evening one from 19:00, once a
  day each (an evening pass also stands for a missed morning).
- `brief()`: today's nudges, urgent first, then the fills meant for the brief.

**Candidates** (plain functions, each with tests):
- Home (`src/modules/inventory/brain.ts`, on R7e's functions): going off
  (is this right?: Right / It's gone uses it up; Not this marks it still
  good), running out (done, undo?: put on the shopping list on its own; Undo
  takes it off), Cook tonight (an ask from what is lime and mustard in the
  Fridge, Freezer and Kitchen; fills Home's existing slot; Another idea).
- Upkeep (`src/core/brain/upkeep.ts`, core because Upkeep is core): every due,
  late or lead-window Cycle of a module that has no brain of its own; Yes logs
  it done, Undo puts it back.
- People (`src/modules/crm/brain.ts`): keep in touch (Call), birthdays within
  a week (Send wish opens WhatsApp with the drafted wish), gift ideas (from
  Likes, within two weeks) and the wish (the day or the day before) as asks
  that fill the board's existing slots.
- Turf (`src/modules/games/brain.ts`): a match within three days short of
  players (urgent tomorrow or tonight; Open match), dues owed to you for more
  than three days, as Turf web counts them (Remind opens WhatsApp with Turf's
  own reminder).

**The phone** (`src/platform/brain.ts`): the passes run from the existing
background task (`expo-background-task`, every 15 min or more as Android
allows) and when the app opens or comes back; one at a time. The key is the
Claude key already under You › Agent (moved, unchanged, to
`src/platform/keys.ts`; `boot.ts` re-exports it).

**UI, a first pass from the kit** (`docs/design/BRAIN-BRIEF.md`, artboards
`NR-Brain-*`): the Morning brief on top of Today ("Updated 7 pm" after the
evening pass), the nudge cards in To check, You › Agent › Brain (on/off, Run a
pass now, the key and model, the budget, the Sent to Claude log, what it has
learned, Skills, Copy as Markdown), Cook tonight on Home, gift ideas on the
birthday cards and profile, and the drafted wish in the wish card.

## What you must decide

1. **The model and the budget.** Default `claude-opus-5-5` (Sonnet 5.5 and
   Haiku 5.5 are one tap away) and 40k tokens a day. A pass is roughly 1 to 3k
   tokens in and under 1k out.
2. **Caching may not engage yet.** The cached part (house rules and four
   Skills) is under 1,000 tokens; the API caches only prefixes above a
   model-dependent minimum (512 to 4,096 tokens). It is set up and will start
   paying once the Skills grow, or we add more standing context. The log shows
   "from cache" so you can see when it does.
3. **Server-side fallbacks are on** (a declined pass is answered by another
   model). Say if you'd rather a decline just fall back to code's words.
4. **Pass times vs quiet hours.** The morning pass is from 7:00, quiet hours end
   at 7:30 by default, so its notifications wait until 7:30. Move either?
5. **Running out files itself** (done, undo?: butter goes on the shopping list
   on its own). The alternative is shall I? (Add to list).
6. **Upkeep in core offers every module without a brain**: Subscriptions,
   Vehicles, Documents' Cycles come in as Upkeep nudges until those modules
   offer their own (MODEL slice 6).
7. **The adjusting rule**: Not this 3 times in 14 days, and more often than
   acted on, takes a module from two a day to one. Never to zero.
8. **Event passes** ("a few on events") are not built; the hook is
   `runBrainPass(os, 'event', why)`. Which events: a Turf sync, an order
   stocked, a trip filed?
9. **The 8 am brief notification** (M5) still carries sleep, steps, the day and
   spend; it does not list nudges (the urgent ones notify on their own).
   Should it?
10. **Exact times.** Nothing in Expo SDK 57's bundled modules runs at an exact
    time in the background (`expo-background-task` is WorkManager: 15 min or
    more, at Android's discretion). If the passes land too late, the options
    are a native AlarmManager module (outside Expo's bundle) or running the
    passes on the Mac (R12) as MODEL first asked.
11. **No SDK.** The brain calls the Messages API over fetch, as the existing
    Claude provider does, rather than adding `@anthropic-ai/sdk` to the app.

## What needs the phone to check

- Save the Claude key under You › Agent › Brain (or Providers), Run a pass now:
  a nudge lands in To check, the Sent to Claude log has the entry, and the
  call succeeds over fetch from React Native with `output_config.format`,
  `fallbacks` and the beta header (none of that is exercised by tests).
- Run a second pass the same day with something new: "from cache" in the log
  (see decision 2).
- The background task runs the morning pass after 7:00 without opening the app
  (Android may delay it; check `adb shell dumpsys jobscheduler`), and the
  evening pass after 19:00; the Morning brief says "Updated 7 pm".
- Notifications: at most three a day, urgent first; one filed in quiet hours
  arrives when they end, and survives a later sync.
- Card buttons: Call opens the dialler, Send wish and Remind open WhatsApp
  with the text, Open match opens the match, Undo takes butter off the list.
- Home's Cook tonight card after a pass; Another idea; a birthday's gift ideas
  and the wish prefilled in the wish card.
- Today stays quick with the brief on top (it reads the nudges and each
  module's asks on every change).

## Patch notes for the merge

**The brain, a first pass** (MODEL.md layer 8). LifeOS now comes to you first.
The screens are a first pass from the kit until the *NR-Brain* artboards are
drawn.
- **Morning and evening passes**: twice a day LifeOS looks through Home,
  Upkeep, People and Turf for what needs you and asks Claude to judge and word
  it. At most two nudges per module a day; at most three notifications a day,
  urgent first, never in quiet hours.
- **A Morning brief on Today**, above the tiles: today's nudges and what to
  cook tonight, each opening its record. "Updated 7 pm" after the evening pass.
- **Nudges in To check**, in three shapes: done, undo? (butter put on the
  shopping list) · is this right? (milk probably gone) · shall I? (call Dad,
  send Karan's wish, remind Arjun, open Thursday's match). Not this means
  never again.
- **Cook tonight** on Home, **gift ideas** on People's birthday cards and
  profile, and **a drafted wish** in the wish card, from Claude.
- **You › Agent › Brain**: the Claude key, the model, a daily budget, the
  **Sent to Claude** log (exactly what left the phone: records only), what it
  has learned and its Skills, Copy as Markdown, Run a pass now.
- It learns: an answer it already has never costs a call again, and what it
  learns stays on the phone (in backups), never in Claude.
- Without a key, or over the budget, nudges still come in LifeOS's own words.
