# R7g, the trip template drawn to its design · hand-over

Branch `claude/serene-edison-o0lpvy`. No migration, no native change (an over-the-air update).

## What changed

Every trip screen now follows its artboard on the Claude Design canvas page
*Trip template · Noir (Japan)* (`JP-*` boards), on live data:

| Screen | Artboard | File |
|---|---|---|
| Travel, all trips | JP-Travel | `src/boards/travel/home.tsx` |
| Trip page before the trip | JP-Overview | `jp/overview.tsx` (picked by `trip.tsx`) |
| Trip page while away | JP-Today, JP-TodayPM | `jp/today.tsx` |
| Trip page after | JP-Recap | `jp/recap.tsx` |
| Plan: Line, Days, Map | JP-Route, JP-Calendar, JP-Map | `plan.tsx`, `jp/planparts.tsx` |
| A stop, its edit sheet | JP-Place, JP-Edit | `stop.tsx`, `things.tsx` |
| The stay | JP-Stay | `jp/stay.tsx` |
| A day | JP-Day, JP-DayTravel | `day.tsx`, `jp/bookparts.tsx` |
| Bookings, a booking | JP-Bookings, JP-Booking | `bookings.tsx`, `booking.tsx` |
| Money: Budget, Settle up | JP-Money, JP-Settle | `money.tsx` |
| Log a spend, Split a receipt, Pay back | JP-AddExpense, JP-Receipt, JP-Payback | `jp/spend.tsx`, `jp/receipt.tsx`, `jp/payback.tsx` |
| A spend, how it split | JP-Bill | `bill.tsx` |
| Prep: Checklist, Packing, Docs | JP-Todo, JP-Pack, JP-Docs | `prep.tsx` (`pack.tsx` now opens Prep › Packing) |
| Search | JP-Search | `jp/search.tsx` |
| Copilot, voice | JP-Copilot, JP-Listen | `jp/copilot.tsx`, `jp/listen.tsx` |
| View-only | JP-ViewOnly | `jp/viewonly.tsx` |

- **The frame** (`jp/shell.tsx`): the trip header (back, the trip's name in its script, search, the ₹ /
  local switch shared by every trip screen), the stage stepper, the trip bar, `TripScreen`, `tripRoutes`,
  the dot-matrix board, faces. **The kit** (`jp/kit.tsx`): the artboards' motion (rise in, the stamp
  pressing in, bars growing, pulse, blink), CSS gradients, the seigaiha wave, the Japanese faces (the
  phone's CJK sans and serif; nothing is downloaded).
- **Record pages that fill the screen**: a board's `page` section may set `fullScreen` (the record screen
  then leaves out its own scroll view); the trip and the stop use it.
- **Module code** (`src/modules/travel`): `overview.ts` (stage, the way there, needs attention, coming up
  and its rail, the seats-open board, the line, stamps), `today.ts` (morning or afternoon, the day track,
  leave by, last connection, the rest of today, cash, wallet, stamps, recap figures), `planview.ts` (legs,
  calendar weeks, map projection, crowd hours), `booked.ts` additions (flight legs and landings, the long
  leg, connection margin, overlapping stays), `money.ts` additions (cost by day, insights, category
  lines, things that cost, refunds), `prep.ts` additions (due today, departure day, the docs shelf, the
  offline copy), `search.ts`, `copilot.ts` (the trip as context, the answer's proposed changes, applied
  only on Save, with Undo), `travelhome.ts`, `weather.ts` (month normals by place). Each has tests with
  made-up data.
- **Trip** gains hidden `wallet` (cash and IC card) and `keep` (Keep for the next trip).
- **Importer**: times written "≈10:45" or "about 9:05" now import as that time (they became noon), and
  seats that open "about" or "from" a day are read.

## Not done, or different

- Live weather, Booking.com and Gmail finds: not connected; weather shows each stop's month normals,
  and the copilot shows Booking.com and Gmail as labelled slots.
- The data has no kana readings, Japanese stay names or addresses, so boards and the driver card show
  the English name with the stop's kanji.
- "Who ticked" shows You (a Task keeps when, not who); trip members are slice 8.
- Split a receipt after a photo is read was not seen running (it needs a photo and the brain's key).

## Checks

- `npm run typecheck` clean. `npm test`: 702 tests, 701 pass; the one failure is deliveries'
  date-dependent test, failing before this branch.
- `npx expo export --platform web` builds; every screen was opened in the web build with the Japan trip
  imported, with no page errors, and compared side by side with its artboard.

## On the phone

Import the Japan trip once (Travel › + › Import a trip): the screens fill from it.
