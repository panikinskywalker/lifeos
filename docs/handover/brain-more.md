# Handover: the brain's slices 4 and 6 (branch `claude/brain-more`)

Built 2 Nov 2026 from `m1-design-system` at 0c3a9b3 (v0.0.17). MODEL.md layer 8,
*First slices* 4 (Cook tonight and the fridge photo) and 6 (every module offers
candidates) for Money, Documents, Projects and Assets. No migration, no version
bump, no CHANGELOG edit, no PR. `npm run typecheck`, `npm test` (65 files, 514
tests) and `npx expo export --platform web` pass. Nothing has been run on the
phone; the Snap screen's first state was checked in the web build.

## What was built

**MODEL.md first**: layer 8 gains *Slices 4 and 6: the fridge photo and more
candidates* (the table of each new candidate: kind, shape, when, code's line,
Yes, what leaves; and when each is urgent); slices 4 and 6 in *First slices*
are marked built. PLUGINS.md's brain section has the new contracts.

**Snap the fridge** (Home; HOME-BRIEF screen 5):
- `src/modules/inventory/fridge.ts`: the question (the Fridge's pills by name,
  the ones to use soon marked, nothing else), the JSON schema (`not_seen`,
  `found`, `dish`), `fridgeDiff` (not seen only from names on the list; found
  only what is not on it; no em dashes in the dish), accept / fix
  (`acceptMissing` = used up, `fixMissing` = still good, `acceptFound` = into
  the Fridge, bought today), Undo through `undoFridge`, and `keepFridgeDish`.
