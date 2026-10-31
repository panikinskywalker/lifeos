# Projects · design prompt for Claude Design

Paste the prompt below into Claude Design on the LifeOS canvas
(https://claude.ai/artifact/RVT9hLfcQ7tvgXvZN1x6cF), page *v3 Noir*. Source of
truth: `docs/MODEL.md` layer 2 (*Agenda*: Event, Task, Project and their
Fields, 31 Oct) and R4. Projects is being built alongside this design (31
Oct): the first screens are drawn from the kit and this design replaces them.
Name the artboards `NR-Projects-*` so the build can read them.

---

Design **Projects** for LifeOS, my personal life-OS app for Android (390 × 844, edge to edge, dark). Use the **v3 Noir** page of this canvas for every colour, type style, radius and component: `NR-KitComponents`, `NR-FieldKit`, `NR-KitCharts`, `NR-KitRecords`, and the chips from `NR-People-Parts`. Don't invent a theme. If a part needs something the kit lacks, draw it as a new kit piece and name it. The Tasks disc in Noir is lilac; keep it.

**What Projects is.** What I have to do and where I have to be: tasks with due dates (some repeating), projects that group tasks toward an aim, and events, most of which come in on their own from my phone's calendar (a month back, two ahead, the same meeting in four accounts shown once). It answers three questions fast: what's on today, what have I let slip, and how far along is each project. It is not a to-do app with folders and labels; keep it calm.

**Where it sits.** The bottom bar is Today · Upkeep · Dump (centre) · Browse · You. Projects opens from Browse › Modules and from a Today tile. Keep the app's bottom bar. A task with a due date is also a **Cycle**, so it shows in **Upkeep** like the filter that is due; don't redraw Upkeep, just make sure a task row there and here feel like the same thing.

**The data (design to these, nothing more).**
- **Task**: title; status to do · doing · done · blocked; **due** (a day); **repeats** never · every day · week · 2 weeks · month · 3 months · year (done moves the due date on and the task stays open); priority low · medium · high · urgent; project; people; estimate (minutes); notes; done on.
- **Project**: title; status planning · active · on hold · done; **aim** (one or two lines: what done looks like); target date; area (work · personal · home · side project · learning). Derived: **progress** (tasks done of all), overdue tasks, the **next** task, its events, and **spend** (money linked to it from Finance).
- **Event**: title; kind (meeting · met · call · flight · stay · reservation · check-in, or plain *event* from the calendar); starts, ends, all day; location as written, and the **Place** it is at (LifeOS links it on its own: "Toit" for "Toit, 100 Feet Rd, Indiranagar"); people *with* me (from the calendar's attendees; this moves their *last spoke* in People); project; trip; airline and flight number; cost; notes; which calendars it is on.

**Screens (full scroll for each):**

1. **Projects home**
   - Header: "Projects", today's date with what's on ("Sat 31 Oct · 4 today · 2 overdue"), a + for a new task.
   - **Today**: the day's events in time order (all-day first) and the tasks due today, as one list or two; show me which is which at a glance. A *now* line between past and coming events if you think it helps.
   - **Overdue**: tasks past due, the longest late first, "3 d late" in the alert colour, each with its tick.
   - **Projects**: a card per open project: name, progress (a bar, "3 of 8"), the next task, how many are late, the target date or status (planning, on hold).
   - **Coming up**: the next few tasks with their day (tomorrow · Thu · 4 Nov).
   - Ticking a task: it strikes through, a toast says "Done" with Undo; a repeating one says "Done · next Sun".

2. **A task** (Task record page, drawn whole)
   - Title with its project above; one big **Done** (or "Done · next week" when it repeats; **Reopen** when done).
   - Due (with "2 d late"), Repeats, Priority, Project (opens it), People (chips), Estimate, notes.
   - For a repeating task, **Done before**: the last few times, on time or late.
   - The "Tell me about…" bar at the end, as every record has.

3. **A project** (Project record page, drawn whole; draw **Flat move** fully)
   - Name, status, aim.
   - The **progress block**: the big "3/8 tasks done", the bar, "by 12 Dec", what's overdue, the next task, "₹14,200 spent".
   - **Tasks**: open ones with ticks (late first, then by due), **Add** (a new task already in this project), then **Done** (faded, struck through).
   - **Events** in the project (the flat viewing, the movers' slot).

4. **An event** (Event record page, drawn whole; draw a calendar dinner and a flight)
   - Kind and "from your calendar" small above the title.
   - **When**: the time range big, the day and "in 9 days" under it.
   - **Where**: the location as written and the Place chip it is linked to (tap opens the Place); a meeting link stays text.
   - **With**: people chips (tap opens the person).
   - Project, trip, flight (airline, number), cost, which calendars, notes.

5. **Today tile**: "Projects" in a small and a wide size: what's due today and the overdue count; the next event with its time.

6. **Add / edit a task** (form): title, due (quick picks: today · tomorrow · this weekend · next week · pick), repeats as pills, priority as pills, project (pick or new), people. And **add a project**: name, aim, target date, area.

**Shared parts** (design each once):
- **The task row**: tick, title, a second line (priority when high or urgent · repeats · project), the due word on the right (late in alert). States: open, done, late, repeating, blocked.
- **The event row**: the time (or "All day") as the lead, title, kind · place.
- **The project card** with its progress, and the progress block on the project page.
- **The due word**: today · tomorrow · Thu · 4 Nov · 3 d late.
- **A toast** with Undo after a tick.

**Realistic content, not lorem ipsum.**
- Projects: **Flat move** (active, into 4B by 12 Dec; 3 of 8; Book movers 3 d late; next: Pack books; ₹14,200 spent) · **Goa trip** (planning, 20 Dec; 1 of 5) · **Build LifeOS** (active, side project; 12 of 30) · **Tax filing** (on hold).
- Today: Standup 10:00–10:15 (Work calendar) · Lunch with Kendal at Toit, 1:30 pm · Diwali (all day) · tasks: Pack books (urgent, Flat move) · Pay rent (repeats monthly) · Water the plants (repeats weekly).
- Overdue: Book movers (3 d late, Flat move) · Call the plumber (1 d late).
- Coming up: Change address (Thu) · Renew car insurance (4 Nov) · Get 3 contractor quotes (10 Nov).
- Events: Flight 6E 2131 BLR → GOI, 20 Dec 6:10 am · Dinner with Priya, Sat 8 pm, Toit Indiranagar · Flat viewing, 4B, Sun 11 am (Flat move).
- Amounts in ₹ with Indian grouping.

**Deliverables:**
- Every screen above at 390 wide, full scroll, as `NR-Projects-Home`, `NR-Projects-Task` (one-off and repeating), `NR-Projects-Project`, `NR-Projects-Event` (dinner and flight), `NR-Projects-Tile`, `NR-Projects-Form`.
- New kit pieces in a `NR-Projects-Parts` artboard.
- States: an empty Projects (nothing yet: "turn on the calendar and your events come in", add a task), loading, a day with nothing on, a lot overdue (12+), a project with every task done, a long project name and a long event title.
- **No backdrop blur**: draw sheets as the semi-opaque version that ships.
- Dark only: the light theme is undecided.
- Notes on every decision this prompt didn't cover.

*Goal is not in this design*: MODEL.md has it open (dropped in *Retired*, named in R4) until Rutvij decides.
