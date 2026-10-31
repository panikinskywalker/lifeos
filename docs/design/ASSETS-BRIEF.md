# Assets · design prompt for Claude Design

Paste the prompt below into Claude Design on the LifeOS canvas
(https://claude.ai/artifact/RVT9hLfcQ7tvgXvZN1x6cF), page *v3 Noir*. Source of
truth: `docs/MODEL.md` layer 2 (*Things*: Asset's Fields, agreed 31 Oct), layer
8 (*The Home board*, *Travel through the same brain*) and R7a. Assets is being
built alongside this design (31 Oct): the first screens are drawn from the kit
and this design replaces them. Name the artboards `NR-Assets-*` so the build
can read them.

---

Design **Assets** for LifeOS, my personal life-OS app for Android (390 × 844, edge to edge, dark). Use the **v3 Noir** page of this canvas for every colour, type style, radius and component: `NR-KitComponents`, `NR-FieldKit`, `NR-KitCharts`, `NR-KitRecords`, the pill and chip pieces from `NR-People-Parts`, and the stock pill and space tile from `NR-Home-Parts`. Don't invent a theme. If a part needs something the kit lacks, draw it as a new kit piece and name it.

**What Assets is.** Everything I own that doesn't run out: my car, my laptop and phone, the fridge and the AC, furniture, jewellery, and my clothes. LifeOS keeps what each cost, when the warranty ends, when it's due for service (by months, and by km for the car), and for clothes, whether they're clean, in the wash or packed. Most of it I add once and forget; the screens should tell me the few things that need me (a service in 600 km, a warranty ending in 3 weeks) and otherwise stay quiet.

**Where it sits.** The bottom bar is Today · Upkeep · Dump (centre) · Browse · You. Assets opens from Browse (its Overview, and the Asset list) and from Upkeep, where its cycles sit with everyone else's. Clothes live inside **Home** (the Clothes space), not in a screen of their own. Keep the app's bottom bar.

**The data (design to these, nothing more).**
- **Asset**: name, **category** (vehicle · device · appliance · clothing · furniture · jewellery · property · other), bought on, price, current value, vendor (a shop, an Organisation), **warranty until**, serial, where (a Place), **kept in** (a Space in Home), status (owned · sold · lost / broken), notes.
- **Service**: every N months (any Asset; the AC every 6 months), and every N km for a vehicle (default 6 months or 10,000 km, whichever first); next service date and km; a log of services with cost.
- **Vehicle**: registration, **odometer** readings (km, with history), fuel; its Insurance and PUC renewals are cycles too.
- **Clothing**: **state**: clean · in the wash · packed; kept in Clothes (or another space that holds clothes).
- Nudges the brain will raise later (layer 8): *service due* ("Creta: 600 km to service"), *warranty ending* ("Fridge: warranty ends 12 Nov; anything to claim?"), *laundry* ("6 in the wash since Sunday").

**Screens (full scroll for each):**

1. **Assets home** (the Overview)
   - Header: "Assets", what's in it ("23 things · ₹4.2 L"), a + to add.
   - **Needs a look**: what's late or due soon, most urgent first: a service by km or date, a warranty ending, insurance. Each with why ("600 km to go", "ends in 21 days") and its one action (Serviced · Renewed).
   - **By category**: a tile per category with its count and value; Vehicles first.
   - **Upkeep spend by month** (bars, the last 6).
   - **Clothes**: one line from Home ("11 clothes · 3 in the wash · 2 packed") that opens the Clothes space.

2. **An Asset** (draw the **MacBook** fully; the **AC** as the second example, with a service by months)
   - Header: name, category chip, status, the photo if there is one.
   - Stat trio: paid / worth, bought, cycles.
   - **Warranty**: until when, days left, a bar from bought on to the end; ended warranties look done, not alarming.
   - **Service** (when it has one): cadence, next due, last done, **Serviced** (with cost).
   - Where it is (Place) and what it's kept in (Space), vendor, serial.
   - Papers: the receipt and the warranty card (Documents), the spends linked to it.

3. **A vehicle** (the **Creta**)
   - Stat trio: odometer (tap to log a reading, "+840 this month"), insurance days left, this year's spend.
   - **Next service on both clocks**: the time bar (days of 6 months) and the distance bar (km of 10,000), whichever ends first called out ("Due at 30,000 km or 14 Jan, whichever first").
   - Attention card for what's due, Serviced / Renewed and Snooze.
   - Quick actions: Log odometer · Record service · Add expense · Add document.
   - Odometer history (a small line chart) and the service log (date, km, cost).

4. **The Clothes space** (in Home; HOME-BRIEF screen 2's second example, drawn in full here)
   - Pills in three groups: **Clean**, **In the wash**, **Packed** (for a trip, with the trip's name when there is one).
   - Design the **clothes pill** in its three states, distinct from the stock pill: clean (lime), in the wash (with a drop), packed (outlined, with a bag).
   - **Tap** cycles clean → in the wash → clean; a packed one taps back to clean. **Long-press**: a small sheet with the other states and Open.
   - Header: "Clothes", "11 things · 3 in the wash · 2 packed", + to add clothes.
   - Empty: "Clothes are Assets: add a shirt, your jeans, the turf kit."

5. **The packing picker** (the travel module uses it later; draw it now so the pills are shared)
   - Opened from a Trip ("Goa · 4 days"). Shows my **clean** clothes as pills (from every space that holds clothes) and the Bathroom's Stock, each tap adding it to the bag.
   - A suggested set on top, scaled to the days and the weather there ("4 days · 31° · 4 tees, 2 shorts, swimwear"), marked as LifeOS's suggestion, each one removable.
   - "Forgot last time" line ("You forgot a charger in Kyoto").
   - The bag: what's picked, as packed pills; **Pack** sets them packed; when the trip ends, "Back home?" turns them to in the wash.
   - In the wash ones are shown faded with "in the wash" so I can see what I can't take.

6. **Add / edit an Asset** (form)
   - Category first, as pills; the form then shows only that category's Fields: a vehicle adds registration, odometer, fuel, service every km; clothing adds state and kept in (the Clothes space preselected); others add warranty and service every months.
   - Bought on, price, vendor (pick an Organisation or keep as typed), warranty until (with "1 year" / "2 years" shortcuts from bought on).
   - Also **add clothes fast**: type "6 shirts, 3 jeans, turf kit" and see them as pills before saving.

7. **Upkeep and Today**
   - How an Asset's cycles look in Upkeep's list (service by km shows km left, not days).
   - An **Assets tile** for Today in a small and a wide size: the next service and the next warranty end.

**Shared parts** (design each once):
- **The clothes pill** in its three states, and its long-press sheet.
- **The two-clock service bar** (time and km).
- **The warranty bar** (bought on to end, days left).
- **The category chip and tile.**
- **A toast** with Undo after a state change and after Serviced.

**Realistic content, not lorem ipsum.**
- Vehicle: 2022 Hyundai Creta, KA 05 MZ 1234, petrol, 28,400 km (+840 this month), service due at 30,000 km, insurance with ICICI Lombard ending in 9 days, ₹6,400 last service at Hyundai Indiranagar.
- Devices: MacBook Pro 14" (₹2,40,000, worth ₹1,70,000, warranty 330 days left), iPhone 15 (AppleCare until Sep 2027), Kindle.
- Appliances: LG fridge (warranty ends in 21 days), Daikin AC in the bedroom (service every 6 months, due in 10 days), IFB washing machine.
- Clothes: White oxford shirt · Blue linen shirt (in the wash) · Black polo · Checked flannel shirt · Grey tee (in the wash) · Olive kurta · Dark blue jeans · Black jeans · Light jeans (in the wash) · Turf kit (packed for Thursday) · the bibs (packed).
- Trip for the packing picker: Goa, 4 days from Friday, 31°.
- Amounts in ₹ with Indian grouping.

**Deliverables:**
- Every screen above at 390 wide, full scroll, as `NR-Assets-Home`, `NR-Assets-Asset` (MacBook and AC), `NR-Assets-Vehicle`, `NR-Assets-Clothes`, `NR-Assets-Packing`, `NR-Assets-Form`, `NR-Assets-Today` (the Upkeep rows and the tile).
- New kit pieces in a `NR-Assets-Parts` artboard.
- States: no Assets yet, a vehicle with no readings (unscheduled service), a service overdue by km, an ended warranty, a sold Asset, the Clothes space with everything in the wash, a lot of clothes (60+).
- **No backdrop blur**: draw sheets as the semi-opaque version that ships.
- Dark only: the light theme is undecided.
- Notes on every decision this prompt didn't cover.
