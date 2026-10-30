# Home · design prompt for Claude Design

Paste the prompt below into Claude Design on the LifeOS canvas
(https://claude.ai/artifact/RVT9hLfcQ7tvgXvZN1x6cF), page *v3 Noir*. Source of
truth: `docs/MODEL.md` layer 8 (*The brain*: Home, Stock, Space, Nudge) and
R7e. Home is being built alongside this design (30 Oct): the first screens are
drawn from the kit and this design replaces them. Name the artboards
`NR-Home-*` so the build can read them.

---

Design **Home** for LifeOS, my personal life-OS app for Android (390 × 844, edge to edge, dark). Use the **v3 Noir** page of this canvas for every colour, type style, radius and component: `NR-KitComponents`, `NR-FieldKit`, `NR-KitCharts`, `NR-KitRecords`, and the pill and chip pieces from `NR-People-Parts`. Don't invent a theme. If a part needs something the kit lacks, draw it as a new kit piece and name it.

**What Home is.** Everything I keep at home, so LifeOS can tell me what's running out, what to use before it goes off, and what I can cook tonight. I order about 90% of my groceries online (Blinkit, Zepto, Instamart), so most of it arrives on its own: an order mail is read, or I share Blinkit's invoice PDF after the delivery notification. LifeOS never sees what I use up, only what comes in, so it **guesses** from how often I rebuy and from shelf life, and asks me cheaply to confirm. The design has to make guessing feel honest: what LifeOS *knows* and what it *thinks* must look different.

**Where it sits.** The bottom bar is Today · Upkeep · Dump (centre) · Browse · You. Home opens from Browse › Boards and from a Today tile. Keep the app's bottom bar. Home's sections are its **spaces**, not a tab bar of its own.

**The data (design to these, nothing more).**
- **Stock**, something kept at home that runs out or goes off: name ("Amul butter"), size ("100 g"), quantity (2), **space**, bought on, **life** (how long it keeps: Claude's estimate, or mine), **rate** (how often I rebuy, learned), **state**: fresh · use soon · probably gone · used up, and where it came from (Blinkit order · Zepto mail · receipt photo · I added it).
- **Spaces**: Fridge · Freezer · Kitchen · Cabinets · Clothes · Bathroom · Cleaning, plus any I add, rename or reorder. Each has its own page.
- **Clothes** are Assets, not Stock: they don't run out. Their states are clean · in the wash · packed.
- **Nudges** that Home produces (into To check and the Morning brief on Today): *running out* ("Butter: you rebuy every 3 weeks, it's been 18 days"), *going off* ("Paneer: bought Mon, use by tomorrow"), *cook tonight* ("Eggs, spinach, paneer, cream: palak paneer?").

**Screens (full scroll for each):**

1. **Home**
   - Header: "Home", what's in it ("64 things · 6 spaces"), a + to add.
   - **Use soon**: a strip of what goes off in the next 2 days, most urgent first.
   - **Cook tonight**: one card. The dish, the 3–5 things it uses (as pills, the ones going off marked), "Another idea" and "Not tonight".
   - **Running low**: what LifeOS thinks I'm about to run out of, each with why ("every 3 weeks · 18 d"), and the way into the shopping list.
   - **Spaces**: a tile per space, with its count and a hint of state (2 to use soon · 1 running low). Fridge and Kitchen first.
   - **Just came in**: the last order ("Blinkit · ₹437 · today 6:40 pm · 9 things") and what it added.

2. **A space** (draw the **Fridge** fully, and Clothes as the second example)
   - Every thing as a **pill**. Design the pill's states:
     - **fresh**: lime;
     - **use soon**: mustard;
     - **probably gone**: faded, its estimated life has passed and it waits for me;
     - **used up**: gone from the space, with Undo.
   - **Tap** = used up. **Long-press** = a small sheet: half left · still good · moved to Freezer · edit.
   - Group by kind inside the space (Dairy · Veg · Leftovers) or a flat cloud. Choose and say why.
   - **Snap the fridge** button (see screen 5).
   - **Clothes**: pills in clean · in the wash · packed. Tap cycles clean → in the wash. Shirts, jeans, the Turf kit.

3. **A thing** (Stock record page)
   - Name, size, space, quantity with − / +.
   - **Life**: bought 4 Oct · keeps ~30 days · "LifeOS's guess" vs "you said". I can correct it, and it learns.
   - **Rate**: "you rebuy every ~3 weeks", with a small history of when I bought it (dots on a line).
   - Where it came from: the order, with its price.
   - Actions: Used up · Half left · Add to list · Move.

4. **Shopping list**
   - Pills again: what's running low (LifeOS's suggestions, marked as such) plus what I added.
   - Group by where I usually buy it (Blinkit · offline).
   - The last step is mine: **Copy list** and **Open Blinkit** / **Open Zepto**. LifeOS never orders.
   - After the order arrives, the list clears what came in.

5. **Snap the fridge** (photo check)
   - The camera (a simple frame). Then the result: the photo small at the top and the **differences** as pills: "Not seen: butter, curd" · "Found: coriander, lemons". Each one taps to accept or fix. "All right" closes it.
   - Say clearly that the photo goes to Claude only because I pressed the button, and isn't kept there.

6. **Groceries coming in** (To check cards, in Noir; use `V2-ToCheck` only for structure)
   - **Blinkit delivered**: "Blinkit · ₹437 · just delivered. Share the invoice and I'll stock the fridge." **Open Blinkit** · Skip.
   - **Stocked from an order** (done, undo?): "9 things from Zepto · Fridge 5 · Kitchen 3 · Bathroom 1", each pill removable, Undo.
   - **Is this right?**: "Is 'Amul Taaza 1L' milk for the Fridge?" with the space as pills.
   - **Receipt photo** for a shop visit: the photo, what was read, fix and accept.

7. **Today: the Morning brief section and the Home tile**
   - Today keeps its tiles. On top, a **Morning brief** section: a few lines from every module's nudges, with Home's here: "Use the paneer today · Butter's nearly out · Palak paneer tonight?". Each line opens its record or its card. Show it in the morning and after the evening update ("Updated 7 pm").
   - The **Home tile** in a small and a wide size: what to use soon, and the count running low.

8. **Add / edit a thing** (form): name, size, quantity, space (pills), bought on, keeps for (days, with LifeOS's guess shown), and a photo. Also **add several at once**: type "eggs, butter, 2 milk" and see them as pills before saving.

**Shared parts** (design each once):
- **The stock pill** in its states, in 2 sizes (space page; strips and cards), with a count badge ("×2") and a tiny "guess" mark when the state is LifeOS's estimate.
- **The space tile**: icon, name, count, state hints.
- **The "why" line** on a guess ("every 3 weeks · 18 d", "bought Mon · keeps 4 d").
- **The source chip**: Blinkit · Zepto · Instamart · receipt · you.
- **A toast** with Undo after Used up and after stocking an order.

**Realistic content, not lorem ipsum.**
- Fridge: Amul butter 100 g (18 d, running low) · Mother Dairy toned milk 1 L ×2 · Malai paneer 200 g (bought Mon, use soon) · eggs ×12 · spinach (use soon) · coriander · Amul fresh cream (half) · curd 400 g · leftover dal (from yesterday).
- Freezer: frozen peas · McCain fries.
- Kitchen: Aashirvaad atta 5 kg · basmati rice · toor dal · Tata salt · Maggi ×4 · Nescafé.
- Cabinets: Dolo 650 (strip of 15, expires Mar 2027) · ORS · band-aids.
- Bathroom: Colgate · Head & Shoulders (running low) · Dettol handwash.
- Cleaning: Surf Excel Matic 2 kg · Vim bar · garbage bags.
- Clothes: 6 shirts (2 in the wash) · 3 jeans · Turf kit (packed for Thursday) · the bibs.
- Orders: Blinkit ₹437 today, Zepto ₹1,212 on Sunday. Amounts in ₹ with Indian grouping.

**Deliverables:**
- Every screen above at 390 wide, full scroll, as `NR-Home-Home`, `NR-Home-Space` (Fridge and Clothes), `NR-Home-Thing`, `NR-Home-List`, `NR-Home-Snap`, `NR-Home-Incoming`, `NR-Home-Today` (the Morning brief section and the tile), `NR-Home-Form`.
- New kit pieces in a `NR-Home-Parts` artboard.
- States: an empty Home (nothing yet: "your next Blinkit order fills this", connect mail, add by hand), loading, a space with everything fresh, a space where most things are probably gone, a lot of things (80+).
- **No backdrop blur**: draw sheets as the semi-opaque version that ships.
- Dark only: the light theme is undecided.
- Notes on every decision this prompt didn't cover.
