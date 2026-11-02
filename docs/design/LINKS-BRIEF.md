# Links and Activity · design prompt for Claude Design

Paste the prompt below into Claude Design on the LifeOS canvas
(https://claude.ai/artifact/RVT9hLfcQ7tvgXvZN1x6cF), page *v3 Noir*. Source of
truth: `docs/MODEL.md` layer 1 (*Link*, *Links*), layer 3 (*Activity*), layer 5
(*Links*, *Activity*) and R11. Both are built alongside this design (2 Nov): the
first screens are drawn from the kit and this design replaces them. Name the
artboards `NR-Links-*` and `NR-Activity-*` so the build can read them.

---

Design **Links** and **Activity** for LifeOS, my personal life-OS app for Android (390 × 844, edge to edge, dark). Use the **v3 Noir** page of this canvas for every colour, type style, radius and component: `NR-KitComponents`, `NR-FieldKit`, `NR-KitCharts`, `NR-KitRecords`, and the Links card and map from `NR-People-Profile` (Person's own Links card is the starting point). Don't invent a theme. If a part needs something the kit lacks, draw it as a new kit piece and name it.

**What Links is.** Every record in LifeOS (a person, a place, a payment, a trip, a task, a thing at home) can be linked to any other, with a word: Karan *works at* Acme, the dinner was *with* Karan *at* Toit, the ₹1,800 was *paid to* Toit. Filing makes most links on its own from what I say and from SMS and mail; I add and remove the rest by hand. **Links** shows that web around one record. "Graph" in this app means a chart, never this.

**What Activity is.** A GitHub-style grid of days per **tracker**: a square for every day something happened. "Days worked" (30 min in Slack or a standup on my calendar), "Workouts", "Steps goal met", "Ordered food" (a Zomato or Swiggy SMS or payment). A tracker is a name, an icon, a colour and **rules**; a day counts when any rule matches what LifeOS has already filed. Nothing is typed in by hand.

**Where they sit.** The bottom bar is Today · Upkeep · Dump (centre) · Browse · You. The **Links card** is on every record page; the **Links screen** opens from it and from Browse (a Links row). **Activity** is a board in Browse › Boards and a tile on Today. Keep the app's bottom bar.

**The data (design to these, nothing more).**
- **A Link**: the two records, the **link word** (works at, with, at, paid to, part of, kept in, or my own word), which way it reads (Acme reads the same Link as "People here"), when it was made, where from (a dump, an SMS, me), and whether filing only guessed it.
- **Module tints**: each record wears its module's colour (People, Places, Money, Projects, Health, Home, Things, Documents, Travel, Notes). Links and its card are tinted by the module of the record at the other end.
- **A tracker**: name, icon, colour (one of the module tints), rules, shown on Today or not, its order. **Rules**: a text or email says a word · a payment (mentioning a word, in a category, out / in) · a record of an Object that day · a health number at a line or my goal · minutes in some apps · a calendar event on a calendar or with a word · a habit ticked.
- **Per tracker, derived**: the days (26 weeks), done today, this week, this month, current streak, longest streak, days in the last 6 months.

**Screens (full scroll for each):**

1. **The Links card** (on a record page; draw it on a **Place**, Toit, and on a **Task**, below a board-drawn page)
   - Header: "Links", the count, **Link** to add.
   - A small map when two or more things are linked (tap opens Links).
   - **Groups by link word**, as read from this record: "Been here · 6", "Payments · 4 · −₹7,240", "In · 1". Each row: the other record's icon in its module tint, its title, its Object and date, an amount for payments. Four rows a group, then "2 more".
   - Long-press a row: **Open · Show in Links · Remove link**; remove leaves a toast with Undo.
   - A guessed link (filing wasn't sure) marked as such, with Right / Not this.
   - Empty: "Nothing linked to Toit yet" and the Link button.

2. **Add a link** (sheet, then the record picker)
   - Pick the word: this Object's own words as pills ("Works at", "Lives in" on a Person), *related*, or type my own ("gift for").
   - Then search and pick the record, grouped by Object, tinted.
   - Done: a toast "Linked as works at" with Undo.

3. **Links screen** (draw it on **Karan**, a Person, with about 25 linked)
   - Header: the record's name, "24 linked · tap to walk, hold to open", **Open**.
   - **Direct links · Two steps out** switch.
   - The **network**: Karan in the middle, records around him in their module tints, link words on his lines, the second ring smaller and quieter. Tap re-centres on a record; hold opens it. Design how a re-centre animates and the "Back to Karan" way home.
   - A **legend** of the modules on screen, in their tints.
   - Below: Karan's Links in full, grouped by word as on the card, with add and remove.
   - Draw a busy one (40 records, two steps out) and say how it stays readable.

4. **Browse › Links**
   - "How your records connect": the most linked records, each with its count, opening its Links screen. Search on top.
   - Empty: "Nothing is linked yet".

5. **Activity home** (`NR-Activity-Home`)
   - Header: "Activity", "2 of 4 done today", + New tracker.
   - Each tracker: icon in its tint, name, today's tick, the grid (as many whole weeks as fit, newest on the right, Monday on top), "3 this week · 11 this month · 4-day streak". Tap opens it.
   - **On Today**: switches for which show on the Today tile, and their order (drag or up / down).

6. **A tracker** (`NR-Activity-Tracker`: draw "Ordered food")
   - The 26-week grid, large; this week · this month · streak (longest under it).
   - **A day counts when any of these happen**: the rules as rows, each with its kind's icon.
   - Tap a day: what made it count ("Zomato · ₹420 · 9:12 pm").
   - Edit rules · Delete tracker (confirm: only the tracker goes, nothing it counted).

7. **New / edit tracker** (`NR-Activity-Edit`)
   - Name, icon (a pill row), colour (the module tints).
   - The rules so far, each removable; **Add a rule**: the seven kinds as pills, then each kind's small form (words; payment words, category, out / in / either; an Object; a health number or "my goal"; apps from my screen time and minutes; calendars and words; a habit).
   - Save, disabled until there is a name and a rule.

8. **The Activity tile on Today** (`NR-Activity-Tile`): wide only. One tracker at a time, swipe for the next with page dots; and the "all of them" style (You › Home) stacking every tracker. Tap opens Activity.

**Shared parts** (design each once, in `NR-Links-Parts`):
- **The link row** (icon in tint, title, Object · date, amount) and the **group label** ("BEEN HERE · 6 · −₹7,240").
- **The node** in three sizes (centre, ring one, ring two), with a photo for a person, the initial otherwise; the **line** with its word.
- **The module legend** chip.
- **The day square** in its states (done, not done, future, today) and the grid at tile size and full size.
- **The rule row** for each of the seven kinds.

**Realistic content, not lorem ipsum.**
- Karan Mehta (People): works at Acme Labs; lives in Indiranagar; with him: Dinner at Toit (20 Oct), Goa trip (20 to 24 Dec), Thursday football (13 games); payments: ₹900 from him (21 Oct), ₹1,850 to him (Goa flat share); member of Goa gang; gift for: AirPods (an Asset).
- Toit (Places, restaurant in Indiranagar, Bengaluru): been here 6 times; payments ₹2,340, ₹1,800, ₹3,100; Karan, Priya, Arjun were here.
- Trackers: Days worked (Slack, Teams, Zoom 30+ min; "standup" on the calendar) · Workouts · Steps goal met (8,000) · Ordered food (Zomato, Swiggy). Amounts in ₹ with Indian grouping.

**Deliverables:**
- Every screen above at 390 wide, full scroll, as `NR-Links-Card` (Place and Task), `NR-Links-Add`, `NR-Links-Screen` (Karan; and a busy one), `NR-Links-Browse`, `NR-Activity-Home`, `NR-Activity-Tracker`, `NR-Activity-Edit`, `NR-Activity-Tile`.
- New kit pieces in `NR-Links-Parts`.
- States: a record with nothing linked, one with 60 links, a guessed link, Links with only one module; Activity with no trackers, a tracker with no rules, a tracker with no data yet (no screen time permission: say which to turn on), loading.
- **No backdrop blur**: draw sheets as the semi-opaque version that ships.
- Dark only: the light theme is undecided.
- Notes on every decision this prompt didn't cover.
