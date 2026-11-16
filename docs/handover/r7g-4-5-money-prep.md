# R7g slices 4 and 5, money and prep · hand-over

Branch `claude/serene-edison-o0lpvy`, on slice 3. No migration, no version
bump, no CHANGELOG edit.

## What was built

### Slice 4: Bill and money on a trip

- **Split arithmetic in core** (`src/core/money/split.ts`): parties ('me' or a
  Person's id), the five ways to split (equal · exact · percent · shares ·
  adjust), what does not add up, and everyone's balances over a set of entries
  in ₹: paid, share, payments sent and received, who owes whom pair by pair or
  simplified to the fewest payments. In core because finance's Bill and
  travel's ledger both need it and a module never imports another.
- **Bill** (`src/modules/finance/bills.ts`, Object id `bill`, hidden): kind
  (spend · payment), Group (*group*), Trip (*trip*), amount, currency, the ₹
  value fixed when saved and the rate used, date, category, the split, Booking
  (*paid_for*), Your payment (*same_as*), receipt, notes. `makeBill`,
  `makePayment`, `billBalances`, `billBalanceWith`; the receipt question,
  `parseReceipt` and `receiptShares` for Split a receipt.
- **Finance's balances add Bills**: a person's balance and the Group's
  balances add Bill debts to the Debts; Settle up records a payment Bill for
  what Bills owe (and still settles the Debts as before). Group gains
  **Simplify debts**.
- **The trip's ledger** (`src/modules/travel/money.ts`): bookings (planned are
  estimates, to pay is booked, paid is paid unless a Bill already covers it),
  Bills (paid, by each share), journeys' fares, things to do that are wanted
  or planned, and the daily allowance for the days left, each split over who
  it covers. Projected per person, by category, the trip's balances (with the
  Group's Simplify debts), bookings not in Settle up yet, the journeys table.
- **Board** (`src/boards/travel/money.tsx`, `bill.tsx`):
  - **Money › Budget**: whose money (Everyone or one person), projected against
    the cap with paid · booked · estimates, cap, a day, left, the rate (edit it),
    where the money goes (open a category for its lines), the journeys.
  - **Money › Settle up**: you owe / you're owed, with Pay or Record against
    each person; Split a receipt; Record a payback; who owes whom (Simplify
    toggles the Group's field); everyone's balance; not in Settle up yet with
    Add; the expenses and paybacks.
  - **Log a spend**: amount in the local currency or ₹ (the ₹ shown live), what,
    category, paid by, the five ways to split with each share shown live; an
    error when it does not add up.
  - **Split a receipt**: a photo (camera or library) read by Claude through the
    brain's photo path, only when pressed; tap who had each line (a line no one
    tapped is shared by all); saved as one exact Bill with the lines in Notes.
  - **A Bill's page**: the amount and ₹ value at its rate, how it split (each
    person's paid, share and what it did to their balance), the receipt lines,
    the booking, bank record and trip it is linked to, Edit, Delete with Undo.
  - **Trip page**: the spend card is now your projected share from the ledger
    (categories from it), and a Money tile shows your balance and what is left
    of the budget.
- **Import, part 4**: the Japan app's expenses and settlements as Bills, in a
  crm Group "Japan trip" of kind trip made from the travellers (set on the trip).

### Slice 5: Prep

- **Task** gains Trip (*trip*), On the checklist under (`section`: documents ·
  money · to-do · packing · notes) and a hidden source key. A fold
  (`travel.foldedR7g5`) sets Trip on tasks already linked to a trip; Plan a
  trip's tasks are made with it.
- **Module** (`src/modules/travel/prep.ts`): the checklist, the notes by
  priority, the six filters, sections, Ready to fly, the trip's Documents, the
  emergency numbers by country.
- **Board** (`src/boards/travel/prep.tsx`):
  - **Prep › Checklist**: Ready to fly with each section; to be aware of (the
    notes, critical first; Handled ticks one); the filters (All, Overdue, Next
    7 days, Before we fly, On the trip, No date); the sections with ticks
    (projects' `toggleTask`, Undo); Show done; the departure-day check; Add an item.
  - **Prep › Packing**: the trip's packing items, and Packing (clothes, Home's
    Bathroom) a tap away.
  - **Prep › Docs**: the emergency card with tap to call, the trip's papers, the
    documents tasks still to sort.
  - **Trip page**: a Prep tile beside Money (Ready to fly, overdue or heads-ups).
- **Import, part 5**: the checklist as Tasks (who it is for as people, done
  kept) and the alerts as notes (critical → urgent, warning → high, info →
  low; resolved ones done).

## Not done, on purpose

- **The fold of finance's old splits into Bills.** Finance's split still makes
  Debts and the People and Group screens read them; Bills are added on top, so
  nothing counts twice. Folding them and switching the split sheet to make
  Bills is a follow-up (noted in MODEL.md under *Bill*).
- Cost by day and the money insights (slice 6), Remind on WhatsApp.

## Checks

- `npm run typecheck` clean. `npm test`: 652 tests, 651 pass; the one failure
  is deliveries' date-dependent test, failing before this branch. New:
  `src/modules/travel/money.test.ts` (split math, Bill and balances, the
  ledger, prep). The web export builds.
- Checked in the web build with the real Japan file: the import (14 expenses,
  46 checklist items, 22 notes), Budget (you ₹2,44,156 projected of
  ₹2,50,000), Settle up (you owe Rushikesh, Parth owes you), a Bill's page, Log
  a spend, Prep (18% ready, 2 overdue, 19 open notes), Docs with Japan's
  numbers, the trip page's Money and Prep tiles.

## Phone checks

- Import the Japan file again (Travel › Import a trip): expenses, the
  checklist and the notes come in; nothing doubles.
- Money › Settle up against the Japan app's own Settle up.
- Log a spend in yen split three ways, then open it.
- Split a receipt (needs the brain on with a key).
- Prep: tick an item, Undo; Handled on a note.

## Patch notes for the merge

**Travel: money and prep** (the trip template, slices 4 and 5).
- **Money**: what the trip will cost you against your budget, paid, booked
  and estimated, where it goes, and the yen rate.
- **Settle up, Splitwise's way**: log a spend and split it equally, by exact
  amounts, percentages, shares or adjustments; split a receipt photo by tapping
  who had what; see who owes whom, simplify debts, record paybacks.
- **Prep**: the trip's checklist with Ready to fly, notes to be aware of,
  packing, papers and the emergency numbers.
