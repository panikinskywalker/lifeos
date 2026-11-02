# R7d travel · hand-over

Branch `claude/r7d-travel`, from `m1-design-system` at 0c3a9b3 (v0.0.17).
No migration, no version bump, no CHANGELOG edit. Built together with layer 8's
travel slice (*Travel through the same brain*).

## What was built

- **Fields first** (`docs/MODEL.md` layer 2 *Agenda*, *Trip's Fields*; layer 6
  R7d marked built; layer 8 slice 5 noted). Picked as the simplest where MODEL.md
  said nothing:
  - Keys unchanged; one new Field, **To** (`placeId`, link → Place, word `to`).
    The typed destination stays the title; the Place is matched by name (a city,
    area or country first), else made as a city.
  - **packed** (hidden, text list): the non-clothes things ticked on the list.
    Clothes are not stored on the trip: they are Links.
  - Spent, days, flights and stays are derived, not Fields.
  - A trip made from a booking mail is *booked*.
- **The module** (`src/modules/travel`):
  - `trips.ts`: `tripDays`, `daysToStart`, `tripPhase` (undated · upcoming ·
    away · back), `nextTrip`, `linkedTo` (records linked by *trip* or *part_of*,
    once each), `tripSpend` (money out only; left, per day, per day left, by
    category), `spentWhileAway` (payments on the trip's days on no trip),
    `addToTrip` (through the Transaction's Trip Field, so a later edit keeps the
    Link; Undo), `tripBookings` (flights and stays with PNR), `linkTripPlace`,
    `tripsTo` (a Place's Trips here).
  - `packing.ts`: the kind of place (beach · cold · city) and abroad from the
    destination by name lists, or a local currency that is not INR; clothes kind
    from the Asset's name (top, bottom, sleep, swim, warm, other); counts from
    the days (three when undated); `packingList` (suggested clean clothes, what
    is short, things from Home's Bathroom Stock or three defaults, the trip's
    extras, Claude's learned list by `packingKey`); `pack` (the bag becomes
    exactly these: picked clothes *packed* and linked `packed_for`, one taken
    out goes back clean; Undo); `backHome` (still packed → in the wash; the
    Links stay as what you took); `stillPacked`. Clothing Assets, Spaces and
    Stock are found by their data; the module imports neither assets nor
    inventory.
  - `brain.ts` (`travelBrain`, through `src/core/brain/contract.ts`), all
    *coming up*: **check in** (a flight within 48 h, urgent within 24 h; Yes
    opens the airline's site, else the flight), **pack** (a trip within 3 days,
    nothing packed; ask: a packing list for this kind of trip), **before you
    go** (1 to 2 days out, shape *check*; ask: Claude joins it with the pass's
    other nudges), **back home** (clothes still packed up to a week after). What
    leaves: destination, days, purpose, kind of place, airline, hours to go;
    never a PNR or a mail. One Skill, *Travel*.
  - Mail (`filing/tickets.ts`, `filing/bookings.ts`): the route also from the
    codes in brackets ("Bengaluru (BLR) 06:15 → Goa (GOX)"); a booking or issue
    date is never the flight's, and without a "Departure" the first date after
    the day the mail was sent wins; stays read a date on the line after
    Check-in (Airbnb), names from the body before the subject, `Hotel:` needs
    its colon, an Airbnb listing's name from "Reservation confirmed - …"; a
    stay's place falls back to "… in Old Manali". A trip made from mail is
    *booked*; a flight into a trip that lands somewhere other than its
    destination (the return) moves its end.
  - `index.ts`: the brain, the fold once (`travel.foldedR7d`: every trip gets
    its Place), a listener that links a trip saved without a Place, and the
    `trip_spend` tool beside `plan_trip`.
  - `travel.test.ts`: 16 tests (the six mails, filing into trips, the Place,
    spend through both words, spent on those days with Undo, packing for a
    beach trip and a cold work trip abroad, pack / re-pack / Undo / back home,
    and the four candidates).
- **Core, small** (one line): `packed_for` in `src/core/graph/edges.ts`
  (*Packed for* / *Packed*).
- **The board** (`src/boards/travel`, a first pass from the kit): the Travel
  home (`/module/travel/index`: next trip or away now with spend, bookings and
  Pack; coming up; been, with what each cost), the Trip page (dates, days, the
  countdown and the Place as chips; spend vs budget; Pack, or Back home after;
  flights and stays; expenses; spent on those days with Add), the packing
  picker (`/module/travel/pack?trip=…`), and **Trips here** on a Place's page
  (an override from this board, so the places board is untouched). The old
  `sections.tsx` (expenses by `data.tripId`) is gone; the Overview reads spend
  through Links.
- **Design brief**: `docs/design/TRAVEL-BRIEF.md`, artboards `NR-Travel-*`.
- Checks: `npm run typecheck` clean, `npm test` 502 green (486 before),
  `npx expo export --platform web` builds; the Travel home, the Japan trip page
  and its packing picker were looked at in the web build with the demo data.

## What you must decide

1. **A new Place for a destination nobody has**: made as a *city* (so Trips here
   works at once). Goa is a state, Old Manali an area. Keep making them, or link
   only to Places you already have?
2. **Packing counts** (tops one a day plus one, bottoms one per three days,
   sleepwear, swimwear at the beach, two warm layers somewhere cold): your
   numbers?
3. **Back home** puts what you took *in the wash*, while a tap on Home brings a
   packed thing back *clean* (R7a's question 2). Same answer for both?
4. **Check in** opens the airline's home page (goindigo.in, airindia.com…), not
   its web check-in page, since those deep links were not checked. Want the
   deep links once you have checked them on the phone?
5. **Spent on those days** is offered, never linked on its own. Link payments
   made in the trip's city on their own instead (needs the payee's Place)?

## Phone checks

- Gmail on: a real IndiGo or Air India ticket makes a flight in a *booked* trip,
  a hotel or Airbnb mail a stay in the same trip, the return flight sets its end;
  the fare shows as spent.
- An old trip (from before) shows its Place after first open; the Place shows
  Trips here.
- Pack from a trip: the clothes turn *packed* on Home › Clothes; Undo restores;
  after the trip, Back home puts them in the wash.
- The brain's morning pass two days before a trip: a pack card (opens the
  picker) and a before-you-go card; a flight the next day: a check-in card that
  notifies and opens the airline.

## Real samples needed

The six mails in `travel.test.ts` are plausible samples written for the tests,
laid out the way those senders' plain text usually is; none is real. One real
mail each, exported with the parser dataset (You › Data sources › Export for
the parser), to check them:
- IndiGo itinerary (and its web check-in mail),
- Air India e-ticket,
- MakeMyTrip flight booking and MakeMyTrip hotel booking,
- Booking.com confirmation,
- Airbnb reservation confirmed.

## Patch notes for the merge

**Travel** (R7d), built in its own session and merged here. The screens are a
first pass from the kit until the *NR-Travel* artboards are drawn.
- **Trips make themselves from mail**: IndiGo, Air India and MakeMyTrip tickets
  and MakeMyTrip, Booking.com and Airbnb stays land in one *booked* trip, the
  return flight sets when it ends, and the fare is its first expense.
- **Spend vs budget** on every trip: spent, what's left, per day left, by
  category. Payments from the trip's days that are on no trip are offered with
  an Add button.
- **Packing**: a list from the days and the kind of place, picked from your
  clean clothes and Home's Bathroom; Pack marks the clothes packed, Back home
  puts them in the wash.
- **The brain comes to you** before a trip: check in for tomorrow's flight,
  pack for Friday, what to do before you go, and unpacking when you're back.
- A trip's destination is now a Place, and a Place's page shows **Trips here**.
- New AI tool: what a trip cost against its budget.
