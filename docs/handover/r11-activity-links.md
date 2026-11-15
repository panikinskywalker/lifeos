# R11 Activity and Links · hand-over

Two passes on branch `claude/r11-activity-links`:

1. **First pass** (2 Nov, from `m1-design-system` at 0c3a9b3, v0.0.17;
   merged as **v0.0.21**): Activity became a board; one Links card on every
   record; the Links screen and Browse › Links from the kit.
2. **Second pass** (15 Nov, from `m1-design-system` at bb0de54, v0.0.30;
   merged as **v0.0.31**): better Links logic, one thing once, Turf named
   once, Links built to the *Links · Noir* artboards, payments as an audit
   trail, and Activity rebuilt to its new artboards.

No migration in either pass. MODEL.md layers 3, 5 and 6 say what is built;
this file says how, what was decided, and what to check on the phone.

Design canvas: https://claude.ai/artifact/RVT9hLfcQ7tvgXvZN1x6cF, page
*Links · Noir*: `L-*` (L1 one hop, L2 two hops, L3 a link tapped, L4 the
record's Links card, L5 add a link, L6 everything, L7 the parts) and, in a
second row added this pass, `A-*` (A1 Activity home, A2 a tracker, A3 new
tracker, A4 the Today tile).

## Links, as built

**How a Link reads** (`src/core/graph/words.ts`). Words are lower case, as
the record would say them: Karan *works at* Zomato, was *with* the dinner,
*paid*, *member of* Football, *played in* a game, *captain of* another. Most
Links come from a link Field, so the Field decides: from the record holding
it, the Field's label ("project", "venue"); from the record it points at, a
verb where the Field names a part someone plays, else the other Object's
records ("tasks", "debts"), never the Field's word read backwards. Then the
Object's declared words, core's words, the other Object's name. Between two
records of one Object only the direction tells ("in" / "contains").

**One thing once** (`src/core/graph/view.ts`, `ObjectDef.linkRole`). An
Object can say how Links shows its records:
- `{ aspectOf: field }`: another face of the record in that Field; folds into
  it. Player profile → its Person; Venue → its Place.
- `{ joins: [a, b], words? }`: the meeting of two records, shown as one link
  between them, carrying its line; what is about it folds in. Appearance =
  a person in a game, so Priya has "played in" games with "₹450 · paid · 1
  goal · Owes you ₹450" on each row, and a game has "players"; the share's
  Debt is in that row, not its own.
- `{ trail: true }`: **payments are an audit trail, not Links** (Rutvij, 15
  Nov: a monthly Claude charge made a line and a row every month and slowed
  things). Transaction declares it. A payment is never a Link on the card,
  the map, Browse › Links or the add sheet; it is an Event in the Recent
  timeline of each record it touches (`trailOf`), replacing its "Linked
  from" line. The Links stay stored: finance and its boards read them, and a
  payment's own page still shows its card and payee.

`viewLinks` reads every Link through these rules; `linkGroups`, `egoGraph`,
`mostLinked` and `linkOverview` all read through it. `isDetail` keeps joins,
their parts and payments off the map.

**Screens** (each drawn to its artboard, Noir colours per module from
`linkColorForModule` in `src/ui/theme/moduleTint.ts`):
- **The Links card** (L4, `src/ui/components/LinksCard.tsx`) on every record;
  below a board's own page unless the page sets `ownLinks` (Person, whose
  NR-People card takes its rows from `linkGroups` too). Small map with Open
  Links; groups by word in a left column (84 wide, not the design's 66, so
  ORGANISATIONS stays whole); discs in module colours; *to check* on guesses;
  four a group then *N more*; tap opens, hold opens the link sheet.
