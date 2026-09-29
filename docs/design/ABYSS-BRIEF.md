# LifeOS · Abyss v2 — brief for Claude Design

How to use this file: paste **Part 1** as your message to Claude Design, and
attach this whole file plus the previous handoff (`lifeos-abyss-handoff.zip`)
as reference. Parts 2–7 are the detail the prompt points at.

---

## Part 1 — the prompt (paste this)

> Design **Abyss v2**, the dark glass theme for LifeOS, my personal life-OS app for Android. Attached: this brief (ABYSS-BRIEF.md) and the first Abyss handoff you made (lifeos-abyss-handoff.zip). Keep what worked in v1 — the deep blue-black ground, soft glass objects far behind, thin frosted panes, one mustard accent, coral only for "late", big light numbers, round controls, the floating pill nav — and fix the problems listed in Part 3 of the brief.
>
> Three things matter most:
> 1. **Design the app as it actually is now** (Part 2): the centre button is **Dump** (a brain, one box for telling and asking), not Talk; Today is built from the sections listed there (My day, Progress, Activity, Habits, Spend, Done today, Area cards…), and there are screens v1 never covered (To check, the Dump screen, module dashboards, Activity trackers, Time view, deliveries with OTP, settings).
> 2. **It will be built in React Native (Expo), not Jetpack Compose** (Part 4): the glass must be achievable without blurring every pane live — a pre-rendered backdrop and translucent "frost" panes, with real blur only on the nav bar and sheets. Specify materials in those terms.
> 3. **It's a theme, not a replacement** (Part 5): LifeOS keeps its Light theme; Abyss is a choice in You › Appearance. Give every value against the token names the app already uses, so switching is a token swap.
>
> Deliver what's in Part 6, check it against Part 7, and when a decision isn't covered, choose the calmer, more readable option and note it.

---

## Part 2 — what the app actually is (design all of this)

**Frame:** 390 dp wide, Android, edge-to-edge. Fonts: v1 proposed Outfit (big numbers) + Instrument Sans (everything else); keep that pairing or argue for one family. Icons are the app's own inline line icons (2 dp stroke, round caps — Lucide-like); don't rely on an icon font.

### 2.1 Navigation
Floating pill bar, five items: **Today · Upkeep · Dump (centre, raised disc, brain icon) · Browse · You**. The top-right of each tab has a **bell** (To check, with a count) and a **You** orb.

### 2.2 Today (the home screen — the most important screen)
A greeting and date, then sections the user **switches on/off and reorders** (You › Home screen). Some sections have **two looks** the user picks between — design both:

| Section | What it shows | Looks |
|---|---|---|
| **My day** | today in time order: all-day items first (tasks due, upkeep due or late, deliveries arriving with their **OTP**, bills renewing), then timed events and reminders, with a **"now" line**; done items struck through; late items in coral | one |
| **Progress** | steps, sleep, screen time vs goals (goals learned from the last 30 days), habits x/y, tasks this week x/y, spend this month vs usual; tap sets your own goal | **Rows** (small ring · label · "5,000 of 8,000" · 7-day mini bars) · **Rings** (big rings side by side, scroll sideways — never gaps) |
| **Activity** | GitHub-style grid per tracker: a square per day, ~18–26 weeks, Mon on top, newest column right; done = tracker colour, not done = faint shade of it; today's tick top-right; "3 this week · 12 this month · 5-day streak". Trackers: Days worked, Workouts, Steps goal met, Ordered food, + user-made | **One at a time** (swipe, page dots, "2 of 4") · **All stacked** |
| **Habits** | habits due today | **Today list** (tap circle to tick, flame + streak) · **This week** (row per habit, Mon–Sun circles, ticked days filled, streaks joined by a line, future days outlined) |
| **Steps**, **Sleep** | today / last night + 7-day bars (1×1 tiles, side by side) | one |
| **Spend this month** | big amount, "₹8,658 more than usual by today", cumulative line vs your usual month | one |
| **Done today** | spent, came in, steps, workouts, habits ticked, tasks done, upkeep done, dumps — two-column grid of small icon + value + label | one |
| **Area cards** | one card per module: its number ("₹78,658", "2 to call", "1 overdue", "Goa in 14 d"), a line, a 7-point mini chart; two-up grid; tap → module dashboard | one |
| **Upcoming**, **Screen time**, **People to call**, **Overdue**, **On this day** | next 2 weeks · today + top apps · keep-in-touch / birthdays · late upkeep count · a month / 6 months / years ago | one |

Also on Today: an empty state per section ("No steps yet — turn on Health Connect ›"), and a quiet "Choose what's on Today" link at the bottom.

