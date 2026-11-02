# Health · design prompt for Claude Design

Paste the prompt below into Claude Design on the LifeOS canvas
(https://claude.ai/artifact/RVT9hLfcQ7tvgXvZN1x6cF), page *v3 Noir*. Source of
truth: `docs/MODEL.md` layer 2 (*Body*: Measurement, Workout, screen time,
comparisons), layer 5 (the Metric screen) and R6. Health is built alongside
this design (2 Nov): the first screens are drawn from the kit and this design
replaces them. Name the artboards `NR-Health-*` so the build can read them.

---

Design **Health** for LifeOS, my personal life-OS app for Android (390 × 844, edge to edge, dark). Use the **v3 Noir** page of this canvas for every colour, type style, radius and component: `NR-KitComponents`, `NR-FieldKit`, `NR-KitCharts`, `NR-KitRecords`. Don't invent a theme. If a part needs something the kit lacks, draw it as a new kit piece and name it.

**What Health is.** My body in numbers, without me typing them: my Galaxy Watch and Samsung Health share steps, sleep, heart rate and workouts with Android's **Health Connect**, my scale or I give my weight, and Android's **Usage access** gives my screen time per app. LifeOS reads them once a day and on every open, and answers one question per metric: *how am I doing compared with last week and with my usual?* No goals, no badges, no streaks to guilt me: just honest numbers and the comparison.

**Where it sits.** The bottom bar is Today · Upkeep · Dump (centre) · Browse · You. Health opens from Browse › Modules and from Today's tiles (Steps, Sleep, Screen time). Keep the app's bottom bar.

**The data (design to these, nothing more).**
- **Measurement**, one reading of a metric: metric (steps · sleep · resting heart rate · heart rate, the day's average · weight · water · mood · other), value, unit, the day it counts for, and for sleep **asleep and awake** times. Health Connect gives one per metric per day; I can add my own (a weight).
- **Workout**: type (run · walk · cycling · strength · yoga · swim · sport · other), duration, date, started at, distance, calories, intensity, notes (Health Connect's title, "Morning run").
- **Screen time**: per day the total, pickups, first and last use, and time per app.
- **Comparisons**, the heart of every page: **this week vs last week** (the last 7 days against the 7 before) and **vs your usual** (the median of the 8 weeks before, so one holiday week doesn't skew it; it needs two weeks of data). A week is its **average per day** (steps a day, hours a night), so a day the watch was off doesn't count as zero; weight compares its latest readings. Higher is better for steps and sleep, lower for resting heart rate and screen time, neither for weight and average heart rate: colour the change only where it means something.
- **The weigh-in nudge**: if I weigh myself by hand and it has been twice my usual gap, the brain asks "16 days since you last weighed yourself" with **Log weight**. Never a judgement on the number.

**Screens (full scroll for each):**

1. **Health home**
   - Header: "Health", today's date, the To check bell, a + (new workout).
   - **A card per metric**, in this order: Steps (today), Sleep (last night), Heart rate (resting today, the day's average under it), Weight (latest, with its date), Screen time (today). Each: icon, name, the headline number, the change vs last week, and a week of bars (weight: a month's line). A metric with no data says what to turn on, in one line.
   - **Workouts**: "6 in 30 days · 4h 10m", the last few, All.
   - Decide whether the cards should be a grid of tiles or full-width rows, and say why.

2. **A metric's page** (draw **Steps** fully, then **Sleep**, **Heart rate**, **Weight** and **Screen time**)
   - Header: the metric, where it comes from ("From Health Connect" / "From Usage access"), a button to the full chart.
   - The headline number and what it is (today · last night · latest, 2 Nov).
   - **The comparisons card**: This week (a day, on average) with ▲ / ▼ vs last week and vs your usual; Last week; Your usual (median of 6 weeks). Design its states: no last week yet, no usual yet ("needs two weeks of data"), a big change, no change.
   - **Last 30 days**: bars (weight: a line), today highlighted.
   - What only this metric has:
     - **Steps**: best day this month; this week's walks and runs.
     - **Sleep**: the nights, each with asleep → awake ("11:40 pm to 7:05 am") and its length; show the nights as bars on a clock (a night bar) if you can make it read at a glance.
     - **Heart rate**: two comparisons cards (resting, and average through the day), then by day.
     - **Weight**: the readings, each saying whether it came from Health Connect or me; **Log weight**.
     - **Screen time**: pickups today, first and last use, apps this week with their time.

3. **The Metric screen** (the generic full-screen chart every tile opens): Day · Week · Month · Year, the total or average with the change vs the period before, the chart, **the comparisons card**, the heat map for the year, the records underneath. Draw it for Steps and Screen time.

4. **A workout** (record page): type, duration, distance, when it started, intensity, notes, from Health Connect or me. And its form.

5. **Log a weight** (the Measurement form with weight picked): the number large, the day, a note. One tap from the weigh-in nudge.

6. **Today**: the Steps, Sleep and Screen time tiles in small and wide sizes, with the change vs your usual; the weigh-in line in the Morning brief and its To check card (*shall I?*: Log weight · Later · Not this).

7. **Data sources** for Health: Health Connect (not installed · needs an update · permission needed · on, synced 5 min ago, 312 brought in) and Screen time (Android's Usage access switch: "find LifeOS in the list, switch it on, come back").

**Shared parts** (design each once):
- **The metric card** for the home, in the states: data · no data (what to turn on) · today not in yet.
- **The comparisons card** (above), in a full and a compact size (the compact one for Today's wide tile).
- **The change chip**: ▲ / ▼ with the percent, good / bad / neutral colours, and its words ("vs last week", "vs your usual").
- **The night bar**: asleep to awake on a 6 pm to noon axis.
- **An app row** for screen time (icon, name, time, a thin bar of its share).
- **The source line**: Health Connect · Usage access · you.

**Realistic content, not lorem ipsum.**
- Steps: 3,100 so far today; this week 7,356 a day, last week 8,816, usual 8,515 (median of 4 weeks); best day 11,850 on Thu 15 Oct. A 42 min walk on Sat, a 5.5 km run on Thu.
- Sleep: 6h 30m last night (12:30 am to 7:00 am); this week 7h 04m a night, last week 7h 19m, usual 7h 20m.
- Heart rate: resting 58 bpm, average 72 bpm today; resting this week 60, usual 60.
- Weight: 76.4 kg on Mon 2 Nov (me), 76.2 on Fri 30 Oct, 75.8 kg last week, usual 75.4.
- Screen time: 1h 36m so far today, 60 pickups, first use 7:12 am; this week 4h 03m a day; WhatsApp 5h 50m, Instagram 4h 40m, YouTube 3h 30m this week.
- Workouts: Run 42 min · 5.5 km, Strength 35 min, Yoga 30 min, Walk 25 min.

**Deliverables:**
- Every screen above at 390 wide, full scroll, as `NR-Health-Home`, `NR-Health-Steps`, `NR-Health-Sleep`, `NR-Health-Heart`, `NR-Health-Weight`, `NR-Health-Screen`, `NR-Health-Metric` (the Metric screen), `NR-Health-Workout`, `NR-Health-Form`, `NR-Health-Today`, `NR-Health-Sources`.
- New kit pieces in a `NR-Health-Parts` artboard.
- States: nothing yet (no Health Connect, no Usage access: what to turn on and why), loading, a first week (no usual yet), a week the watch was off for three days, a metric that is missing (no weight ever).
- **No backdrop blur**: draw sheets as the semi-opaque version that ships.
- Dark only: the light theme is undecided.
- Notes on every decision this prompt didn't cover.
