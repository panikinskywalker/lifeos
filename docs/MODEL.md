# LifeOS — the model (single source of truth)

Started 1 Oct 2026 as the reset. This file says what exists in the app: the
words, the Objects, the modules, the inputs, the screens. Code must match
it; anything in code that is not described here is to be removed. It replaces
`ARCHITECTURE.md`, `GRAPH.md` and section C of `SCOPE.md` once complete.
Built one layer at a time; a layer is marked **agreed** or **proposed**.

## 1. Vocabulary — agreed 1 Oct, Object / Field / Record added 4 Oct

One word per concept. The right-hand column lists words that are retired from
docs, code and UI copy.

| Concept | Word | Retired |
|---|---|---|
| A storage unit: its name, fields, cycles, filing rules (Person, Task, Transaction) | **Object** | kind, type, entity type |
| A column on an Object (phone, birthday, amount) | **Field** | attribute, property, column |
| One row of an Object (Karan is a record of Person) | **Record** | entity, node, item |
| A typed connection between two records | **Link** | relation, edge, connection |
| A chart of a number over time (tile, Metric screen) | **Graph** / chart | — (never the network view) |
| The network picture around a record (its screen) | **Links** | graph view, life graph, links map |
| Something that happened at a time, attached to records | **Event** | timeline event, log |
| One line said in passing, about a record | **Fact** | Notes bullets, comment |
| Long-form text you wrote | **Note** | knowledge note |
| Raw input, verbatim, immutable | **Dump** | one box, talk message |
| Anything recurring on a record | **Cycle** | reminder, scheduled job, subscription-as-field |
| Where data comes from automatically | **Source** | connector, ingest |
| Turning input into records | **Filing** | extraction, ingest, parse |
| What filing isn't sure about | **To check** | review, queue |

Consequences:
- Everything stored is an Object. Core owns Link, Cycle, Event, Fact and Dump as
  Objects; modules own the domain Objects. One link between two records is a
  record of the Link Object.
- Two code-only exceptions, because TypeScript and the DOM own the plain names: a
  record in code is `ObjectRecord`, an event is `LifeEvent`. UI copy and docs
  say record and event.
- An Object is a definition, not necessarily its own table. Core decides storage
  (today: one shared table, Object fields in JSON). Nothing above core depends on it.
- The Link records across every module form one **context graph** (the
  enterprise-context-graph idea at personal scale): records are the nodes, Links
  the labelled edges, each with provenance (source, sentence, when, confidence).
  Filing writes into it, the Links screen draws it, and Talk answers by walking
  it one or two hops out from what search found.
- Comments are Facts (a Fact has a subject record, text, date, source).
- A one-off reminder is a Cycle with a single occurrence.
- A record's timeline is simply the Events linked to it, system ones included
  (created, edited, cycle done) and life ones (met, flew, serviced).

## 2. Objects — proposed; each module's Objects are decided in that module's milestone (layer 6)

Link, Cycle, Event, Fact and Dump are core Objects (Dump, Fact and Event are
also listed under Mind and Agenda below because that is where you browse them).
Every record of any Object has: title, created / updated, archived, tags,
attachments, and can carry links, facts, events, cycles and notes.

### People (module `crm`; Person agreed 22 Oct in R2)
| Object | Meaning | Key fields | Filed by |
|---|---|---|---|
| **Person** | Someone in your life | see below | you, dumps, contacts, call log, calendar, SMS/UPI payer match, Turf web |
| **Group** | A set of people (Goa gang, flat, family) | members, kind | you, dumps, splits |

Organisation is in the `places` module (decided 22 Oct, R3); see Places below.

**Person's Fields** (agreed 22 Oct). The keys stay as they were (`phone`,
`email`, `upi`, `relationship`…) so Turf web's sync and old backups keep working.
| Field | Type | Notes |
|---|---|---|
| Relationship | select, **you can add options** (30 Oct) | family · friend · partner · colleague · client · vendor / service · acquaintance are the defaults; "New…" in the form adds one you can reuse (Mentor, Neighbour), with its own colour |
| Phone | contact (phone) | tap to call; matched on its last 10 digits (contacts, call log, SMS) |
| Email | contact (email) | tap to mail; matched on calendar attendees |
| UPI IDs | text, comma-separated | the UPI ids you know (typed, from contacts, from Turf web); a payment from one is theirs for sure |
| Birthday | date, year optional | drives a yearly **Birthday** Cycle, 7 days' notice |
| Works at | link → Organisation, word "works at", **and** the typed text | the link when a record is picked; the text stays as the fallback (`company`) |
| Role | text | |
| Lives in | link → Place, word "lives in", **and** the typed text | as Works at (`city`) |
| Keep in touch | select cadence | off · every week · 2 weeks · month · 3 months · 6 months · year; drives the **Keep in touch** Cycle (old day counts snap to the nearest) |
| Last spoke | date | filled on its own by a call in the call log, an Event with them (met, call, a calendar meeting they are in, a dump), and a payment to or from them; it is the cycle's last done |
| Photo | file | the profile hero; from the phone contact |
| Likes | text list (chips, like UPI IDs; 30 Oct) | filter coffee, pottery, RCB; kept in step with the Likes section of your Notion pages (R2b); what gift ideas are drawn from |
| About | long text | was Notes; one-liners stay Facts |
| *(hidden)* contact id | source key | the phone contact it came from, so re-syncs fill gaps |

**Birthdays, decided 30 Oct with the NR-People designs; both come from the
brain (layer 8), so the People screens show their slot until it is built.**
- **Gift ideas**: a *coming up* nudge before a birthday; Claude suggests gift
  ideas from their Likes (with prices).
- **The wish**: on the day Claude drafts a wish; you pick a mood (Simple ·
  Funny · Warm), edit it and *Send on WhatsApp* opens WhatsApp with the text
  ready. LifeOS never sends by itself.

**Senders are aliases** (shared with Turf, decided 22 Oct): a payment sender
learned once ("Who is priya.s@okicici?") is kept in core's `aliases` table on
the Person, beside the UPI IDs Field. Matching a payment checks the UPI IDs,
then the aliases, then the name.