### 2.3 Dump (centre tab)
One box: type or talk (mic). Telling ("met Kendal, her birthday is 8 Sept") files things; asking ("how much on food this month?") answers. Below: recent dumps as cards — the words, then what was filed as rows (Person · Kendal, Birthday 8 Sep…) each with **Undo**; states: *filing…*, *waiting* (free AI limit reached — "files by 9:40"), *answered on the phone now, full answer queued*.

### 2.4 To check (the bell)
Everything filed automatically (from dumps, bank SMS, payment apps, Gmail) grouped by where it came from ("Yesterday · HDFC Bank SMS", "Email · rutvij@gmail.com"), each row with tick / edit / cancel, and **flags** ("We think 'JOHN D' is John Doe — Yes / Not them", "Guessed Football: only the amount fits", "Category unknown"), and "approves itself in 12 days".

### 2.5 Browse and module dashboards
Browse: search, a two-up grid of module tiles (tinted, with counts), Memory, Recent. Tapping a module opens its **dashboard**: stat row (3 across), charts (bars by month / day, a stacked breakdown with legend, progress bars — budgets, projects, goals, habits this week, trip budgets —, a heat map for habits), "needs you" lists, then **Records** (the list of record types). Design one generic dashboard + Finance, People, Tasks, Habits, Deliveries as examples.

### 2.6 Records
- **Record page**: header band (icon orb, title, sub, status chip, 3 stats), fields, **Cycles** (upkeep: Service / Insurance / PUC with due + Done), **Connections** grouped by link word ("Paid to / from", "Part of", "With"), a small **graph** card, **Mentioned in** (notes, facts), **Dumps**, reminders, attachments, notes, **timeline**. Special heads: **Delivery** (big OTP + "Track package"), **Subscription** (per month / next bill / paid this year), **Habit** (streak, 30-day %, this-week circles, 13-week heat map), **payee guess banner** ("We think this is Priya — Yes / Not them").
- **Record list**: saved-view chips, search, grouped by day with "₹560 out" per day, swipe left to delete (Undo).

