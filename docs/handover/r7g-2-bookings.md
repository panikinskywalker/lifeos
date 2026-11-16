# R7g slice 2, journeys, stays and Bookings · hand-over

Branch `claude/serene-edison-o0lpvy`, on slice 1 (f6ea2ab). No migration, no
version bump, no CHANGELOG edit.

## What was built

- **Event's travel Fields** (`src/modules/projects/types.ts`, sections Booking
  and Journey): booking status (confirmed · pending · planned · cancelled),
  currency, still to pay, who paid (`paidBy`: `me` or a Person, hidden), how the
  rest is paid, card charged on, free to cancel until and its time, check-in,
  check-out, getting there, reference, booking and map links; for journeys from
  and to stops (words *from_stop* / *to_stop*), how, plan, cost each, estimate,
  takes, book ahead and seats open, links to book (`book`), last connection,
  steps. New kinds: `journey`, `ticket` (one person's flight booking), `activity`.
- **Document** gains Booking (link → Event, word *for*).
- **Module** (`src/modules/travel/booked.ts`): stays, tickets, flights, journeys
  and others of a trip; a booking's money in its currency (total, paid, still to
  pay; unknown is all to pay); its pay word (To pay · Part paid · Paid · Planned ·
  Cancelled); what is left at the stays by currency; stays missing a check-in
  time; a journey's steps; a day's view (where you wake and sleep, check-outs,
  check-ins, journeys, flights, what to pay on arrival); deadlines (seats open,
  free cancellation ends, cards charged). A cancelled stay holds no night; a
  planned one is marked.
- **Import, part 2**: every booking with its money and status (cancelled ones too,
  marked cancelled), each person's ticket, activities, and the journeys between
  stops with their seats-open day read from the note ("seats open 26 Nov").
- **Booking mail**: a stay mail's check-in and check-out times, total and free
  cancellation land on the stay; a mail that says it is paid sets nothing left.
- **Nudges** (*coming up*): seats open (from 2 days before; Yes opens the link to
  book), free cancellation ends (3 days), a card charged (2 days), stays in the
  next 3 weeks with no check-in time.
- **Board**:
  - Bookings (`/module/travel/bookings?trip=…`): the flights, going and coming
    home, with each person's ticket and who paid; the airports; what is left to
    pay at the stays (≈ ₹ at the trip's rate) and what is paid; every stay with
    its stop's mark, dates, check-in (or *check-in time missing*), amount and pay
    chip; tours, passes and other with Add; cancelled ones folded away.
  - A booking (`/module/travel/booking?event=…`, after `JP-Booking`): status you
    can change (with Undo), total, paid and still to pay with each person's part,
    covers, who paid, how the rest is paid, card date, free cancellation with
    days left, check-in and out, getting there, the reference on a tap, booking
    page, map, papers, Mark cancelled; a journey shows leave by, arrive, cost
    each, book ahead with its links, last connection and its steps.
  - A day (`/module/travel/day?trip=…&day=…`): Overview · Itinerary · Stay & pay ·
    Travel, previous and next day. Plan › Days opens it from each day and each
    moving day; stops and the trip page open bookings.
  - The trip page's line card gains a Bookings row (stays, tickets, what is left).
- **Tests**: `src/modules/travel/booked.test.ts`, 5 tests (bookings from the
  import, a moving day, deadlines and their nudges, a stay mail, the seats-open
  day). Two older assertions were updated for deliberate changes, each keeping
  what it checked before: a stay mail's read now carries times and money
  (`travel.test.ts`), and the import now brings the cancelled stay, the ticket
  and the journey (`stops.test.ts`). 643 tests run, 642 pass; the one failure is
  deliveries' date-dependent test, failing before this branch. Typecheck clean;
  the web export builds.
- Checked in the web build with the real Japan file: Bookings (4 flights, 3
  tickets, 2 airports, 10 stays, ¥2,83,018 to pay, ¥4,214 paid, 4 without a
  check-in time), a Kyoto hostel, and 26 Dec (Overview and Travel).

## Notes

- The tracker you pasted holds nothing the Japan app's data lacks for the
  bookings (references, links, payment notes and the same cancellation
  deadlines); the only disagreement is still one BnB (cancelled in the app,
  confirmed in the mail tracker).
- A day's number counts from the trip's first day (17 Dec, the flight out), so
  26 Dec is day 10; the design counted from landing (day 9).
- The copilot looking for missing check-in times in your mail is slice 7.

## Phone checks

- Import the Japan file again over slice 1's import: the same trip updates.
- Bookings shows 10 stays; the hostel shows part paid; Plan › Days › 26 Dec opens
  the moving day with its last bus and steps; Reserve the Shinano opens the
  rail site.
- A hotel mail with times and a total fills the stay.

## Patch notes for the merge

**Travel: bookings and journeys** (the trip template, slice 2).
- **Bookings**: your flights with each person's ticket, every stay with what is
  paid and still to pay, the ones missing a check-in time, tours and passes.
- **A booking's page**: status, money, who it covers and who paid, how to pay,
  free cancellation, check-in and out, the reference on a tap, its papers.
- **Each day of the trip**: where you wake and sleep, the journey with when to
  leave and the last connection, what to pay on arrival, step by step.
- **Journeys** between stops, with links to book and when seats open.
- Reminders before seats open, free cancellation ends or a card is charged,
  and for stays with no check-in time.
- Hotel mails now fill check-in times, the total and free cancellation.