- `src/core/brain/photo.ts`, `askWithPhoto`: the brain on, a key, the budget
  (a photo counts ~1,600 tokens), one call with the image, the Sent to Claude
  entry (pass `photo`, why "you pressed Snap the fridge", lines "Home · a photo
  of the fridge: read once, not kept" and the names), usage recorded. The image
  is never written anywhere in LifeOS (tests check `brain_sent` and
  `brain_learned` hold no base64).
- `src/boards/inventory/snap.tsx` at `/module/inventory/snap`: ready (what
  happens, Open the camera, the privacy line) → reading (the photo small,
  "Claude is looking…") → result (Not seen and Found as pills: tap = accept,
  hold = fix, tap again to take it back; each acts at once and is undone if
  you change your mind; the dish; All right; Take another) or failed ("Nothing
  changed": no key, over budget, off, Claude didn't answer, camera refused,
  photo too big). The camera is `expo-image-picker` (already a dependency),
  quality 0.4 with base64; the camera's file is deleted when you leave or take
  another.
- Ways in: a Snap the fridge card on Home (under Cook tonight) and on the
  Fridge space (replacing the "soon" slot).

**Cook tonight**: the photo's dish fills the slot when you press All right,
under the key a pass would use for the Fridge as it now is (so no pass asks
again); never over a dish already there. **Another idea** now forgets the dish
and runs a pass at once; with no dish yet, **Ask now** does the same.

**Candidates through `BrainDef`** (each with tests; Claude mocked):
- Money (`src/modules/finance/brain.ts`): a renewal that bills itself (is this
  right?, Keep it), a bill (a subscription with auto-post off: shall I? Paid
  marks the Cycle done and files the expense), a SIP or a deposit maturing
  (Right), one spend in the last two days at least 3x the category's median over
  90 days, ₹1,000 or more, with 5 or more before it (Right).
- Documents (`src/modules/documents/brain.ts`): expiring inside its notice
  (going off, shall I? Renewed opens the Document for the new date), new files
  in your folders a day or more after they were found (one nudge, Look opens
  Your folders). Never the number, the file or its text.
- Projects (`src/modules/projects/brain.ts`): an open task past its due day
  (Done ticks it; a repeat moves on), an Event today or tomorrow whose kind
  needs you (R4's `eventsOn`), not on a trip (travel's), not started yet (Open).
- Assets (`src/modules/assets/brain.ts`): a warranty inside 30 days (going off,
  Right), a service due by date or km or late (Serviced logs it), any other
  Cycle on an Asset or a Routine as Upkeep words it (Done).

**Upkeep stops offering their Cycles**: it already skipped modules with a
brain; such a module now brings them through core's
`cycleCandidates(os, now, module)` with the same keys (Projects reuses the Due
Cycle's key), so nothing filed before is filed again.

**Design**: `docs/design/BRAIN-BRIEF.md` gains an addendum (the new cards'
content, Cook tonight's Ask now and asking states, the photo's Sent to Claude
entry, and what the build adds to `NR-Home-Snap`).

## Shared core edits (each small)

1. `src/core/brain/upkeep.ts`: `cycleCandidates(os, now, module?)` and
   `cycleAct(os, verb, nudge, done?)`; the candidate's payload gains
   `template`. **Bug fix**: a Cycle due *today* (state `today`, not `soon`) was
   never offered by slice 3's Upkeep candidates; it is now.
2. `src/core/brain/model.ts` and `src/core/ai/brainModel.ts`: an optional
   `image` on `complete` (an image block before the text).
3. `src/core/brain/photo.ts` (new) and `src/core/brain/words.ts` (new: day
   words the modules share: `dueWords`, `inWords`, `dayMonth`, `pastDay`).
4. `src/core/brain/prompt.ts`: the house rules' list of what a pass may hold
   names the new kinds (changes the cached system prompt once).
5. `src/core/registry/context.ts`: `DeviceBridge.brain` (`model()`,
   `pass(why)`), filled in `src/platform/boot.ts`. Boards may not import
   platform code; this is how Home reaches Claude.
6. `src/core/brain/index.ts`: the exports.

No module imports another. Module manifests gain `brain:` in finance,
documents, projects and assets (each module's `index.ts`).

## What you must decide

1. **The unusual spend rule**: 3x the category's median over 90 days, ₹1,000
   or more, at least 5 before it, in the last two days. A category's month
   running over its target is not a nudge (yet).
2. **A renewal that bills itself** is a heads-up three days before (Keep it).
   If that is noise for small ones (₹75 iCloud), a floor (say ₹500)?
3. **Paid on a bill** files the expense in the *Subscriptions* category (as
   Upkeep's Done with a cost does), not the subscription's own category.
4. **Events that need you** are a list of kinds (flight, stay, check-in,
   reservation, appointment, dinner, party, guests, wedding, concert, match,
   interview, exam). Calendar events come in as kind `event`, so they never
   qualify; say if attendees or a location should count instead.
5. **Overdue tasks are urgent only when marked urgent**; Upkeep made every
   late Cycle urgent. Tasks due today are not offered (Today's agenda has them).
6. **A found thing** goes into the Fridge as bought today (LifeOS's guess of
   its life starts from today).
7. **"Not kept there"**: the screen says the photo is read once and not kept
   by LifeOS or the log, which is true here. What Anthropic keeps under its
   API terms is not something LifeOS controls; the copy does not claim it.
8. **Ask now / Another idea run a whole pass** (every module's nudges, within
   the limits), not a dish-only call. Simpler, and the limits still hold.

## What needs the phone to check

- **The camera**: Snap the fridge from Home and from the Fridge; the camera
  permission prompt; a photo at quality 0.4 stays under 5 MB (else "too big");
  the reading state; pills come back; tap and hold act and take back; All right
  fills Cook tonight; the camera's file is gone afterwards (the picker's cache).
- **A real call with a photo**: Claude answers the schema with an image
  (`output_config.format` plus an image block has not been exercised by tests),
  the Sent to Claude log shows the photo entry, tokens about 1.5 to 2k in.
- **A real pass** with Money, Documents, Projects and Assets data: their
  nudges arrive in Claude's words, two a module at most; Paid files the
  expense; Renewed and Look open the right screens; Done ticks a task.
- **Ask now / Another idea** on Cook tonight: a pass runs, "Asking…", the dish
  fills (or the toast says why not).
- Upkeep's own nudges no longer repeat subscriptions, documents, tasks or
  assets (only modules without a brain).

## Patch notes for the merge

**The brain, more of it** (MODEL.md layer 8, slices 4 and 6). The screens are
a first pass from the kit until the artboards are drawn.
- **Snap the fridge** on Home and the Fridge: take one photo, Claude compares
  it with the pills and lights up the differences ("Not seen: butter · Found:
  coriander"). Tap to accept, hold to fix. The photo goes to Claude only
  because you pressed the button, and LifeOS keeps it nowhere; Sent to Claude
  shows it left.
- **Cook tonight** takes the dish from the fridge photo, and **Ask now** /
  **Another idea** ask straight away instead of waiting for the next pass.
- **Money** brings renewals coming up, bills to pay (Paid files the expense),
  a deposit maturing, and a spend far above your usual.
- **Documents** brings papers expiring (Renewed opens it) and new files in
  your folders you haven't looked at.
- **Projects** brings late tasks (Done) and the dinner, appointment or match
  coming up today or tomorrow.
- **Assets** brings a warranty about to end and a service due by date or km.
- Fixed: something due today in Upkeep now comes as a nudge.
