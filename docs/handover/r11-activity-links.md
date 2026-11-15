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

## Follow-up 2, 15 Nov: one thing once

Rutvij: "game and turf are the same thing, it appears twice". On Priya the demo
showed each game as the game, her Appearance ("Game on Sat, 17 Oct"), a Debt
titled after the turf ("Turf · Playground Arena · 2026-10-17"), plus her Player
profile beside her and a Venue beside its Place.

- **`ObjectDef.linkRole`** (core type, `src/core/domain/types.ts`; PLUGINS.md):
  `{ aspectOf: field }` (a face of the record in that Field) or
  `{ joins: [fieldA, fieldB], words? }` (the meeting of two records).
  Declared in `src/modules/games/types.ts`: Appearance joins `personId` and
  `gameId` (the person side reads "Players"); Player profile is a face of
  `personId`; Venue a face of `placeId`. Three lines; no data changes.
- **`src/core/graph/view.ts`** (new): `viewLinks` (faces folded in, a join as
  one link to its other end carrying the join's line and what folded into it,
  a share's Debt folded into its game row), `canonicalId`, `aspectsOf`,
  `isDetail`. `linkGroups`, `egoGraph` and `mostLinked` read through it;
  `LinkItem` gains `removable` and `via`.
- **Person's own Links card** (`src/boards/crm/profile.tsx`) now takes its rows
  from `linkGroups`, so the profile reads the same (its local word list is
  gone; the map shows each record once). Shared edit in crm's board.
- Card: a game row says the share and what is owed, holding it offers *Open the
  appearance* and no Remove; rows don't repeat the game's own line and date.
- Tests: `src/core/linkGroups.test.ts`, 7 (a new one for faces and joins on
  Priya, a game, the Place, the network and Most linked). 634 of 635 pass;
  the deliveries failure is the base's, as before. Typecheck green; web export
  builds; the demo's Priya checked in the browser.

Phone checks: Priya's profile and Links screen: "Games · 3" with her shares,
no Appearances or Player profile; the network: games and Football, then Karan,
Rutvij, Arjun, Playground Arena, Dome Turf; Playground Arena (the Place) lists
its Games; a game lists its Players.

Not changed: Football's Debts still list on the group (money owed, each "Priya
· Owes you ₹450"); their titles are the games module's ("Turf · <venue> ·
<date>").

Patch notes:
- Links show each thing once: a game is one game, not also each player's
  appearance and share; a player profile is the person, a venue is the place.

## Follow-up 3, 15 Nov: Turf, not "Games" and "Turf"

Rutvij meant the module and the board: Links' colour legend said "Games" for
what the app calls Turf, and Browse listed a Games module beside the Turf
board (Home had the same double: a Home board and a Home module).

- `src/boards/turf/index.ts`: `module: 'games'` (Turf is the games module's
  board), so `/module/games` opens Turf home.
- `src/ui/theme/moduleTint.ts`: games' short name is "Turf" (the Links legend,
  Browse, anywhere modules are named).
- `app/(tabs)/browse.tsx`: a module whose board is placed under Boards (Turf,
  Home) is not listed again under Modules.
- MODEL.md layer 5 *Browse* says so.

