# R7g slice 3, things to do · hand-over

Branch `claude/serene-edison-o0lpvy`, on slice 2 (b8fe5b3). No migration, no
version bump, no CHANGELOG edit.

## What was built

- **Thing to do** (`src/modules/travel/types.ts`, Object id `outing`, hidden from
  Browse): trip (*part_of*), stop (*stop*), Place (*at*), kind (see · eat · do ·
  relax · shop · event), day, until, cost each (0 is free), how busy (1 to 5),
  quietest time, what kind of event (festival · seasonal · closure · crowds ·
  holiday · weather), how sure (official · past pattern · predicted), link, links
  to book, photo, notes, a hidden *suggested* flag. Statuses idea · want to ·
  planned · done.
- **Module** (`src/modules/travel/outings.ts`): a trip's and a stop's things
  (planned first), the five filters, events on the trip's dates, what is on a
  day (the stop's own events, then trip-wide ones, and things planned for it),
  status with Undo, adding one.
- **What's on while you're there**: the brain asks Claude, per stop on the line
  and its dates, for trips in the next 90 days (`travelBrain.asks`, one learned
  key per stop and dates, so each is asked once). The answer is read back as
  suggestions on the stop's page, offered with Add, never added on its own.
- **Import, part 3**: the Japan app's 61 things to do (with a Place for each one
  that has a pin, links to book, Claude's flag) and 14 events.
- **Board** (`src/boards/travel/things.tsx`): on a stop's page, Things to do with
  All · Planned · Want to · Ideas · Free, the crowd meter, the quietest time, a
  sheet per thing (set status, links to book, Google Maps, open) and Add; On your
  dates, the events there, and Claude's suggestions. On the trip page, **On your
  route**. On a day's page, **Happening today**.
- Tests: `src/modules/travel/outings.test.ts`, 4 tests. 647 tests run, 646 pass;
  the one failure is deliveries' date-dependent test, failing before this
  branch. Typecheck clean; the web export builds.
- Checked in the web build with the real Japan file: Magome (5 things, the event
  on its dates), Kyoto (4 things, 8 events over New Year), 31 Dec (four events
  happening, what to pay, tonight), the trip page's On your route (17).

## Mail

The Gmail connected to this Claude session is the work account
(your work account); the trip's mails are in your personal accounts, so
nothing could be read here. On the phone, LifeOS reads the mailboxes you added
under You › Data sources and files booking mails on its own (slice 2 added
check-in times, totals and free cancellation). The trip copilot searching your
mail for what's missing is slice 7.

## Phone checks

- Import the Japan file again: things and events come in; nothing doubles.
- Magome's page: the filters, a thing's sheet (Planned, Google Maps).
- After the brain's next pass with a key, a stop's page shows Claude's
  suggestions under On your dates.

## Patch notes for the merge

**Travel: things to do** (the trip template, slice 3).
- **Things to do** at every stop: what to see, eat and do, how busy it gets and
  the quietest time, with links to book and Google Maps. Mark them planned,
  want to, idea or done.
- **On your route**: festivals and what to be aware of on your dates, closures,
  holidays, crowds and weather, and Claude's suggestions for each stop.
- Each day of the trip shows what's happening that day.
