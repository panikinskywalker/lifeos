# Travel · design prompt for Claude Design

Paste the prompt below into Claude Design on the LifeOS canvas
(https://claude.ai/artifact/RVT9hLfcQ7tvgXvZN1x6cF), page *v3 Noir*. Source of
truth: `docs/MODEL.md` layer 2 (*Trip's Fields*), layer 6 (R7d) and layer 8
(*Travel through the same brain*). Travel was built on 2 Nov as a first pass
from the kit; this design replaces it. Name the artboards `NR-Travel-*` so the
build can read them. The packing picker was first asked for in
`ASSETS-BRIEF.md` (screen 5, `NR-Assets-Packing`); if that artboard exists,
start from it and keep its pills.

---

Design **Travel** for LifeOS, my personal life-OS app for Android (390 × 844, edge to edge, dark). Use the **v3 Noir** page of this canvas for every colour, type style, radius and component: `NR-KitComponents`, `NR-FieldKit`, `NR-KitCharts`, `NR-KitRecords`, `NR-KitTrips` (*Header · a place*, *Map with the route*), and the pills and chips from `NR-People-Parts` and `NR-Home-Parts`. Don't invent a theme. If a part needs something the kit lacks, draw it as a new kit piece and name it.

**What Travel is.** My trips: where, when, with whom, and what each cost against what I meant to spend. I book flights on IndiGo and Air India (sometimes through MakeMyTrip) and stays on MakeMyTrip, Booking.com and Airbnb, so most trips make themselves: a booking mail becomes a flight or a stay, and the flight or stay lands in its trip ("Trip to Goa", 18–22 Dec, booked). The fare in the same mail is the trip's first expense. The rest of the spend I add, or LifeOS offers the payments from those days for me to add with one tap. Before I go, LifeOS helps me pack from my own clothes and reminds me to check in; when I'm back, it puts what I took in the wash.

**Where it sits.** The bottom bar is Today · Upkeep · Dump (centre) · Browse · You. Travel opens from Browse › Travel and from a Place's page (*Trips here*). Keep the app's bottom bar. Travel has no tab bar of its own.

**The data (design to these, nothing more).**
- **Trip**: destination ("Goa"), its **Place** (a city on the map), starts and ends (days away, both counted), purpose (leisure · work · family · other), travelling with (people), **budget** (₹), local currency, notes, status (idea · planning · booked · ongoing · done).
- **Spend** (derived): spent, left of the budget (or over), per day, per day left while it's ahead or under way, by category. Only payments linked to the trip count; money in doesn't.
- **Flights and stays**: Events linked to the trip. A flight has its route (BLR → GOX), number (6E 6123), airline, departure time and PNR. A stay has its name (The Park Calangute), check-in, check-out, nights, where.
- **Packing**: my **clothes** (Assets, each clean · in the wash · packed) and **things** that aren't clothes (Home's Bathroom stock, then charger, ID, medicines, plus sunscreen at the beach, gloves somewhere cold, passport · forex card · plug adapter abroad, laptop for work, and anything Claude adds for this kind of trip). A suggested set is scaled to the days and the kind of place: tops one a day plus one, bottoms one per three days, sleepwear, swimwear at the beach, two warm layers somewhere cold.
- **Nudges** travel produces (To check and the Morning brief on Today), all *coming up*: **check in** ("Check in: 6E 6123 tomorrow at 06:15", opens the airline), **pack** ("Goa on Fri: pack 5 tops, 2 bottoms, sleepwear, swimwear"), **before you go** ("use the paneer first, skip Sunday's order, water the plants"), **back home?** ("Back from Goa? 9 things are still packed").

**Screens (full scroll for each):**

1. **Travel (home)**
   - Header: "Travel", the next trip in a line ("Goa in 2 days"), the To check bell, + for a new trip.
   - **Next trip** (or **Away now**, "day 2 of 4"): one big card. Destination, dates, the countdown; spend vs budget (three numbers and a bar, coral when over); its flights and stays as rows; **Pack** (or Packing list once packed) with the suggested set in a line.
   - **Coming up**: the trips after it, each with dates and "in 48 days".
   - **Been**: past trips, newest first, each with what it cost and "of ₹30,000" when it had a budget; over budget in coral.
   - A small **year** strip if it earns its place: trips this year, spent this year.

2. **A trip** (the Trip record page): draw **Goa** (ahead, booked) fully, and **Delhi** (a work trip, away now) as the second example.
   - On top: `NR-KitTrips`' *Header · a place* grown into the trip's hero: destination, dates, days, the countdown or "day 2 of 4", who's coming (faces), the Place (opens it).
   - **Spend vs budget**: spent · left (or over) · per day left; the bar; by category as a stacked bar (travel, food, stays, transport).
   - **Flights and stays** as a timeline in time order: the outbound flight, the stay with its nights, the return flight. Each opens its Event. PNR shown small.
   - **Expenses**: the payments on the trip, newest first, + Add.
   - **Spent on those days**: payments made during the trip that aren't on any trip, each with an **Add** button. Make it quick to add five in a row.
   - **Pack** (ahead) / **Back home: 9 to the wash** (after).

3. **Packing** (the picker; from a Trip and from the pack nudge)
   - Header: "Packing · Goa", "4 days · beach".
   - The **suggested set** on top as a line ("LifeOS suggests 5 tops, 2 bottoms, sleepwear, swimwear"), marked as LifeOS's suggestion, with what's short ("swimwear: none clean").
   - **Clothes** as pills: in the bag · suggested, not yet in · not picked · away (in the wash, or packed for another trip: faded, not tappable, with why).
   - **Things** as pills: from the Bathroom (marked), from the list, from Claude (marked ✦, "kept for trips like this one"), and "Add a thing".
   - **Pack** sets every picked piece of clothing packed and keeps the things ticked. Undo in the toast.

4. **Back home** (a sheet or a card): "Back from Goa? 9 things are still packed" · **To the wash** · Later. Show the pills going from packed to in the wash.

5. **To check cards and the Morning brief** (in Noir; `V2-ToCheck` only for structure)
   - **Check in** (shall I?): the flight, when, the airline; **Check in** opens the airline; Later.
   - **Pack** (shall I?): the trip, the suggested set as small pills; **Pack** opens the picker.
   - **Before you go** (is this right?): Claude's few lines joined with what else is coming up at home; Right · Not this.
   - The **Morning brief** lines for each ("Check in for 6E 6123 by tonight · Pack for Goa").

6. **Trips here** on a Place's page (Goa): the trips there, newest first, dates and what each cost.

7. **Add / edit a trip** (form): destination (typing it finds the Place), dates as a range, purpose as pills, budget, local currency, travelling with (faces). Keep it short: most trips come from mail.

**Shared parts** (design each once):
- **The trip row** and **the trip card** (big, for Next trip).
- **The spend block**: three numbers and the bar, with the over state.
- **The booking row**: flight (route, number, time, PNR) and stay (name, nights, check-in day).
- **The packing pill** in its four states, sharing the clothes pill from `NR-Assets-Clothes`.
- **The countdown chip**: in 48 days · tomorrow · day 2 of 4 · back 3 days ago.

**Realistic content, not lorem ipsum.**
- Goa, Fri 18 – Tue 22 Dec, leisure, with Priya; budget ₹30,000. IndiGo 6E 6123 BLR → GOX 06:15, PNR X5RT9P, ₹6,412; The Park Calangute, 4 nights; Air India AI 2894 GOX → BLR 18:30, ₹5,210. Spent ₹21,840: fares ₹11,622, Britto's ₹2,350, scooter ₹1,600, Thalassa ₹4,100, Uber ₹2,168.
- Delhi, Thu 14 – Sat 16 Jan, work: MakeMyTrip, IndiGo 6E 2175 BOM → DEL 07:05, Lemon Tree Premier, Aerocity, 2 nights.
- Old Manali, Fri 12 – Mon 15 Feb: Airbnb, "Cosy cabin in Old Manali", cold: 2 warm layers.
- Japan, 20 Dec – 4 Jan, ₹3,50,000 budget, abroad: passport, forex card, plug adapter.
- Clothes: White oxford shirt · Black polo · Grey tee (in the wash) · Olive kurta · Checked flannel shirt · Blue linen shirt (in the wash) · Dark blue jeans · Khaki shorts · Swim shorts · Pyjamas · Turf kit (packed for Thursday).
- Bathroom: Colgate · Head & Shoulders · Dettol handwash.
- Amounts in ₹ with Indian grouping.

**Deliverables:**
- Every screen above at 390 wide, full scroll, as `NR-Travel-Home`, `NR-Travel-Trip` (Goa and Delhi), `NR-Travel-Pack`, `NR-Travel-Back`, `NR-Travel-Nudges` (the To check cards and the Morning brief lines), `NR-Travel-TripsHere`, `NR-Travel-Form`.
- New kit pieces in a `NR-Travel-Parts` artboard.
- States: no trips yet ("Turn on Gmail and your booking mails make trips on their own", plan one by hand); a trip with no dates; a trip with no budget; over budget; away now; a trip just back with things still packed; a packing list with nothing clean of a kind; no clothes at all ("Clothes are Assets: add them in Home › Clothes").
- **No backdrop blur**: draw sheets as the semi-opaque version that ships.
- Dark only: the light theme is undecided.
- Notes on every decision this prompt didn't cover.