- **A link, tapped** (L3, `src/ui/components/LinkSheets.tsx`): since / until,
  **Set dates**, where it came from (`linkInfo`: a dump with its sentence
  while kept, a message, the agent, a Field, you), confidence with *Right*,
  change the word (`changeLinkWord`, keeps provenance; not a Field's), Open,
  Remove with Undo; through a meeting, *Open the appearance* instead.
- **Add a link** (L5, same file): search, or *New record "…"* (that Object's
  form, linked on save); words = this record's link Fields (which fill the
  Field) then knows · family of · works with · with · at · part of · owns ·
  paid for · about, or your own; since; **Both ways?** (not for symmetric
  words like knows, or a Field's word). Faces, meetings and payments are not
  offered. Saved as yours (source manual).
- **The Links screen** (L1, L2, `app/links/[id].tsx`, `src/ui/components/LinkMap.tsx`):
  1 hop · 2 hops, counts, module chips, the map (lime-ringed centre, rings
  in module colours, word pills on bent lines, +N, dashed "?" for guesses,
  dotted quieter second ring, a tapped line lime with the rest at 20%), the
  centre card (Open record, hop switch, Back to), the full card. Ring two is
  ranked by shared connections, at most four of one Object. **Motion**: lines
  draw out (300 ms), the tapped record glides to the middle (420 ms); reduced
  motion skips. **Zoom**: pinch and two-finger pan, Reset zoom, double-tap.
- **Browse › Links** (L6, `app/links/index.tsx`, `src/ui/components/LinkCloud.tsx`,
  `src/core/graph/overview.ts`): find a record; Clusters or Free; counts;
  module chips; a time-lapse (Play, drag); *Joins up the most*, ranked by
  breadth (each kind of linked record counts up to five) then modules.

**Removing and adding keep Fields in step** (`removeLink`, `addLink` in
`src/core/links.ts`): a Link a Field made is taken out of (or put into) that
Field, so it does not come back on the next edit.

**Turf, once**: the Turf board is the games module's (`module: 'games'`), its
short name is Turf everywhere modules are named, and Browse no longer lists a
module whose board is already under Boards (Turf, and Home for inventory).

## Activity, as built

A Browse board (`src/boards/activity`) over core's trackers (a setting,
`activity.trackers`, not an Object), drawn to A1 to A4:
- `grid.tsx`: tracker colours (the Noir module colours over the stored tints),
  disc, today's tick, a tappable grid with month names, card and mini rows.
- `home.tsx` (A1): how many counted today, a card per tracker, New tracker,
  On Today (show or hide each, hold to reorder via `SortableList`).
- `tracker.tsx` (A2): this week / month / streak with the longest, 26 weeks,
  a day tapped shows **what made it count** (`dayMatches` in
  `src/core/activity/trackers.ts`: each payment, message, event, workout,
  health number, app time or habit that matched, opening its record), the
  rules, Edit rules, Delete (asks first).
- `edit.tsx` (A3): name, icon, colour, rules, the seven kinds of rule.
- `tile.tsx` (A4): one tracker at a time with page dots, or all stacked small.

Routes: `/board/activity`, `/board/activity/tracker?tracker=<id>`,
`/board/activity/edit` (`?tracker=<id>` to edit); the old `/activity` routes
went in the first pass.

## Decisions (where the design or the model was silent)

- Words: *with* for a Task's or Trip's People; *transfers in* for a
  transfer's to-account; *player of the match*; *member of* for a group.
- Payments: Events on the timeline, not Links (above); the Links stay stored.
- A Delivery shows its order's payment from its Order Field (it used to come
  through Links).
- A guessed link's *Right* sets confidence to 1; there is no "Not this" on the
  sheet (Remove does that).
- Both ways stores a second Link the other way round; symmetric words are
  already stored once.
- Activity's colours: a tracker keeps its stored tint key; only the drawing
  changed to the Noir module colours.

## Shared edits (outside my own folders, for anyone merging after)

- `src/core/domain/types.ts`: `ObjectDef.linkRole`.
- `src/core/registry/types.ts`: `EntityDetailSection.ownLinks`.
- `src/core/repo/sideRepos.ts`: `LinkRepo.setValidity` (the `valid_from` /
  `valid_to` columns already existed).
