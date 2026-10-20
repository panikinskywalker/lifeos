# LifeOS · design brief v3 — designed the way the app is built

How to use this file: paste **Part 1** as your message to Claude Design, attach
this file, `light-tokens.json` (the app's Light values), `docs/MODEL.md` (what the
app is) and the existing LifeOS canvas as reference. Light theme first; Abyss
(dark glass, `ABYSS-BRIEF.md`) is a theme applied to the same parts afterwards.

Why v3: since 4 Oct 2026 the app is built in three tiers (core → modules →
boards) and every screen is assembled from a closed list of **Field types**.
Design follows the same tiers, so nothing is drawn twice and every module gets
its screens the day it lands. The Abyss brief listed screens flat; this one lists
parts, then the screens made of them.

---

## Part 1 — the prompt (paste this)

> Design **LifeOS v3** (Light theme), my personal life-OS app for Android, the way it is now built. Attached: this brief, the app's tokens (light-tokens.json), its model (MODEL.md) and the previous canvas. Keep the direction that exists — calm bento, warm cream ground, stepped tile surfaces, one mustard accent, sage for done, coral only for late, big tabular numbers, small uppercase labels, thin stroke icons, no shadows or gradients — and design in **three tiers, in this order**:
>
> 1. **The Field type kit** (Part 2): fifteen Field types, each drawn in four places — a list row, the record page, the form input, a tile. This is the atom; everything else is assembled from it.
> 2. **The six generic screens** (Part 3): Overview, List, Record, Form, Metric, Links — designed once with a placeholder Object, so every module gets them for free. Show each with two real Objects (a Transaction and a Person) to prove the kit holds.
> 3. **The boards** (Part 4): Today, Upkeep, Dump, To check, Browse, You, and the **finance board** (Finance home, Spend, Investment record, Account record, Subscription record) as the first module with real data; then Turf, the first user board.
>
> Build constraints are in Part 5, tokens in Part 6, deliverables in Part 7. When a decision isn't covered, choose the calmer, more readable option and note it.

---

## Part 2 — the Field type kit (design these first)

A Field has a type; the type decides how it looks everywhere. Design one
treatment per type per place. Frame 390 dp; dp values against the tokens.

| Type | Row (list cell / trailing) | Record page (label + value) | Form input | Tile (Today / boards) |
|---|---|---|---|---|
| text | one line, truncated | label + value | single-line input | — |
| longtext | first line, muted | full text, markdown-ish | multiline, grows | — |
| number | tabular, right-aligned, unit small | value + unit | numeric keypad, unit suffix | big number + 7-point mini bars |
| money | tabular, ₹ prefix, out/in tone | amount + currency; foreign: original + INR | amount field with currency picker | big amount, delta chip, pace line |
| date / datetime | relative ("yesterday", "in 3 d") | relative + absolute | date / time picker | — |
| duration | "1h 20m" | h m | minutes stepper | ring (progress toward a target) |
| select / multiselect | chip(s), tinted by option colour | chip(s) | picker sheet with "Add …" | breakdown (stacked bar + legend) |
| boolean | tick / empty circle | Yes / No | toggle | checkbox pill |
| link | chip with the record's icon → opens it | chip(s); 1 = inline, many = row list | record picker (search, recent, "New …") | — |
| contact | tap to call / mail / open | value with action icon | input with the right keyboard | — |
| file | thumbnail / file icon | thumbnail or preview; cover image on the header | attach (camera / files) | — |
| location | pin + place name | map pin + address | search places / coordinates | — |
| meter | latest reading + unit, small trend arrow | latest + history sparkline + "Add reading" | reading + date | sparkline |

Also in the kit: the **record header** (icon orb, title, subtitle, status chip, 3
stats), **section card** and **section header** (title, meta, action), **row
item** with every trailing variant (value, chevron, chip, toggle, checkbox,
swipe-to-delete with Undo), **chip** states (default / selected / pressed /
disabled), **buttons**, **inputs** (focus / error), **segmented**, **stepper**,
**sheet**, **toast with Undo**, **empty state** (that names what to do), **To
check bell** with count, the **nav bar** with the raised Dump disc (brain).

Charts (all SVG in the app): sparkline, mini bars, column chart, line with a
comparison line, ring, stacked bar + legend, heat map (year), the Activity
grid (26 weeks, Mon on top), week circles (habits), timeline (events on a rail).

## Part 3 — the six generic screens (design once)

