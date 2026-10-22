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
| **Organisation** | A company, shop, bank, payee | kind (employer / shop / payee / bank / brand), UPI ids, category | SMS, mail, dumps, you |

**Person's Fields** (agreed 22 Oct). The keys stay as they were (`phone`,
`email`, `upi`, `relationship`…) so Turf web's sync and old backups keep working.
| Field | Type | Notes |
|---|---|---|
| Relationship | select | family · friend · partner · colleague · client · vendor / service · acquaintance |
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
| About | long text | was Notes; one-liners stay Facts |
| *(hidden)* contact id | source key | the phone contact it came from, so re-syncs fill gaps |

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
| **Asset** | Something you own, vehicles included | category (vehicle / device / appliance / …), bought on, price, vendor → Organisation, warranty cycle, meter readings (km, hours) for cycles by meter, serial, location → Place | dumps, you, mail receipts |
| **Document** | ID, policy, contract, certificate | kind, number, issuer → Organisation, issued, expires (cycle), file, about → any record | you, dumps, mail |
| **Delivery** | A parcel on its way | shop → Organisation, carrier, tracking, expected, status, OTP, order → Transaction link | SMS, mail |

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

### Places
| Object | Meaning | Key fields | Filed by |
|---|---|---|---|
| **Place** | Somewhere you go | kind (home / city / restaurant / gym / …), address, coordinates, parent → Place | dumps, calendar, mail |

### Agenda (module `agenda`; the day / month / year view keeps the name Time)
| Object | Meaning | Key fields | Filed by |
|---|---|---|---|
| **Event** | Something that happened or will | kind (met / call / flight / stay / service / meeting / check-in / created / edited / cycle done …), start, end, roles → records, kind-specific fields | everything |
| **Task** | Something to do | due, done, priority, project → Project, people | dumps, you, mail |
| **Project** | A set of tasks and events with an aim | status, target date, spend (derived) | dumps, you |
| **Trip** | Travel with dates, people and spend | destination → Place, dates, companions, budget, currency | dumps, mail, calendar |
| **Habit** | Something you do on a rhythm, chores included | cadence (daily / weekdays / N per week / every N weeks / weekday), kind (habit / chore), minutes; check-ins are Events; streaks where cadence is daily-ish | dumps, you |

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
| select / multi-select | direction, Event kind | chip | group by | options fixed per Object |
| boolean | Task done | tick | count | |
| link | company → Organisation | chip, opens record | related to | to one Object, or to any; stored as a Link record |
| contact | phone, email, URL | tap to call / mail / open | equals | |
| file | Document scan, receipt | thumbnail / preview | has file | |
| location | coordinates on Place | map pin | near | |
| meter | odometer | latest + history | delta | drives cycles by meter |

### Retired from today's code
| Was | Becomes |
|---|---|
| `vehicle` | Asset, category vehicle, with meter readings |
| `item` (inventory) | dropped; revisit when wanted |
| `routine` | Habit, kind chore |
| `habit_log` | Event, kind check-in |
| `subscription` | Cycle on an Organisation or Asset |
| `budget` | monthly target on a Category setting |
| `goal` | dropped; activity goals are parked in ADHOC |
| `org` with payee / merchant / shop kinds | Organisation, one kind field |
| comments | Facts |
| reminders table | Cycles |

Count: 19 domain Objects, down from 25 kinds plus two side tables; 23 with
the four games Objects added 17 Oct.

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
(Person) · `projects` (Task, Project, Goal, Event) · `travel` (Trip) · `assets`
(Asset, Vehicle) · `inventory` (Item) · `documents` (Document) · `health`
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
- [ ] **R3 places** — Place, Organisation; from calendar, mail and dumps.
- [ ] **R4 projects** — Task, Project, Goal, Event; calendar source.
- [ ] **R5 habits** — Habit, Habit log, Routine; check-ins; streaks; chores in
  Upkeep; Upkeep re-hung on cycles from every module.
- [ ] **R6 health** — Measurement, Workout; Health Connect and Usage access
  sources; one page per metric; Metric screen comparisons.
- [ ] **R7a assets** — Asset, Vehicle (meters); warranty, service and km cycles.
- [ ] **R7b deliveries** — Delivery; shipping parsers; OTP; tracking.
- [ ] **R7c documents** — Document; expiry cycles; files.
- [ ] **R7d travel** — Trip; spend vs budget; flights and stays from mail.
- [ ] **R7e inventory** — Item; quantity, restock.
- [ ] **R7f knowledge** (later) — Note, Fact as the Second Brain; Memory replaced.

### Boards and automations
- [ ] **R8 Today and Time** — Today tiles re-hung on module tools and core queries only; Time
  board from On this day; the route moves from `app/almanac/time.tsx` to
  `app/time.tsx`.
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
- [ ] **R13 Phone model** — a 1–3B quantised model on the S22 for offline
  filing of everyday dumps; chain: phone → Mac → cloud.
- [ ] **R14 Your own fine-tune** — dumps + what filing did + corrections exported
  as the training set; fine-tune evaluated on the golden tests before it enters
  the chain.

### Around it
- [ ] **R15 Build and ship** — standalone dev / preview build with OTA updates
  (ADHOC), app lock, database encryption; retention jobs (dumps 15 days, raw
  texts 60 days, To check auto-approve 15 days).
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

