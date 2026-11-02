# R8 Today and Time · hand-over

Branch `claude/r8-today-time`, from `m1-design-system` at 0c3a9b3 (v0.0.17).
No migration, no version bump, no CHANGELOG edit.

## What was built

- **MODEL.md first**: layer 5 *What Today is made of* (a table of every tile,
  its board and what it reads; sizes, empty tiles, looks, ids, default
  order) and a new *Time (board)* section; R8 ticked in layer 6.
- **Today is a layout.** `app/(tabs)/index.tsx` now draws the Morning brief
  and `os.registry.tiles` in your order, nothing else (no board, module or
  core query import; a test checks it). Pairing is unchanged: two smalls
  share a row, a small alone on its row is drawn medium (v0.0.17).
- **Every tile moved to the board that owns its data**, as a `TileDef`
  (`tiles` on the BoardManifest, the contract core already had):
  - `src/boards/today` (new, placement `bar`): My day, Progress, Activity,
    Done today, Areas, Upcoming, Screen time, Overdue. One upkeep pass per
    data change is shared by Upcoming, Overdue and My day, as before.
  - Health (`tile.tsx`, new): Steps, Sleep. Finance (`tile.tsx`, new): Spend
    this month. Habits (`tile.tsx`, new): Habits. People, Home, Turf: a
    `TileDef` appended to their existing tile files.
  - Time (new): On this day.
- **The Time board** (`src/boards/time`, placement `browse`): the old
  `app/almanac/time.tsx` moved to `src/boards/time/screen.tsx` (git mv, so
  history follows), plus **On this day** on a day view (each date opens as
  a day, each item its record or dump). Routes: `/time` (`app/time.tsx`),
  `/board/time` (Browse › Boards), and `/almanac/time` redirects to `/time`
  with the same `span` and `day`. The On this day tile opens `/time`.
- **You › Home screen** reads names, descriptions and looks from the
  registered tiles.
- **Shared core / app-shell edits** (small, for the merge):
  - `src/screens/homeLayout.ts`: rewritten. `TILES`, `TileId`, `TILE_STYLES`
    and `tileStyle` are gone; `TILE_ORDER` (ids), `todayTiles`, `tileLooks`,
    `tileConfig` are new; `homeLayout`, `saveHomeLayout`, `homeAreas`,
    `setHomeAreas`, `setTileStyle` keep their names and settings keys.
  - `src/screens/NeedsSource.tsx` (new): the "Turn on …" line, shared by
    Health, Finance and Today's tiles.
  - `src/boards/index.ts`: `todayBoard`, `timeBoard` registered.
  - `src/boards/{crm,inventory,turf,health,finance,habits}/index.ts`: one
    import and one `tiles:` line each.
  - `src/ui/theme/moduleTint.ts`: `time: 'tasks'`.
  - No change to `src/core`.
- **Tests**: `src/screens/homeLayout.test.ts` (5): default order with
  boards registering out of order, a saved layout kept with new tiles
  slotted in and unknown ones dropped, looks from the style Field, every
  default tile declared by exactly one board, Today importing no board,
  module or core query. 491 green.
- **Design brief**: `docs/design/TIME-BRIEF.md`, artboards `NR-Time-*`
  (Month, Day, Year, the On this day tile, the tile system).

## Decisions (where the model was silent; the simplest)

1. **Tile ids stay** (`steps`, `myday`, `onthisday` …), not the
   `board.name` form the `TileDef` comment suggests, so saved order,
   switches and looks carry over with no fold.
2. **Tiles over core live on a Today board** (`src/boards/today`) rather
   than an Upkeep board (Upcoming, Overdue) or an Activity board (R11 can
   move Activity when it builds that board; one line).
3. **Looks are `configFields`**: a select Field keyed `style`; Today passes
   `{ style }` as the tile's `config`. Stored under `today.styles` as before.
4. **Default order** is a list of ids in `homeLayout.ts`; a tile a board
   adds later that isn't in it goes to the end, shown.
5. **Sizes**: `small` (1×1) and `medium` (2×1) of the existing `TileSize`;
   `large` is unused.
6. **Time is reached at `/time` and `/board/time`** (Browse opens every
   board at `/board/<id>`); both draw the same screen. No `route` field was
   added to BoardManifest to keep core untouched.
7. **On this day on Time** is on the Day view only, from that day (so any
   day looks back, not just today).
8. **Looks on You › Home screen** follow Today's default order (Progress,
   Activity, Habits) instead of the old hand-written order.
9. Copy moved verbatim: a few existing tile strings and the "—" no-data
   value still carry em dashes, kept so the tiles look exactly as before.

## Checked

- `npm run typecheck` clean, `npm test` 491 green, `npx expo export
  --platform web` builds.
- Web export with demo data (You › Load demo data), dark, 390 wide: Today
  compared pixel by pixel with a v0.0.17 export of the same data; the only
  differences are the clock (now line, "Updated") and one face colour from
  a random demo id. You › Home screen identical apart from the Looks order.
  Time at `/time` (month), `?span=day`, `/almanac/time?span=year` (lands on
  `/time?span=year`), `/board/time`, and a day with a look-back
  (`?span=day&day=2026-10-23`: "1 month ago · Goa"). Browse shows Time
  under Boards. No console errors.

## Phone checks

1. Today looks as v0.0.17: every tile, pairs, People / Home / Overdue /
   Steps alone drawn wide, cold start (first three rows, then the rest).
2. You › Home screen: turn a tile off and move one; Today follows. Change
   each Look; Today follows.
3. On this day tile (when there is a look-back): tap an item, then the tile;
   Time opens on that day.
4. Browse › Boards › Time: month, tap a day, Year, tap a month, back.
5. An old link to `/almanac/time` (none left in the app) still lands on Time.

## Patch notes (for the version this is merged as)

- Today's tiles now come from the boards that own them; nothing changes on
  screen.
- **Time** is a board in Browse, at `/time`; a day shows what happened on
  that date a month, six months and years before.
