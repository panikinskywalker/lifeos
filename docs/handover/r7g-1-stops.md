# R7g slice 1, stops and the line · hand-over

Branch `claude/serene-edison-o0lpvy`, from `m1-design-system` at bb0de54
(v0.0.30). No migration, no version bump, no CHANGELOG edit.

## What was built

- **Stop** (`src/modules/travel/types.ts`, Object id `stop`, hidden from Browse):
  name, local name, trip (*part_of*), kind (stop · idea · airport), order,
  Place (*at*), colour, poster, about, a hidden source key.
- **Trip's new Fields**: Group, Daily allowance, Rate and the day it was taken,
  Look (*japan*), hidden Start from and source key. Budget is unchanged in
  code; it reads as each person's from now on (MODEL.md).
- **Event gains Stop** (`src/modules/projects/types.ts`, word *stop*): the stay's
  stop. Not *at*, because places' filing owns *at* on Events and would skip or
  drop a second *at* link.
- **The line** (`src/modules/travel/stops.ts`): stops in order, `ensureStop` (by
  name, at the end of the line, with its Place and an unused colour),
  `stayOnStop`, nights from the stays (a gap with no bed, a night on a plane),
  runs of nights, moving days, a stop's span, move a stop up or down with Undo,
  an idea onto the line with Undo, the stop's mark (the local name's first
  character in the *japan* look), and the trip as a calendar file (.ics).
- **The fold** (once, `travel.foldedR7g1`): a trip with no stops gets its
  destination as the first; every stay with no stop gets the stop for its city.
- **Booking mail**: a stay filed from mail lands on the stop for its city.
- **Import** (`src/modules/travel/importApp.ts`): a trip app's snapshot
  (`format: lifeos.tripapp.v1`) brings in the trip, its people (you left out),
  stops with their pins, stays and flights as Events, and day plans as Facts on
  the trip dated that day. A second import updates in place.
- **Board** (`src/boards/travel`, a first pass from the `JP-*` artboards):
  - Plan (`/module/travel/plan?trip=…`): Map · Line · Days. The line with
    nights, stays, gaps, move up and down, ideas with Add to the line, Add a
    stop with common places for the *japan* look. The days as a calendar with
    each night's stop, moving days, day by day with the day's plan, Add to my
    calendar. The map drawn from the stops' pins.
  - A stop's page: the station board (the local name in the *japan* look),
    previous and next, about, nights and stays, the stops either side, the trip,
    the line and its Place.
  - The trip page gains **The line** card; Import a trip is a quick action
    (`/module/travel/import`).
- Tests: `src/modules/travel/stops.test.ts`, 7 tests (stops, swapping, nights,
  the calendar file, the fold, a mail stay, the import from a made-up snapshot).
  646 tests run, 645 pass; the one failure is deliveries' date-dependent test,
  failing before this branch too. Typecheck clean; the web export builds.
- Checked in the web build with the real Japan snapshot: 10 stops, 20 nights,
  9 moving days, the overnight flight on 17 Dec, 6 ideas and airports, 10 day
  plans; Line, Days, Map, the Magome stop and the trip page looked at.

## The Japan file

`japan-dec-2026.trip.json` (sent in the conversation, not in the repo: it holds
booking references) is the Japan app's database read on 15 Nov: 16 places, 15
bookings with their payment fields, 15 journeys, 10 day plans, 61 things to
do, 14 events, 14 expenses, 46 checklist items, 22 alerts. Slice 1 imports the
trip, places, stays, flights and day plans; later slices import the rest from
the same file. On the phone: Travel › + › Import a trip, pick the file, pick
"Rutvij".

## Phone checks

- Import the file; open Japan; The line shows 10 stops; Plan › Days shows the
  calendar; Add to my calendar opens the share sheet with an .ics file.
- An old trip shows its destination as the first stop after first open.
- A hotel booking mail lands on its city's stop.

## What you must decide

1. **one BnB** is *Cancelled* in the Japan app but still confirmed in the
   mail tracker (15 Nov), overlapping a Kyoto hostel until its 27 Dec
   free-cancellation deadline. The import follows the app and leaves it out.
2. **the airport hotel** checks out at 11:00 on 7 Jan, after the flight home leaves KIX at
   10:00: shown in slice 2's Needs attention, not yet.

## Patch notes for the merge

**Travel: the line of a trip** (the trip template, slice 1).
- A trip is now a line of **stops**, each with its nights from the stays booked
  there; ideas wait off the line until you add them.
- **Plan**: the line, the days as a calendar with each night's stop and the
  moving days, and a map of the stops. Add the trip to your calendar.
- A stop's page: its station board, previous and next, its nights and stays.
- Hotel booking mails land on the right stop.
- **Import a trip** from its own trip app: the Japan trip comes in with its
  stops, stays, flights and day plans.