Typecheck green; tests as before (634 of 635, the base's deliveries failure);
web export builds; checked in the browser: Browse lists Turf and Home once
(under Boards), Priya's Links legend reads Turf · People · Places, and Games
opens Turf.

Phone check: Browse has no Games or Home tile under Modules; the Links legend
says Turf.

Patch notes:
- Turf and Home show once in Browse, under Boards; Links calls Turf's colour
  Turf, not Games.

## Follow-up 4, 15 Nov: Links built to the Links · Noir artboards; Activity designed

The canvas already had the Links design (page *Links · Noir*, artboards
`L-Links`, `L-Links2`, `L-LinkDetail`, `L-RecordLinks`, `L-AddLink`,
`L-Everything`, `L-Parts`); Rutvij asked to build to it, using the design's
link words where they read well, and to add Activity to that page.

App:
- **Words** (`src/core/graph/words.ts`): lower case verbs as the record says
  them (*works at*, *with*, *paid*, *member of*, *captain of*, *fronted*,
  *played in*), the Field's label from its holder, the other Object's records
  ("tasks", "transactions") where no verb fits. A map line says its card's
  word, one record in the singular. MODEL.md layer 5 says so. Decided here
  (the design was silent): *with* also for a Task's or Trip's People;
  *transfers in* for a transfer's to account; *player of the match*.
- **The card** (`src/ui/components/LinksCard.tsx`, L4): small map with Open
  Links, word column, module-coloured discs, *to check* for guesses, hold for
  the link sheet. The column is 84 wide, not 66, so ORGANISATIONS stays whole.
- **The map** (`src/ui/components/LinkMap.tsx`, L1, L2, L7): rings round a
  lime-ringed centre, module colours, word pills along bent lines, "+N",
  dashed "?" for guesses, dotted quieter second ring, a tapped line lime with
  the rest at 20%. Replaces the force layout (`LinksView.tsx` removed;
  `d3-force` and `@types/d3-force` in package.json are now unused: left for
  the merge to drop, since removing them changes the lockfile).
- **The link sheet** (`src/ui/components/LinkSheets.tsx`, L3): since / still
  true, where it came from (`linkInfo` in `src/core/links.ts`: dump sentence
  while kept, message, agent, Field, you), confidence with *Right*, change the
  word (`changeLinkWord`, keeps provenance; not for a Field's link), Open,
  Remove with Undo; a link through a meeting opens that record.
- **Add a link** (same file, L5): search, *New record "…"* (opens that
  Object's form, linked on save), words (own link Fields, then knows · family
  of · works with · with · at · part of · owns · paid for · about, or your
  own), since, Link; faces and meetings are not offered. Not built from L5:
  *Both ways?* (core already stores symmetric words once).
- **The screen** (`app/links/[id].tsx`, L1, L2): hop switch, counts, module
  chips, the map full width, the centre card, the full card below.
- Not built: L6 (backlog in the design), the motion in L7 (lines drawing out,
  the glide on re-centre), *Set dates* in L3, pinch and pan in L2.

Canvas (the same page, a second row titled *Activity · Noir*): `A-Home`
(A1: every tracker's grid, done today, On Today with toggles and reorder),
`A-Tracker` (A2: 26 weeks, this week / month / streak, *what made a day
count* for a tapped day, the rules), `A-Edit` (A3: name, icon, colour, rules,
the seven kinds, a habit picked), `A-Tile` (A4: the Today tile one at a time
and all of them). The app's Activity board is not yet rebuilt to them; A2's
*what made a day count* needs a core reader that lists a day's matches.

Tests: `src/core/linkGroups.test.ts` now 8 (the word expectations follow the
new rule; a new one for `linkInfo`, `changeLinkWord` and since). 635 of 636
pass; the one failure is the base's deliveries test, as before. Typecheck
green; the web export builds; Priya's Links (one and two hops, a line's
sheet), Toit's card and the add sheet checked in the browser, no console
errors.

Phone checks: the Links screen on a person (rings, words, +N, chips, tap to
re-centre, hold to open, tap a word for its sheet, Back to); a record's card
(map, word column, hold a row: Right / change word / Remove with Undo); Link
on a record (search, a Field word fills the Field, New record links on save).

Patch notes:
- Links are drawn as in the design: the record in the middle, what it links
  to round it in module colours, the link word on each line; one or two hops,
  filter by module.
- Every record's Links card groups by the words you would say (works at,
  with, paid, played in); hold a link to see where it came from, confirm a
  guess, change its word or remove it.
- Adding a link searches records, can start a new one, and takes a since date.
