# R11 Activity and Links · hand-over

Branch `claude/r11-activity-links`, from `m1-design-system` at 0c3a9b3
(v0.0.17). No migration, no version bump, no CHANGELOG edit.

## What was built

- **Model first** (`docs/MODEL.md`): layer 3 gains the *Activity* board; layer 5's
  *Links* and *Activity* bullets say what the Links card, the Links screen,
  Browse › Links and the Activity board are; R11 marked built in layer 6.
- **Activity is a board** (`src/boards/activity`, placement `browse`, registered
  in `src/boards/index.ts`):
  - `home.tsx` (was `app/activity/index.tsx`): every tracker's row, "2 of 4 done
    today" in the header, an empty state, New tracker, On Today (show, hide,
    reorder).
  - `tracker.tsx` (was `app/activity/[id].tsx`) at `/board/activity/tracker?tracker=<id>`.
  - `edit.tsx` (was `app/activity/edit.tsx`) at `/board/activity/edit` (`?tracker=<id>` to edit).
  - `grid.tsx` (was `src/screens/ActivityGrid.tsx`): the grid and the row.
  - `tile.tsx`: the Today Activity tile, moved out of `app/(tabs)/index.tsx`
    unchanged apart from its routes (one at a time or all, as You › Home sets).
  - Core's trackers (`src/core/activity/trackers.ts`) are untouched: a tracker
    stays a setting (`activity.trackers`), not an Object.
- **Links**:
  - Core (`src/core/graph/read.ts`): `linkGroups(os, id)` groups a record's Links
    by the word as read from it, with each Link's id, ends, module, date and a
    signed amount for payments; `linkWord` picks the word; `mostLinked(os, n)`.
  - `src/ui/components/LinksCard.tsx`: the **Links card** (small map when two or
    more are linked, groups with four rows and *N more*, rows tinted by the
    other record's module, payments summed, long-press Open · Show in Links ·
    Remove link with Undo, Link to add, an empty state) and **LinkSheet** (word
    pills, your own word, the record picker; Undo removes exactly that Link).
  - `RecordScreen.tsx`: the old Links card, the "Around this record" map card and
    the inline LinkSheet are replaced by the shared ones (the map is now inside
    the card). A board that draws the whole page (Task, Project, Event, Group,
    Stock) gets the card below its page; Person draws its own.
  - `app/links/[id].tsx`: the network as before plus a legend of the modules on
    it, "Back to …", and the centre's Links card in full (add and remove here
    too, so Person's links can be removed).
  - `app/links/index.tsx` and a **Links** row in Browse: the most linked records.
- **Tests**: `src/core/linkGroups.test.ts`, 3 tests (words from each side,
  same-Object direction, signed payments, remove and put back the same way
  round, most linked leaves out mentions and deleted records). 489 tests green;
  typecheck green; `npx expo export --platform web` builds.
- **Design prompt**: `docs/design/LINKS-BRIEF.md` (`NR-Links-*`, `NR-Activity-*`).

## Decisions (where the model was silent; the simplest was picked)

- **Activity's screens move under the board** (`/board/activity/...`); the old
  `/activity` routes are removed rather than kept as redirects (nothing else
  linked to them). The tracker's query parameter is `tracker`, since `id` is
  taken by the board route (PLUGINS.md).
- **No board quick action** for a new tracker: the home's button is enough.
- **The link word** reads from the record you are on: this Object's own label
  when it declares the word towards the other Object; else the other Object's
  inverse label for an incoming Link; else core's word in that direction
  (`works at` normalised to `works_at`, so the Organisation reads "People here").
  Between two records of one Object only the direction counts (Koramangala
  "In" Bengaluru, Bengaluru "Contains" Koramangala).
- **Groups** are ordered by size, then word; inside a group dated things newest
  first, then by title. Four rows a group on the card, all on the Links screen.
- **Remove** removes the one Link by its id; Undo links the same two records
  the same way round with the same word.
- **Board pages get the card below them** unless a section says `ownLinks`
  (only Person, whose NR-People card already lists links and opens Links,
  where removing is possible).
- **Browse › Links** is a plain list of the most linked records (30), not a
  search; search already opens any record, and its card opens Links.
- The design prompt asks for a few things not built (guessed links with Right /
  Not this on the card, tapping a day to see what made it count, a search on
  Browse › Links); they wait for the artboards.

## Shared core edits (small; for the merge)

- `src/core/graph/read.ts`: three new exports appended (`linkWord`, `linkGroups`,
  `mostLinked`) and one type import; nothing existing changed.
- `src/core/registry/types.ts`: `EntityDetailSection.ownLinks?: boolean`.
- `src/ui/theme/moduleTint.ts`: `activity: 'tasks'` (the Browse tile tint).
- `src/ui/screens/RecordScreen.tsx`: the Links card and LinkSheet now come from
  `src/ui/components/LinksCard.tsx`; the card is added below `page` sections.
- `src/boards/crm/index.ts`: `ownLinks: true` on the Person page.
- `src/boards/index.ts`: `activityBoard` registered (one import, one line).
- `app/(tabs)/index.tsx`: `ActivityTile` moved to `@boards/activity/tile`
  (import swapped, function removed).
- `app/(tabs)/browse.tsx`: one Links row above Memory.