Every module gets these from its Objects' Fields. Design each with a
placeholder Object, then show it twice with real ones: **Transaction** and
**Person**.

1. **Overview** — the module's key numbers (3-across stat row), a trend (bars
   by month or days), one breakdown, "needs you" rows (overdue, guesses), then
   its Objects as rows with counts. This is what a module tile in Browse opens.
2. **List** — saved-view chips, search, filter / sort / group controls; rows
   from the Object's summary Fields; grouped by day or month with a group total
   where a money Field exists ("₹560 out"); swipe to delete with Undo; a board
   layout (columns by status) for Objects that have statuses.
3. **Record** — header; the Fields by section; **Cycles** (name, next due, Done
   / Snooze); **Events** (the timeline on a rail, system and life events, filter
   by kind); the **Links card** (every link grouped by link word, tap to open,
   "Link" to add) with "Around this record" (a small network preview) opening
   the Links screen; **Facts** (one-liners about this record, add one, long-press
   to forget); attachments; "Tell me about…" (speak an update into this record).
   Module overrides sit at the top (the hero) or as extra cards — show where.
4. **Form** — Fields by section with the kit's inputs; sensible defaults shown;
   link pickers; a sticky Save; the same screen for new and edit.
5. **Metric** — one number over time: Day / Week / Month / Year switcher, the
   big number, delta vs the previous period, the chart, a year heat map, the
   records underneath.
6. **Links** — the network around a record, 1–2 hops, nodes tinted by module,
   link words on the lines, tap to re-centre, long-press to open; a hop toggle.

## Part 4 — the boards (the product's face)

**Navigation:** floating pill bar, five items: **Today · Upkeep · Dump (centre,
raised disc, brain) · Browse · You**. Top-right of every tab: the **bell** (To
check) with a count.