**Group's Fields** (agreed 22 Oct).
| Field | Type | Notes |
|---|---|---|
| Name | text | the title |
| Kind | select | home · trip · friends · family · work · sport (new; the Football group moves to sport once, Turf's sync still finds it by name) |
| Members | link → Person, many, word "member" | each member's default share and joined / left stay in core's `group_members` |
| Default split | select | equally · by shares; how a bill in this group splits unless you say otherwise |
| Place | link → Place, word "at" | where the group is (Flat 4B) |
| Photo | file | the group's cover |
| About | long text | was Notes |

**Organisation** is settled in **R3 places** (decided 22 Oct): it stays in the
`places` module and R3 decides its Fields. People only links to it (a Person
works at one, a Transaction's payee is one) and payee matching reads its UPI
ids as R3 leaves them.

### Things
| Object | Meaning | Key fields | Filed by |
|---|---|---|---|
| **Asset** | Something you own, vehicles and clothes included | category (vehicle / device / appliance / clothing / …), bought on, price, vendor → Organisation, warranty cycle, meter readings (km) for cycles by meter, serial, location → Place, kept in → Space, a clothing state; see below | dumps, you, mail receipts |
| **Document** | ID, policy, contract, certificate; or any file in a folder you pick | see below | your folders, you, dumps, mail |
| **Delivery** | A parcel on its way | shop → Organisation, carrier, tracking, expected, status, OTP, order → Transaction link | SMS, mail |
| **Stock** | Something kept at home that runs out or goes off (butter, detergent, a medicine) | see below | you (one line, the form), a shared order invoice, dumps |
| **Space** | A part of Home that holds Stock and Assets (Fridge, Clothes) | see below | the seven defaults, you |

**Stock and Space** (module `inventory`, shown as **Home**; Fields agreed 30 Oct
with R7e, from layer 8 and `docs/design/HOME-BRIEF.md`). They replace the old
`item` Object: the records you had are folded into Stock once, on first open.

**Stock's Fields** (Object id `stock`). One record per product per space:
buying it again adds to the same record, and each purchase is a *bought* Event
on its timeline (when, how many, price, the order), which is what the rate
learns from.
| Field | Type | Notes |
|---|---|---|
| Name | text (the title) | "Amul butter"; matched with sizes and case ignored ("Amul Butter 100g" is the same product) |
| Size | text | "100 g", "1 L", "strip of 15" |
| Quantity | number, in halves | how many you have (×2); *used up* takes one off, *half left* halves the last one; 0 is used up |
| Space | link → Space, word *kept in* | the pill's page |
| Bought on | date | the latest purchase |
| Life | number (days) + whose: **estimated** · **yours** | how long it keeps once bought. Estimated from a table of shelf lives by name in code until the brain gives better (milk 3 d, paneer 4, butter 30, atta 90…); yours when you correct it, and yours stays on the product from then on. Empty for things that don't go off (salt) |
| Rate | number (days), **learned** | how long one lasts you: the median of the last five spans from a purchase to when it was used up or bought again; empty until it has been bought twice, or bought and used up |
| Source | select | order · receipt · you; an order also names its **shop** (Blinkit · Zepto · Instamart · BigBasket · other) |
| Order | link → Transaction, word *bought in* | the latest order's payment, when finance has one |
| Price | money | what the latest one cost (from the invoice) |
| On the list | boolean | you put it on the shopping list |
| Checked on | date | *still good*: you looked and it's fine |
| Notes | long text | |

**State** is derived, not stored (it changes every day on its own):
- **used up**: quantity 0. It leaves its space (with Undo) and stays a record,
  so the rate, your life and the shopping list remember it.
- **probably gone**: its life has passed since bought on. LifeOS can't see
  you eat it, so it waits for you (faded).
- **use soon**: in the last 2 days of its life, or the last tenth of a long one
  (a medicine's last 50 days).
- **fresh**: otherwise, and always for things with no life.
- *Still good* on a use-soon or probably-gone thing sets *checked on*: it
  counts as use soon for 2 more days, then probably gone again.

**A rebuy** adds to what is left, unless what was left is probably gone or
its rate is nearly up (80 %): LifeOS never sees things used up, so then it
assumes the last one ran out.

**Running low** is the rate's, apart from state: a thing with a rate, one or
less left, and its rate nearly up ("every 3 wk · 18 d", from 3 days before),
or half of the last one left. Used-up things you rebuy stay on the shopping
list as LifeOS's suggestions.

**Space** (Object id `space`), **a small Object, not a setting** (decided 30
Oct): Clothes are Assets in another module, and modules reach each other only
through Links, so an Asset is *kept in* a Space the way a Person *works at* an
Organisation; a Space is also found by search ("fridge" opens it), and
renaming one keeps everything in it.
| Field | Type | Notes |
|---|---|---|
| Name | text (the title) | Fridge · Freezer · Kitchen · Cabinets · Clothes · Bathroom · Cleaning are made once; add, rename and reorder your own |
| Icon | select | fridge · snow · pot · cabinet · shirt · drop · spray · box |
| Order | number | Fridge and Kitchen first |
| Holds | select | stock · clothes (Assets, R7a) |

Spaces are hidden from Browse's record lists; Home draws them.

**Asset** (module `assets`, Object id `asset`; Fields agreed 31 Oct with
R7a). The old `vehicle` Object folds into it (see *Retired*). Fields that
belong to one category sit in their own section of the form.
| Field | Type | Notes |
|---|---|---|
| Name | text (the title) | "Hyundai Creta", "MacBook Pro 14", "Blue linen shirt" |
| Category | select | vehicle · device · appliance · clothing · furniture · jewellery · property · other; *electronics* becomes device once |
| Bought on | date | |
| Price | money | what it cost |
| Current value | money | what it is worth now (Things worth on the Overview) |
| Vendor | link → Organisation, word *vendor* | where it was bought; was a link to a Person, those Links stay |
| Warranty until | date | drives the **Warranty** Cycle (fixed, 30 days' notice) |
| Serial | text | serial or model number |
| Where | link → Place, word *at*, **and** the typed text | the link when a Place is picked; the text (`location`) stays as the fallback, as Person's Lives in |
| Kept in | link → Space, word *kept in* | a Space in Home (layer 2, Space); clothing goes to Clothes |
| State | select, clothing | clean · in the wash · packed (default clean); on Home a tap cycles clean → in the wash → clean, a packed one comes back clean; packing for a trip (R7d) sets packed |
| Service every | number (months) | drives the **Service** Cycle; a vehicle's default is 6 months |
| Service every (km) | number, vehicle | default 10,000; with months, whichever comes first |
| Next service | date and km | written back by the Service Cycle |
| Registration | text, vehicle | the number plate |
| Odometer | meter (km), vehicle | the latest reading; readings drive the Service Cycle by km |
| Fuel | select, vehicle | petrol · diesel · electric · hybrid · CNG |
| Notes | long text | |

Statuses: owned · sold · lost / broken. **Cycles**: Warranty, Service (by
months, by km, or either). A folded vehicle keeps its **Insurance** and
**PUC** renewals as Cycles on the Asset, as they were; whether they become
Documents (R7c) is open.

**Document** (module `documents`; Fields agreed 2 Nov with R7c). LifeOS does not
keep its own copy of your papers: **you pick folders on the phone once**
(Android's folder picker: Documents, Download, a Scans folder) and every file in
them is a Document that **points at the file where it already is**. Nothing is
copied; what LifeOS adds (kind, expiry, tags, links) lives on the record.

| Field | Type | Notes |
|---|---|---|
| Title | text | from the file name when found in a folder ("Car insurance 2026"), yours to change |
| Kind | select | ID / passport · insurance · contract / lease · receipt / invoice · ticket / booking · medical · tax · certificate · other; guessed from the name and the text, yours to change |
| Reference number | text | |
| Issuer | text | the typed name (an Organisation link later) |
| Issued | date | |
| Expires | date | drives the **Renew** Cycle (180 days' notice for an ID, else 30) |
| Person, Trip, Asset | link | what it is about; words `person`, `trip`, `asset` |
| File | file | where it lives: the folder's link to it, name, type, size, last changed, and which picked folder; tap opens it in the phone's own viewer |
| Notes | long text | |

Not shown, for search only: the **text inside** a PDF, read on the phone
(PdfBox), up to 20,000 characters; it never leaves the phone. A scan has none.

Statuses: **new** (found in a folder, not looked at yet) · **filed** · **missing**
(the file has gone from the folder). One made by hand is filed.

**Your folders** (Documents › Your folders):
- Picked once each; Android remembers the access. Remove one and its new Documents
  go; the ones you filed stay, marked missing (the files are not touched).
- **Rescan** when the app opens and on Rescan now: a new file is a new Document
  (status new); a renamed or moved one inside your folders is found again by
  name and size and keeps its record; a deleted one becomes missing, never
  silently gone. Subfolders are included, five deep.
- A few PDFs' text is read on each rescan (15), so a first scan of many files
  stays quick.
- A file shared into LifeOS is only lent for a moment, so it is not indexed;
  save it into one of your folders.
- Backups keep the Documents (kind, expiry, tags, links), not the files.

### Money
| Object | Meaning | Key fields | Filed by |
|---|---|---|---|
| **Account** | Bank, card, cash, wallet, investment, loan | kind, last-4, currency, opening balance, limit | SMS discovery, you |
| **Transaction** | Money moved | amount, currency (+ INR value), direction (out / in / transfer), when, account, payee → Organisation or Person, category, raw text, source | SMS, notifications, mail, dumps, cycles done |
| **Debt** | I owe / owes me, from a split or a loan | counterpart → Person, amount, from → Transaction, group, settled by → Transaction | dumps, splits |

Not Objects: **Category** is a setting (name, colour, rules, monthly target).
**Subscription** is a Cycle on the Organisation (or Asset) it pays for, with
cost and auto-posted Transaction; the Subscriptions report lists those cycles.
**Budget** is the monthly target on a Category.

### Body
| Object | Meaning | Key fields | Filed by |
|---|---|---|---|
| **Measurement** | One reading of a metric | metric (steps / sleep / heart rate / weight / water / custom), value, unit, when, source | Health Connect, dumps, you |
| **Workout** | A session | type, duration, distance, calories, when, source | Health Connect, dumps |

Screen time is a Measurement too (metric = screen time, with per-app
breakdown in data), filed by Usage access.

### Mind
| Object | Meaning | Key fields | Filed by |
|---|---|---|---|
| **Dump** | What you said, verbatim, immutable | text, when, source (typed / voice / shared), subject record (optional), filing state | you |
| **Note** | Long-form text, markdown, `[[links]]` | kind (idea / journal / meeting / reference), body | you, dumps |
| **Fact** | One line about a record | subject, text, when, source, confidence, active | dumps, you, filing |

### Places (module `places`; Objects and Fields agreed 22 Oct, R3)
| Object | Meaning | Key fields | Filed by |
|---|---|---|---|
| **Place** | Somewhere you go | kind, address, coordinates, parent → Place, maps link, notes | dumps, calendar, mail, Turf |
| **Organisation** | A company, shop, bank, payee | see below | SMS, mail, dumps, you |

**Place** (Object id `place`), agreed 22 Oct:
| Field | Type | Notes |
|---|---|---|
| kind | select | home · work · city · country · area (neighbourhood) · restaurant / café / bar · venue (turf, ground, hall) · gym · shop · stay (hotel, Airbnb) · airport / station · other. `venue` is what Turf files. |
| address | text | as written ("80 Ft Rd, Koramangala 4th Block") |
| coordinates | location | the map pin |
| parent | link → Place, word *in* | Koramangala *in* Bengaluru *in* India; replaces the old city and country text Fields, which become parent Places on first open (a city in its country) |
| maps link | contact (url) | a Google Maps / Apple Maps link, tap to open |
| notes | long text | |

Derived, not Fields: visits (Events linked *at* the Place), last been, what was
spent there (Transactions whose payee is an Organisation *at* the Place), the
Places inside it.

**Places and travel stay apart** (decided 30 Oct). A Place is *where*
something is and has no dates (Toit, the gym, Goa); a Trip is *going
somewhere for a while* (Goa, 20–24 Dec: dates, companions, budget, spend) and
stays in `travel` (R7d); a planned tour is a Trip with status planning. They
meet through Links only: a Trip's destination → Place (R7d turns today's text
into the link), its stays and flights *at* their Places. Once that link
exists, a Place's page shows **Trips here**. A Trip planner stays a candidate
board (layer 3).

**Organisation** (Object id `org`), agreed 22 Oct:
| Field | Type | Notes |
|---|---|---|
| kind | select | employer / company · shop / brand · restaurant / food · bank / card / broker · service (telco, utility, insurer, app) · airline / travel · school / college · club / gym · payee (not sure yet) · other. Finance files `payee`, `shop` and `bank` on its own. |
| UPI ids | text | comma-separated, as finance learns them from payments |
| website | contact (url) | its domain files mail from that sender to it |
| phone | contact (phone) | |
| place | link → Place, word *at* | the branch you go to (Toit *at* Indiranagar) |
| notes | long text | |

No category Field: finance's payee rules already learn the category per payee.
Person's company becomes a link to an Organisation (*works at*) in R2.

### Agenda (Event, Task, Project in module `projects`, shown as Projects; Trip is `travel`'s, Habit is `habits`'; the day / month / year view keeps the name Time)
| Object | Meaning | Key fields | Filed by |
|---|---|---|---|
| **Event** | Something that happened or will | kind (met / call / flight / stay / service / meeting / check-in / created / edited / cycle done …), start, end, roles → records, kind-specific fields | everything |
| **Task** | Something to do | due, done, priority, project → Project, people | dumps, you, mail |
| **Project** | A set of tasks and events with an aim | status, target date, spend (derived) | dumps, you |
| **Trip** | Travel with dates, people and spend | destination → Place, dates, companions, budget, currency | dumps, mail, calendar |
| **Habit** | Something you do on a rhythm, chores included | cadence (daily / weekdays / N per week / every N weeks / weekday), kind (habit / chore), minutes; check-ins are Events; streaks where cadence is daily-ish | dumps, you |

**The module's name** (checked 31 Oct, R4): layer 3 and R4 call it `projects`
and so does the code, so `projects` stands; *Agenda* is this group's name in
this layer only. Its board is **Projects**.

**Two kinds of Event** (as the code has them, 31 Oct). Core keeps every
record's timeline (created, edited, status, cycle done: the `events` table,
`LifeEvent` in code). An Event you can open, edit and link (a meeting, a
dinner, a flight) is a record of the Event Object, which `projects` declares
because it has Fields and a form. Joining the two is not R4.

**Event's Fields** (Object id `event`; R4, 31 Oct). Keys unchanged.
| Field | Type | Notes |
|---|---|---|
| Title | text | |
| Kind | text, an open list | met · call · meeting · flight · stay · reservation · check-in; `event` from the calendar. Modules file their own (travel: flight, stay; places: reservation), so it stays text, not a select |
| Starts | datetime (`startAt`) | |
| Ends | datetime (`endAt`) | |
| All day | boolean | |
| Location | text | as written; places links the Event *at* its Place (R3) |
| *at* | link → Place | a Link made by places' filing from Location, not a Field |
| *with* | link → Person | from the calendar's attendees and dumps; moves their last spoke (R2) |
| People | link → Person, many, word *person* | picked in the form; also moves last spoke |
| Project | link → Project, word *project* | **new**: an Event can belong to a Project, as a Task does |
| Trip | link → Trip | as before |
| Airline, Flight no. | text | travel's, for flights |
| Cost | money | |
| Notes | long text | |
| *(hidden)* source, source key, calendars | | `calendar` and the calendar key, so a re-sync updates in place; which of your calendars it is on |

**Task's Fields** (Object id `task`; R4, 31 Oct). Keys unchanged.
| Field | Type | Notes |
|---|---|---|
| Title | text | |
| Status | to do · doing · done · blocked | as before |
| Due | date (`dueDate`) | drives the task's **Due** Cycle: a one-off Cycle, so the task is in Upkeep and is *overdue* there like any Cycle |
| Repeats | select (`repeat`) | **new**: never · every day · every week · every 2 weeks · every month · every 3 months · every year. Makes the Due Cycle repeat on the calendar: *done* logs a cycle done Event and moves Due on, and the task stays open |
| Priority | select | low · medium · high · urgent |
| Project | link → Project, word *project* | |
| People | link → Person, many, word *person* | |
| Estimate | number (minutes) | |
| Notes | long text | |
| *(hidden)* done on | (`completedAt`) | when it was last ticked |

A done task's Cycle leaves Upkeep (`cycleActiveStatuses`); undone, it comes back.

**Project's Fields** (Object id `project`; R4, 31 Oct). Keys unchanged.
| Field | Type | Notes |
|---|---|---|
| Title | text | |
| Status | planning · active · on hold · done | as before |
| Aim | long text (`description`) | was Description |
| Target date | date (`dueDate`) | |
| Area | select | work · personal · home · side project · learning |

Derived, not Fields: **progress** (tasks done of all), **overdue** (its open
tasks past due), **next** (the soonest open task), its Events, and **spend**
(the money of Transactions linked to the Project, read through Links only).

**The fold** (once, on first open after R4): open tasks with a due date get
their Due Cycle (the templates backfill has already run on the phone, so it
would not add them). No other record changes.

**Goal is dropped** (decided 31 Oct, as *Retired* says). Each goal becomes a
Project once, on first open, in place (same id: links, tags, Facts and
timeline stay): target date → target date, why it matters → Aim, its numbers
(6,40,000 of 10,00,000 ₹) → a Fact on it; area career → work, learning →
learning, the rest → personal; active → active, achieved → done, dropped →
done and archived. A task toward a goal is in that Project when it had none;
when it had one, its *goal* Link becomes *related*. Task's Goal Field goes.

### Games (module `games`, agreed 17 Oct, revised 20 Oct; feeds the Turf board)
The football you already run in **Turf Ledger**, your web app
(github.com/panikinskywalker/Turf-App: Cloudflare D1 + R2, hosted and
signed in by OpenAI Sites). **Since 20 Oct (plan 2, revised the same day for
the iPhone)** the whole app is rebuilt as ours: **Turf web**, on your own
Cloudflare account, holds the one true copy of every game, share, payment,
player, venue and stat (layer 4, *Turf web*). The full organiser flow is in
the Turf board in LifeOS on the S22, which keeps a synced copy and works
offline, and in Turf web itself, signed in, on your iPhone. Friends use Turf
web's public pages. Turf Ledger's data comes in once, at the switch, with
every record keeping its Turf Ledger id, so the links your friends already
have can keep working. Until the switch, Turf Ledger stays as it is and you
keep adjusting it.
| Object | Meaning | Key fields | Filed by |
|---|---|---|---|
| **Game** | One match | when (date + time), venue → Venue, format (side size), total cost, expected players, payment terms (tentative / prepaid / advance paid / postpaid), advance, fronted by → Person, score A–B, team colours, captains → Person, man of the match → Person, goal data quality, share link | Turf Ledger, you |
| **Appearance** | One player in one game | game → Game, player → Person, share (money), amount paid (money; part payments; over the share is a credit), paid, paid on, RSVP, attendance (confirmed / late / no-show), team (A / B), position, goals, assists, saves, played in goal | Turf Ledger, you, a matched SMS |
| **Player profile** | Your football view of a person | person → Person, positions (main, second, comfortable), preferred foot, speciality, playing style, starting level, ability, the six attributes (pace, stamina, defending, passing, dribbling, shooting), keeper willing and rating, jersey number, kit colours, boots, favourite player, clubs and countries supported, availability (regular / window only; all week / weekdays / weekends; available / injured / out of station, with periods), photo, share link | Turf Ledger, you |
| **Venue** | A turf you book | place → Place, usual kick-off, format, usual cost, payment terms, advance, maps link, photo | Turf Ledger, you |

Players are **Persons** (crm; name, phone, email, UPI from Turf Ledger's
payment id) and members of the **Football** Group; a Venue's location is a
**Place**. The football detail stays in games, so People stays clean.

**Money.** A payment is an entry, never a tick: "+₹147 from Priya for Sat's
game", with who recorded it, where (LifeOS, iPhone, a matched SMS) and when;
a refund or a correction is its own entry. A share's amount paid is the sum of
its entries: part payments are allowed, more than the share is a credit, and
the person who fronted the cost counts as paid (Turf Ledger is adding part
payments on 20 Oct: `amount_paid_cents`, a financial audit, no removing a paid
player without a refund; its amounts become opening entries at the switch).
Entries from two phones both count and never overwrite each other; the list
of entries replaces Turf Ledger's payment and financial audit logs. In LifeOS
each entry is an Event on the Appearance.
Turf Ledger's `transactions` table is not written by the app, so nothing is
imported from it as Transactions; your bank SMS already files the ₹147s, and
importing them again would count them twice. Instead:
- What is still owed on a share between you and someone is a **Debt** (they
  owe you when you fronted; you owe when someone else did; nothing when
  neither is you). "Which player is you" is a Turf board setting. The Debt
  links to its Appearance, goes down with each payment and is settled at zero.
- A money-in Transaction is matched to a player by its **sender**: the UPI id
  or the sender text in the SMS. The first time a sender is seen you are asked
  once ("Who is priya.s@okicici?"); the answer is kept as an alias on that
  Person, so every later message from it is known, for finance as well as
  Turf (decided 22 Oct). Players' UPI ids from Turf web count as known from
  the start.
- **Sure → recorded on its own**: a known sender in the Football group, the
  amount exactly what they owe (one share or their total; several shares are
  paid oldest first), arriving in the days after the game, and only one player
  fitting. The payment entry is made on the Appearance, the Transaction linked
  to it, the Debt lowered, and the entry sent to Turf web; it shows in
  **To check** as filed, with Undo.
- **Otherwise asked in To check**: a new sender, an amount that is off (a part
  payment, a round-up), one person paying for others, or more than one player
  fitting: "Priya paid her ₹147 for Sat 19 Sep?" Yes records it as above; a
  smaller amount is offered as a part payment.
- Before recording, LifeOS checks the share against Turf web's latest copy: a
  share already paid there is never paid twice; the Transaction is offered as
  the proof of the payment already recorded.
- The proof stays on the phone: the SMS and its Transaction live only in
  LifeOS (finance). Turf web gets the payment entry alone (amount, who, when,
  "matched SMS, LifeOS"), never the message.

**The whole organiser flow is in LifeOS and in Turf web signed in** (layer 3, *Turf*): new and edited
matches, shares and payments, attendance, scores and goals, teams and the
team generator (Turf Ledger's `lib/team-balance.ts`, ported to games),
captains and player of the match, players and their profiles, availability,
venues, leaders, WhatsApp shares, reviewing what friends submit.

### Design follows the same tiers (added 5 Oct)
Design is assembled the way the code is: the **Field type kit** (each type in a
row, on the record page, as a form input, as a tile), then the **six generic
screens** drawn once, then the **boards**. Each module milestone includes its
board's design.
**Since 22 Oct the design language is v3 Noir**: the *v3 Noir* page of the
Claude Design canvas (artboards `NR-*`: Today, the kit, the Field type kit),
which Rutvij extends as features are added; `docs/DESIGN.md` has its tokens.
Earlier briefs (`docs/design/MODEL-BRIEF.md` Light, `ABYSS-BRIEF.md`) are
history.

### Field types — proposed 4 Oct

A closed list. Every Field on every Object has one of these types, and each
type carries three things: how it renders (list row, record page, form, tile),
how it queries (filter, sort, aggregate), and how filing fills it from text,
SMS, mail or a device reading. A module's screens are derived from its schema;
it overrides only where the default is wrong (a hero chart on Measurement, the
large OTP on Delivery).

| Type | Example | Render | Query | Notes |
|---|---|---|---|---|
| text | title, Document number | one line | search, equals | |
| long text | Note body | markdown | search | |
| number | steps, quantity | value + unit | sum, avg, buckets | unit on the Field |
| money | Transaction amount | amount + currency | sum by period / category | INR value stored alongside |
| date / datetime | birthday, when | relative + absolute | day / week / month / year buckets | |
| duration | workout length, Habit minutes | h m | sum | |
| select / multi-select | direction, Event kind | chip | group by | options fixed per Object, unless the Field lets you add options (each with its own colour, stored as a setting like Categories; R2, 30 Oct) |
| boolean | Task done | tick | count | |
| link | company → Organisation | chip, opens record | related to | to one Object, or to any; stored as a Link record |
| contact | phone, email, URL | tap to call / mail / open | equals | |
| file | Document scan, receipt | thumbnail / preview | has file | |
| location | coordinates on Place | map pin | near | |
| meter | odometer | latest + history | delta | drives cycles by meter |

### Retired from today's code
| Was | Becomes |
|---|---|
| `vehicle` | Asset, category vehicle, with meter readings (R7a, 31 Oct); your records folded in once (plate → registration, service cycle and readings kept, insurance and PUC stay as Cycles, spends linked to it stay linked) |
| `item` (inventory) | Stock (R7e, 30 Oct); your records folded in once (location → a Space, expires → your life, restock-below → on the list) |
| `routine` | Habit, kind chore |
| `habit_log` | Event, kind check-in |
| `subscription` | Cycle on an Organisation or Asset |
| `budget` | monthly target on a Category setting |
| `goal` | dropped (31 Oct, R4): each goal folded into a Project; activity goals are parked in ADHOC |
| `org` with payee / merchant / shop kinds | Organisation, one kind field |
| comments | Facts |
| reminders table | Cycles |

Count: 19 domain Objects, down from 25 kinds plus two side tables; 23 with
the four games Objects added 17 Oct; 25 with Stock and Space (R7e, 30 Oct).

## 3. Three tiers: core, modules, boards + automations — agreed 4 Oct

### Core (plumbing, no domain data)
Knows what a Record, Link, Fact, Event, Cycle and Dump are and how they are
stored, searched, backed up and undone. Runs the filing pipeline and To check.
Defines the Source contract. Owns the Objects every module uses: Link, Cycle, Event, Fact, Dump.

### Modules (one domain of data each; built, tested and shipped one at a time)
A module declares:
- its **Objects** with fields and the cycles they can carry (layer 2);
- its **filing rules**: how a sentence, SMS, mail or device reading becomes its records;
- the **sources** that feed it (SMS → Money, Health Connect → Body, contacts → People);
- its **AI tools**, read and write (balances, spend by category, streaks, who
  owes whom; log spend, split a bill), with confirm / describe where money or
  people are involved; called by the model in Talk and filing, and by boards;
- nothing visual beyond field definitions; Browse renders a default list /
  record / form for every module, so a module is usable the day it lands.
Rules: a module never imports another module. It reaches other modules' records
only through core Links (a Transaction links to a Person; Finance does not know
what a Person is).

**The modules (decided 4 Oct: all twelve existing data modules stay):**
`finance` (Account, Transaction, Debt, Subscription, Budget, Group) · `crm`
(Person) · `projects` (Task, Project, Event; Goal dropped in R4) · `travel` (Trip) · `assets`
(Asset; Routine until R5) · `inventory` (Stock, Space; shown as Home since R7e) · `documents` (Document) · `health`
(Measurement, Workout) · `habits` (Habit, Habit log, Routine) · `knowledge`
(Note) · `places` (Place, Organisation) · `deliveries` (Delivery). `dashboard`
and `automation` own no data and become boards. Added 17 Oct: `games` (Game,
Appearance, Player profile, Venue; layer 2), for the Turf board. Later as
wanted: … Each module's Objects and Fields are settled in its
own milestone (layer 6), not before.

### Boards (the top tier: what you see on screen)
A screen, or a set of screens, that connects modules into a purpose. It owns screens, tiles,
charts, reports and its own settings, and defines **no Objects**; if it needs a
new Object, that is a new module. It may add filing hints scoped to itself
(e.g. "₹147 in from someone in the Football group is a turf share").
- **Turf**: People (players, Football group) + Money (shares in, who owes) +
  Places (the turf) + Games (matches). Keeps Turf Ledger's flow, which you are
  used to (agreed 17 Oct), drawn in the LifeOS redesign:
  - **Home**: money at a glance (games, collected, outstanding, games played),
    recent games, who still owes (follow-ups).
  - **Games**: Match centre (the upcoming match, counts, the last 13 weeks as
    a grid, a month calendar, day of the week) and Match history (filter paid /
    partial / unpaid, search venue or player).
  - **+** (new match): venue fills format, cost and kick-off; pick players;
    shares split.
  - **Players**: Squad (search; filter unpaid / clear and by availability)
    and Leaders (goals, assists, saves, wins, appearances).
  - **Venues**: your turfs with their defaults.
  - **Match**: score, teams and captains; *Payment checklist* (tick paid,
    attendance) and *Team view*.
  - **Player profile**: attributes chart, stats, kit colours, availability,
    their dues.
  Those five sections are the board's own; the LifeOS bottom bar stays.
- **Today** and **Upkeep**: boards over every module, pinned to the bottom bar.
- **Time**: what happened in a day / month / year, over every module.
- Candidates: Trip planner (Agenda + Money + People + Places), Car (Things +
  Money + Documents), Household (chores + shared bills).

### Automations (the top tier's other half: what the app does on its own)
A Board connects modules for *seeing*; an Automation connects modules for
*doing*. Think UnifyApps / Sprinklr workflows, or Apple Shortcuts. User-built,
from the same building blocks modules expose.
- **Trigger**: anything in any module — a record created or changed, a cycle due
  or done, a message filed, a time, a place reached — or a **manual run** from a
  button on Today / Browse or a sentence in the Dump box ("run month close").
- **Conditions** on the triggering record or on anything looked up.
- **Steps**, chained, each step's output available to the next: create / update
  a record, link, roll a cycle, post a transaction, notify, ask the model, wait,
  branch.
- **Run log** with inputs and outputs per step; retry; run now; enable / disable;
  templates (big spend flag, document expiry, subscription auto-post, contact
  nudge, km-based service, turf share collected → debt settled).
Modules contribute triggers and actions through their Objects and Cycles, never
UI. Core runs the engine (the existing When / If / Then engine with its loop
guard, extended to multi-step with data passing, manual runs and a model step).

Dependency direction, strictly one way: boards and automations → modules → core.
## 4. Inputs: sources and filing — proposed, revised 4 Oct

Three ways in. Only what you say becomes a Dump.

### Readings (structured, from a device or service)
Health Connect, Usage access, contacts, calendar, call log. A reading becomes a
record directly: Measurement, Workout, Event, or fields on a Person. Stamped
with its source and the source's own id, so re-syncing never duplicates. No
model, no To check.

### Messages (text from a source: SMS, payment notifications, mail)
Parsed directly by per-sender parsers on the phone → record (Transaction,
Delivery, Event…). The raw text is kept as a Field on that record, so a misparse
can be corrected and taught; raw text is cleared 60 days after filing, the record
stays. A message no parser understands is a **leftover**: kept, listed in To
check, and offered to the model when one is available. The parsers are trained
over time by per-sender rules plus what you teach: category rules, payee
aliases, trusted senders. The model path for messages should shrink toward zero.

### Dumps (what you type, say or share)
Stored verbatim as a Dump, then filed. Every record, link, fact and event filed
from it keeps the sentence it came from. **Dumps are cleared after 15 days**;
what was filed from them stays, with that sentence as provenance.

### Filing a dump, in order
1. **The sentence parser** on the phone, no network, for everyday sentences
   (did X, spent N on X, X paid me, remind me, add a chore…).
2. **The model**, only for what the parser didn't finish: the free chain, given
   the Objects' schemas as its tools, so it can only fill Fields that exist. Long
   dumps split; progress kept per chunk; never re-files what is already filed.
3. **Identity**: aliases → exact title → same-dump context → fuzzy match, per
   Object. A low-confidence match is a flagged guess, never a silent merge.
   "I / me" is never a record.
4. **Write with provenance**: every write remembers its sentence and what it
   replaced. Undo reverses exactly one write.
5. **Confidence** decides: sure → filed; a guess → filed and shown in To check;
   nothing parsed and no model available → *waiting* with why and when.

States of a dump: filed · partly filed · waiting (why, until when) · needs you ·
failed (bad model output only; never for lack of a provider). Untouched To
check items auto-approve after 15 days.

### Training the message parsers
No model is trained; the parsers are rebuilt against your real texts.
1. **Export** from the phone (You › Data sources › Export for the parser): the
   last 12 months from every inbox — SMS, Gmail (the mail the app fetches:
   receipts, alerts, statements, tickets), payment notifications — one-time
   codes, promotions and personal senders left out, each with what the parser
   read, what the app filed, and **your corrections** (category changes, "not
   them" on a payee, amounts fixed in To check). It leaves the phone only through
   the share sheet to the Mac.
2. **Rebuild on the Mac**: every text is a fixture; corrections are the expected
   answer; misreads become sender rules or merchant cleanups; unread texts are
   the gap list.
3. **Ship**; the next export shows what is still unread.
The same loop applies to mail and payment notifications.

### The Source contract
Each source declares: id, the modules it feeds, the permission it needs,
`sync(since)` returning readings or messages, and its state (enabled, last
sync, count today, last error). You › Data sources lists them with one
"Sync all". Sources: you (typed / voice / share), SMS, payment notifications,
Health Connect, Usage access, contacts, calendar, call log, Gmail (IMAP).

### Notion: your People CRM, kept in step (agreed 24 Oct)
Your People CRM in Notion and People in LifeOS keep each other up to date: a
change in either is stored in the other. It is crm's **notion** source, one
that also writes (the Turf web pattern: changes wait in `os.outbox` and send
when online). Decided 24 Oct:
- **Everyone, both ways.** Every Person in LifeOS has a page in the Notion
  database and every page there is a Person (payees and Turf players
  included). A page is matched to a Person by its Notion id once known, before
  that by phone, email or a unique name (as contacts and Turf do), never
  making a second Person.
- **Newest edit wins, per Field.** When both sides changed the same Field
  between syncs, the later change is kept and the other is shown once in
  To check, so nothing is lost silently.
- **Beyond the Fields**, LifeOS also writes last spoke and keep in touch, the
  balance (owes you / you owe), Facts as notes on the page and the timeline
  (calls, meetings, payments) as a log, *placed to fit your database's
  layout*, decided once it has been read.
- **Never the original** (decided 30 Oct): LifeOS never writes to your
  existing Contacts database or its pages. All of R2b, the Likes sync
  included, targets a duplicate: **📇 Personal CRM (1)**
  (https://app.notion.com/p/40991ce13f8281bba4dff0ff4d0d830d, under Pipeline ›
  Beta; its Contacts database is `collection://d5691ce1-3f82-8389-945f-87d26161f264`),
  made 30 Oct with all 83 people. LifeOS is pointed at that one; the original
  (`collection://90150d9b-31a4-46dc-84ad-280e5388783b`) is only ever read.
- **The phone talks to Notion** with an internal-integration token you paste
  once (You › Data sources › Notion; kept in the secure store, like Turf
  web's key) and the database shared with it.
- **The database** (read 24 Oct): *Pipeline › Beta › Personal CRM ›
  🫂 Contacts*, 83 people; properties Name, Associations (multi-select),
  Birthday, Last Contacted, Last Update? (one line), Status (a formula); every
  page from one template (How do I know them, Address, Family members, Likes,
  Gift ideas, About them / Miscellaneous notes, Life Updates, Lore). No phone,
  email or UPI on any page, so the first match is by name.
- **The mapping** (agreed 24 Oct):

  | Notion | LifeOS | How |
  |---|---|---|
  | Name | the Person's title | exact name; an unsure match is asked once in To check |
  | Last Contacted | Last spoke | the later date wins both ways |
  | Birthday | Birthday | month and day only: Notion's year is a placeholder (2024 / 2025), so it is ignored; LifeOS writes back the next birthday's date, as you keep it now |
  | Last Update? | the newest Fact | a new Last Update? becomes a Fact; a Fact said in LifeOS becomes Last Update? |
  | Associations | **tags**, one per association, both ways | relationship is filled once where it is plain (Family / Extended Family → family, Girlfriend → partner, Colleague → colleague, Friend / Inner Circle → friend) |
  | page bullets | **Facts**, each remembering its section | Talk can answer "what does Kunal like?"; a Fact said in LifeOS goes under Life Updates, dated |
  | *(new)* LifeOS log | the timeline | calls, meetings and payments appended to a section at the end of the page, written by LifeOS only |
  | Status | — | Notion's formula; LifeOS only reads it |
  | *(new properties)* Phone, Email, UPI IDs, Relationship, Works at, Role, City, Keep in touch, Balance, LifeOS id | the Fields of the same name; Balance is ₹, + they owe you; LifeOS id is the Person's id | added to the database once by LifeOS (your columns and views stay) |

  Groups are not in Notion. Address and Family members stay page text (read
  as Facts) until Person has Fields for them. **Likes** is kept in step with
  the page's Likes section (each bullet a like; 30 Oct), not read as Facts.
- *Found on the way:* a birthday with no year (Notion, phone contacts) must be
  stored as no year, not this year, or People says "turns 0"; fixed with R2b.

### Turf web: the hosted home of Turf (added 17 Oct, revised 20 Oct)
LifeOS keeps its data on the S22, and you also run games from your iPhone,
where LifeOS can't go. So Turf's data lives on a host both phones and your
friends can reach: **Turf web**, built from Turf Ledger's own code and moved
to your own Cloudflare account (Workers, D1 for data, R2 for photos).
- **The one true copy** of Turf is Turf web's database. The Turf board in
  LifeOS keeps a synced copy.
- **Three ways in**:
  - *You on the iPhone*: Turf web saved to the home screen, signed in as
    organiser with an emailed one-time code (Cloudflare Access; no
    passwords). The full organiser flow.
  - *You on the S22*: the Turf board in LifeOS, the full organiser flow,
    offline too.
  - *Friends*: the public pages, no sign-in, through per-match, per-player
    and viewer links: RSVP, lineup, teams and score, squad, leaders, public
    profiles, profile invites, availability.
- **Sync with LifeOS**: every change on Turf web carries a change number;
  LifeOS asks for everything since the last one it saw (when the board opens,
  on pull-to-refresh, with Sync all, and on a timer while the app is open).
  A change made in LifeOS is sent as an action with its own id, so sending it
  twice is harmless; offline, actions wait in order, and until Turf web
  confirms, the change shows *sending*.
- **Two phones**: payments are entries, so both count. Any other edit (a
  score, a venue, a player's details): the latest change wins, and the one it
  replaced is kept in that record's history.
- **Answers from friends** reach LifeOS in the same sync: RSVPs and
  availability straight onto the Appearance or Player profile; a submitted
  profile waits for your approval, in LifeOS's **To check** or on Turf web.
- **Access**: the organiser pages take a Turf web account or Cloudflare
  Access; the sync and actions API take a **phone key** (`tw_…`, made in Turf
  web › Settings › Connected phones, revocable there), which LifeOS keeps in
  its secure store (You › Data sources › Turf web; built that way in Turf web
  v0.0.2, noted 22 Oct). The source contract (`sync` plus sending actions) is
  settled in PLUGINS.md with R9c.
- **Before the switch**, LifeOS can read Turf Ledger (R9a's pull) so the board
  is checked on your real data while Turf Ledger is still the one you use.

The pipeline, identity, provenance, To check and the Source contract live in
core. Per-sender parsers and Object schemas belong to the module whose records
they produce.

Deferred: the Second Brain (Notes, Facts, the `mind` module) is worked on later;
Facts still exist as a core Object because filing writes them.

## 5. Surfaces: the five tabs — proposed 4 Oct

Bottom bar: **Today · Upkeep · Dump (centre, raised) · Browse · You**. A bell
in every header opens **To check**. Everything below is either a board, a
module's default surface, or settings.

### Five generic screens, derived from Object schemas
Every module gets these for free from its Field types; it overrides only where
the default is wrong.
1. **Overview** — the module's key numbers (from its AI tools), a trend, what needs you.
2. **List** — rows rendered from the Object's fields; filter, sort, group; search.
3. **Record** — header; fields by type; cycles; events (the timeline); the
   **Links card** (every link grouped by link word, tap to open, add one by
   hand; opens the Links screen); facts; "Tell me about…" to speak an update
   into this record.
4. **Form** — fields by type; links pick records; sensible defaults; used for new and edit.
5. **Metric** — full-screen chart for any number over time: day / week / month /
   year, change vs the previous period, heat map for the year, the records
   underneath. Every tile on every board opens one.

### Today (board)
Tiles from any module, each live from real data, each opening a Metric screen:
My day (events, tasks, dues, deliveries with OTP, bills, in time order with a now
line) · Steps · Sleep · Screen time (+ top apps) · Spend this month vs usual pace ·
Upcoming · People to call · Overdue · On this day · module cards (number + 7-day
trend). Tiles can be added, removed, reordered (You › Home). An empty tile names
the permission it needs and opens You › Data sources. No placeholder numbers.

**What Today is made of** (R8, 2 Nov). Today is a layout and holds no data
of its own: the **Morning brief** on top (layer 8), then the **tiles boards
register** (`tiles` on a BoardManifest, one `TileDef` each), in your order.
A tile reads through its module's tools and core's queries only; Today reads
nothing but the layout. Each tile lives with the board that owns its data:
| Tile | Board | Reads |
|---|---|---|
| My day · Progress · Done today · Upcoming · Overdue · Screen time · Activity · Areas | Today (`src/boards/today`) | core: the day, goals, Cycles, usage, trackers; Areas asks each module's Overview |
| Steps · Sleep | Health | core metrics over Measurements |
| Spend this month | Finance | core spend pace over Transactions |
| Habits | Habits | the board's own checklist and week |
| People | People (`crm`) | crm's `peopleToCall` |
| Home | Home (`inventory`) | inventory's use soon and running low |
| Turf | Turf | games' next match and dues |
| On this day | Time | core's `onThisDay` |

- **Sizes**: *small* (half a row) or *medium* (a full row). Two smalls side
  by side share a row; a small alone on its row is drawn medium (v0.0.17).
- **A tile with nothing to show draws nothing** (Turf with no players, On
  this day with no past, Habits with none). A tile that needs a source and
  has none names it and opens You › Data sources.
- **Looks** (Habits: today list · this week; Activity: one at a time · all
  stacked; Progress: rows · rings) are a tile's config: a select Field in its
  `configFields`, drawn by You › Home screen, the first option the default.
- **Ids stay** as they were (`myday`, `steps`, `onthisday` …), so the order,
  switches and looks you saved carry over. A tile a board adds later lands
  at the end of Today, shown, until you move it.
- **Default order**: My day · Turf · Progress · Activity · Habits · Steps ·
  Sleep · Spend · Done today · Areas · Upcoming · Screen time · People · Home
  · Overdue · On this day.

### Time (board)
What happened in a day, a month or a year, over every module (layer 3).
Route `/time` (`app/time.tsx`) with `span` (day · month · year; month when
absent) and `day` (any ISO day in the period; today when absent). The old
`/almanac/time` sends you on with the same params. Opened from the On this
day tile (that date, as a day), from Browse › Boards › Time (this month), and
from a day's own On this day rows.
- **Day · Month · Year** switch; the period's name with earlier and later
  (later stops at the period holding today).
- **Month**: a calendar, Monday first, each day marked (dumped, an event,
  spend as shade); tap a day to open it. **Year**: twelve months with spend,
  dumps and events; tap one to open it.
- Then the period, each section only when it has something: **Money** (spent,
  came in, by category; a day lists its payments), **Body & phone**
  (averages, each opening its Metric), **What happened** (Events, Trips),
  **What you dumped**, **Upkeep done**, **Added** (new people, records by
  Object, facts remembered).
- **On this day** (a day only): the same date a month, six months and every
  year back (up to ten), only the dates with something; each date opens as
  a day, each item its record or dump. Today's tile is this list from today,
  three dates with two items each.
- Everything comes from core's `periodOf`, `periodSummary` and `onThisDay`
  (`src/core/almanac`), pure; the board lays them out.

### Upkeep (board)
Every Cycle from every module by due date: overdue · this week · this month ·
later. Filter chips by module. A 7-day strip with checkable pills. Mark done
(→ Event, next due rolled, optional cost → Transaction) · snooze · skip.
"This month will cost" from cycle costs due.

### Dump (centre)
One box: type, hold to speak, or share into it. A statement is filed; a question
is answered (on-phone answer at once from search and links; a fuller answer
from the model when available). Below: the last 15 days of dumps, each with
what it filed as chips (1 person · 2 facts · 1 task), per-item Undo, and its
state (filed · waiting, why · needs you).

### Browse
**Search across the whole app** on top: every record of every module, facts,
dumps, notes, tags, attachment names, events, cycles, boards and automations by
name, settings screens, and metrics ("steps" opens the Steps metric). One index
(`records_fts` plus a small index of screens and boards); results grouped by
what they are, each opening the thing itself. Then two sections:
- **Boards** — Turf, Time, Spend, Activity, Automations, and every board added
  later; a grid of tiles, yours first, pinned before the rest. Today and Upkeep
  are boards too but sit in the bottom bar, so they are not repeated here.
- **Modules** — the twelve, in their tints, each opening its Overview → Lists →
  Records (as the grid is today).
Then **everything else lives here too**: Memory (facts), Recent, Tags, Reminders,
To check history, Data sources status, the component gallery (dev). If it is a
screen and not a tab, Browse reaches it. Any board can also be pinned to Today as a
tile, and opened by name from the Dump box ("open turf"). A new board is one
folder under `src/boards/<id>` registered in one list, like a module; later a
board may come from a package (the plugin story), which changes nothing here.

### You (settings)
Data sources (each source: permission, enabled, last sync, today's count; SMS
senders; Export texts for the parser; Sync all) · Agent (providers, keys, daily
budget, models) · Categories and rules · Home (Today tiles) · Notifications and
quiet hours · Backup and restore · App lock · Appearance · Locale and currency ·
Component gallery (dev).

### Also in the app (kept — 4 Oct)
- **Links** (the code calls it Graph view; renamed 4 Oct because "graph" means a
  chart): a sixth generic screen and an important one. From any Record (its
  Links card) and from Browse: the network around the record — Karan in the
  middle, lines to Zomato, the gym, the dinner, the payment — 1–2 hops, tinted
  by module, link words on the lines; tap re-centres, long-press opens. Reads
  Link records only, so every module gets it without writing anything. Not to
  be confused with the tiles on Today, which are charts and open Metric.
- **Automations**: a tile in the Browse grid. The list of your automations with
  last run and state; the editor (trigger → conditions → steps, outputs passed
  along); templates; run log per run and per step; run now. Manual-run
  automations can also sit as buttons on Today. See layer 3.
- **Activity**: a core board, a tile in the Browse grid and a Today tile. The
  GitHub-style grid per tracker ("days coded", "days with Zomato", "8,000 steps"),
  rules over messages, payments, records, metrics, habits.
- **Tags**: tag chips on every Record and List; a Tags page from Browse › Recent;
  one page per tag listing its records across modules.
- **Memory**: the Facts list, a row in Browse (by who they are about; edit, forget).
  Stays until the Second Brain work decides what replaces it.
- **Reminders**: its own screen listing one-off Cycles (reminders) by time, from
  Today and You › Notifications. Upkeep shows them too; this is the focused list.
- **Spend**: its own screen from Today's spend tile and the Money overview:
  transactions with sort (date, amount) and filters (category, account, kind,
  date range), spend by category. It is Money's List with its filters pinned.

## 6. Milestones — proposed 4 Oct

Thin slices, each usable on the phone when done. `docs/MILESTONES.md` M1–M4 stay
as history; new work is tracked here. "Done" means: typecheck and tests green,
the slice checked on the S22, the box ticked in the same commit.

### R0 — Make the code say what the model says (no new features) — done 4 Oct 2026
The restructure, in one day, as a chain of commits that each kept typecheck,
309 tests and the web export green.
- [x] Vocabulary in code: Entity → ObjectRecord (code name; the DOM owns Event, so LifeEvent), EntityTypeDef → ObjectDef (`id`, not `type`), a record's `type` → `object`, Relation → Link, TimelineEvent → LifeEvent, os.entities → os.records, os.relations → os.links, registry.entityTypes → objects; files renamed (recordRepo, eventRepo, RecordScreen, FormScreen, ListScreen, RecordRow, LinksView); tables renamed in migration v11 (records / links / events / record_tags / record_id / object, records_fts); the record page says Links, the network screen is /links/[id]. *(AI tool names keep their old words until R12: the golden fixtures are recorded against them.)*
- [x] **Field types** as a closed registry (`src/core/domain/fields.ts`): text, longtext, number, money, date, datetime, duration, select, multiselect, boolean, link, contact, file, location, meter — each with parse / format / query / zod; currency → money, relation → link, json removed; `FieldDef` → `Field` (linkTo, linkWord, default). The record page formats unknown types through the registry; forms have inputs for the new types.
- [x] **Module manifest split**: a module is Objects + cycles + filing + sources + AI tools + triggers + actions, nothing visual. All twelve data modules kept; each has a companion board in `src/boards/<module>` (overview, screens, quick actions, record sections). `dashboard` and `automation` became boards; the dead widget dashboard system was deleted. Browse shows Boards above Modules; /board/[id] routes.
- [x] Dependency rule enforced by `src/core/deps.test.ts`: boards → modules → core, ui → core, no module imports another module or UI, core has no runtime React Native. Allowlist empty.
- [x] Every existing Object moved into its module **unchanged**. Object changes happen in each module's own milestone.
- [x] One home for filing (`src/core/filing`: dumps, messages, parsers); what filing wrote are **Filings** (`os.filings`, table `filings`, migration v13) and the To check list reads them; the Source contract (SourceDef, Reading, Message) on the manifest and registry. Comments became Facts (migration v12): a note on a record is a Fact about it, on its timeline and in its search text.
- [x] The one failing test fixed (a clock bug); 309 tests green; `docs/ARCHITECTURE.md` retired into this file and PLUGINS.md; AGENTS.md rewritten for the tiers.

**Carried out of R0, deliberately:**
- *Reminders → one-off Cycles.* Reminders carry RRULE recurrences and drive the notification mirror; folding them into cycles is product work, not a rename. It goes with **R5 habits**, where Upkeep is re-hung on cycles from every module.
- *AI tool names* (`create_entity`, `connections`, `list_entity_types`…) → the vocabulary, with **R12**, when the local model is tuned and the golden fixtures are re-recorded.
- *Parsers into modules* (bank SMS → finance, shipping → deliveries, mail → both) → **R1 / R7b** as planned.
**Phone check pending:** the app has not been opened on the S22 since the reset; migrations v11–v13 run on first open.

### Then module by module (each: Objects in the new schema → filing rules and
sources moved in → AI tools with tests → the six generic
screens checked on the phone → overrides only where the default is wrong)
- [x] **R1 finance** — done 4 Oct 2026. Objects as decided: Account (institution → Organisation
  link, status), Transaction (fourth kind `investment`; payee link with merchant as the bank's
  spelling; investment link; source / sourceRef / rawText, raw text cleared by the 60-day job),
  Debt, Subscription (price history), **Investment** (instrument, invested, current value as a
  meter, units, cost, SIP and maturity cycles); Budget folded into a monthly target per Category
  (You › Categories). **Filing rules in the module**: a MessageParser contract in core (read →
  JSON, file → records with provenance); finance's money parser (bank SMS, payment notifications,
  receipt and bank-alert mail), rules, accounts, payees, merchants, FX; deliveries' shipping and
  travel's bookings parsers moved with it, since one pipeline cannot be half-split. **Sources
  declared by the module** (sms, notifications, gmail) reading the phone through a device bridge
  core exposes; core runs a source. **Tools**: spend, subscriptions_run_rate, net_worth,
  portfolio; log_spend moved home as a session-bound filing tool. **Board**: Spend as a board
  screen, Investment hero, Investments on the Finance home. **Dataset**: all three inboxes, every
  parser's read, what was filed, your corrections. 319 tests green; the web export builds.
  *Deferred inside R1:* You › Data sources still lists sources from a platform table until every
  source is declared by a module (R2 contacts / call log — done; calendar with R4; R6 health / usage); the
  SubscriptionHero does not yet draw the price history; a price feed for current value is R12+.
  **Phone check pending**: migrations v11–v14 and the budget / institution folds run on first open.
- [x] **R2 crm** — built 22 Oct 2026 (branch `claude/r2-people-058675`; no migration). Person and
  Group as agreed (layer 2, *People*): phone and email are contact Fields, keep in touch a cadence
  select (old day counts snap to the nearest), Works at → Organisation and Lives in → Place with
  the typed text kept (folded once on start, then whenever the text is typed), a photo, About;
  Group gains sport (Football moved once), default split, place, photo. **Sources declared by
  the module**: contacts (the people you picked, re-filled) and call log, through `os.device`
  (`contacts`, `callLog`), run by core like finance's; the contacts picker reads the bridge.
  **Payee and UPI matching**: core's `whoIs` (`src/core/identity.ts`) matches a UPI id, a phone
  or an email against `ObjectDef.identity` (Person gives its UPI IDs, phone, email), then against
  a sender learned as an alias in core's `aliases` (the same table Turf's "Who is
  priya.s@okicici?" writes), then the mobile number inside a UPI id; finance's `payeeFor` asks it
  first. **Last spoke** moves on its own: a call (call log), an Event with them, a payment linked
  to them (not an unconfirmed guess); it rolls the Keep in touch cycle. **Cycles**: Keep in touch
  (interval) and Birthday (yearly, 7 days' notice). **Tools**: `people_to_call`, `last_met`,
  `who_is`; *balances per person* stay finance's `balances` (one home for money; the Person
  profile shows it and Settle). **Board** (v3 Noir, NR-KitRecords): Person · Profile as the
  record's hero (a new `placement: 'hero'` on record sections), the People home with the People
  strip (a lime ring = due), Call or message, Birthdays, Groups; the keep-in-touch nudge.
  355 tests green; the web export builds. *Left for later:* the calendar source moves with **R4**
  (it files Events); Organisation's Fields are **R3**'s. **Phone check pending.**
  **Designed 30 Oct** (`NR-People-*` on the canvas: Home, Profile, ProfileStates, Parts, Form,
  Group, List, ListAZ, Contacts, WhoIs, Tile, Loading); Likes, gift ideas, the drafted wish and
  relationships you add were decided with it (layer 2); gift ideas and the wish wait for layer 8.
  **Rebuilt to it 30 Oct**: the People home (search, quick filters, the Due strip, Call or message,
  Birthdays, Not spoken in a while, Groups), the Person page and its states (no photo, no phone,
  overdue, birthday today, just added, vendor, owes / owe with Settle and Pay · UPI, plays football,
  long and one-word names), the Group page (shares, balances per member with Settle), the person form
  (relationship pills + New…, UPI IDs and Likes as chip inputs, Works at / Lives in with *Keep as
  typed* or *New organisation…*, a birthday with "I know the year"), the People and Groups list (by
  relationship or A–Z with the rail), Pick contacts (suggested from the call log), **Who is this?**
  in To check (finance files a `payee-who` item for a new UPI sender; *This* moves the payments to
  the person and learns the sender as an alias), the People tile on Today, loading skeletons. Gift
  ideas and the wish are slots until layer 8. Since then a typed company or city links only to an
  Organisation or Place you already have (the form's *Keep as typed*); one is made only by *New
  organisation…*. A birthday with no year is kept without one (no "turns 0"). Phone check pending.
- [x] **R2b Notion** — built 30 Oct 2026: your Notion People CRM kept in step with People, both
  ways (layer 4, *Notion*), as crm's `notion` source (`src/modules/crm/notion/`: client, mapping,
  sync), writing **only to the copy** 📇 Personal CRM (1). The original is refused twice in code:
  every write method checks the id and the page's parent (`assertWritable`), and the request layer
  refuses any write naming an original id; the settings screen refuses a pasted link to it; tests
  prove each write path. First sync adds the ten columns to the copy and pulls every page (matched by
  Notion id, LifeOS id, phone, email or a unique name; an unsure one asked once in To check,
  `notion-match`), then every Person gets a page. Per Field the newest edit wins against the last
  agreed value, the other shown once in To check (`notion-conflict`); on first pairing tags, likes and
  UPI ids are merged. Likes ↔ the Likes section; other bullets → Facts (source `notion`, once);
  Last Update? ↔ the newest Fact; Associations ↔ tags; LifeOS writes Facts under Life Updates, a
  LifeOS log of calls, meetings and payments, Balance (finance's `balances` tool through the
  registry) and LifeOS id. Changes wait in the outbox and send when online; nothing echoes back.
  You › Data sources › Notion: token (secure store), the target, Sync now. **Migration v15**
  `facts-from-notion` (facts may have the source `notion`). 395 tests green; the web export builds.
  *Not in R2b*: deletes either way, Groups. **Not yet run against Notion** (needs your token and the
  copy shared with the integration); phone check pending.
- [x] **R3 places** — done 22 Oct 2026. Objects as agreed (layer 2, *Places*):
  Place (kind with the twelve options, `venue` kept for Turf; address; map pin;
  parent → Place, word *in*; maps link; notes) and Organisation (ten kinds;
  UPI ids; website; phone; place → Place, word *at*; notes), both in
  `src/modules/places`. **The fold** (once, on first open): a Place's city and
  country text become parent Places, a city in its country; notes that are
  only a maps link (Turf venues) move to the maps link Field, also for venues
  Turf makes later. **Filing**: an Event with a location — the calendar,
  travel's stays and bookings, anything else — is linked *at* its Place (one
  you have is matched by name; a location with an address, or an event that
  says what kind of place, makes one, shown in To check with Undo; meeting
  links and bare rooms stay text; a stay's Place is the hotel, in its city);
  events filed before R3 are linked once. Mail: a table booking becomes an
  Event (kind *reservation*) at the restaurant; mail from an Organisation's
  website domain lands on its timeline and what other parsers filed from it is
  *sent by* it (a new core link word); a mail only that matched stays a
  leftover. Dumps: a record made from a bare name gets its kind from the
  Object (`enrich`, now called by core's `upsert_node`: "Toit brewpub" is a
  restaurant, "HDFC Bank" a bank) and the model has `file_place` ("Toit is in
  Indiranagar, Bengaluru"), logged on the dump with Undo. **Tools**:
  places_been, place_info (in, visits, last here, organisations, spent there,
  km from home), places_near (by map pin), organisations. **Board** (v3 Noir,
  from NR-KitRecords · Place · card and NR-KitTrips · Header · a place and Map
  with the route): the Places screen (a header per city, Place · cards with
  visits, kind chips), the Place record's card and drawn map (km from home,
  opens your maps app), visits, who is here and what is inside, the
  Organisation's payments and branch, the Overview (been in the last 30 days,
  paid most), quick actions. Demo data has a few Places. 357 tests green; the
  web export builds. *Not in R3*: Person's company → Organisation is R2's;
  maps are drawn, not tiled, so there is no real map until a provider is
  chosen; no migration (Fields live in record JSON). **Phone check pending.**
  **Design prompt 30 Oct**: `docs/design/PLACES-BRIEF.md` asks for
  `NR-Places-*` artboards that replace this first pass.
- [x] **R4 projects** (Task, Project, Event; calendar source; Goal dropped): built 31 Oct 2026 (branch
  `claude/r4-projects`; no migration). Fields as written in layer 2 (*Agenda*): a task's Due
  and **Repeats** are its **Due Cycle** (fixed; repeating when Repeats is set), so tasks are in
  Upkeep while open; ticking a repeating task marks the Cycle done and moves Due on; done in
  Upkeep finishes a one-off task; a due date taken off leaves the Cycle undated. Event gains a
  Project; Project's Description is its Aim; progress, overdue, next and spend derived. **The
  fold** (once, `projects.foldedR4`): open tasks with a due date get their Due Cycle. **The
  calendar source is declared by `projects`** (`src/modules/projects/sources.ts`), reading the
  phone through `os.device.calendar` (platform's expo-calendar bridge); the calendar code moved
  out of core unchanged, and its Events still link *at* their Place (R3) and move last spoke
  (R2). **Tools**: `agenda_today`, `tasks_overdue`, `project_status` (`tasks_overview` kept).
  **Board** (a first pass from the kit until the `NR-Projects-*` artboards of
  `docs/design/PROJECTS-BRIEF.md`): the Projects home (Today, Overdue, Projects with progress,
  Coming up), the Task, Project and Event pages. Core: My day lists a task once, not again for
  its Due Cycle. **Goal is dropped** (decided 31 Oct): each goal is folded into a Project once
  (`projects.foldedGoals`, layer 2). 428 tests green; the web export builds. **Open**: the brain's
  *coming up* from Events (no candidates contract on this branch yet). **Phone check pending**
  (the calendar).
- [ ] **R5 habits** — Habit, Habit log, Routine; check-ins; streaks; chores in
  Upkeep; Upkeep re-hung on cycles from every module.
- [ ] **R6 health** — Measurement, Workout; Health Connect and Usage access
  sources; one page per metric; Metric screen comparisons.
- [x] **R7a assets**: built 31 Oct 2026 (branch `claude/r7a-assets`; no migration). Asset as agreed
  (layer 2, *Things*): the category clothing, *kept in* a Space by Link (the assets module does not
  import inventory; it finds spaces that hold clothes by their data), a clothing state (clean · in the
  wash · packed), vendor → Organisation, where → Place with the typed text kept. **The fold** (once,
  on first open): `vehicle` records become Assets in place, category vehicle (plate, odometer, next
  service, fuel kept; readings, the Service cycle, Insurance and PUC cycles, and spends linked with
  the word `vehicle`, now `asset`, stay); *electronics* becomes device; Stock R7e filed in Clothes
  becomes clothing, clean (this part waits for Home's spaces). **Cycles**: Warranty (fixed, 30 days'
  notice); Service by months for anything, by km too for a vehicle (6 months or 10,000 km by
  default), written back to next service. **Tools**: `under_warranty`, `due_for_service`, `clothes`.
  **Core, small**: "the car", Upkeep's Vehicles chip and the transport cost category name an Asset of
  category vehicle (`asset:vehicle`); "add a car" opens the Asset form. **Board** (a first pass from
  the kit until the `NR-Assets-*` artboards): the Asset page (warranty bar, service with Serviced), a
  vehicle's odometer, insurance, spend and service on both clocks, clothing's state and space; the
  Overview (due for service, warranty ending, in the wash); quick actions Asset · Vehicle · Clothes.
  **Home**: the Clothes space shows clothing Assets as pills in clean · in the wash · packed (tap
  cycles clean → in the wash → clean, a packed one comes back clean; hold for the rest), and its tile
  counts them. `docs/design/ASSETS-BRIEF.md` asks for `NR-Assets-*`, with the packing picker R7d
  uses. 431 tests green; the web export builds. *Not in R7a*: a form that shows only a category's
  Fields (the form shows every section); the packing picker itself (R7d). **Phone check pending.**
- [ ] **R7b deliveries** — Delivery; shipping parsers; OTP; tracking.
- [x] **R7c documents** — built 2 Nov 2026 (no migration): Document (layer 2, *Things*) points at files in
  folders you pick on the phone, indexed and never copied. **Module**: the folders (settings
  `documents.folders`), the rescan (new files in as *new*, a renamed or moved one followed by its size
  and its name or date, a deleted one *missing*), 15 PDFs' text read per rescan for search and a better
  kind, the kind guessed from the name and text, remove a folder (its new ones go, filed ones stay as
  missing); the `folders` source runs a rescan with every sync. **Phone**: Android's folder picker
  (expo-file-system, access kept), `listFolder` in the device module (one query per folder, five
  deep), the phone's own viewer to open. **Board**: Your folders (Add folder, Rescan now, New in your
  folders with Filed), the file card on a Document (Open, Filed, missing), New in your folders on the
  Overview. *Not in R7c*: the text of photos (no OCR), shared files saved into a folder, Insurance and
  PUC as Documents (still open). **Phone check pending.**
- [ ] **R7d travel** — Trip; spend vs budget; flights and stays from mail.
- [x] **R7e Home** — built 30 Oct 2026 (branch `claude/r7e-home-1f3592`; no migration), layer 8's first slice: Stock and Space
  (layer 2, *Things*) in `inventory`, shown as Home; the old `item` records folded in once.
  **Module**: state from bought on and life; the rate learned from purchases and used up;
  *used up* and *half left* with Undo; the *running out* and *going off* candidates as plain
  functions the brain calls later (no model calls); several things from one line ("eggs,
  butter, 2 milk"), each into the space its name suggests. **Tools**: `stock_low`, `use_soon`,
  `whats_in(space)`. **Groceries in, code only**: a Blinkit delivery notification or a bank /
  UPI SMS naming Blinkit → a To check card ("Blinkit · ₹437 · just delivered. Share the
  invoice…"), linked to finance's Transaction; the shared invoice PDF's text read by a Blinkit
  parser behind a seam (written against a plausible layout until a real invoice; the phone
  can't read a PDF's text yet). Zepto and Instamart mail parsers wait for a real mail each.
  **Board** (a first pass from the kit until the `NR-Home-*` artboards): Home (Use soon,
  Running low, Spaces, Just came in), a space page of pills (tap = used up, long-press = half
  left · still good · move), the Stock page, the shopping list (Copy list · Open Blinkit /
  Zepto; LifeOS never orders), a Home tile for Today. Cook tonight and the fridge photo are
  slots until the brain. Home is a board in Browse › Boards (a companion board placed there).
  Core gains small pieces: `filings.ofKind / forSource / update`, the parser contract's
  `packages` (the notifications source listens to Blinkit too), the device bridge's `pdfText`
  seam, link words *kept in* and *bought in*; five Lucide icons (fridge, snow, pot, spray,
  bath). 420 tests green; the web export builds. **Reading the PDF** (31 Oct): the device
  module reads a shared PDF's text with PdfBox-Android (Apache 2.0), rows in reading order; a
  PDF with no text (a scan, a locked file) gives a *Couldn't read this invoice* card in To
  check. *Waiting*: a real Blinkit invoice (text or scan) to check the parser; the
  `NR-Home-*` artboards. **Phone check pending** (needs a new dev build).
- [ ] **R7f knowledge** (later) — Note, Fact as the Second Brain; Memory replaced.

### Boards and automations
- [x] **R8 Today and Time** — Today tiles re-hung on module tools and core queries only; Time
  board from On this day; the route moves from `app/almanac/time.tsx` to
  `app/time.tsx`.
  *Built 2 Nov (branch `claude/r8-today-time`)*: layer 5 *What Today is made
  of* and *Time*. Every Today tile is a `TileDef` on the board that owns its
  data (Today's own board `src/boards/today` for the tiles over core);
  `app/(tabs)/index.tsx` lays out the Morning brief and the registered
  tiles only. The Time board (`src/boards/time`) at `/time`, in Browse ›
  Boards, with On this day on a day and as its Today tile; `/almanac/time`
  redirects. Brief `docs/design/TIME-BRIEF.md`; hand-over
  `docs/handover/r8-today-time.md`. *Not yet checked on the phone.*
- [ ] **R9 Turf** — the first user board, the whole of Turf Ledger in LifeOS
  (agreed 17 Oct; **plan 2 on 20 Oct**: the whole app rebuilt as ours, Turf web
  on Cloudflare holds the data, LifeOS and the iPhone both run games; layer 2 *Games*, layer 3 *Turf*, layer 4 *Turf web*). Proves the
  tier. Needs Person, Group and Place as R2 / R3 leave them. Order after 20
  Oct: R9a (built) → R9b → R9c → R9d → R9e; the design is needed from R9c.
  - [ ] **R9a Read** — LifeOS side built 18 Oct 2026; the Turf-App endpoint is
    waiting (see below). Built: the `games` module (Game, Appearance, Player
    profile, Venue; `src/modules/games`), the Turf Ledger source with the token
    in the secure store, the pull (players matched to People by phone, email
    or a unique name before one is made, only empty Person fields filled; the
    Football group; venues → Places; archived, never deleted, when gone; Debts
    with "which player is you", settled when ticked), four tools (who owes,
    this week, a player's stats, leaders), the Turf board read-only (Home,
    Games, a game with Payment checklist and Team view, Players with Squad and
    Leaders, Venues), You › Data sources › Turf Ledger, tests over a recorded
    sample pull. *Waiting*: the Turf-App `GET /api/lifeos` change (not written
    yet: needs your go-ahead, since it serves the whole ledger to whoever holds
    the token), its deploy through OpenAI Sites, the first real pull. The
    Sites copy could not be fetched on 18 Oct (its git token had expired), so
    GitHub is assumed to match the live app; on 20 Oct the live `/api/data`
    (signed in, read only) confirmed it: 76 players, 32 games (18 Jul–20 Oct),
    470 appearances, 10 venues, no part payments yet.
    Agreed scope: in Turf-App, `GET /api/lifeos` behind the token (you
    deploy it through OpenAI Sites); the `games` module (Game, Appearance,
    Player profile, Venue) with the Turf Ledger source: players → Person and
    the Football group, venues → Place, photos as files; Debts for open shares
    between you and someone; tools (who owes, this week's game, a player's
    stats, leaders). The Turf board's screens, read-only. Tests over a
    recorded pull.
  - [ ] **R9b Turf web, the backend**: Turf Ledger's code forked into its own
    repo on your Cloudflare account; Cloudflare Access in place of the OpenAI
    sign-in; every table gains a change number and soft delete; payments as
    entries; the sync API (changes since N) and the actions API (with ids, in
    order, idempotent); the money rules and the team generator with tests.
    Needs no design.
    *20 Oct, first slice done* in `~/Projects/turf-web` (commit 44bedad, local
    only): wrangler config, Access sign-in verified in the Worker, migration
    0017 (change numbers and tombstones by trigger, payments as entries,
    opening entries for shares already paid), `GET /api/sync`, `POST
    /api/actions`, the payment action, money-held guards; 19 tests; builds,
    and checked end to end on the local Workers runtime. Your real data: a
    read-only export of the live Turf Ledger (20 Oct, 14:09; GET /api/data and
    the photos) in `turf-web/.data/` (git-ignored), loaded by
    `scripts/import-turf-ledger.ts` (ids kept, opening entries, re-runnable;
    5 tests) into the local Turf web, its totals matching the export.
    Versioned since 20 Oct (`turf-web/CHANGELOG.md`): **v0** the start, **v0.0.1**
    the backend for the design additions (`turf-web/docs/design/ADDITIONS.md`:
    dues, mark-all-paid, audit log with undo, devices, own goals and a score that
    follows the goals, formations, guests, the copy / share texts, .ics,
    settings), **v0.0.2** private player links and phone keys; the D1 database
    is on Cloudflare, loaded. *Next*: the team
    generator's tests, photos in sync, the first deploy (needs your `wrangler
    login` and the Access setup in its README).
  - [ ] **R9c The organiser flow in LifeOS**: the Turf source switches from
    Turf Ledger's pull to Turf web's sync and actions; the board stops being
    read-only: new and edited matches (venue defaults, terms, who fronted,
    shares split), payment entries with part payments and credits,
    attendance, scores and goals, teams and the generator, captains and
    player of the match, players and profiles, availability, venues, all of
    Leaders, WhatsApp shares, the SMS share match in To check, *sending* and
    offline. Screens follow the design when it lands. In slices (22 Oct):
    - [x] **R9c.1 The sync** (LifeOS v0.0.1, 22 Oct): the `turf` source reads
      Turf web's `GET /api/sync?since=N` with the phone key; the Turf Ledger
      pull is gone. Payment entries are Events on the Appearance, paid so far
      is their sum (part payments in who owes and the Debts); tombstones
      archive; RSVPs before the lineup; "which player is you" from Turf web's
      settings; guests not in the Football group; the board syncs on open and
      every minute while open. Tests over a recorded sync page. *Phone check
      pending.* Not in Turf web's sync yet: seasons, votes, stat and payment
      claims, kit picks (a Turf web version adds them when LifeOS needs them).
    - [x] **R9c.2 Sending** (LifeOS v0.0.2, 22 Oct): changes wait in core's
      outbox (migration v14) with their own ids and go to Turf web's
      `POST /api/actions` before each sync, in order; offline they wait,
      listed on Home as *Sending*; a refusal is undone and listed as *Not
      sent* with Turf web's reason. First change: payment entries from the
      match's Payment checklist (payment with part payments, refund,
      correction, note; Mark paid), shown at once as *sending* and counted in
      who owes and the Debts until the confirmed entry replaces it. *Phone
      check pending.*
    - [x] **R9c.3 Matches** (LifeOS v0.0.3, 22 Oct): New / Edit match (venue
      defaults, terms, who fronted, shares split; squad changes keep teams,
      stats and payments; a paid share needs a refund before removal),
      attendance, goals / assists / saves / own goals / in goal, captains,
      player of the match, the score (follows the goals unless set by hand).
      Turf web's rules for these are copied into `games/rules.ts` (from
      Turf web v0.0.61) so the board shows the same offline. A match made
      here is `local-<change id>` until Turf web answers with its id; queued
      changes naming it are sent with the real one. *Phone check pending.*
    - [x] **R9c.4 Teams** (LifeOS v0.0.5, 22 Oct): Turf web v0.0.61's ratings
      (`games/ratings.ts`), team generator (`games/balance.ts`), kits and
      formations (`games/kits.ts`) copied in; `games/teams.ts` feeds them
      from the records. The board's Match screen, Team view (the pitch in
      formation, side lists) and Pick teams follow the *Turf · Noir*
      artboards 4b and 4d; Save teams sends one `team` change per player
      who moved, formations their own. Gap: Turf web doesn't sync "play well
      with" picks, side wishes or kit votes, so the generator here balances
      on ratings, positions and chemistry; the Captains suggestion stays on
      Turf web. *Phone check pending.*
    - [x] **R9c.5 Players, venues, Leaders** (LifeOS v0.0.6, 22 Oct): new and
      edited players (a Person and a Player profile, the Football group;
      Turf web's id replaces the local one), availability (mode, days,
      periods), new and edited venues (with their Place), Turf web's
      Leaders copied in (`games/leaders.ts`: thirteen tables, ranking rules,
      places before the last match day), dues and every WhatsApp text from
      Turf web's own `dues.ts` / `messages.ts` (copied; `games/money.ts`).
      Board: Home, Dues, Audit log, Games (centre and history), the match's
      Payment checklist and pay sheet, New match, Log stats, Formations,
      Squad, Leaders, Player, Stats card, Edit player, Venues, Edit venue,
      Turf settings, the section switcher and the sync states, per the
      *Turf · Noir* artboards. *Phone check pending.*
    - [x] **R9c.6 To check, SMS, texts** (v0.0.6, 22 Oct): friends' profile
      submissions sync into To check and are approved or turned down on the
      Submission screen (a direct call to Turf web's `/api/invites`, so it
      needs a connection); the audit log syncs; the SMS share match as
      decided in layer 2 *Money* (`games/smsMatch.ts`: sender = UPI id or the
      bank's name; known = a learned alias in core `aliases`, a player's UPI,
      or finance's Person; sure → recorded with Undo; else a question, and a
      Yes learns the sender); boards can now give To check their own cards
      (`BoardManifest.checkCards`). Gaps: squad-invite requests (new players
      asking to join) and photos aren't in the sync yet; undoing a change
      from the audit log stays on Turf web.
  - [x] **R9d Turf web, the screens** (v0.0.5–v0.0.6, 20 Oct 2026): every
    organiser screen and every friends' page of the *Turf web · Noir* canvas,
    built in `turf-web/app/ui/` from the artboards' own measurements
    (`scripts/design-to-jsx.mjs`), on the real data: Home, Dues, Audit, Match
    centre and history, Match (checklist, team view, log stats, pick teams,
    record a payment), New / Edit match, Squad, Leaders, Player (+ edit, links),
    Venues, Settings (accounts, phone keys, who you are, links, data), Sign in;
    friends' match (RSVP from the open link or the private one), viewer link,
    public profile, private page, availability, invite form, submission
    review. Still to do: home-screen install polish (manifest, icons) and the
    design gaps listed in `turf-web/docs/design/ADDITIONS.md` Part 4.
  - [ ] **R9e The switch**: a full export of Turf Ledger (every table and the
    photos) imported into Turf web once with ids kept, paid amounts as opening
    entries; the old address redirects to Turf web; Turf Ledger retired. Done
    when you have run a week's game from the two phones alone.
- [ ] **R10 Automations** — multi-step with data passing, manual run from a
  button or a sentence, model step, run log per step; templates.
- [ ] **R11 Activity and Links** — Activity board over trackers; Links screen and
  card everywhere, tinted by module.

### The model
- [ ] **R12 Mac model first** — Ollama over Tailscale as the first provider; a
  7–9B open model; golden sentences pass; cloud only on failure; budget applies
  to cloud only.
  - [x] *Code side built 2 Nov* (`claude/r12-mac-model`; decisions in layer 7,
    *The provider chain*): the Mac provider over Ollama's `/api/chat`, first in
    the chain, the cloud on failure, caps and budgets cloud only, You › Agent ›
    Your Mac with Test the Mac, the golden sentences against a mocked Mac in
    `npm test`, `scripts/golden-mac.ts` for the real one.
  - [ ] *The run on the Mac*: `qwen3:8b` pulled, the golden script green on the
    Mac, Test the Mac green from the S22 over Tailscale.
- [ ] **R13 Phone model** — a 1–3B quantised model on the S22 for offline
  filing of everyday dumps; chain: phone → Mac → cloud.
- [ ] **R14 Your own fine-tune** — dumps + what filing did + corrections exported
  as the training set; fine-tune evaluated on the golden tests before it enters
  the chain.

### Around it
- [x] **R15 Build and ship** — standalone dev / preview build with OTA updates
  (ADHOC), app lock, database encryption; retention jobs (dumps 15 days, raw
  texts 60 days, To check auto-approve 15 days). Built 2 Nov 2026 (branch
  `claude/r15-ship`; no migration; `docs/handover/r15-ship.md`). Encryption
  needs the new APK. *Phone check pending.*
  - [x] **Standalone build and OTA** (v0.0.15 to v0.0.17): EAS preview APK,
    updates on the `preview` channel, the fingerprint leaves out app.json's
    version so a JS-only version arrives as an update.
  - **Database encryption** (decided 2 Nov): the whole database file is
    SQLCipher (expo-sqlite's `useSQLCipher`, AES-256), `lifeos-secure.db`. The
    key is 32 random bytes in the phone's secure store (`lifeos.db.key`,
    Android Keystore), not tied to the fingerprint, so filing and syncs in the
    background still open it; it never leaves the phone and is not in any
    backup. A new install starts encrypted. Today's plain `lifeos.db` moves
    only when you ask (You › Lock & backup › Encrypt the database): first a
    copy is made encrypted and checked (every table's row count, SQLite's
    quick check) and thrown away; if it matches, the key is saved and the
    next start makes the real copy, checks it the same way, and only then
    switches to it; the plain file is deleted on the start after that. A copy
    that does not match is deleted and the plain database stays in use.
    Encrypted with its key missing (a phone restore brings the file, not the
    key): the file is set aside, never deleted, and a new database starts;
    your backup file is how data crosses phones. The web build stays plain.
  - **App lock** (decided 2 Nov): covers every screen with an opaque cover on
    open and after you've been away longer than your setting (every time, 1, 5
    or 15 minutes); fingerprint, face or the phone's PIN opens it. Work in the
    background (filing, syncs, the brain, reminders) carries on while locked;
    notification text is the phone's to hide. Back does nothing while locked.
    A phone with no screen lock set never locks you out. The lock and the
    encryption are separate: the lock guards the screen, the key the file.
  - **Retention** (decided 2 Nov): one job in core, once a day (from the
    filing run: app open, return to the app, the background task), each part
    counted in a log (the last 30 runs, `retention.log` in settings; the last
    run shown in You › Lock & backup). *To check*: what you haven't ticked or
    undone in 15 days is ticked as filed; nothing is removed. *Dumps*: a dump
    filed (or with nothing to file) more than 15 days ago leaves the Dump list
    and search, so the model is not shown it either; its row stays, as the
    provenance behind "Dumps that mention it" and the record timelines, which
    keep the sentence. Waiting or failed dumps stay until filed. (Deleting the
    rows needs a migration, since the database refuses it by design; not
    done.) *Raw texts* (60 days, from M4.2c): ignored messages deleted, the
    wording of filed messages and of the transaction's Original text cleared,
    the per-app screen time and ended synced calendar events removed.
- [ ] **R16 Docs** — `ARCHITECTURE.md`, `GRAPH.md` and SCOPE §C retired into
  this file; `HANDOFF.md` rewritten for the three tiers.

Suggested order: R0 → R1 → R2 → R3 → R8 → R9 → R4 → R5 → R12 → R6 → R7a–e →
R10 → R11 → R13 → R15 → R14 → R7f → R16. Finance, People, Places and the Turf
board early, so the structure is proved on the thing you actually want.


## 7. The agent: a model LifeOS owns — proposed 4 Oct

Reference: PewDiePie's Ajax for Odysseus (a fine-tuned Qwen 3.5 9B as the
always-on local agent). We want the model, not their workspace UI: a small open
model that runs for Rutvij and is integrated as LifeOS's brain, with cloud
providers as fallback only.

- **Job**: turn sentences into filing tool calls over the Objects (layer 4,
  step 2), and answer questions from the context graph. Nothing else.
- **Where it runs, in two steps**: (1) on the Mac over Tailscale through the
  existing Ollama provider — a 7–9B model, no quota, nothing leaves the network;
  (2) a 1–3B quantised model on the phone for offline filing.
- **Provider chain becomes**: phone model → Mac model → free cloud (Groq,
  Gemini) → Claude. Cloud is reached only for what the local models fail on,
  and the daily budget in You › Agent applies to cloud only.
- **Tuned on your data, same loop as the parsers**: the export gains your dumps
  with what filing did and what you corrected in To check; that set is the
  fine-tune for your own model. Golden tests (the sentences in PRODUCT.md §5)
  are the acceptance bar for any model in the chain.
- **Not wanted**: Odysseus's chat / email / calendar screens. LifeOS already has
  the records; the model serves them.

### The provider chain (agreed 2 Nov, R12)
- **The Mac model**: `qwen3:8b` in Ollama (Q4, about 5 GB), the same model for
  filing, questions and fact mining, so one pull is enough. Spoken to over
  Ollama's own `/api/chat` (not its `/v1` copy) because only there can the
  context be set: 16k tokens, thinking off, kept loaded for 30 minutes.
  Address and model in You › Agent › Your Mac; the address is the Mac's
  Tailscale IP or name, port 11434 assumed.
- **Order**: phone parser → your Mac → the cloud providers in your order. The
  Mac always goes first when it is on; it is not in the cloud list.
- **A failure, judged per call** (the next provider takes that call; nothing
  is retried on the Mac): the Mac does not answer a 3-second check (then it
  is skipped for 2 minutes), the call takes over 2 minutes, Ollama answers
  with an error (model not pulled, out of memory), or the reply is unusable:
  empty, a tool that was not offered, or arguments that are not an object.
  A reply in words instead of a tool call is not a failure; filing already
  nudges once and accepts "done".
- **Budget**: the Mac's calls are written to usage (shown as free) but never
  count against a cap or the free-tier bar; monthly caps, the "low on free
  budget" rule and the Brain's daily budget are cloud only.
- **Harder asks** (Claude for plans, when that switch is on) stay as they are:
  an explicit choice to pay for those.
- **Acceptance**: the golden sentences (`scripts/golden-sentences.ts`: the
  filing flows of PRODUCT §5 and the Jarvis dumps, plus two questions) pass
  against a mocked Mac in `npm test`, and against the real Mac with
  `scripts/golden-mac.ts`. A model enters the chain only when that run is
  green.

*24 Oct: layer 8 proposes widening this job — Claude as the brain that
notices, with what it learns kept here so a local model can take over. Not
decided; until it is, this layer stands.*

## 8. The brain: LifeOS comes to you first — proposed 24 Oct

From a brainstorm on 24 Oct, after Anthropic's Claude Duet (an agent that
comes to you with what needs you, keeps working, and asks before it acts).
Duet is built for work; personal life is its weak side, and that is LifeOS's
side. Nothing here is built. It widens layer 7 and touches R5, R7e, R8, R10
and R12; those are settled when this layer is agreed.

**The idea.** Anything you are missing, LifeOS already suggests: the butter
running out, the paneer to use before it turns, the filter that is due, what
to pack for Friday's flight, what you can cook tonight from what is left. It
uses the Claude API (you have it now) as the brain, and keeps everything it
learns on the phone.

### How it works: code notices, Claude judges
- **Candidates, in code.** Each module offers what might need you, cheaply,
  from its own records: Turf (Thursday has 3 in of 10), People (9 days since
  Dad), Stock (butter bought 18 days ago, rebought every 21), Upkeep (filter
  five months old), travel (you fly Friday). No model call to find them.
- **Claude gets the short list**, not the database, and does what code
  cannot: judges what matters today, joins things up ("you fly Friday: use the
  paneer and spinach first, skip Sunday's order"), and turns a notice into
  something you can act on ("eggs, spinach, paneer, half a cream: palak paneer
  tonight?"). It brings world knowledge your data lacks: shelf lives,
  seasons, packing, recipes.
- **What comes to you is one To check**, in three shapes, with the same
  verbs everywhere: *done, undo?* (filed on its own) · *is this right?*
  (unsure) · *shall I?* (something outward: a text written and ready to send,
  a payment to mark, a list to order). LifeOS never sends, pays or orders by
  itself; the last step is yours (Send in WhatsApp, open Zepto). Money is
  never moved.

### Four kinds of nudge (every module offers its own)
| Kind | Examples |
|---|---|
| **Running out** | butter, detergent, medicines, the gas cylinder, water cans |
| **Going off** | paneer, milk, a medicine's expiry, a passport or policy expiring |
| **Due** | Upkeep's Cycles: the filter, the AC, the car by km; keep in touch; a Turf share owed |
| **Coming up** | a trip, a match, guests, a birthday — and what each needs from you |

### How many (agreed 24 Oct)
What waits for you and what interrupts you are limited apart:
- **In To check and the morning brief**: no overall limit, at most **two
  nudges per module a day**, so no one module crowds out the rest.
- **As a phone notification**: at most **three a day across all of
  LifeOS**.
- **Urgent ones always notify** (going off today, a match short tomorrow, a
  share due today); they count toward the three, and take the slots first.
- **It adjusts from what you do**: a module whose nudges you keep turning
  down with Not this gets fewer, one whose nudges you act on keeps its two.
  The limits are where it starts; what it learns is stored like the rest.

### It learns, and keeps what it learned here
- **Claude teaches the code.** Every answer worth keeping is stored: Amul
  butter keeps about 30 days (on the product, so the next butter costs no
  call); the packing list for a four-day beach trip; "Not this" on a nudge
  (it does not come back); how fast you get through milk. The API is asked
  only about what is new, so the cost falls as LifeOS learns.
- **Stored as data in LifeOS**, never in Claude's memory: learned answers as
  records, and **skills** (the instructions and rules it has built up) as
  files you can read and export. If the subscription goes, the local model
  (R12) runs on the same skills and memory, and they are the training set for
  your own fine-tune (R14).

### Privacy and cost
- **What leaves the phone is records, never raw input**: "Butter, Amul 100 g,
  bought 4 Oct" goes; a bank SMS, a mail, a photo do not — unless you pressed
  the button that sends that one (a fridge photo, an invoice to read).
- **Scheduled sends**: a morning and an evening pass, plus a few on events;
  only what changed since the last pass; the unchanging part of each request
  (skills, preferences) cached by the API.
- **A Sent to Claude log** in You: what left, when, and why. Seeing it is
  what makes the privacy believable.
- **Code before Claude**: order mails and invoices are read by parsers, not
  the model; a small model for small questions ("what kind of thing is
  this?"), the large one only for the passes. A daily budget, as in You ›
  Agent.

### Groceries come in on their own (about 90% are online)
- **Order mails** (Zepto, Instamart, BigBasket — to check which send them),
  through the mail source finance already reads; a parser per shop.
- **Blinkit sends no mail.** Its delivery notification and the bank / UPI SMS
  say an order arrived and what it cost; a card follows — "Blinkit, ₹437,
  just delivered. Share the invoice and I'll stock the fridge" — and the
  shared invoice PDF is read by code (if the PDF is only a picture, Claude
  reads it). Skipped, the order is still logged. *To check*: one real Blinkit
  invoice, text or picture.
- **Offline (the rest)**: a photo of the receipt, or a dump.

### The Home board (named 24 Oct)
A board over a revived inventory module (R7e), as Turf sits over games:
everything kept at home, in **spaces**.
- **Spaces**: Fridge · Kitchen · Cabinets · Clothes · Bathroom · Cleaning, and
  any you add, rename or reorder. Each space opens to its own page of pills.
- **Every thing in a space is a pill**, coloured by state, moving on its own.
  Food and supplies: lime = fresh · mustard = use soon · faded = probably
  gone (its estimated life has passed; waiting for you); tap = used up (and
  LifeOS learns your rate), long-press = half left, or still good.
- **Clothes are Assets** (agreed 24 Oct; layer 2, Things), not Stock: they
  don't run out. Asset gains the category *clothing* and a **space**, so
  Home shows them in Clothes; their pills say clean · in the wash · packed,
  and packing for a trip picks from them. Settled in R7a.
- **Use soon** strip on top, then **Cook tonight** (a dish from what is lime
  and mustard).
- **Running low → the shopping list**, pills again; the last step is Copy
  list · open the app.
- **The fridge photo**: snap the fridge, Claude compares it with the pills,
  the differences light up ("no butter · found coriander"), you tap to
  accept or fix.

### Travel through the same brain
A trip filed from booking mail already knows the days, the place and why.
- **Packing as pills** from Home's Clothes and Bathroom, scaled to the days, tuned to the weather there (a
  free weather service, to choose), remembering what you forgot last time.
- **Before you go**: use the fridge up, skip the Sunday order, water the
  plants, tell the squad you're out on Thursday.
- **Back**: "the fridge is probably empty — here's a list."

### The morning brief on Today (agreed 24 Oct)
Today keeps its tiles and gains a **Morning brief** section on top: the
morning pass's nudges in a few lines (what's going off, what's due, what's
coming up, the one dish to cook), each line opening its record or its To
check card. The evening pass updates it. The tiles stay below, as R8 has
them.

### Words (to add to layer 1)
- **Stock** (agreed 24 Oct) — the Object for something kept at home that
  runs out or goes off (butter, detergent, a medicine): product, space,
  bought, quantity, life, rate, state; its Fields are in layer 2 (*Things*,
  30 Oct). Not "item", which layer 1 retires for a record. Clothes are Assets.
- **Space** (agreed 24 Oct) — a part of Home that holds Stock and Assets
  (Fridge, Clothes); not a Place, which is somewhere on a map.
- **Nudge** (agreed 24 Oct) — what the brain brings you (one of the four kinds); it lives in
  To check.
- **Skill** (agreed 24 Oct) — instructions and rules the brain has learned, kept as data.

### Open questions
- ~~**Where it runs when the phone is idle.**~~ *Decided 31 Oct: the phone*
  runs the passes and calls Claude's API directly (see *The contract* below).
- **Layer 7's job** widens from filing and answering to noticing and
  proposing; the chain becomes Claude first for the brain, local models for
  filing, until R12–R14 can take the brain too.

### First slices, when this is agreed
1. **Stock and the Home board** — the Object, spaces and pills by hand
   and from dumps; Use soon from shelf life.
2. **Groceries in on their own** — one shop's mail parser, the Blinkit
   invoice share, the receipt photo.
3. **The brain's first pass** — candidates from Stock and Upkeep, one
   morning nudge pass through Claude, the learned store, the Sent to Claude
   log.
   *Built 31 Oct (branch `claude/brain-v1`), wider than first planned:
   candidates from Home, Upkeep, People and Turf, morning and evening passes,
   the Morning brief on Today, Cook tonight, gift ideas and the wish; see
   *The contract* below and `docs/handover/brain-v1.md`. Not yet checked on
   the phone.*
4. **Cook tonight and the fridge photo.**
5. **Travel** — packing and before you go.
6. **Every module offers candidates** — Turf, People, Money, Documents.

### The contract (slice 3, agreed 31 Oct; code contracts in `docs/PLUGINS.md`)
- **Candidates are a pure function on the module manifest**: `brain.candidates(os,
  now)` returns plain `Candidate`s (key, kind, shape, the record it opens, code's
  own line, the record's fields as plain values, urgent, rank, asks). Typed in
  core (`src/core/brain/contract.ts`); no module imports another. Upkeep is core,
  so core offers every due Cycle whose module offers no candidates of its own
  (crm's keep in touch and birthdays are crm's). A module may also offer
  **asks** that are not nudges: a slot Claude fills (Home's Cook tonight).
- **Three filing kinds in To check**, one per shape, with the same verbs everywhere:
  `nudge-done` (*done, undo?*: LifeOS did it on its own, e.g. butter put on the
  shopping list; Undo) · `nudge-check` (*is this right?*: Right / Not this) ·
  `nudge-ask` (*shall I?*: the module's verb, e.g. Send in WhatsApp, Call; the
  last step is yours). Every card also has Later (tick). A pass's nudges are
  one group in To check, and each opens its record.
- **The limits** (*How many*): at most two nudges per module a day (one, once a
  module's nudges are turned down with Not this three times in 14 days and more
  often than acted on); at most three phone notifications a day, urgent ones
  first, moved out of quiet hours. A nudge's key is filed once; Not this keeps
  it from coming back.
- **The learned store** (`brain_learned`): every answer Claude gives is kept by
  the key the module made for the question (gift ideas for Karan with these
  Likes; the wish for this birthday; a dish from these things), with Not this
  and what Claude says is worth remembering. A pass asks Claude only about keys
  it does not hold, and calls no one when there is nothing new. **Skills**
  (`brain_skills`): the rules the brain works by, as text you can read; core's
  house rules and each module's start them, Claude may add one. Both are in
  backups and exported as one Markdown file from You › Agent › Brain.
- **What a pass sends** is records only: each candidate's fields as plain values
  (a name, a date, a count, Likes), never a phone number, a message, a mail or a
  photo. The unchanging part (house rules and Skills) is the cached system
  prompt. Every send is written to the **Sent to Claude** log (`brain_sent`):
  when, which pass, why, the lines that left, tokens, cache use. A **daily
  budget** (tokens, You › Agent › Brain) is checked before each call; over it,
  or with no key, the nudges are filed in code's own words.
- **When**: a morning pass (from 7:00) and an evening pass (from 19:00), run by the
  existing background task (`expo-background-task`, every 15 min or more as
  Android allows) and when the app opens; a pass can be run by hand. The
  **Morning brief** on Today shows today's nudges and the dish, "Updated 7 pm"
  once the evening pass has run.