- `src/core/graph/read.ts` (rewritten Links readers), `words.ts`, `view.ts`,
  `overview.ts` (new), `src/core/links.ts` (add, remove, info, word, dates).
- `src/core/activity/trackers.ts`: `dayMatches` appended.
- `src/modules/finance/types.ts`: Transaction `linkRole: { trail: true }`.
- `src/modules/games/types.ts`: Appearance joins, Player profile and Venue
  faces.
- `src/boards/crm/index.ts` (`ownLinks`) and `profile.tsx` (rows from
  `linkGroups`); `src/boards/turf/index.ts` (`module: 'games'`);
  `src/boards/deliveries/record.tsx` (order payment from its Field).
- `src/ui/screens/RecordScreen.tsx`: the shared Links card and sheet; payments
  in Recent.
- `src/ui/theme/moduleTint.ts`: `linkColorForModule`, games → Turf, activity
  tint.
- `app/(tabs)/browse.tsx`: the Links row; modules with a Browse board left out.
- `app/dev/components.tsx`: the gallery's Links demo uses the new map.
- Removed: `src/ui/components/LinksView.tsx` (the force layout). `d3-force`
  and `@types/d3-force` are now unused in `package.json`; left in, since
  dropping them changes the lockfile.

## Checks

- Typecheck green. 637 of 638 tests pass; the one failure,
  `src/modules/deliveries/deliveries.test.ts` (*a parcel arriving today*),
  fails on the base too (a second demo parcel now counts as today) and is not
  touched here.
- New and changed tests: `src/core/linkGroups.test.ts` (9: words both ways,
  named Fields, remove and add keeping Fields, breadth ranking, hidden Objects
  off the map, faces and joins, payments on the trail, link info, word change,
  dates, both ways, the overview); `src/modules/activity.golden.test.ts` gains
  *what made a day count*. Test expectations changed only where the word rules
  or the payments rule changed by Rutvij's decision.
- `npx expo export --platform web` builds. Checked in the browser on the demo,
  no console errors: Browse › Links (clusters, free, time-lapse), Priya's map
  (one and two hops, draw out, re-centre glide, a line's sheet), Toit's and
  Amex Platinum's cards and Recent, the add sheet, the Activity home, tracker
  and edit.

## Phone checks (none done yet)

1. Links screen on a person: rings and words, +N, module chips, tap to
   re-centre (the glide), hold to open, tap a word for its sheet, Back to.
2. Pinch and two-finger pan on the map; Reset zoom; double-tap (web can't).
3. A record's card: hold a row → Set dates, Right on a guess, change word,
   Remove with Undo.
4. Link on a Task: Project and People offered, Project's picker only
   Projects, the form then shows it; Both ways on a hand word.
5. A card, payee or person: payments in Recent as Events, none in Links.
6. Priya (Turf): "played in" games with her share and what's owed; a game
   lists its players; Playground Arena once, as the Place.
7. Browse: Turf and Home only under Boards; Browse › Links clusters and the
   time-lapse.
8. Activity: On Today toggles and hold-to-reorder; a tracker's day tapped
   shows its matches (needs real SMS, screen time or calendar data); the
   Today tile both ways.

## Not built

- The Activity artboards' motion (none was drawn) and any Activity nudges.
- Dropping `d3-force` from `package.json`.

## Patch notes (v0.0.31)

- Links read the way you would say them (works at, with, played in) and are
  drawn as in the design: the record in the middle, what it links to round
  it in module colours, one or two hops, zoom with two fingers.
- Each thing shows once: a game is one game, not also each player's
  appearance and share; a player profile is the person, a venue the place;
  Turf is one name.
- Payments no longer crowd Links: each is an event on the card, payee and
  people it touches.
- Hold a link to see where it came from, confirm a guess, set its dates,
  change its word or remove it; adding one can start a new record and go
  both ways.
- Browse › Links shows everything you have linked, with a time-lapse.
- Activity is redrawn: tap any day of a tracker to see what made it count.
