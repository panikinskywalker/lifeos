# Time · design prompt for Claude Design

Paste the prompt below into Claude Design on the LifeOS canvas
(https://claude.ai/artifact/RVT9hLfcQ7tvgXvZN1x6cF), page *v3 Noir*. Source of
truth: `docs/MODEL.md` layer 5 (*Today*: what it is made of; *Time*) and R8.
Time and the Today tiles are built (2 Nov, R8) from the kit; this design
replaces the kit drawing. Name the artboards `NR-Time-*` so the build can
read them.

---

Design **Time** for LifeOS, my personal life-OS app for Android (390 × 844, edge to edge, dark). Use the **v3 Noir** page of this canvas for every colour, type style, radius and component: `NR-KitComponents`, `NR-FieldKit`, `NR-KitCharts`, `NR-KitRecords`, and the existing `NR-Today` artboard for the tiles. Don't invent a theme. If a part needs something the kit lacks, draw it as a new kit piece and name it.

**What Time is.** My life by date. Any day, month or year as one page: what I spent and on what, my body and phone averages, what happened, what I dumped, upkeep I did, who and what I added. And it looks back: what happened on this date a month, six months and years ago. It reads every part of the app, and it never asks me to enter anything; it only shows what is already there.

**Where it sits.** The bottom bar is Today · Upkeep · Dump (centre) · Browse · You. Time opens from Browse › Boards, and from the **On this day** tile on Today (straight to that date as a day). Keep the app's bottom bar. Time has no tab bar of its own: the Day · Month · Year switch is its only navigation.

**The data (design to these, nothing more).**
- **A period**: a day, a month or a year; earlier and later (never past the period holding today).
- **Money**: spent, came in, the number of payments, spend by category (Food & Drink, Groceries, Housing, Travel, Shopping…); on a day, each payment.
- **Body & phone**: steps, sleep, screen time, resting heart rate, weight, workouts (count and minutes). Averages per day for a month or year. Each opens its full chart.
- **What happened**: Events (met, call, dinner, flight) and Trips overlapping the period.
- **What you dumped**: the dumps, first line and time.
- **Upkeep done**: a Cycle done, on what, its cost.
- **Added**: new people (named), other records by kind (+3 Tasks), facts remembered.
- **Day marks** (month and year): per day, spend, dumps, events.
- **On this day**: the same date 1 month, 6 months, and 1 to 10 years ago, only the dates with something; each date has a few items (a dump, an event, a trip, "Met Karan", an upkeep done).

**Screens (full scroll for each):**

1. **Month** (the default)
   - Header: "Time", back.
   - The Day · Month · Year switch; "November 2026" with earlier / later.
   - **The calendar**: Monday first, each day showing what is in it (dumped, an event, spend as a shade). Today ringed; days to come dimmed. Tap a day to open it. A small legend.
   - Then the sections, each only when it has something: Money (the total, came in, a category bar, "See every payment"), Body & phone, What happened, What you dumped, Upkeep done, Added.

2. **Day**
   - "Monday, 2 November 2026" with earlier / later.
   - Money lists each payment (payee, category, account, amount).
   - What you dumped with times; What happened in time order.
   - **On this day**, at the end: each date as a row ("1 year ago · Sat 2 Nov 2025", opens that day) with its items under it, each opening its record or dump.

3. **Year**
   - "2026" with earlier / later.
   - **Twelve months** as tiles: spend, dumps and events per month; tap to open the month. Months to come dimmed.
   - The sections as for a month, with yearly totals and averages.

4. **Today: the On this day tile** (full width, on Today with the other tiles)
   - Up to three dates, two items each, the date's "1 year ago" on the right. Tap an item to open it; tap the tile to open that date on Time.
   - Draws nothing when there is nothing to look back on.

5. **Today: the tile system** (one artboard, `NR-Time-Tiles`)
   - Today is now only the Morning brief and tiles that boards register. Draw the two sizes on the 2-column grid: **small** (half a row; two share a row) and **medium** (a full row). A small tile alone on its row is drawn medium; show People and Steps both ways.
   - The **empty tile** that names its source ("No steps yet. Turn on Health Connect ›").
   - **You › Home screen**: the list of tiles with on / off and move up / down, and **Looks** (Habits: Today list · This week; Activity: One at a time · All stacked; Progress: Rows · Rings).

**Shared parts** (design each once):
- **The period header**: the switch, the period's name, earlier / later.
- **The day cell** of the calendar in its states: empty, dumped, event, spend shades, today, to come.
- **The month tile** of the year.
- **The look-back row**: "1 year ago" with the date, and its items.

**Realistic content, not lorem ipsum.**
- November 2026: ₹560 spent so far (Food & Drink); Dentist at Indiranagar; Priya's birthday dinner in 9 days; weight 76.4 kg; one workout, 30 min.
- 2026: ₹1,48,658 spent, ₹2,43,000 came in; Housing ₹64,000 · Travel ₹42,000 · Shopping ₹24,800 · Food & Drink ₹7,810; Goa (23 to 27 Sep, ₹30,000); Japan in planning (Dec, ₹3,50,000); coffee with Priya; beers with Arjun; dinner at Toit.
- A day: 23 Oct 2026, Airtel fiber ₹1,899 (Utilities, Amex Platinum); On this day: "1 month ago · Wed 23 Sep 2026 · Goa".
- A year ago: "Met Karan" at a friend's wedding; "dumped: renew the passport before March".
- Amounts in ₹ with Indian grouping.

**Deliverables:**
- Every screen above at 390 wide, full scroll, as `NR-Time-Month`, `NR-Time-Day`, `NR-Time-Year`, `NR-Time-Tile` (On this day on Today), `NR-Time-Tiles` (sizes, the empty tile, You › Home screen).
- New kit pieces in a `NR-Time-Parts` artboard.
- States: a period with nothing recorded ("Nothing recorded for March 2025."), a day with no look-back, a busy month (a dump or event most days), a year before you started using LifeOS, loading.
- **No backdrop blur**: draw sheets as the semi-opaque version that ships.
- Dark only: the light theme is undecided.
- Notes on every decision this prompt didn't cover.