### 2.7 Other screens
- **Activity** page (all trackers), **tracker** page (26-week grid, this week / month / streak / longest, "a day counts when any of these happen" rules) and the **rule builder** (name, icon, colour swatch; rule types: a message mentions words · a payment (words / category / in-out) · a record · a health number or your goal · minutes in chosen apps · a calendar event (calendar / words) · a habit ticked).
- **Time view**: Day / Month / Year; month as a calendar (dots for dumps and events, shading for spend), then money by category, body & phone averages, what happened, dumps, upkeep done, added.
- **Metric** page (steps, sleep… with Day / Week / Month / Year, big number, delta chip, column chart).
- **Spend** page (filters, categories, list), **Graph** (force-directed network of a record's links).
- **You / settings**: Data sources (Bank SMS, Payment apps, Screen time, Health Connect, Contacts, Calendar, Call log, Gmail — each with On/Off, last sync, count), Gmail accounts, Categories (your categories with colour + icon; rules by keyword, exact amounts / multiples, ranges with "from group / after a payment"), Home screen (sections, looks, area cards), Notifications (morning brief + preview, switches, quiet hours), Lock & backup (fingerprint lock, encrypted backup / restore), Agent (AI providers and keys), Appearance (**Light / Abyss**, Frost effects on/off).
- **Lock screen** ("LifeOS is locked · Unlock"), **toasts** with Undo, **sheets** (pickers, goal editor), **empty states**.

---

## Part 3 — fix these from v1

1. **Out of date.** Talk → **Dump** (brain disc). Replace the "Brief from your agent" card with the real Today sections above (the morning brief is a notification; an optional small brief line at the top of Today is fine).
2. **Readability over the objects.** In v1 text washes out where the lavender sphere shows through (Browse "Japan trip", the vehicle page's Documents rows, "₹6,400"). Make it impossible: every pane gets an **always-on darkening layer** under its film (not only in high-contrast mode); keep the bright cores of objects **behind the gutters and between panes**, never under text-dense panes; state a minimum contrast (primary text ≥ 7:1, secondary ≥ 4.5:1) **over the brightest point of the backdrop**, and show the worst case.
3. **Colour must mean something.** v1 says hue = which module a thing lives in, but then gives Today's panes fixed colours regardless of content (Overdue always rose, even for a car service). Rule for v2: a pane or row takes the **module's** tint when everything in it belongs to one module; **mixed panes are neutral** (My day, Progress, Done today, To check). Keep coral = late, mustard = the one action / selection.
4. **Density.** v1's 46 dp greeting and roomy panes spend a screen of Today on chrome. Keep large light numbers for the one figure that matters in a pane, tighten the rest; aim for My day + Progress + the first Activity grid above the fold on a 390 × 844 phone.
5. **Performance-aware material.** See Part 4 — no live blur per pane.
6. **Not only dark.** Abyss sits beside Light; don't design anything that only works in Abyss.

---

## Part 4 — how it will be built (constraints)

React Native 0.86 (Expo SDK 57) on Android. What's cheap and what isn't:

- **Backdrop:** one static image per screen density (ground gradient + glows + objects + grain, composed once), fixed to the viewport, not scrolling. Say where objects sit relative to a 390 × 844 viewport (Part 3.2). Parallax: none.
- **Panes ("frost"):** *no live blur.* A pane = translucent film (vertical gradient of white or the module hue at low alpha) + the always-on darkening layer + 1 dp edge + a top highlight line + optional corner sheen. Give each as colour + alpha values, so a pane is a few layered fills. It must look right over the static backdrop (that *is* the "glass").
- **Real blur, only here:** the bottom nav bar and bottom sheets (and the lock screen), where content moves behind them. Specify blur radius and tint.
- **Fallback:** "Frost effects" off / battery saver → flat panes (give the solid colours); objects stay.
- **No:** per-pane blur, drop shadows that need blur on every row, animated backdrops, gradients on buttons.
- Charts and grids are drawn in SVG (bars, lines, rings, heat maps, the Activity grid) — give their colours per module in Abyss.

---

## Part 5 — tokens: map to the names the app uses

The app reads colours from these names (Light values exist). Give the **Abyss value for every one**, plus the new frost values:

- `bg`: `ground` (and the backdrop), `tile`, `tileRaised`, `lowest`, `container`, `dim`, `bar`, `pressed`, `scrim`, `overlay`, `pill`
- `fg`: `primary`, `secondary`, `tertiary`, `onBar`, `onBarActive`, `onBarText`
- `line`, `ringTrack`, `rail`, `chart[5]`
- `accent`: `mustard`, `mustardInk`, `mustardSoft`, `gold`
- `alert`: `coral`, `coralText`, `coralInk`, `coralFill` · `ok`: `sage`, `sageText`, `sageInk`, `sageFill`
- module tints — `finance`, `upkeep` (things / upkeep), `people`, `tasks`, `health` (health + habits), `memory` (notes / memory), `travel` (+ places), `documents` (+ deliveries use upkeep) — each as `fill` (film), `fillStrong` (record header, hero), `ink` (tiny module-coloured marks, grids, chart bars)
- **new** `frost`: pane film (neutral + per module), darkening layer, edge, top highlight, sheen, pill material, chrome (nav) material, sheet material, fallback flat colours
- type styles the app has: `display` (hero number), `stat`, `title` (screen title), `heading`, `rowTitle`, `body`, `tileTitle`, `label`, `caption`, `labelCaps`, `labelMicro`, `nav` — say family / size / weight / line height / tracking for Abyss (a theme may change fonts)
- radius: `tile`, `card`, `sheet`, `band`, `button`, `input`, `iconBox`, `checkbox`, `chip`; spacing and sizes if they change

---

## Part 6 — deliverables

1. **Screens (390 wide, 2×)** for everything in Part 2, including both looks where a section has two, and empty / loading / late / done states where they exist. At minimum: Today (full scroll, both Progress looks, both Activity looks, both Habits looks), Dump (with filing / waiting states), To check, Browse, Finance dashboard, a generic module dashboard, Record (vehicle), Record (delivery with OTP), Record (person with guess banner), Record list (transactions), Activity page, tracker page, rule builder, Time view (month), Metric page, You, Data sources, Categories, Home screen settings, Notifications, Lock & backup, Lock screen, a sheet, a toast.
2. **Component sheet** in Abyss (and Light beside it where they differ): pane / hero / pill / chrome / sheet materials; tile heads; row item with every trailing / action variant; chips (default / selected / pressed / disabled); buttons; inputs (focus / error); toggle, segmented, stepper, checkbox; ring; stacked bar + legend; column / line / mini bars; heat map + Activity grid; week circles; timeline; toast; empty state; nav bar with the Dump disc; lock screen.
3. **Token table** in the Part 5 names (JSON + a readable table), Abyss and the unchanged Light side by side.
4. **Backdrop** as the composed images (1×, 2×, 3×) and where each object sits.
5. **Notes**: every decision this brief didn't cover, and anything you'd change in Light to match.

## Part 7 — check before you hand it over

- Every Part 2 screen and section is there; the centre button is Dump; no "Talk" left.
- Contrast holds over the brightest point of the backdrop (show the worst case).
- No pane relies on live blur; nav / sheets are the only blurred surfaces; the flat fallback is specified.
- Tints follow Part 3.3; one mustard thing per screen; coral only for late.
- Today's first screen shows My day, Progress and the first Activity grid.
- Every token in Part 5 has an Abyss value.