## Phone checks

1. Browse › Boards shows **Activity**; it opens the home with every tracker, the
   "done today" line, New tracker and On Today; a tracker opens, edits and
   deletes; back from a tracker returns to the home.
2. The **Activity tile** on Today still swipes between trackers, both styles,
   and opens the board / the tracker.
3. A generic record (a Place, a Transaction): the **Links card** with its map,
   groups by word, tints by module, *N more*; hold a row → Remove link → Undo
   puts it back; Link adds one with a word and the toast's Undo removes it.
4. A Task, Project, Event, Group and Stock page: the Links card below the page.
   A Person: only its own Links card (no second one).
5. **Links screen** from a card: legend matches the tints, tap walks, hold
   opens, Back to …, the card in full below works for the current centre.
6. Browse › **Links**: the most linked records, each opening its Links screen.

## Patch notes (for the version this becomes)

- Activity is now a board in Browse › Boards, with its home, trackers and the
  Today tile.
- Every record has a Links card: grouped by link word, coloured by module,
  with Remove link and Undo, and Link to add one.
- The Links screen shows which colour is which module and lists every link
  under the network; Browse has a Links list of your most connected records.

## Follow-up, 15 Nov: better Links logic

Branch `claude/r11-activity-links` restarted from `m1-design-system` at bb0de54
(v0.0.30), since R11 was merged as v0.0.21. No migration, no version bump, no
CHANGELOG edit. MODEL.md layer 5 *Links* says the new rules.

What was wrong, on the demo data:
- Words read backwards from the record a Field points at: Priya's card said
  "Player · 3", "Person · 2", "Captain", "Plays as"; Amex said "Account · 3",
  "ToAccount"; a Project's tasks were "Project". Most Links are made by Fields,
  and the card used the Field's word from the wrong side.
- Removing a Link a Field made (a Task's Project) left the Field set, so the
  next edit of the task brought the Link back. Adding offered the Object's
  declared words, some of which point the other way (Person's "Mentioned in").
- Browse › Links was topped by habits (55 check-ins each) and spaces.
- The two-step network was mostly identical "Game on Sat, 17 Oct" Appearance
  nodes and habit check-ins; lines said "toaccount", "person".

What changed:
- `src/core/graph/words.ts` (new): `readLink` (the word from either side,
  Field first), `lineWord` (the word on a network line), `linkFields`,
  `holds`, `humanise`.
- `src/core/graph/read.ts`: `linkGroups` uses it, names Fields when one Object
  points here through several, adds `context` (what the other record also
  points at), `subtitle`, `guessed` and `hidden` to each item, puts hidden
  Objects' groups last; `egoGraph` leaves out hidden Objects, ranks ring two by
  shared connections, at most four of one Object there, and gives each line
  its `word`; `mostLinked` ranks by breadth and returns `modules`. The old
  `linkWord` export is gone (only this file and its test used it).
- `src/core/links.ts`: `removeLink` and `addLink`, which change the Field when
  a Field made the Link, with an exact Undo.
- UI: the Links card uses them, shows each row's context and a *guess* tag; the
  Link sheet offers this record's link Fields (picker limited to the Objects
  each takes), *Related* and your own word; network lines show the new words;
  Browse › Links says "across N modules".
- Tests: `src/core/linkGroups.test.ts` now 6 (Field words both ways and named
  Fields, remove and add keeping the Field in step, breadth ranking, hidden
  Objects off the network, ring two ranking and its cap). The first test's
  Organisation word changed from "People here" to "People" because Person's
  Works at is a Field (a rule change, not a fix to pass).
- Typecheck green; 633 of 634 tests pass. The one failure,
  `src/modules/deliveries/deliveries.test.ts` (*a parcel arriving today*),
  fails on the base too without these changes (a second demo parcel now counts
  as today); not touched here. `npx expo export --platform web` builds; the
  demo's Links list, Priya's Links screen and card checked in the browser,
  no console errors.

Shared edits: `src/core/graph/read.ts`, `src/core/graph/words.ts` (new),
`src/core/links.ts` (two functions appended), `src/ui/components/LinksCard.tsx`,
`src/ui/components/LinksView.tsx` (one line: the edge's word), `app/links/index.tsx`.
Boards that call `linkGroups` (deliveries, workout, note, habit, document) get
the new words with no change; their item shape only gained fields.

Phone checks:
1. Priya (Turf player): Appearances, Debts, Games · captain, Games · fronted
   by, Groups, Player profiles; each row says what it joins up.
2. A Task with a Project: remove the Project Link from the Project's card,
   edit the task, the Link stays gone; Undo puts the Project back in the Field.
3. Link on a Task offers Project and People; Project's picker shows only
   Projects; the task's form then shows that Project.
4. Browse › Links: people and groups first, no habits or spaces.
5. Links screen on Priya, two steps out: Karan, Rutvij and the games before
   other players' Appearances; lines read debt, player, captain, member.

Patch notes:
- Links read the right way round: a Project lists its Tasks, a person their
  Appearances and Debts, a Game its captain and venue.
- Removing a link that came from a field now stays removed, and adding one
  through a field fills that field.
- Browse › Links shows what joins up the most, not habits with many check-ins;
  the Links network puts people and places before repeated records.