### 4.1 Today
Greeting and date, then sections the user switches on / off and reorders:
**My day** (today in time order: all-day items first — tasks, upkeep, deliveries
with their **OTP**, bills — then timed events with a now line), **Progress**
(rings: steps, sleep, screen time, habits, tasks, spend vs usual), **Activity**
(a tracker grid), **Habits** (today list or this-week circles), **Steps**,
**Sleep** (1×1 tiles with 7-day bars), **Spend this month** (big amount, "more
than usual by today", cumulative line vs usual), **Done today** (two-column
grid), **Area cards** (one per module: number, line, 7-point mini chart,
two-up), **Upcoming**, **Screen time**, **People to call**, **Overdue**, **On
this day**. An empty state per section that names the permission ("No steps yet
— turn on Health Connect ›"). "Choose what's on Today" at the bottom.

### 4.2 Upkeep
Every Cycle from every module by due: overdue · this week · this month · later;
filter chips by module; a 7-day strip with checkable pills; Done / Snooze / Skip;
"This month will cost ₹…".

### 4.3 Dump
One box: type or hold to speak. Telling files; asking answers (an on-phone answer
at once, the fuller one when the model lands). Below: the last 15 days of dumps,
each with what it filed as chips (1 person · 2 facts · 1 task), per-item Undo,
and its state (filed · waiting, why · needs you).

### 4.4 To check
Everything filed automatically, grouped by where it came from ("Yesterday · HDFC
Bank SMS", "Email · rutvij@gmail.com", a dump quoted). Flagged guesses first.
Tick / edit / cancel per item; Tick all. Untouched items approve after 15 days.

### 4.5 Browse
Search across the whole app on top; **Boards** (Turf, Time, Spend, Activity,
Automations…) as a two-up tinted grid; **Modules** (the twelve) as the same grid
with counts; then Memory, Recent, Tags.

### 4.6 You
Data sources (each: permission, on / off, last sync, today's count; SMS senders;
Export for the parser; Sync all), Agent (providers, keys, daily budget), Categories
(colour, icon, rules, **monthly target**), Home screen (Today sections), Notifications
and quiet hours, Backup and restore, App lock, Appearance (Light / Abyss), Locale.

### 4.7 The finance board (first module with real data)
- **Finance home**: net worth (accounts + investments − liabilities), this month
  spent / received with the pace line, where it went (stacked bar + legend),
  **Targets** (per-category progress against the monthly target), subscriptions
  run-rate, recent payments, chips → Spend · Reports · Investments · Accounts.
- **Spend**: period chips (this month / last / 3 months / year / all), kind
  (spending / income / investments / everything), total with delta chip, by
  category (tap filters), account and word filters, sort, the list.
- **Reports**: month view, subscriptions run-rate, net worth over time.
- **Transaction record**: the generic Record with the **payee guess banner**
  ("Yes, Priya S" / "Not them") at the top, the split section, and the Source
  section (SMS · original text).
- **Account record**: balance hero, institution (a link to the bank), last-4,
  credit limit utilisation, its transactions.
- **Investment record**: hero — invested · now · gain (sage / coral), value
  sparkline from readings, SIP and maturity line, "Add reading"; its
  transactions.
- **Subscription record**: per-month / per-year / next renewal trio, price
  history, Renew-now, its charges.
- **Person record** (crm, but shows money): balance with them, splits, groups.

### 4.8 Turf (the first user board; design the pattern)
Turf keeps the flow of Turf Ledger, the web app it replaces on the phone
(`docs/MODEL.md` layer 3, *Turf*), drawn in these tokens; Turf Ledger's own
themes are not carried over. Its five sections sit in the board under the
LifeOS bottom bar:
- **Home**: money at a glance (games, collected, outstanding, games played),
  recent games, who still owes (₹147 chips with faces, a Settle up action).
- **Games**: Match centre (the upcoming match, counts, the last 13 weeks as a
  grid, a month calendar, day of the week) and Match history (filter paid /
  partial / unpaid, search).
- **+ New match**: venue fills format, cost and kick-off; pick players; shares
  split.
- **Players**: Squad (filters unpaid / clear and availability) and Leaders.
- **Venues**: your turfs and their defaults.
- **Match**: score, teams, captains; Payment checklist and Team view tabs.
- **Player profile**: the six-attribute chart, stats, kit colours,
  availability, their dues.
A record waiting to reach Turf Ledger shows *sending*. It is assembled from
games (matches, appearances, profiles, venues), crm (players, the Football
group), finance (shares in, debts) and places (the turf). Design it so the
same pattern serves a Trip planner and a Car board.

## Part 5 — how it will be built (constraints)

React Native 0.86 (Expo SDK 57), Android, edge-to-edge, 390 × 844 reference.
Icons are inline SVG, thin 2 dp strokes (Lucide geometry); no icon fonts, no
emoji. Charts are SVG. No shadows, gradients or glass in Light; Abyss adds its
materials on the same parts (see `ABYSS-BRIEF.md` Part 4). Every component must
exist in both themes; dark values are derived by us from the tokens.

## Part 6 — tokens

The app reads colours from the names in `light-tokens.json`: `bg` (ground, tile,
tileRaised, lowest, container, dim, bar, pressed, scrim, overlay, pill), `fg`
(primary, secondary, tertiary, onBar…), `line`, `ringTrack`, `rail`, `chart[5]`,
`accent` (mustard, mustardInk, mustardSoft, gold), `alert` (coral…), `ok`
(sage…), and module tints — finance, upkeep (things, deliveries), people, tasks,
health (health + habits), memory (notes), travel (+ places), documents — each a
fill and an ink. Type styles: display, stat, title, heading, rowTitle, body,
tileTitle, label, caption, labelCaps, labelMicro, nav. Radii: tile, card, sheet,
band, button, input, iconBox, checkbox, chip. Use these names; if a part needs a
token that does not exist, name it and give both values.

## Part 7 — deliverables

1. **Field type kit** (Part 2): one sheet per place (row, record, form, tile)
   with all fifteen types, plus the kit components and charts, in Light.
2. **Six generic screens** (Part 3), each with the placeholder Object and the two
   real Objects (Transaction, Person); empty / loading / error states where they exist.
3. **Boards** (Part 4): every screen listed, full scroll at 390 × 2×, with the
   Today sections' alternative looks, and states (empty with the permission named,
   waiting, late, done).
4. **Token additions**: any new token names with Light values (and a note on the
   Abyss value if obvious).
5. **Notes**: every decision this brief didn't cover; anything in the current
   Light theme you'd change to make the kit hold.

## Part 8 — check before you hand it over

- Every Field type appears in all four places; a module designer could build a
  new Object's screens from the kit alone.
- The six generic screens are shown with Transaction and Person and nothing in
  them is specific to either.
- Today's first screen shows My day, Progress and the first Activity grid.
- The centre button is Dump; no "Talk" anywhere; the network screen is called
  **Links**; "graph" means a chart.
- One mustard thing per screen; coral only for late; sage for done.
- Empty states name the permission or the action, never a placeholder number.
