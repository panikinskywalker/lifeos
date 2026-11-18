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
| Simplify debts | boolean | **new** (15 Nov, with Bill): settle the group's balances in the fewest payments |
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

**Delivery** (module `deliveries`, Object id `delivery`; Fields agreed 2 Nov with
R7b). One record per order, moved along by every text, notification and mail
about it; the keys stay as they were (M4.2c) so old records keep working.
| Field | Type | Notes |
|---|---|---|
| Item | text (the title) | what is in it ("boAt Rockerz 255 Pro"), from the text; else "Amazon order" |
| Shop | link → Organisation, word *vendor*, **and** the typed text | Amazon · Flipkart · Myntra · Instamart · Zepto · Blinkit · AJIO · Nykaa · Meesho…; linked to the Organisation of that name (made once, kind shop, if you have none; finance's payments to it then land on the same one); the text (`shop`) stays |
| Carrier | text | Delhivery · Blue Dart · Ekart · Shadowfax · XpressBees · India Post…; empty for quick commerce (the shop's own riders) |
| Tracking number | text | AWB, waybill, consignment |
| Order ID | text | the shop's order number |
| Tracking link | contact (url) | the page the text links to; tap opens it |
| Status | select | ordered · shipped · out for delivery · delivered · cancelled · returned; **only moves forward**; cancelled and returned close it |
| Expected | date | from the text ("by Tue, 29 Sep", "today", "in 10 minutes") |
| Delivered on | date | |
| OTP | text | the code for the agent; shown large while it is on its way; gone once delivered, not shown after 3 days and wiped after 7; *(hidden)* when it came (`otpAt`) |
| Order | link → Transaction, word *bought in* | the payment: the newest spend whose payee names the shop, in the 2 days before the first text; or one that comes within 2 days after (cash on delivery, a late SMS); never another delivery's |
| Notes | long text | |

**Quick commerce** (Instamart, Zepto, Blinkit) is a Delivery too, decided 2 Nov:
same Fields, minutes instead of days; it is never a nudge. Swiggy and Zomato
food orders are not deliveries. A delivery that hears nothing for 10 days after
shipping is taken as delivered, flagged in To check (as before).

**Nudges** (layer 8, *coming up*): a parcel expected today or out for delivery,
not quick commerce; urgent when it has an OTP. The code never leaves the phone:
the nudge says it is ready on the delivery. Yes is *Track* (the tracking link)
or *Open*.

### Money
| Object | Meaning | Key fields | Filed by |
|---|---|---|---|
| **Account** | Bank, card, cash, wallet, investment, loan | kind, last-4, currency, opening balance, limit | SMS discovery, you |
| **Transaction** | Money moved | amount, currency (+ INR value), direction (out / in / transfer), when, account, payee → Organisation or Person, category, raw text, source | SMS, notifications, mail, dumps, cycles done |
| **Debt** | I owe / owes me, from a loan (and Turf's shares) | counterpart → Person, amount, from → Transaction, group, settled by → Transaction | dumps, Turf |
| **Bill** | A spend shared in a Group, or a payback, as Splitwise does it (proposed 15 Nov; see *Bill* further down this layer) | who paid, how it splits, ₹ value, group, trip, booking | you, a receipt photo, the trip copilot |

Not Objects: **Category** is a setting (name, colour, rules, monthly target).
**Subscription** is a Cycle on the Organisation (or Asset) it pays for, with
cost and auto-posted Transaction; the Subscriptions report lists those cycles.
**Budget** is the monthly target on a Category.

**Your share (agreed 14 Nov, phase A).** A Transaction's amount is what moved in
the account, so balances always match the bank. What you *spent* is your share:
- **Your share** (`share`, money) is the part of the amount that is yours; empty
  means all of it. A split you paid sets it to your part (Toit ₹2,600 with Priya:
  ₹1,300); a bill someone else paid is 0 for you until you pay them back, and that
  payment is your spend.
- **A payback** is money in that settles what someone owed you: its share is 0, so
  it is not income. Settle up finds the payment (from that person, the amount of
  the balance, in the last 45 days) and makes it the payback; Turf's matched ₹147s
  are paybacks the same way.
- **A refund** (`refund`) is money back for a purchase: not income, and it takes
  its amount off spending in the category of what it refunds (Adidas ₹18,899 back
  lowers Shopping).
- **Spent** = expenses at your share, less refunds. **Came in** = income at your
  share, leaving out refunds. Every place that adds up money counts it this way
  (Money, Spend, Reports, Today, Time, trips, places, projects): one rule in core.
- **The turf you fronted**: an expense from up to 3 days before a game you fronted
  to the day after, for its total cost or its advance, with only one such game,
  is that game's booking; its share is your share of the game. Filed in To check
  with Undo (Turf's *Turf booked* card).
- **Folded once** on first start with this: splits saved before get their share,
  and Turf payments matched from texts before become paybacks.

**Counting money: what money in is (15 Nov, Rutvij; `docs/research/money-basics.md`).**
Came in is money you earned, so it is not inflated by friends paying you back.
- **From a shop you paid**: money in from a payee you paid in the 90 days before,
  for no more than you paid, is a refund in that payment's category.
- **From a friend**: money in from a person, or from a name not known to be a
  business (a friend with no contact), is money back (share 0): not in Came in.
  The payment says *Not income* with **Count as income**, which counts it and
  everything from that person after (remembered; Undo).
- **Salary** and money from businesses (interest, an employer) stay income.
- **Card bills** are transfers, never spending: the card's "payment received"
  joins the bank's debit, and money to CRED ("to CRED Club", "; CRED credited")
  is on its way to a card.
- Sorted as each payment is filed, and once (`finance.moneyInV1`) for money in
  filed before, leaving alone payments you changed yourself.

**Duplicates: the same payment seen twice (15 Nov, Rutvij).** Never matched on
amount alone. A message is the same payment as an earlier one when:
- both carry the same bank reference (UPI ref, UTR), within 3 days; or
- one is the bank's text and the other its app's notification (or mail), within
  30 minutes, and they do not name different accounts; or
- it is the same text again (banks send one text from two sender ids).
Anything else is its own payment: three friends each sending ₹161 are three. A
message about a payment you typed (same amount and kind, that day or the day
before) confirms it. A receipt mail confirms a payment for the same amount within
a day only if their names share a word, or the payment has no real name (a code,
a payment gateway). The second sighting fills in what the first lacked: the
account, the name, and the bank's stated balance.

**Balances follow the bank (14 Nov, phase A).** A bank text's balance ("Avl Bal")
becomes the account's known balance for its day; the account adds only payments
dated after it, so every new text corrects it (an older text never overwrites a
newer one; a card's figure is its limit, so cards are left out). Cash taken from
an ATM lands in your **Cash** account (made once if you have none).
15 Nov, Rutvij (`docs/research/money-basics.md`):
- **After the bank's figure** means dated after its day, or that day and heard
  after it (the payment's text came later, or you typed it later).
- **A text that only states the balance** ("Available balance in A/c XX1234 is
  Rs 52,000") sets it; a phone plan's "Main-Bal" or reward points never do.
- **A repeat text** (the same payment seen again) still sets the balance it states.
- **Set balance** on an account's page: what the bank shows becomes the balance
  from now on, with Undo.
- **A fund redemption** arrives in the bank account; a buy or SIP leaves it.
  Redemptions filed before are turned around once (`finance.redemptionsV1`).
- **A debit card** spends from the bank account: a debit-card text lands on your
  one account at that bank, never a new credit card.
- **Cards follow the bank too**: a card statement or reminder text ("Total of
  Rs 14,768.76 … is due by …") sets what you owe as of its day, and only spends
  and payments after it count, so a payment the app never saw no longer leaves a
  card lakhs in debt for good. **Set owed** on a card's page does the same by
  hand (what the card app shows), with Undo; *Owed* says "bank said, d MMM".

**A card's bill (14 Nov, phase A).** A card's statement or reminder text ("Total
of Rs 26,046.50 or minimum of Rs 1,310.00 is due by 30-OCT-26", Axis's "Due on …
Total amt … Min amt due …") is kept on the card's account: total, minimum, due
date, the newest wins. A payment into the card that covers it clears it. Money's
Accounts list shows it under the card ("₹26,046.50 due Thu 30 Oct"), in coral once
the day has passed.

### Body (module `health`; Fields agreed 2 Nov with R6)
| Object | Meaning | Key fields | Filed by |
|---|---|---|---|
| **Measurement** | One reading of a metric | see below | Health Connect, you, dumps (the model, through the Object's schema) |
| **Workout** | A session | see below | Health Connect, you, dumps (the model) |

**Measurement's Fields** (Object id `measurement`). Keys unchanged, so old
records and backups keep working. Measurements are hidden from Browse's
record lists: Health draws them as its metrics.
| Field | Type | Notes |
|---|---|---|
| Metric | select | steps · sleep · resting heart rate (`resting_hr`) · heart rate, the day's average (`heart_rate`) · weight · water · mood (1 to 5) · other |
| Value | number | in the metric's unit |
| Unit | text | filled from the metric when empty (steps, h, bpm, kg, L) |
| Date | date | the day it counts for; a night's sleep counts for the day you woke |
| Asleep, Awake | datetime (`startAt`, `endAt`), sleep | when the night began and ended, from Health Connect |
| Notes | long text | |
| *(hidden)* source, source key | text | `health_connect` or empty (you); `hc:<metric>:<day>`, so a re-sync replaces the day, never adds one |

Health Connect files **one Measurement per metric per day** (the day's steps,
last night's sleep, resting and average heart rate, the day's weight);
re-syncing a day updates it, since a day's steps grow until it ends. Yours can
be several a day; a day's value is its latest.

**Workout's Fields** (Object id `workout`). Keys unchanged.
| Field | Type | Notes |
|---|---|---|
| Type | select (`kind`) | run · walk · cycling · strength · yoga · swim · sport · other; Health Connect's exercise types mapped to these |
| Duration | duration (`durationMin`, minutes) | was a plain number of minutes; the values stay as they are |
| Date | date | |
| Started | datetime (`startAt`) | from Health Connect |
| Distance | number (km) | |
| Calories | number | |
| Intensity | select | easy · moderate · hard |
| Notes | long text | Health Connect's own title for the session goes here ("Morning run") |
| *(hidden)* source, source key | text | as Measurement's (`hc:<session id>`) |

**Screen time is not a Measurement** (decided 2 Nov, R6): it stays in core's
per-day tables (`usage_daily`, `usage_app_daily`: the day's total, pickups,
first and last use, time per app), because the per-app breakdown has no Field
type (`json` is retired) and Activity, Time and Today already read those
tables. It is shown as the metric *screen time* like the others, and its
source, Usage access, is declared by `health`.

**Comparisons** (every metric, on its page and on the Metric screen): *this
week vs last* (the last 7 days against the 7 before) and *vs your usual* (the
median of the 8 weeks before this one that have data; needs two such weeks).
A week's value is its **average per day with data** (steps a day, hours a
night), so a day the watch was off does not count as zero; weight's is its
latest reading.

### Mind
| Object | Meaning | Key fields | Filed by |
|---|---|---|---|
| **Dump** | What you said, verbatim, immutable | text, when, source (typed / voice / shared), subject record (optional), filing state | you |
| **Note** | Long-form text, markdown, `[[links]]` | see below | you, dumps, Talk |
| **Fact** | One line about a record | subject, text, when, source, confidence, active | dumps, you, filing |

**The Second Brain** (module `knowledge`, board *Second Brain*; agreed 2 Nov with
R7f): your Notes, the Facts, and the names Talk learned, in one place. Memory
(the old Facts screen) is replaced by it.

**Note's Fields** (Object id `note`; keys unchanged).
| Field | Type | Notes |
|---|---|---|
| Title | text (the title) | yours; left empty, it is the body's first line (marks and brackets dropped, 60 characters) and follows it |
| Body | long text (`body`) | markdown-ish; `[[Name]]` mentions a record (below) |
| Kind | select | idea · journal · meeting · reference · recipe · book / article (keys kept) |
| Source | text (`source`) | where it came from, a URL or a book |
| Project | link → Project, word *project* | |
| People | link → Person, many, word *person* | |
| *Pinned* | the record's star, not a Field | pinned notes come first |

**Mentions.** A `[[Name]]` in a Note's body is a Link with the word *mention*
(note → record), kept equal to the text on every save (core's `syncMentions`):
matched on the record's exact title, then a name learned in Talk; an unknown or
ambiguous name links nothing, shows faded, and a tap searches for it. The
record mentioned lists the Note under *Mentioned in*. The editor's *Mention*
picks a record and writes `[[its title]]`. A Fact's first `[[Name]]` says what
it is about.

**Facts, per record and in one place.** Fact stays a core Object (layer 3). On
a record: the Facts card (add, long-press to forget). In one place: the
*Facts* half of the Second Brain, grouped by what each is about (a record, a
name that is not a record yet, *About you*), searchable; add one, forget with
Undo, or put one *about* a record. Below them, **What you call things**: the
names Talk learned ("the car" → Creta), each forgettable. `/memory` opens it.

**The fold** (once, on first open after R7f; nothing is deleted, no migration):
- a Fact Talk kept under a name (no record then) moves onto the record when
  exactly one record now has that name (its title or a learned name);
- a Fact about a record since deleted keeps that record's name as its subject,
  so it shows under the name, not under *About you*;
- every Note's `[[mentions]]` are linked again, so those written before a
  record existed find it.

**Search** in the Second Brain covers Notes (title, body) and Facts together;
Browse's search stays the whole app's, and a Fact there opens the Facts half.

**Tools**: `write_note` (title, body, kind; mentions linked, unknown ones
named back), `find_notes` (text, kind), `what_i_know` (about a name or record:
its Facts, the Notes that mention it, what you call it). Core keeps
`remember_fact`, `recall`, `forget_fact` and `remember_alias`.

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
| **Trip** | Travel with dates, people and spend | destination → Place, dates, companions, group, budget each, currency, rate; its Stops and their Things to do (proposed 15 Nov) | dumps, mail, calendar |
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

**Trip's Fields** (module `travel`, Object id `trip`; decided 2 Nov with R7d).
Keys unchanged; one Field new.
| Field | Type | Notes |
|---|---|---|
| Destination | text (the title) | "Goa", as typed, or the city a booking mail flies to or stays in |
| To | link → Place, word *to* (`placeId`) | **new**: the Place the destination names, matched by name when the trip is saved (a city, area or country first), else made as a city; the Place's page shows **Trips here** |
| Starts, Ends | date (`startDate`, `endDate`) | from the first flight or check-in; a return flight or a later check-out moves Ends |
| Purpose | select | leisure · work · family · other |
| Travelling with | link → Person, many, word *person* | |
| Budget | money | what you mean to spend, in ₹ |
| Local currency | select | INR · USD · EUR · GBP · JPY · AED · SGD · THB; a new expense on the trip starts in it |
| Notes | long text | |
| *(hidden)* packed | text list | the things ticked on the packing list that are not clothes (charger, sunscreen) |

Statuses: idea · planning · booked · ongoing · done; a trip made from a booking
mail is *booked*.

Derived, not Fields: **days** (Starts to Ends, both counted); **spent**: the
money-out Transactions linked to the trip through Links (word *trip* from the
form, *part_of* from a booking mail), each counted once, against the budget,
per day and what is left; **flights and stays**: Events linked to it the same
way; **packed**: clothing Assets linked *packed for* it (a new core link word).

### The trip template (proposed 15 Nov, from the *Trip template · Noir (Japan)* page and the Japan app)

Every trip gets the same five sections, **Overview · Plan · Bookings · Money ·
Prep**, before, during and after. Two sources, the same trip: the canvas page
*Trip template · Noir (Japan)* (artboards `JP-*`, the look) and your **Japan
December 2026** app (https://claude.ai/artifact/724gYrAqYMwha9yHVRkUUj, the
working features, read 15 Nov). Japan, 17 Dec 2026 to 7 Jan 2027, three of
you, is the example. No migration: all of it lives in record JSON and Links.

**What the Japan app keeps, and where each goes here**:
| The app's | Here |
|---|---|
| trip settings: travellers, dates, rates, budget and daily per person, simplify debts | Trip's Fields, its Group (crm), the Group's *Simplify debts* |
| places: stop · idea · airport, Japanese name, order, line colour, pin, about | **Stop** (new, travel), its Place (places) |
| things to do: See · Eat · Do · Onsen · Shop · Event, Idea · Want to · Planned · Done, cost each, day, how busy, quietest time, pin, notes | **Thing to do** (new, travel) |
| events on the route: Festival · Seasonal · Closure · Crowds, from / until, how sure, source | **Thing to do** of kind *event* |
| bookings: stay · flight · activity · transport · other, Confirmed · Pending · Planned · Cancelled, covers, reference, total, still to pay, how paid, check-in / out, getting there, free cancellation, card charged on, paid by, link, papers | **Event** with travel's Fields (projects' Object), its Documents |
| journeys: date, time, from / to stop, mode, Booked · Suggested · Decided, not booked · To decide, leave at, arrive about, step by step, last connection, cost each, estimate, takes, book ahead | **Event** of kind *journey* |
| expenses and paybacks: payers (one or several), split equal · exact · percent · shares · adjust, currency with the ₹ value fixed, part payment toward a booking, receipt items | **Bill** (new, finance) |
| checklist: To-do · Documents · Money · Packing, who, due, done, notes | **Task** with Trip and Section |
| alerts: critical · warning · info, resolved | **Task** in section *notes*, priority urgent · high · low; done is resolved |
| a day's plan, as text | a **Fact** on the Trip, dated that day |
| booking papers (photos, PDFs) | **Documents** linked to the booking Event |
| roles: editor · viewer, secure fields for contributors | Trip members (below) |
| offline copy, downloadable offline file | not needed: LifeOS keeps everything on the phone |
| copilot: Booking.com, Gmail, receipt photo, proposed changes | the trip copilot (R7g slice 7) |

**Trip, new Fields** (added to *Trip's Fields* above).
| Field | Type | Notes |
|---|---|---|
| Group | link → Group, word *group* (`groupId`) | who is going, a crm Group of kind trip, made from Travelling with; every Bill on the trip is in it |
| Budget | money | **changed**: what each person means to spend (the cap, ₹2.5L each) |
| Daily allowance | money, in the local currency (`dailyAllowance`) | ¥7,000 a person a day: what the days still to come are estimated at |
| Rate | number, and the day it was taken (`fxRate`, `fxDate`) | ₹ for one of the local currency (¥1 = ₹0.6028); other currencies use finance's rates |
| Start from | link → Trip, word *copied from* (`fromTripId`) | hidden; a trip started from another copies its checklist (undated) and its packing list (Recap's *Keep for the next trip*) |
| Look | select (`look`) | the trip's own touch, designed per destination (below) |

**Stop** (Object id `stop`): one place on a trip's line, or a maybe.
| Field | Type | Notes |
|---|---|---|
| Name | text (the title) | "Magome"; the edit form offers common places with their local name and pin |
| Local name | text (`localName`) | "馬籠", shown beside the name; in the *japan* look its first character is the stop's mark and stamp |
| Trip | link → Trip, word *part_of* (`tripId`) | |
| Kind | select | stop · idea (not decided, off the line) · airport |
| Order | number | its place on the line; ideas have none |
| Place | link → Place, word *at* (`placeId`) | the pin and the address; matched by name or made, as a trip's destination is |
| Colour | select | the line's colour: green · teal · indigo · persimmon · wood · plum · crimson · gold · sky · slate |
| Poster | file | the stop's picture (the app's travel posters); drawn by the look when empty |
| About | long text | "Edo-era post town on the old Nakasendo road…" |

Derived, not Fields: **its nights** (the nights its stays cover; a night with
no stay is a *gap*, a planned stay is dashed); **the legs either side**
(journeys *from* and *to* it); **its things to do**; **visited** (its last
night has passed: the stamp collected); **weather** (normals per stop until a
weather service is chosen).

**Thing to do** (Object id `outing`; "activity" is the Activity board's word):
something to see, do or eat at a stop, or something on while you're there.
Its own Object because it is neither a Place (it has a status, a cost and
maybe a day; "grilled rice cakes" is no place) nor a Task (nothing to tick
off); it links to a Place when it is one (decided 15 Nov).
| Field | Type | Notes |
|---|---|---|
| Name | text (the title) | "Nakasendo walk to Tsumago" |
| Trip | link → Trip, word *part_of* (`tripId`) | every one is on a trip; an event for the whole trip (New Year closures) has no stop |
| Stop | link → Stop, word *stop* (`stopId`) | the same word a stay uses; *at* is the Place's, and one Object cannot carry two link Fields with one word |
| Place | link → Place, word *at* (`placeId`) | when it is somewhere on the map (Fushimi Inari); its pin |
| Kind | select | see · eat · do · relax (an onsen) · shop · event |
| Day | date (`day`) | when it is planned; an event's first day |
| Until | date (`until`) | an event's last day |
| Cost each | money, in the local currency (`cost`) | 0 is *Free* |
| How busy | number, 1 quiet to 5 packed (`crowd`) | |
| Quietest time | text (`quietest`) | "after 15:00" |
| What kind of event | select (`happening`) | events: festival · seasonal · closure · crowds · holiday · weather; the things to be aware of while you're there, not only the fun ones (New Year closures, peak crowds, snow) |
| How sure | select (`sure`) | events: official · past pattern · predicted |
| Link | contact (url) | its page, or the source for an event |
| Book at | contact (url), several, each with its label (`book`) | links to book it (a guided walk, a ticket) |
| Photo | file | |
| Notes | long text | |
| *(hidden)* suggested | boolean | Claude suggested it, not you |

Statuses: idea · want to · planned · done. Want to, planned and done things
that cost count in the trip's estimates (below).

**Event, new Fields for travel** (added to *Event's Fields*; in sections by
kind, as an Asset's are by category; projects keeps the Object, travel files
these kinds). People is *covers* for a booking (the others: you are always covered); Cost is its total, in the booking's **Currency** (`currency`, a new Field). A flight booking for one person is kind **ticket** (their fare, reference and who paid); the legs stay kind flight.
| Field | Type | Kind | Notes |
|---|---|---|---|
| Booking | select (`booking`) | stay, flight, activity, other | confirmed · pending · planned · cancelled; planned is not booked yet, cancelled leaves the money |
| Stop | link → Stop, word *stop* (`stopId`) | stay | the trip stop the stay is at, from the booking mail's city or the import; its own word because *at* is places' (an Event *at* its Place) |
| From, To | link → Stop, words *from_stop* / *to_stop* (`fromStopId`, `toStopId`) | journey | kind `journey` is new, beside flight and stay; their own words because a dump's *from* / *to* roles on an Event point at Places and carry no marker, so a form edit would drop them |
| Mode | select (`mode`) | journey | flight · train · bus · train and bus · taxi · car · walk · other |
| Plan | select (`plan`) | journey | booked · suggested · decided, not booked · to decide |
| Cost each | money (`fare`) | journey | per person, in its currency |
| Estimate | boolean (`estimate`) | journey | the cost each is a guess |
| Takes | text (`takes`) | journey | "3.5–4 h" |
| Book ahead | text, and a date when it has one (`bookNote`, `seatsOpenAt`) | journey | "seats open 26 Nov, 10:00 JST"; the date drives the deadline rail and a nudge |
| Book at | contact (url), several, each with its label (`book`) | journey, activity | **links to book** (decided 15 Nov): "Reserve the Shinano" → the rail company's page; shown as buttons on the journey, the day and the deadline rail |
| Last connection | text (`lastConnection`) | journey | "Nakatsugawa → Magome bus, 17:45 on Saturdays" |
| Steps | long text (`steps`) | journey | one per line: "10:30 Leave the guest house" |
| Still to pay | money (`toPay`) | stay, flight, activity | in the booking's currency |
| Paid by | `me` or a Person's id, hidden (`paidBy`) | stay, ticket, activity | who paid the part already paid; not a link Field, since *you* is no record |
| How the rest is paid | text (`payHow`) | stay | "cash, yen, at the desk" |
| Card charged on | date (`chargeOn`) | stay | |
| Free cancel until | date and time (`cancelBy`, `cancelNote`) | stay, activity | drives the deadline rail and a nudge |
| Check-in, Check-out | text (`checkIn`, `checkOut`) | stay | "15:00–19:00", "by 09:00"; empty is *check-in time missing* |
| Getting there | text (`access`) | stay | "bus from Nakatsugawa, uphill from the stop" |
| Reference | text (`reference`) | stay, flight, activity | shown on a tap; never to trip members |
| Booking link, Map link | contact (url) (`bookingUrl`, `mapUrl`) | stay, activity | a blank map link searches by name |

**Document**: one link added, **Booking** (link → Event, word *for*, `eventId`):
a booking's papers (photos, PDFs), viewed one after another on the stay.

**Task**: **Trip** (link → Trip, word *trip*, `tripId`) and **Section** (text,
an open list, `section`: to-do · documents · money · packing · notes). The
trip's checklist is its Tasks; *who* is People (everyone when empty);
*overdue*, *next 7 days*, *before you fly*, *during the trip* and *no date* are
derived from Due against the trip's dates. A note (an alert) is a Task in
*notes*: priority urgent is critical, high a heads-up, low info; done is
resolved.

**A day's plan**: derived (its stay, journeys, things to do planned that day,
Tasks due), plus your own lines as **Facts** on the Trip dated that day.

**A booking's page** is drawn in `JP-Booking` (added 15 Nov): its status, the
total with paid and still to pay, who it covers, who paid, how the rest is
paid, when the card is charged, free cancellation, check-in and out, getting
there, the hidden reference, its links and its papers.

**The trip copilot is everywhere** (decided 15 Nov): every section has its own
helper, as ask chips and the copilot sheet, and each can fill what that section
holds: plan a day, find things to do and book them, find what's on and what to
be aware of on your dates at each stop (festivals, closures, holidays, crowds,
weather), fill bookings and check-in times from your mail, log a spend, split a
receipt, suggest packing, write the checklist. It proposes; nothing is saved
until you tap Save, and Undo works after. **It is meant to do much more
later**: what it can do is the trip's tools plus core's, not a fixed list, so
each new tool a module adds is one more thing it can do.

### Bill: money shared in a group, as Splitwise does it (proposed 15 Nov)

**Bill** (module `finance`, Object id `bill`): one spend shared in a Group, or
one person paying another back. It works exactly as Splitwise (decided 15 Nov).
A Transaction stays *your* money moving, as your bank tells it; a Bill is who
paid and who owes, whoever paid. They meet by a Link when your money paid it.
| Field | Type | Notes |
|---|---|---|
| What | text (the title) | "Dinner at the post-town inn"; a payback reads "Cy paid Ben" |
| Kind | select | spend · payment |
| Group | link → Group, word *group* (`groupId`) | a trip's Group, your flat, any Group |
| Trip | link → Trip, word *trip* (`tripId`) | when it was on a trip |
| Amount | money, any currency | |
| ₹ value | money (`inr`) | fixed when saved, at that day's rate; yours to change to what the card really charged; every balance adds these |
| Date | date | |
| Category | select | finance's categories (food, transport, stays, fun, shopping, flights, other) |
| Paid by, Split | one structured value (`split`), as a Transaction's split is today | who paid how much (one person or several, *you* among them; it adds up to the amount) and how it splits: **equally** (who is in) · **exact amounts** · **percentages** · **shares** · **adjust** (equal, plus or minus each); a payment is exact, all to the one paid |
| Booking | link → Event, word *paid_for* | a part payment toward a stay or a flight |
| Your payment | link → Transaction, word *same as* | the bank's record of what you paid, matched by amount and day and asked once in To check, so it is never counted twice |
| Receipt | file | the photo; its items (original and English, price, who had it) go in Notes |
| Notes | long text | |

**Opening a Bill shows how it was split** (decided 15 Nov; drawn in `JP-Bill`):
who paid how much, the way it split, each person's share and where it came from
(an equal part of N, an adjustment, an exact amount, the receipt lines they
had), the rate and the ₹ value, what it did to each person's balance, and what
it is linked to (your bank Transaction, the booking, the receipt photo). The
same for a Bill made by the fold from an old split.

Derived, not Fields:
- **Everyone's balance** in the Group: what they paid minus their share, over
  its Bills, in ₹ value. **Who owes whom** pair by pair or, with the Group's
  **Simplify debts** (a new Group Field, boolean), in the fewest payments.
- **You owe / you're owed** with each person is the same numbers from your
  side; **Settle up** makes a payment Bill (Pay back: swipe to record; logged,
  never sent; Remind opens WhatsApp with the amount).
- **Paid for someone else**: a Bill you paid that is wholly theirs ("Cy's
  flight") puts it all in their share: their spend, and what they borrowed
  from you until a payment evens it.
- **Not in Settle up yet**: a booking's paid part that no Bill covers, offered
  to add.

Finance's split today becomes a Bill: the fold (once) makes a Bill from each
Transaction with a split, linked to it (*same as*), and its split Debts go,
since balances are derived from Bills. Loans, and Turf's shares, stay Debts.
*Not folded yet (16 Nov):* Bills are built and a person's balance and Settle up
add them to the Debts; the fold and switching finance's split to make Bills
are a follow-up.

**Money on a trip, derived** (as the Japan app's ledger, one source of truth
for Overview, Money and Recap):
- **Paid**: the Bills on the trip, and bookings' paid part not yet in a Bill.
- **Booked** (still to pay): bookings' Still to pay.
- **Estimates**: planned bookings' totals, journeys' cost each times the people
  (not flights), want to / planned / done things' cost each times the people,
  and the daily allowance times the days still to come times the people.
- Each line is shared among the people it covers (a booking's People, a Bill's
  split, everyone otherwise), so **each person's projected** is theirs alone,
  against the Budget each; Overview shows the most-spent person against the cap.
- **Your spent** is your share; what you paid for others is theirs.
- Totals show in ₹ or the local currency, a switch in the trip's header.

**Stage, derived** (Plan · Book · Prep · Travel · Home): *plan* until the first
booking; *book* until every night has a stay and the flights are in; *prep*
until it starts; *travel* while away; *home* after. **Needs attention**: your
notes, and what code finds (a night with no stay, a missing check-in time, a
tight last connection, a document Task due). **Coming up**: seats opening,
free cancellation ending, cards charged, Task dues and the flight, in date
order to the day you fly. **Today** (while away): the day's stop, its
journey's leave-by, last connection and steps, what is to pay, the day's
things and Tasks. **Recap**: nights, stops, moves, each person's spent by stop,
steps walked (health's Measurements on those days), settled up, back home.

**Looks** (decided 15 Nov): the Japan touches are the Japan trip's only; each
destination gets its own bespoke look. **Where a look comes from**: it is
designed on the canvas like the Japan page, a `<XX>-Look` set of artboards
(the hero, the stop mark and stamp, the poster, the pattern, the colours) made
in Claude Design when a trip there is planned, then built into the travel board
as a look (`src/boards/travel/looks/<name>`) and named here. The Japan app's
posters, photos and city maps come with the *japan* look. A trip with no look
designed yet is plain Noir.

**Trip members** (decided 15 Nov): you can **invite the trip's Group**. Members
see the whole trip (references, payment notes and booking papers stay yours),
comment on anything, and **add new things** directly (a thing to do, a Bill
they paid, a checklist item, a note), each marked with who added it. A
**change or removal** of something already there is a **suggestion**: it waits
in your To check as a proposed change (Save · Discard) and nothing changes
until you accept. Comments are Facts on the record, with who said them. Ticks
on the departure-day check are a member's own and show who ticked. This needs a
host both phones reach, as Turf web is for Turf: the trip's copy lives there,
LifeOS keeps a synced one, members use a web page signed in by an emailed code.
Where it is hosted is still to choose (a second app on Turf web's Cloudflare
account is the obvious place).

**The Japan trip comes from the Japan app's data** (decided 15 Nov, this first
trip only): a snapshot of its database (the trip settings, 16 places, 15
bookings with their payment fields, 15 journeys, 10 day plans, 61 things to do,
14 events, 14 expenses and paybacks, 46 checklist items, 22 alerts; read 15
Nov) is imported once, each slice importing its part. The snapshot holds
booking references, so it never goes in the repository: it is fetched again
from the app when the importer runs and shared into LifeOS as a file (You ›
Data). Later trips start in LifeOS. The trip, its stops and the Events it
makes keep a hidden source key (`tripapp:japan-dec-2026…`), so importing the
same file again updates them in place.

**Decided 15 Nov**: sharing by members as above, built once a host is chosen;
Budget each (old trips' budgets read as yours); paybacks between any two people
recorded, so the whole group's balances are right; Splitwise's rules for every
shared spend (Bill); looks per destination; Thing to do as its own Object.

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
the four games Objects added 17 Oct; 25 with Stock and Space (R7e, 30 Oct);
28 with Stop, Thing to do and Bill (the trip template, proposed 15 Nov).

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
`finance` (Account, Transaction, Debt, Bill proposed 15 Nov, Subscription, Budget, Group) · `crm`
(Person) · `projects` (Task, Project, Event; Goal dropped in R4) · `travel` (Trip; Stop and Thing to do proposed with the trip template) · `assets`
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
  Those five sections are the board's own, in the bottom bar while you are in
  Turf (The bar inside a board, below).
- **Today** and **Upkeep**: boards over every module, pinned to the bottom bar.
- **Time**: what happened in a day / month / year, over every module.
- **Activity** (R11, 2 Nov): a Browse board (`src/boards/activity`) over core's
  **trackers**, the GitHub-style grid of days. A tracker is a setting, not an
  Object (`activity.trackers`: name, icon, tint, rules, shown on Today); a day
  counts when any rule matches what is already filed (a text or mail saying a
  word, a payment, a record of an Object, a health number at a line, time in
  apps, a calendar event, a habit ticked). Core keeps the trackers and their
  sums (`src/core/activity`); the board draws them and defines no Objects.
  Screens, drawn to the *Activity · Noir* artboards (A1 to A4, on the canvas's
  *Links · Noir* page, 15 Nov): **home** (how many counted today, every
  tracker as a card: today's tick, the grid, this week · this month · streak;
  New tracker; On Today: show or hide each, hold to reorder), **tracker** (26
  weeks with month names, this week / month / streak with the longest, a day
  tappable for **what made it count**: each payment, message, event, workout,
  health number, app time or habit that matched, opening its record; the
  rules; Edit rules; Delete, asking first), **edit** (name, icon, colour from
  the module colours, the rules and the seven kinds of rule). Its **Activity
  tile** on Today shows one tracker at a time (swipe, page dots) or all of
  them stacked small (You › Home).
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

**As built in R10 (2 Nov; the simplest where the above was open):**
- **A rule** is a name, one trigger, conditions (all must hold), **steps** in
  order, on / off. Stored where rules always were (`automation_rules`, the
  steps in its `actions` column): no migration. Rules from before R10 (one
  action each, no keys) become steps once, in place, same id, name, trigger,
  conditions, run count.
- **A step** is one action from core or a module, with its settings and a key
  (`s1`, `s2`, … kept when steps move). Branch and wait are not built: a
  **Continue only if** step (a field, an op, a value) ends the run quietly
  when it fails, which covers the branches the templates need.
- **Data passing**: every step hands back an **output** (plain values: a made
  record's `id` and `title`, the model's `text`, a count). A later step's
  text settings and a Continue only if read it as `{{steps.s1.title}}`, as
  they read the triggering record as `{{title}}`, `{{data.amount}}`,
  `{{vars.x}}`. Each action says which outputs it gives, so the editor can
  offer them.
- **The model step** (*Ask Claude*): a prompt you write, filled in like any
  text setting, sent to Claude with the brain's key and model, counted against
  the brain's **daily budget** (You › Agent › Brain) and capped per step (400
  tokens by default); every send is in the *Sent to Claude* log, as a pass
  named `automation`. What leaves is only the filled prompt. With no key, over
  budget or offline, the step uses its **fallback** words when it has them,
  else it fails and the run stops.
- **Manual run**: the trigger *Run by hand*, with an optional phrase (the
  name by default). Started from its button on the Automations board, from
  Run now on the rule, or from a sentence in Talk: "run month close" runs the
  rule whose phrase or name is "month close", without the model, and answers
  with a toast and Undo. *Every day* fires once a day after its time (08:00 by
  default), not on every scheduler tick.
- **The run log**: each run keeps, per step, what went in (the filled
  settings), what came out, its line ("Tagged #review"), done · failed ·
  skipped · stopped, and what Undo needs. A run is undone step by step,
  last first, for the actions that can be undone (tag, status, fact,
  reminder, star, a record made); a notification or a model answer cannot
  be, and the log says so. A failed run can be run again on the same record.
  The last 200 runs are kept; runs are not in backups (as before).
- **Templates** come from modules (`ModuleManifest.templates`): Big spend
  flag (finance), Subscription auto-posted (finance), Document expiry
  (documents), Contact nudge (crm, with the model step and its fallback).
  Picking one opens the editor filled in; nothing runs until it is saved.

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
check, and offered to the model when one is available.

**Throwaway messages live a week (agreed 6 Nov).** A message that filed nothing
(a login OTP, a promotion, a duplicate, a leftover) is deleted after 7 days. A
one-time code never outlives its use: the wording of any OTP text goes after 7
days, or at the next daily clean-up once its parcel is delivered, and a sender's
first-seen line is never an OTP. A Delivery's own OTP Field goes the moment it is
delivered, and after 7 days at the latest. The Delivery record itself stays,
because it is the history of what you bought. The parsers are trained
over time by per-sender rules plus what you teach: category rules, payee
aliases, trusted senders. The model path for messages should shrink toward zero.

**Learned from Rutvij's own texts (10 Nov).** 753 texts from 90 days on the phone,
masked on the Mac before anything was read, then kept as parser tests:
- **One movement, two texts, one transfer.** A card bill paid from another account
  (straight, by BillPay or through CRED: the debit and the card's "payment
  received"), a card's credit balance sent to savings, money into your loan
  account: whichever text comes second joins the first as one transfer, from one
  account to the other, so it is never counted as spending or income. A plain spend
  only joins a transfer in, and plain income only a transfer out, so a friend's
  ₹200 never cancels your ₹200 chai.
- **Which way it moved**: a transfer that comes in is stored as arriving at the
  account (`toAccountId`), one that goes out as leaving it, so a card payment lowers
  what the card owes and cash deposited raises the bank's balance.
- **Transfers by their words**: cash deposited "by SELF", money into a loan account
  or a forex card, a card's credit balance sent to your savings.
- **Your own name is learned (agreed 10 Nov)**: money to or from the name your banks
  write for you ("RUTVIJ ANIL MAHA", "RUTVIJ AN", "Mr. RUTVIJ") is a transfer between
  your accounts, not spending or income. You teach it once with **That's me** beside
  *Paid to / Paid by* on a payment whose payee is not a shop; every earlier payment
  to that name turns into a transfer too, with Undo. Banks cut names short, so a
  name matches when its first word is yours and each word after starts the next of
  yours. The names stay on the phone (`finance.myNames`).
- **Refunds and cashback** are read as money back for a purchase (filed as income
  until Money decides how they count).
- **Not a payment**: a charge that "will be auto-debited", a failed payment that
  "will be refunded", one the bank is "unable to confirm", a purchase you only
  initiated, reward points from a shop. An insurance cover ("Rs 20 lakhs") is never
  the amount; the premium is.
- **A year of texts and CRED's notifications (11 Nov)**, from the app's parser export
  (1,956 texts, 114 notifications), masked on the Mac first:
  - *Asking you to pay is a bill, not a payment*: "tap to pay ₹5,450", "Pay total
    Rs 1891 or min Rs 100", a disconnection notice, anything ending "Ignore if
    paid". A request to approve ("AutoPay request for up to Rs 799", "requested
    money from you") moves nothing yet.
  - *A shop or service that names no account, card or wallet sends a receipt or a
    notice*; the bank's own text carries the money. So MakeMyTrip's "thank you for
    booking", EPFO's passbook balance, a refund only "initiated", a coupon or a
    sale are never payments. A wallet payment ("using Zepto Cash", "Apay balance")
    is one, named for its shop.
  - *A fund house's SIP confirmation* repeats the bank's debit and is set aside.
  - *A card bill paid through CRED* ("payment of ₹50,000 on your ICICI Bank credit
    card XXXX-8013 has been processed") is a transfer into that card.
  - *Words that are never a name*: "NACH of Rs 500", "transfer of Rs 295", "Chq no",
    CLG, CMS, "deactivate"; a gateway in front of the shop (PhiCom*) is dropped.
  - *Categories*: a NEFT or RTGS of ₹20,000 or more from a company is salary;
    shortened names still match ("MEDICA", "MULTISPE", "COFF", "VADAPA"); annual
    maintenance and card charges are fees; a nameless NACH debit is asked, not
    taken for a subscription.
- **Names cut cleanly**: SBI's "trf to NAME Refno", HSBC's "paid from HSBC account
  … to NAME", "Mr." before a name, the payer of an incoming NEFT ("of ACME"),
  "WWW*" and "BKG*" prefixes, spaced letters ("P L A Y O").

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

### Message samples (agreed 6 Nov)
The working set for that loop, kept in the app (You › Data sources › Message
samples). The full export above stays for when every text is needed; samples are
what you send first, because they are small and masked.
- **One example per shape, per sender.** A message whose wording matches one
  already kept (digits aside) only adds to its count. At most 30 shapes per sender,
  newest kept. Every message the app takes in adds to it; a button adds the last 12
  months of texts from the phone's inbox.
- **Masked before it is stored**: account and card digits, reference and phone
  numbers, balances and limits, the name part of UPI ids and mail addresses,
  number plates, PIN codes, the address a card or kit was sent to, and application
  and file ids become placeholders of the same shape. Amounts, merchants and people's names stay,
  because the parsers read them. Because it is masked it is not raw text, so the
  60-day rule does not apply; you can clear it.
- **Left out**: one-time codes and passwords in any wording ("is your Instagram
  code", "Delivery Code is", "Share DAC", "Password is"), texts from people's own
  numbers, mail from people. The same check clears such a text's wording after a week.
- **Grouped by who read it**: Not read yet first (the gap list), then each module
  (Money, Deliveries, Travel…), then Read and skipped. You can read every example
  before it leaves.
- **Export** is one JSON file through the share sheet, with what each parser reads
  in each example today. You choose where it goes. When you send it to Claude, its
  masked contents go to Anthropic. The file is then the fixture set for better
  parsers on the phone, and the next export shows what is still unread.

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
| My day · Progress · Done today · Upcoming · Overdue · Screen time · Areas | Today (`src/boards/today`) | core: the day, goals, Cycles, usage; Areas asks each module's Overview |
| Activity | Activity (`src/boards/activity`) | core's trackers |
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

**Everyday money questions are answered on the phone (agreed 6 Nov).** No model,
no network, nothing leaves: code reads the question and works out the figure from
your Transactions, Accounts and subscriptions. It covers: where the money went,
how much on a category or at a merchant (with the payments behind it and the change
from the period before), what came in, the biggest spends, balances, net worth,
subscriptions, investments, what is due before payday and what would be left,
anything charged twice, and whether a stated amount is affordable. **Payday** is
worked out: the day of the month of your latest Salary. Anything else goes to the
model as before, with every read-only money tool now open to it.

### Ask Money (proposed 6 Nov, drawn in the Money design file; not built)
Money you can talk to, on the idea of Personal Finance in Claude. Claude's own
feature is US only and reaches banks through Plaid, so LifeOS builds it on its own
Sources. Read-only, always (until 15 Nov: see *Ask Money is an agent* below).
- **Where**: an ask box at the top of Money home, opening its own screen with
  starter questions from your data. Every existing Money screen stays below it.
- **Who does the sums**: the phone's code computes every figure. A model only picks
  which figures to fetch and explains them; it never does arithmetic. The starter
  questions run on the phone alone.
- **Show the payments**: every figure opens the exact payments behind it, adding up
  to it.
- **Follow-ups**: in the same thread, kept while the screen is open and not saved.
  What you want to keep, you keep as a view.
- **Views**: "show weekly spend as a chart" returns a view from a closed set of Noir
  blocks (number, bars, line, calendar, list), adjustable in words. **Keep** pins it
  to Money home. It stores the question for the numbers, not the numbers, so it stays
  live without another model call.
- **Noticing**: double charges, new fees and bills that rose become Money's
  candidates in the morning brief (layer 8).
- **Limits**: it never moves money and gives no investment advice; asked, it says so
  and shows what you hold.
- **Ask Money is an agent** (15 Nov, Rutvij: "an actual AI agent", "smart af,
  the Finance Guru", "Make changes"). It replaces the one-sentence-one-block
  shape:
  - **A conversation**: answers stream in its own words, in steps it shows
    ("Looked at 64 November payments · compared with October"), and it asks
    back. Every figure still comes from the phone's sums and opens its
    payments; its own arithmetic is never shown.
  - **A finance guru**: it reads your real numbers and says what to do about
    them (pay this card in full, its interest is about 42% a year; Netflix went
    up and you use it twice a month, pause it?), on its own when something is
    worth saying. No buy or sell calls on a fund or stock: it explains what you
    hold and the general rules (an emergency fund first, stepping a SIP up).
  - **It changes things**: recategorise, split, set a budget, mark a bill
    paid, track or pause a subscription, settle up, fix what it read wrong.
    Each change shows as a card with Undo ("Changed 2 things · Undo all"); a
    bigger one (a monthly line, a budget) asks first. It never moves money:
    "I can't move money. When you pay Rohan ₹450, I'll mark it settled."
  - **It builds on screen**: "put a card on my home that tracks Swiggy" makes
    a component from the kit's blocks and places it on Money home (Move ·
    Remove · Undo). Kept views are these components.
  - The privacy gate stays. With no AI connected, it offers Connect
    OpenRouter, and the quick answers keep working on the phone.
  - **How it runs** (15 Nov, Rutvij; 16 Nov: **Claude Sonnet 5.5 with web
    search**, since Haiku was too weak for judgement; it searches and reads pages
    for rates, fund facts, tax rules and card rewards, each search shown in its
    steps, never with names, digits or exact figures; its environment is open to
    the web and every other sandbox tool is off. Cards: `cards_and_spend` gives
    each card's spend by category and shop, rounded, so it can say which card to
    use for what and what that saves; it answers before it asks, and
    `name_card` renames a card once you say which it is, with Undo; the agent
    names a card by its ref (card-4) and the phone shows the card's name and
    last digits there, so the digits never leave the phone): a Claude
    Managed Agent, first on Claude Haiku
    5.5, with the Claude key already in You › Agent. The app creates the
    agent and its environment once, keeps their IDs, and updates the agent when
    its definition changes. Each Ask conversation is a session; every tool is
    one the phone answers (no sandbox tools, no web; the environment's network
    is closed). Web search can be switched on later. Built 15 Nov (v0.0.72):
    the phone reads the session's events by polling (React Native's fetch
    cannot stream); each conversation has a spend cap of US$0.50 at list
    price; its tools are Money's reads that already pass the privacy gate
    (money_query, money_show, net worth, investments, subscriptions) plus
    money_overview (pace, before payday, anything wrong), recategorise and
    keep_view (at once, with Undo) and set_budget (asks first). Who owes whom,
    splits and settling stay off it for now, since they name people. With no
    Claude key, Ask uses the agent chain in You › Agent as before. 16 Nov
    (Rutvij: "still stupid"): with a key, everything typed goes to the agent,
    never the phone's fixed answers (starters still answer on the phone); it
    compares, finds what drives a figure down to the shop, and ends with one to
    three concrete steps in rupees.
- **Add a payment** (15 Nov, Rutvij): the **+** opens a sheet: Snap a bill,
  Attach, Type it, or say it ("₹640 at Shree Sagar, paid in cash, half is
  Arjun's"). What is read from the bill fills the payment; *Paid with* is Cash,
  an account or card, or someone else paid; the split and the bill stay on it.
  Built 15 Nov (v0.0.73): a snapped or attached bill goes to Claude once, to
  be read, because you pressed the button (as Snap the fridge: the brain's
  key, budget and Sent to Claude log), and the camera's file is then deleted;
  what you type or say is read on the phone. Paid in cash lands in your Cash
  account (made once). Who shares it is set on the payment's page, which
  opens after saving.
- **Upload a statement** (16 Nov, Rutvij): an Upload in Money (the + sheet, the
  grid menu, Accounts and cards) takes a PDF or a screenshot of a bank or card
  statement, or a fund or broker summary (CAMS, Groww, Coin). It goes to Claude
  once, to be read, because you pressed the button (the brain's key, budget and
  Sent to Claude log; a PDF goes as a document). The phone matches what was read
  to your accounts (bank, card or not, last digits) and holdings (by the words
  in their names) and lists each change, ticked: a bank's balance, what a card
  owes with its bill and due day, a fund's value, what went in and its SIP, or a
  new account, card or holding. Apply does the ticked ones, with Undo for all.
  A SIP read from a dashboard or SIP screen (its day from the next instalment
  date) sets the holding's SIP, so its monthly SIP cycle follows (Subscriptions ›
  SIPs, Before payday, Upkeep); an account is matched by its last digits first.
  A **loan statement** (education, home, car, personal; 17 Nov, Rutvij's SBI
  education loan) is read as a loan: what you owe is its outstanding balance
  (DR), and its EMI is shown. Its last digits find it whatever type it was filed
  as, and it becomes a Loan ("SBI ••1176 is a loan: you owe ₹5,04,583.36"), with
  Undo; with no match it is a new loan. A loan's card says *Loan · you owe* and
  shows the amount owed, which counts against net worth.
  What you owe reads as owed everywhere (17 Nov, Rutvij): a card's or loan's
  amount is a minus figure in red on a small dark band ("−₹33,207"), readable on
  every card face, and *On your cards* is a red minus total. Only bank, cash and
  wallet money is *In your accounts*.
  **Merge a copy** (17 Nov, Rutvij: HSBC ••355 and ICICI ••637 were copies): an
  account's page has *This is a copy of another account*; pick the real one and
  confirm. Its payments, transfers and subscriptions move there, the real one
  keeps its own balance and learns the copy's digits (`alsoLast4`, so later
  texts with them land in it), and the copy goes. Undo puts it all back. The
  real account's figure is kept as it was: the copy's payments join its history,
  never its total.
  **No payment from the future** (17 Nov): a bank text whose date is after the
  day it came is a misread (a ₹1,96,958 salary filed as 13 Feb 2034) and takes
  the day it came; and a payment dated after today never counts in a balance.
  **Before payday** cards wear a colour by kind (17 Nov, Rutvij; NR-Money-Home
  v34 and v35): late coral, a bill or card bill sky, a subscription renewing lilac,
  a SIP mint, each labelled (LATE, BILL, CARD BILL, RENEWS, SIP) with a dot legend
  under the row; a pill names its category from the app's list (a card bill says
  *Card bill*).
  Everything comes in by screenshot (17 Nov, Rutvij): besides balances, card
  bills, loans, funds and SIPs, a **subscriptions** screenshot (an app's
  subscription page, Google Play or App Store, a renewal mail) updates a known
  subscription (price, how often, next renewal) or adds a new one, with Undo. A
  screenshot of all your balances updates every account it shows; when one
  could be several accounts (three SBI accounts and no digits shown) its row
  asks **which account**, with one chip each, and stays unticked until you pick:
  never a guess, never a new account. The Upload and Add a
  payment sheets start fresh each time they open, so a reading left from before
  never waits behind its Apply or Save.
- **Photos and PDFs are read by Haiku** (17 Nov, Rutvij): a snapped or attached
  bill and Snap the fridge go to Claude Haiku 5.5 (`PHOTO_MODEL`), whatever model
  the brain's other passes use; same key, budget and Sent to Claude log. An
  uploaded statement or fund screen is a dense table and goes to Claude Sonnet 5.5
  (`STATEMENT_MODEL`), asked to think little (effort low) with room for a long
  list (8,000 tokens), since Haiku's thinking used up the old 2,500 and missed
  funds and SIPs. When nothing can be updated, the sheet says what was read
  ("Claude read 6 funds, but none had a rupee figure") and which screen to try;
  the CAMS / KFintech CAS PDF is the surest way to bring in every fund. Every photo goes with the type its own first bytes say
  (`mediaTypeOf`), since the picker can call a photo PNG after turning it into
  JPEG; a failed bill says Claude's reason. A bill is also read for how it was
  paid ("Paid: CASH", "Card XX8013"), so *Paid with* starts on Cash or the card
  with those digits (else the first card for a card payment).
- **Privacy** (decided 11 Nov): money questions may go to any provider in the chain,
  OpenRouter's free models included, knowing some free providers log or train on
  what they are sent. Only the records needed leave (payee, amount, date,
  category), never raw texts, under the daily budget and in the Sent to Claude log.
- **The privacy gate** (15 Nov, Rutvij; from broke): what Ask Money sends a cloud
  model is a summary. Amounts are rounded (₹10 under ₹1,000, else ₹100); people's
  names (your contacts, and payees not known to be a business) go as stable
  placeholders ("Person 3"), in your question too; shops keep their names. The
  phone puts the names back in the answer and in any payee the model filters by,
  and works out every exact figure it shows. Who owes whom stays on the phone
  (not a tool Ask sends). Not yet gated: questions queued while no model was
  free are answered later by Talk's general path.
- **Better categories: AI sorts what is left in Other** (15 Nov, Rutvij). Money
  home shows *No category yet · N payments in Other* with **Sort with AI**: the
  shops (never people) whose payments are still in Other and that you have not
  set yourself go to your model by name, each with a rounded typical amount,
  plus your category list. Each shop it is sure of is taught (the next payment
  files itself) and its payments move, with Undo; it never picks Other or
  Transfer. Logged in Sent to Claude.
- **A suggested budget** (15 Nov, Rutvij; from broke). With no targets set, Money
  home shows *A budget for you* from your last 3 full months: a monthly limit
  for each category you spent in at least twice (its middle month, rounded up to
  ₹500, or ₹100 under ₹2,000; not Other, transfers or investing), what usually
  comes in (Came in, averaged over months with income), and "This leaves ₹X to
  save" (or how far over). **Use these** makes them the category targets, with
  Undo; after that the Targets section shows instead.
- **What Claude's Personal Finance answers, on the phone** (15 Nov, Rutvij):
  - *Fees you might miss*: money out whose text says what a bank charges
    (interest or finance charges, a late fee, forex markup, GST on charges, a
    bounce or minimum-balance charge, an annual fee) is filed as Fees, unless a
    rule you set says otherwise; a new one shows in *Did anything look wrong?*
  - *A bill that crept up*: a subscription or bill 10% or more above what it was
    12 months ago (or when first seen this year) shows there too, as *A bill went
    up* with Keep it.
  - *"What's an APR, and what has mine cost me?"*: the word in one line, then
    the interest and finance charges filed this year, with the payments.
  - *"Am I spending more than I make?"*: yes or no from a usual month over the
    last 3, with spending by month.
- **Import and export** (15 Nov, Rutvij; from broke and `docs/research/money-basics.md`).
  Money › *Import & export* (a chip on Money home): **Export as CSV** for this
  month, last month, 3 months, this year or all (Date, Payee, Category, Kind,
  Amount with money out negative, Account, Note), through the share sheet.
  **Import a bank statement**: a CSV from the bank's site; the header row is
  found under the bank's own lines, the columns guessed (date, description, one
  amount or money out and in apart) and yours to change, dates and amounts read
  the Indian way (day first, "1,234.50 Dr", brackets); a preview says how many
  payments, out and in, and how many rows could not be read; you pick the
  account. Each row becomes a payment (source `import`), categorised like a
  text; one already filed (same amount and kind within a day, names agreeing)
  is skipped; Undo takes the whole import back. PDF, OFX and QIF wait.
- **How it works** (11 Nov, from a friend's design that matches the agent): the
  model gets Money's read-only tools by name and description, a Money prompt
  (your money manager; every figure from a tool, never its own arithmetic; never
  moves money; no investment advice) and must answer in one fixed shape: a
  sentence, one block from the closed set, and the payments behind each figure.
  Everyday questions stay on the phone with no model (`money_answer`).
- **When**: after Money counts your share (splits, Turf, paybacks), so its answers
  rest on numbers that are right.
- **Built 15 Nov (phase E)**, as recommended and agreed:
  - **The money query**: one closed shape for every figure: what to count (spent,
    came in, bills), the period, how to split it (day, week, month, category,
    payee), only these categories or a payee, leave out these. The phone works it
    out and lists the payments behind it, which add up to it.
  - **The Ask screen** (Money › Ask, from an ask box on top of Money home): Start
    here with live lines, then a thread. An answer is a sentence, one block
    (number, bars, line, calendar, list) and *See the payments*. Follow-up chips
    (compare with last month, only the top category, by week, leave out rent) are
    worked out on the phone; only typed questions go to a model.
  - **A typed question** goes to the agent chain with Money's read-only tools and
    must end with one *show* call (a sentence, a block, the money query); the
    phone computes the figures, the model's own numbers are never shown. Under it:
    "Claude saw 8 payments: payee, amount, date, category", in the Sent to Claude
    log. No model free: it says so, and answers there when one is.
  - **Keep** stores the view (its money query and block) under *Your views* on
    Money home, right after Coming up, and on the Ask screen.
  - **Anything wrong**: charged twice (same payee and amount within a day), a new
    fee (Fees & Charges, to a payee not paid in the last 6 months), price changes.
    *Both are real* / *That is fine* / *Keep it* are remembered; *One is wrong*
    deletes the later payment, with Undo. Charged twice and new fees also come to
    the morning brief.
- **Open**: the cost per question (not measured); bank statement PDFs to backfill
  history; India's Account Aggregator framework (not checked whether an individual
  can use it).

### Money home: four answers at a glance (14 Nov, phase B)
Built from the v3 Noir kit; top to bottom:
1. **This month and the pace**: spent and came in (your share), then one line:
   "₹806 a day keeps it under ₹72k" while under your **monthly line**, "₹4,356 over
   your line of ₹72k" once over. The line is the one you set (You › Categories ›
   Monthly line), else your usual month (the average of the last three months
   with spending). A day's allowance is what is left over the days left, today
   included.
2. **Needs you**: what To check asks about money (who a sender is, a payee guess).
3. **Who owes whom**: everyone with a balance (Turf, splits, IOUs), net per person,
   biggest first; owed to you in lime, you owe in coral; a row opens their page,
   where Settle is.
4. **Coming up before payday**: card bills (a late one first, in coral),
   subscription renewals and SIPs, soonest first, with their total; payday is the
   day of your latest Salary, else the month's end. The Dump box's "what's due
   before payday?" answers from the same list.
Then the rest as before: subscriptions and net worth, where it went, targets,
accounts, investments, recent.

**Money redesign (15 Nov, Rutvij; Money design file, three directions from his
references).** Each screen takes the direction that suits it:
- **Home** leads with where it went (direction C): the kit's ring with badges
  ("₹24k spent in November", breakdown bars, Set a budget), the pace line, the
  kit's orange Analytics chart (columns in tracks, the week), Needs you as
  one-tap rows with Sort with AI, Before payday as day cards, then one line each
  for accounts ("₹54,480 in accounts · you owe ₹19,679 on 2 cards") and who owes
  whom, then Recent. A grid button opens the other Money screens.
- **Accounts and cards** (new screen, direction B): what is in your accounts,
  the cards owed, net worth, the accounts and cards as a stacked wallet, Came in
  and Spent, investments. 16 Nov (Rutvij's reference): the wallet is a **card
  wheel** (kit `CardWheel`): the card in focus full size, the rest stacked
  behind, tops above and amounts below, smaller and tilted away like the iOS
  time picker; it snaps card by card with a haptic tick; tap a card behind to
  bring it forward, the front one to open it. Every card has its own face (ten
  colours, eight patterns, picked from the account so it stays the same), sits
  a little crooked behind the front one, fans in when the screen opens and gives
  under your finger; a card whose bill is late is coral.
  17 Nov (Rutvij): the top shows two figures side by side, *In your accounts*
  (bank, cash, wallets) and *On your cards* (what you owe, and how many), so a
  card's balance you set moves a figure you can see; net worth under them. Each
  account has a **Use it for** Field, short uses with commas ("Shopping, Forex,
  Fuel"), shown as pills under the name on the card in front and on a lime tile
  on its page (tap to edit). Cards come filled in: when Accounts and cards opens
  and a credit card has none, Ask Money (one quiet agent turn, with your Claude
  key) looks up each such card's rewards and writes one to four uses with
  `card_use`; each card is tried once, so it never repeats or spends again. On a
  card still without uses, the tile opens Ask Money already asking about that
  card (sent by its ref, so no digits leave the phone).
  Uses come from the card's product and its published rewards, never from what
  happens to go through it (17 Nov, Rutvij: it told him to use his forex card for
  bills). So a card named only by its bank ("ICICI Bank card") is never guessed
  at: its page asks "Which ICICI card is this?" with a name field, and once named
  (with Undo) Ask Money fills its uses. The uses v0.0.96 guessed for such cards
  were taken off once. A forex card is for spending abroad, never for bills.
  Account types (17 Nov, Rutvij): besides Bank, Cash, Credit card, Wallet / UPI,
  Investment and Loan, an account can be a **Debit card** or a **Forex card
  (prepaid)**. Both hold your money, so they count in *In your accounts*; a forex
  card shows *Spending abroad* until its uses are set (no name or Ask Money
  needed), and Ask Money knows it is for spending abroad. A debit or forex card
  below zero cannot be right (a card bill read before its type was set): its
  card says *Set balance* instead of a minus figure.
  A forex card holds **several currencies** (17 Nov, Rutvij: dinar, yen, dollar,
  pound on one card). Its Set balance asks for each currency and amount, as the
  card app shows them; a spend abroad in a currency after that comes off it (the
  text's own amount, `originalAmount`). Its page lists *On the card*, each
  currency with what it is worth in rupees at today's rate, and the card in the
  wheel shows them in one line ("$385 · KWD 30") over the rupee total, which is
  what counts in *In your accounts*. Loading the card from a bank is a transfer
  (the bank goes down in rupees); what landed in each currency is set on the
  card, since the rate the bank used is not in the text. Rates come once a day
  for USD, EUR, GBP, JPY, AED, KWD, BHD, OMR, SAR, QAR, SGD, THB, AUD, CAD and
  CHF, and bank texts in those currencies are read.
- **An account's or card's page** (direction A): the account drawn as its card
  (balance or what you owe on it), then round-icon buttons Add · Transfer · Set
  balance (Set owed) · Edit.
- **Subscriptions** (direction B): a month and a year, the logos in a row, then
  the list. Tabs (16 Nov, Rutvij): Subscriptions · Bills · **SIPs**, where every
  holding with a monthly SIP shows with its day, when it next goes and what is
  invested a month. **Reports** (direction A): Came in and Spent tiles, how this month
  compares, and the Analytics chart.

### Money pages with no artboard, from the kit (14 Nov, phase C)
No screen stays on the generic layout; each is put together from v3 Noir kit parts.
- **An account's page**: the top bar; the account's disc, name, bank and last
  digits; pills for its kind and whether it counts in net worth; three numbers:
  *Balance* (with "bank said, 12 Nov" when a text stated it, else "from
  opening balance"), *In* and *Out* this month. A card shows *Owed*, *Bill*
  (amount and due day, coral once late) and *Limit used* instead. Then Add payment
  and Transfer; *Money out* by month as columns in tracks (six months); its latest
  payments; its Fields; attachments, tags and reminders.
- **Subscriptions** (Money › Subscriptions): what they cost a month and a year,
  then the active ones, soonest renewal first, each with its day in words
  ("Thu 10 Dec · in 26 days") and its cost a month; paused and cancelled ones
  below. None active: the *No active subscriptions* card from the States design.
- **Who owes whom** (Money › Who owes whom, the *All* of that home section; built
  from NR-Money-Owes 17 Nov): two tiles, *To you* in lime and *You owe* with a coral
  figure; then *Owed to you* and *You owe*, a card per person with their net, their
  latest four open items ("Sat 17 Oct · Turf at Playground Arena", an item the other
  way round with a minus; "6 more" opens their page) and a full-width Settle up, lime on the one who owes you most; the
  last settled ones faded below. A Turf debt's reason is "Turf · <venue>"; its date
  is its own Field.
- **A debt's page** (built from NR-Money-Debt 17 Nov): the top bar; the person's
  disc, what it was for, who owes whom; pills for open or settled, its kind and its
  group; an amount card, lime when it comes to you, orange when you owe, grey once
  settled, with the date and a dark row for the whole balance with that person.
  Then Settle up all (everything with them, with Undo), their page and Edit; the
  payment it came from; what else is open between you, each with its day; its
  Fields; once settled, the day and Reopen; attachments, tags and reminders.
- **Reports**: account kinds in words, one minus sign (−). The net worth line
  ends at today's net worth and is walked back by each month's payments, so it
  agrees with the number above it; it starts the month before your first payment.
  A buy or SIP moves money into a holding and does not change net worth; holdings
  count at today's value.
- **Small things**: Money home's *Accounts › All* opens Reports › Net worth (real
  balances), not the generic list; the form's date shows whole (the year only when
  it is not this year); the parser export sits with the
  masked samples (You › Data sources › Message samples), not behind SMS senders.

### Names and storage (15 Nov, Rutvij)
- **One name per payee**: once a payment is matched to a payee for certain, it
  shows the payee's name ("Playo" for the bank's "PLAYO"); the merchant Field
  keeps the bank's spelling ("As the bank wrote it").
- **No useless storage**: a Delivery's one-time code goes as soon as it is
  delivered (else after a week). After 90 days a payment keeps its Fields and who
  it was paid to; its activity thread (created, linked, the message it came from)
  and its links to the bank account are deleted, except what you wrote or changed.

### Money on its own (agreed 14 Nov, phase D)
Learned from Rutvij's masked texts: SBI's nameless "debit by NACH" (₹5,000, ₹2,000
around the 5th) are SIPs counted as spending; ICICI warns before every
standing-instruction charge (Adobe, Spotify, Blackmagic, Lovable); electricity
(MSEDCL) and water (OCW) bills come as texts; Adobe went from ₹1,516 to ₹699 in
August (a plan change) and nothing said so. In the order built:
1. **NACH to SIP.** A debit by NACH with no name, for an active Investment's SIP
   amount within 3 days of its SIP day, is that SIP: filed as investing, not
   spending, and its Investment's *invested* grows. When none matches, To check
   asks "₹2,000 by NACH on Mon 5 Oct: a SIP?" with each active holding, *New SIP*
   and *Not a SIP*. Picking one moves the payment to investing and sets that
   holding's SIP amount and day, so the next one files itself; *Not a SIP* is
   remembered for that amount. Until answered it stays spending.
2. **Heads-ups before a charge** ("Payment of INR 1516.30 towards Merchant Adobe…
   to be debited… due by 09/07"): set that Subscription's next charge and amount
   (made if new, auto-post off, since the charge text follows), so it shows in
   *Coming up*.
3. **A price change**: a charge or heads-up at a new price adds to the
   Subscription's price history and puts *A bill went up* (or *down*) in To check
   ("Netflix went from ₹499 to ₹649 · ₹1,800 more a year", Keep it · See it) and
   the morning brief. A change under 2% is not one. A foreign one compares its own currency (`foreign`), so the rupee rate
   does not count as a change.
4. **Spotted subscriptions**: three payments to the same payee within 5% of the
   same amount, 25 to 35 days apart, and no Subscription for it: To check asks once,
   "Spotify, ₹299 every month: track it?". *Track it* makes the Subscription
   (auto-post off) and links the payments; *Not a subscription* is remembered for
   that payee.
5. **Bills are Subscriptions** with `bill` set and auto-post off (the brain already
   asks "Paid?" for those); `payee` is the word that names the biller in a payment
   (MSEDCL). A due text (electricity, water, gas, internet, phone, an EMI or a
   premium, with an amount) sets its amount and due day, made if new; a text with
   no due day ("Water Bill … is generated") is due 15 days after it. A payment to
   that payee within 5% of the amount marks it paid: linked, and the next due day
   is a month on. Money › Subscriptions shows bills in their own group ("3
   subscriptions · 1 bill"); bills stay out of the subscriptions run-rate.
6. **Month close**: on the 1st to the 3rd, Money home opens with last month:
   spent against usual, came in, saved (came in less spent), the three biggest
   changes by category against usual, new subscriptions and price rises; it opens
   that month in Reports. The morning brief says it on the 1st.
*Charged twice?* and *A new fee* come with Ask Money (phase E).

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
  Records. Drawn as the module stack: the open card (and the last, which
  nothing covers) shows its Overview's line and, in dot letters, whatever says
  it best: a number, a name, a place or a day (`card.dots`, 8 characters; else
  the number in the line). A card may take turns between faces (`card.cycle`,
  3.5 s each). 15 Nov, Rutvij: Turf's card shows the next match's day ("SAT
  21", the venue under it); with none booked it takes turns between what is
  owed ("3740", "13 owe ₹3,740") and BOOK ("No match booked"). Never a name.
  **One Turf** (15 Nov, Rutvij): a module whose board is a cross-module one
  opens that board (`shownWith`), and that board is not listed again under
  Boards. The games card opens the Turf board; games' plain record lists are
  reached through search.
Then **everything else lives here too**: Links, Facts (the Second Brain's), Recent, Tags, Reminders,
To check history, Data sources status, the component gallery (dev). If it is a
screen and not a tab, Browse reaches it. Any board can also be pinned to Today as a
tile, and opened by name from the Dump box ("open turf"). A new board is one
folder under `src/boards/<id>` registered in one list, like a module; later a
board may come from a package (the plugin story), which changes nothing here.

### Modules shown (15 Nov, Rutvij)
While modules are finished one by one, the app shows only the finished ones:
**Money and Turf** (games) on a phone's first start. A hidden module is left
out of Browse (the module stack and its boards), Today's tiles, Upkeep, the
brief, the morning notification and search's actions, but keeps running, so
nothing it collects is lost, and a linked record (a payee in People) still
opens. You › Modules has a switch per module and **Show every module**; demo
data shows every module too. A cross-module board is shown with its module
(Turf with games, `shownWith`); Today and Upkeep always are.

### The bar inside a board (15 Nov, Rutvij)
The bottom bar never goes away. Inside a board that has sections of its own,
the bar takes them, and its raised button does the board's main action in
place of Dump: in **Turf**, Home · Games · **+** (New match) · Players ·
Venues, which replaced Turf's switcher at the top. A section stays lit on its
deeper pages (Players on Leaders and a player). The back button at the top
leaves the board. A screen with its own box at the bottom (Ask Money) shows no
bar. In **Money** (15 Nov, Rutvij): Money home · Spend · Accounts and cards ·
Subscriptions, and the raised button is Ask Money's sparkle, which opens Ask
Money.
Every page has a back button, Money home's going back to Browse. Every other
board and module page keeps the app's own bar, and its buttons lead back out
to Today, Upkeep, Dump, Browse and You. A board declares its sections as `bar` (`docs/PLUGINS.md` contract:
`BoardManifest.bar`).

### You (settings)
Data sources (each source: permission, enabled, last sync, today's count; SMS
senders; Export texts for the parser; Sync all) · Agent (providers, keys, daily
budget, models) · Categories and rules · Home (Today tiles) · Notifications and
quiet hours · Backup and restore · App lock · Appearance · Locale and currency ·
Component gallery (dev).

### Also in the app (kept — 4 Oct)
- **Demo data switch** (You › Demo data, 4 Nov): sample data in its own database, fresh when turned on and each new day, your own never touched. While on, nothing is read from the phone, nothing goes to Turf web or Notion, no notification is scheduled.
- **Links** (the code calls it Graph view; renamed 4 Oct because "graph" means a
  chart): a sixth generic screen and an important one. From any Record (its
  Links card) and from Browse: the network around the record — Karan in the
  middle, lines to Zomato, the gym, the dinner, the payment — 1–2 hops, tinted
  by module, link words on the lines; tap re-centres, long-press opens. Reads
  Link records only, so every module gets it without writing anything. Not to
  be confused with the tiles on Today, which are charts and open Metric.
  Decided with R11 (2 Nov), the logic sharpened 15 Nov:
  - **How a Link reads** (the *Links · Noir* artboards L1 to L7 on the design
    canvas, 15 Nov). Words are lower case, as the record would say them:
    Karan *works at* Zomato, was *with* the dinner, *paid* ₹1,240, is *member
    of* Saturday football, *played in* a game, *captain of* another. Most
    Links are made by a link Field, so the Field says what the Link means:
    from the record holding it, the Field's label ("project", "venue"); from
    the record it points at, a verb where the Field names a part someone
    plays (*with*, *paid*, *member of*, *captain of*, *fronted*), else the
    other Object's records ("tasks", "transactions", "debts"), never the
    Field's word read backwards. Links no Field made use the Object's
    declared words (a Place: "been here"), then core's words, then the other
    Object's name. Between two records of one Object only the direction tells
    (Koramangala "in" Bengaluru; Bengaluru "contains"). A line on the map
    says its card's word, one record in the singular ("task").
  - **One thing once** (15 Nov). Some records are another face of a thing, or
    the meeting of two, and Links shows the thing, not each record. An Object
    says which with `linkRole`. A **face** folds into the record in a Field: a
    Player profile is its Person, a Venue is its Place (so Playground Arena is
    one node with its Games). A **join** is shown as one link between the two
    records it joins: an Appearance is Priya playing in a game, so Priya has
    "Games" and a game has "Players", each row carrying the share ("₹450 ·
    paid · 1 goal"); what is about that share (its Debt) folds into the same
    row ("Owes you ₹450"), as does what you owe for someone else's share in a
    game shown there. Joins and their Debts are never nodes in the network;
    holding a game row offers *Open the appearance*, and it is removed from the
    game, not from the card. Today: games' Appearance (join), Player profile
    and Venue (faces).
  - **Payments are an audit trail, not Links** (decided 15 Nov). A payment
    touches a card, a payee, people, a trip, and a monthly one (Claude) would
    add a line and a row every month, crowd every card and map and slow them.
    So a Transaction (`linkRole: { trail: true }`) is never shown as a Link:
    it is an **Event on the timeline** of each record it touches (Recent on
    the record page: its title, amount, when, its own line), newest first,
    in place of the "Linked from" line. The Links stay stored (finance and
    its boards read them, and a payment's own page still shows its card and
    payee); only Links leaves them out: the card, the map, Browse › Links and
    the add sheet. A Delivery shows its order's payment from its Order Field.
  - **The Links card** (L4) is on every record: the generic page draws it,
    and a board that draws the whole page gets it below its page unless it
    draws its own (Person's, from NR-People, which reads the same groups). A
    small map of what is around it (*Open Links*), then every link grouped by
    its word in a left column, each row a disc in its module's colour, what
    it joins up under it ("₹450 · paid · 1 goal · Owes you ₹450"); a guessed
    one says *to check*. Groups of hidden Objects (a habit's check-ins) come
    last. Four rows a group, then *N more* (opens Links). Tap opens the
    record; **hold** opens the link (L3). Mentions are not here (Mentioned in
    has them).
  - **A link, tapped** (L3; hold a row, or tap a word on the map): the two
    records and the word, since when and whether still true, where it came
    from (a dump with its sentence while the dump is kept, a message, the
    agent, a Field, you), how sure it is (under 70% it is dashed with a "?";
    *Right* confirms it), **Set dates** (since and until), its word to change
    (not a Field's: that is changed on the record), *Open* the other end,
    **Remove this link** with Undo. A link through a meeting (Priya in a game)
    opens that record instead.
  - **Adding a link** (L5): find the record or start a new one (linked once
    saved), pick the word (this record's own link Fields, which fill the
    Field, then knows · family of · works with · with · at · part of · owns ·
    paid for · about, or your own), since when if you know, **Both ways?**
    (the same word from the other record too; not offered for words core
    already keeps for both, like knows, or for a Field's word), Link. Saved as
    yours (source manual), so it never lands in To check. Removing a Link a
    Field made takes it out of the Field, else the next edit brings it back.
    Faces and meetings (a Player profile, a Venue, an Appearance) are not
    offered: you link the thing itself.
  - **The Links screen** (L1, L2; `/links/<id>`): *1 hop · 2 hops*, the count
    and how many are to check, module chips to filter, then the map: the
    record in the middle with a lime ring, the first ring round it in module
    colours with "+3" for links further out, the word on a pill along each
    line (dashed with "?" when guessed); two hops pull the first ring in and
    add a smaller, dotted second ring whose words show when a line is tapped
    (a tapped line goes lime, the rest drop to 20%). Ring two is ranked by how
    many of ring one each record shares (Karan, at two of Priya's games,
    first), at most four of one Object, thirty records in all; records of
    hidden Objects and details of a meeting stay off it, the centre apart.
    Tap a record to centre on it, hold to open it. Under the map, the centre's
    card (*Open record*, the hop switch, *Back to* the start) and its Links
    in full. Still by default (no pulse or halo); when the map opens the lines
    draw out from the centre once (300 ms), and re-centred the tapped record
    glides to the middle (420 ms) while the old centre moves out to the first
    ring; reduced motion skips both. Two fingers pinch to zoom and drag to pan
    (one finger still scrolls and taps); double-tap or *Reset zoom* goes back.
  - **From Browse** (`/links`): the records that join up the most, by breadth
    (each kind of linked record counts up to five, so 40 payments on a card
    don't outrank a person linked to games, debts, a group and a trip), then
    modules reached; hidden Objects neither count nor appear. Above it,
    **everything** (L6): find a record; *Clusters* (each module a cloud of its
    records in its colour with how many, the best-linked record in the middle
    with lines out to each cloud's best) or *Free* (every record placed with
    the links between them); how many records and links; module chips; a
    **time-lapse** (Play runs from the first record filed to today, or drag
    the bar) showing them appear in the order they were filed.
- **Automations**: a tile in the Browse grid. The list of your automations with
  last run and state; the editor (trigger → conditions → steps, outputs passed
  along); templates; run log per run and per step; run now. Manual-run
  automations can also sit as buttons on Today. See layer 3.
- **Activity**: a board (layer 3, *Activity*), a tile in Browse › Boards and a
  Today tile. The GitHub-style grid per tracker ("days coded", "days with
  Zomato", "8,000 steps"), rules over messages, payments, records, metrics,
  screen time, calendar events and habits. Its screens are
  `/board/activity` (home), `/board/activity/tracker?tracker=<id>` and
  `/board/activity/edit` (`?tracker=<id>` to edit).
- **Tags**: tag chips on every Record and List; a Tags page from Browse › Recent;
  one page per tag listing its records across modules.
- **Facts**: the Second Brain's Facts half (R7f; layer 2, *The Second Brain*), a row in
  Browse (by who they are about; edit, forget); `/memory` opens it.
- **Reminders**: its own screen listing one-off Cycles (reminders) by time, from
  Today and You › Notifications. Upkeep shows them too; this is the focused list.
- **Spend**: its own screen from Today's spend tile and the Money overview:
  transactions with sort (date, amount) and filters (category, account, kind,
  date range), spend by category. It is Money's List with its filters pinned.
- **Money in the v3 Noir kit (14 Nov)**: Money home's *Where it went* is the kit's
  ring with badges; Spend shows *This week* as columns in tracks (today white) and
  *When it went* as hour ticks (each spend's hour from when its text arrived, or
  when you typed it that day; hidden when no times are known); a person's Money
  section opens with the donut *Shared with Priya · this month* (your share and
  theirs across the splits they are in); the Money tile on Today has a second look,
  *Instrument* (Money · live: the last 7 days in dots, against the 7 before), the
  week bars staying the default.

### Splitwise and settling up (agreed 17 Nov, Rutvij; designs first)
From Splitware (a Splitwise client Rutvij uses, read 17 Nov): sign in to Splitwise
inside the app, then read and write Splitwise as you. In the order to build, each
drawn first on the Money design canvas (*Splitwise* row):
1. **Connect Splitwise** (Money's grid menu and You › Agent): Splitwise's own
   sign-in page inside LifeOS (a WebView: one new app build); the session stays
   in the phone's cookie store, which LifeOS's calls share; Sign out clears it.
   Calls go to Splitwise's API as the website does (the session, with its CSRF
   token for writes).
2. **Link people once**: Splitwise friends matched to People by name or email,
   each confirmed; only linked people sync. Their Splitwise balance shows beside
   LifeOS's on their page, so a difference stands out.
3. **Shares go to Splitwise**: a Debt for a linked person (a Turf share, a trip
   split, a split payment) becomes a Splitwise expense (you paid, they owe their
   share; same description and date); the Debt keeps its Splitwise id, so delete
   and Undo remove it there too. A Turf group or trip may map to a Splitwise group.
4. **Settled, both ways**: money from a linked person in a bank text settles their
   Debts in LifeOS and records the payment on Splitwise; a payment they record on
   Splitwise settles them in LifeOS at the next sync.
5. **Pay by UPI** from Settle up: the UPI app opens with the friend's UPI ID,
   amount and note (`upi://pay`); a friend's UPI ID is kept on their Person, on
   the phone only.
6. **Type an expense with a split** in Money's +: "1200 dinner with Arjun and
   Priya, Arjun paid" (Haiku) fills the payment, who paid and each share, and goes
   to Splitwise for linked people.
7. **Remind**: on someone who owes you, a short friendly message with the amount
   (Haiku), ready to send on WhatsApp.
**Its own board (18 Nov, Rutvij; v0.0.123):** Splitwise is a Browse board
(`src/boards/splitwise`, id `splitwise`), not a Money screen: Browse › Boards ›
Splitwise, shown while Money is. Money's grid menu and a person's "Splitwise
says" line open it. It defines no Objects; the client and the sync stay in
finance. Its screen is the one described below; sections of its own wait for
their artboards.
**Built 17 Nov (v0.0.117, steps 1 to 4)** on the *Splitwise* artboards: then Money ›
Splitwise (the grid menu; a person's Money section links there), now its own board. Signed out, the
mint card and *Sign in with Splitwise* (Splitwise's page in a WebView, needing the
build with `react-native-webview`); signed in, the live instrument (owed to you
and you owe, from linked people's Splitwise balances), arc ticks for people
linked, *Link your people* (a guess by name with Link or Not them, Pick from
People or add a new Person; Linked unlinks, with Undo), a group's shares to a
Splitwise group, *New shares go to Splitwise*, Sign out (clears the cookie
store). `src/modules/finance/splitwise.ts` holds the client and one sync, run
when Money › Splitwise opens, from Sync now and with the app's background sync:
new Debts for linked people made after linking go out as expenses; a Debt gone
here is deleted there; Debts settled here go out as one payment per person;
Splitwise payments since the last sync settle Debts here, oldest first, up to
what was paid. LifeOS remembers the expenses it made, so it never reads its own
back. A person's Money section says "Splitwise says ₹1,600 too · in step", or
how far apart. **Built 17 Nov (v0.0.118, steps 5 to 7 and the bill split):**
- *Settled from the bank text*: a payment tied to a person you have a balance
  with (theirs in, or yours out) settles their shares oldest first, up to what
  moved, the moment it is tied to them (`settleFromPayment`); Turf's shares are
  left to Turf, whose ledger sets them. Splitwise gets the payment at the sync.
- *Pay by UPI* on a person you owe: their UPI ID (the person's UPI Field, asked
  for once) opens your UPI app with the amount and what for (`upiLink`).
- *Remind* on someone who owes you: Haiku writes it (tones: Friendly, Short,
  Funny, With my UPI), their name sent as {name}; Send on WhatsApp opens their
  chat when their phone is known.
- *Type a split*: "1200 dinner with Arjun and Priya, Arjun paid" is split
  equally on Save when every name is someone in People (else its page opens).
- *Split the bill by item* (Money › Split the bill, from a scanned bill's
  *Split by item*): the bill is read line by line (name, quantity, line total,
  tax, service); tap a face to take someone off a line, hold it for portions; a
  line no one took is shared by everyone; tax, service and rounding go in
  proportion, to the paisa (`splitBill`); Save files the payment and each
  share as Debts (so Splitwise follows).
Turf and Splitwise (checked 17 Nov): a Turf share for a linked person is a Debt
the moment the game reaches LifeOS, and goes to Splitwise within seconds (a
change to a linked person's Debt starts a sync 4 s later). When Kalpak pays by
UPI, the bank text is filed, Turf matches it to his share (on its own when the
sender is known and the amount exact; else To check asks), marks it paid on Turf
web, and his Debt settles; Splitwise then gets a payment for the amount that was
sent there (a part payment shows on Splitwise only once the share is paid in full).
Still to come: one Splitwise expense per bill with every share (today each
share goes as its own), and the bill photo on it.
Bills, statements and fund screens are read by Haiku (bills already; statements
back from Sonnet once it has room). Left out: Splitware's UPI directory (it sends
your email and UPI ID to a third party) and a copy of Splitwise's group screens
(parked in ADHOC). Only the linked people's Debts go to Splitwise: their
Splitwise id, amount, description and date.

## 6. Milestones — proposed 4 Oct

Thin slices, each usable on the phone when done. `docs/MILESTONES.md` M1–M4 stay
as history; new work is tracked here. "Done" means: typecheck and tests green,
the slice checked on the S22, the box ticked in the same commit.

**Merged 2 Nov 2026** (branch `claude/merge-r5-r15`, one version each, tests
green after each; `docs/handover/merge-r5-r15.md`): v0.0.18 R15, v0.0.19 R12
(code side), v0.0.20 R8, v0.0.21 R11, v0.0.22 R10, v0.0.23 R6, v0.0.24 R7b,
v0.0.25 R7d, v0.0.26 R7f, v0.0.27 layer 8 slices 4 and 6. R5 had not been
pushed by its session, so it is not in. None of them is checked on the phone
yet.

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
  source is declared by a module (R2 contacts / call log — done; calendar with R4; R6 health / usage: done); the
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
  Upkeep; Upkeep re-hung on cycles from every module. *Built in its own session
  on 2 Nov but not pushed when the others were merged; not in v0.0.27.*
- [x] **R6 health**: built 2 Nov 2026 (branch `claude/r6-health`; no migration). Measurement and
  Workout as agreed (layer 2, *Body*; keys unchanged): sleep gains Asleep and Awake, a Workout its
  Started time and a duration Field; screen time stays in core's usage tables (decided, layer 2).
  **Sources declared by the module**: Health Connect and Usage access read the phone through
  `os.device.health` and `os.device.usage` (platform keeps the native calls), run by core like the
  others; Health Connect's filing (`saveHealthDays`) moved from core to the module, unchanged but
  for the new Fields. **Comparisons** in core (`compareMetric`): this week vs last and vs your usual
  (the median of 8 weeks), a week being its average per day with data; on every metric's page and
  on the Metric screen. **Tools**: `health_today`, `metric_compare`, `workouts`, `log_measurement`.
  **Brain**: a *due* weigh-in when you weigh yourself by hand and it has been twice your usual gap.
  **Board** (a first pass from the kit until the `NR-Health-*` artboards of
  `docs/design/HEALTH-BRIEF.md`): the Health home (a card per metric, workouts) and one page per
  metric (steps, sleep, heart rate, weight, screen time); `src/screens/HealthHome.tsx` is gone.
  Demo data has five weeks of Body. 498 tests green; the web export builds. *Not in R6*: custom
  metrics with a name of their own, dumps filed by the sentence parser (the model files them).
  **Phone check pending.**
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
- [x] **R7b deliveries**: built 2 Nov 2026 (branch `claude/r7b-deliveries`; no migration). Delivery as agreed
  (layer 2, *Things*): shop → Organisation (word *vendor*; made once, kind shop, if you have none) with the
  typed text kept, order → Transaction (word *bought in*), the tracking link a url. **Filing**: the parcel
  parser kept (Amazon, Flipkart, Myntra and other shops; Delhivery, Blue Dart, Ekart, Shadowfax and other
  carriers), plus **quick commerce** (Instamart, Zepto, Blinkit texts and notifications; Swiggy food is
  not one) and the **shop apps' notifications** (Amazon, Flipkart, Myntra, Swiggy, Zepto, Blinkit; the
  notifications source listens to them through the parser's `packages`). A quick order is one record
  from placed to delivered (matched within 6 hours) and stops being on its way after 6 hours of silence.
  **The payment**: a new delivery takes the newest spend whose payee names the shop in the 2 days before;
  a payment that comes later (cash on delivery, a late SMS) finds the open delivery through a second
  parser after the money parser (`deliveries.payments`, priority 45). Deliveries reads only a
  Transaction's title, when and its kind; it imports neither finance nor places. **Brain**: *coming up*,
  a parcel (not quick commerce) expected today or out for delivery, urgent with an OTP; the OTP never
  leaves the phone; Yes is Track or Open. **Board** (a first pass from the kit until the `NR-Deliveries-*`
  artboards of `docs/design/DELIVERIES-BRIEF.md`): the Deliveries home (Arriving today as cards with the
  OTP large, On the way, Delivered lately), the Delivery page's top (OTP, status steps, Track, Delivered
  by hand with Undo, Shop and Paid), the Overview. Every parser is written against **plausible samples**
  in the tests, not real texts. *Not in R7b*: a Deliveries tile for Today; a raw text Field (the text is
  on the timeline, as before). **Phone check pending.**
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
- [x] **R7d travel**: built 2 Nov 2026 (branch `claude/r7d-travel`; no migration), with layer 8's travel slice.
  Trip's Fields as written in layer 2 (*Agenda*): the destination is linked *to* its Place (matched by name, a
  city, area or country first, else made as a city; once on first open for the trips you had, `travel.foldedR7d`,
  then whenever a trip is saved), and a Place's page shows **Trips here**. **Spend vs budget** through Links only:
  money-out Transactions linked by the Trip Field (*trip*) or a booking mail (*part_of*), each once; left, per
  day, per day left, by category; the payments made on the trip's days that are on no trip are offered to add
  (through the Trip Field, with Undo), never added on their own. **Mail**: the bookings parser reads IndiGo, Air
  India and MakeMyTrip tickets (the route also from codes in brackets, the flight day never the booking day) and
  MakeMyTrip hotel, Booking.com and Airbnb stays (a date on the line after Check-in, the listing's name); a trip
  made from mail is *booked*, a return flight moves its end; tested on plausible samples, not real mail.
  **Packing**: the list from the days (three when undated) and the kind of place (beach, cold, a city; abroad
  from the destination or a local currency that is not INR): tops one a day plus one, bottoms one per three
  days, sleepwear, swimwear at the beach, two warm layers somewhere cold, chosen from clean clothing Assets
  found by their data; things from Home's Bathroom Stock (else three defaults) plus charger, ID, medicines and
  what the trip asks for; Pack sets the picked clothes *packed* and links them *packed for* the trip (a new core
  link word), Back home puts them *in the wash*; the travel module imports neither assets nor inventory.
  **Brain** (`travel.brain`, all *coming up*): check in (a flight within 48 hours, urgent within 24; Yes opens
  the airline's site), pack (a trip within 3 days with nothing packed; Claude fills a list for this kind of trip,
  kept by `packingKey`), before you go (one or two days out; Claude joins it with the pass's other nudges), back
  home (clothes still packed after a trip). **Tools**: `trip_spend` (with `plan_trip`). **Board** (a first pass
  from the kit until the `NR-Travel-*` artboards of `docs/design/TRAVEL-BRIEF.md`): the Travel home (next trip
  or away now with spend and bookings, coming up, been), the Trip page (dates, spend vs budget, Pack or Back home,
  flights and stays, expenses, spent on those days), the packing picker, Trips here. 502 tests green; the web
  export builds. *Not in R7d*: the weather there (a free service still to choose), "forgot last time", the
  "back: the fridge is probably empty" nudge, trains and buses. **Phone check pending.**
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
- [x] **R7f knowledge**: built 2 Nov 2026 (branch `claude/r7f-knowledge`; no migration). Note, Fact as the
  Second Brain; Memory replaced (layer 2, *The Second Brain*). **Module**: Note's title follows its
  first line until you name it; `[[mentions]]` as *mention* Links (core's `syncMentions`); notes
  pinned first, by kind, searched with the Facts; Facts grouped by what they are about; everything
  known about a record or a name. **The fold** (once): name facts onto the record that now has the
  name, a deleted record's facts keep its name, every Note's mentions linked again. **Tools**:
  `write_note`, `find_notes`, `what_i_know` (the last two on the Dump box's question path too).
  **Core, small**: `facts.setSubject`, `aliases.all`, a record section's `fields` (the Details card
  leaves them out), the two read tools in `READ_ONLY_TOOLS`. **Board** (a first pass from the kit
  until the `NR-Knowledge-*` artboards; `docs/design/KNOWLEDGE-BRIEF.md`): the Second Brain in
  Browse › Boards (search, Notes · Facts, What you call things; `/memory` opens its Facts half), the
  Note page with its mentions as links (unknown ones faded, a tap searches), the Note form with
  Mention. 495 tests green; the web export builds. *Not in R7f*: `[[` suggestions while typing.
  Layer 5's Memory line now says Facts (updated at the merge, v0.0.26). **Phone check pending.**

### Boards and automations
- [ ] **R7g the trip template** (planned 15 Nov): every trip gets the five sections of the *Trip template ·
  Noir (Japan)* page with the Japan app's features, on layer 2's Objects and Fields (*The trip template*,
  *Bill*). Eight slices, each usable on the phone when done; no migration in any. Order: 1 → 2 → 3 and 5
  (either first) → 4 → 6 → 7; 8 once a host is chosen. The Japan trip is the first one built on it, with the
  *japan* look, imported from the Japan app's data slice by slice (1: the trip, stops, day plans; 2: bookings
  and journeys; 3: things and events; 4: expenses and paybacks as Bills; 5: checklist and alerts).
  - [x] **1. Stops and the line.** *Built 15 Nov (branch `claude/serene-edison-o0lpvy`; no migration; see
    `docs/handover/r7g-1-stops.md`).* Stop; the fold (once): each trip's destination becomes its first stop, and
    each stay already filed makes or finds the stop for its city. Plan › Line (stops in order with nights and
    stay, gaps and planned nights, ideas with Add to the line, swap two stops), Plan › Days (the calendar,
    each night's stop, moving days, Add to my calendar as .ics), Plan › Map (the stops' pins and the route,
    drawn as Places draws maps until a provider is chosen), a stop's page with prev / next, the edit form
    with common places offered. A booking mail's stay lands on its stop.
  - [x] **2. Journeys, stays and Bookings.** *Built 16 Nov (no migration; see `docs/handover/r7g-2-bookings.md`).*
    Event's travel Fields; journeys between stops; a day's page
    (Overview · Itinerary · Stay & pay · Travel: leave by, arrive, cost each, book ahead, last connection,
    step by step, your day lines); Bookings (flights as a boarding pass with each person's fare, airport cards,
    stays with paid and still to pay, cancelled and planned ones, which miss a check-in time, tours and
    others); a booking's page (`JP-Booking`) with its papers (Document's Booking link); journeys' links to book. The parsers fill check-in times, still
    to pay and free cancellation from the mail. Nudges (*coming up*): seats open, free cancellation ends, a
    card is charged, a check-in time is missing.
  - [x] **3. Things to do.** *Built 16 Nov (no migration; see `docs/handover/r7g-3-things.md`).* Thing to do; a stop's things (All · Planned · Want to · Ideas · Free; how busy,
    quietest time, Google Maps); events on the route (festivals and what to be aware of: closures, holidays,
    crowds, weather) with how sure and the source, and the copilot finding them for each stop's dates.
  - [x] **4. Bill and money on a trip.** *Built 16 Nov (no migration; see `docs/handover/r7g-4-5-money-prep.md`).*
    Bill in finance (Splitwise's payers and five ways to split, the ₹ value
    fixed, part payments toward a booking, a payback between any two, Simplify debts on the Group); the split
    arithmetic in core (`src/core/money/split.ts`, used by finance and travel alike); the trip's ledger (paid ·
    booked · estimates), each person's projected against Budget each, Daily allowance, Rate (edit it), where
    the money goes, the journeys table; Log a spend; Split a receipt (the photo read through the brain's photo
    path, items assigned by tapping names); a Bill's page showing how it split (`JP-Bill`), edit and delete with
    Undo; Settle up (everyone's balance, who owes whom, not in Settle up yet with Add); Pay back. On the trip
    page, spend against the budget is your projected share, and Money shows your balance. *Still to do:* the
    fold of today's splits (finance's Debts stay as they are; balances and Settle up add the Bills on top, so
    nothing counts twice), cost by day and the insights in code (slice 6), Remind on WhatsApp.
  - [x] **5. Prep.** *Built 16 Nov (no migration; see `docs/handover/r7g-4-5-money-prep.md`).* The checklist as the
    trip's Tasks with Trip and Section (a Task gains both, and a hidden source key), its filters, the notes as
    alerts (Tasks in *notes* by priority, Handled ticks them), Ready to fly by section, the departure-day check,
    Add an item; Packing (the trip's packing Tasks, and R7d's Packing for clothes, a tap away); Docs (the shelf
    from Documents and the documents Tasks, the emergency card by country with tap to call). Money and Prep sit
    side by side on the trip page.
  - [x] **6. Overview, Today and Recap.** *Built 16 Nov in the design pass (below).* The stage stepper, Needs attention, Coming up with the deadline rail,
    the line as nights, stays as station boards, money, stamps, weather by stop (normals), Ready to fly, your
    balance; Today in the morning (leave-by countdown, the next train, last connection, the day, show the
    driver, cash with a quick add, the stamp collected) and the afternoon (the rest of today, bring and pack,
    tomorrow); Recap (spent by stop, steps, settled up, back home, Keep for the next trip). The trip bar on
    every trip screen, the ₹ / local currency switch, the *japan* look (the app's posters, photos and maps).
  - [x] **7. Search and the copilot.** *Built 16 Nov in the design pass (below); Booking.com and Gmail finds stay labelled slots until they are connected.* The trip's search (records, actions, views); a helper in every section; the
    trip copilot over the trip's records, your mail (finance's mail source) and a receipt photo, proposing
    changes (add a thing, a day line, a Task, a note, a Bill from a receipt, a payback; change a booking or a
    journey; move a thing; set a thing's status; tick a Task), saved only on Save, with Undo; by voice through
    R12's chain; it grows with every tool a module adds. Booking.com stays a slot until a connector is chosen.
  - [x] **The design pass** (16 Nov; `docs/handover/r7g-design-pass.md`). Every trip screen is drawn to its
    `JP-*` artboard on the *Trip template · Noir (Japan)* page and runs on live data: Travel (all trips), the
    trip page by phase (Overview before, Today morning and afternoon while away, Recap after), Plan (Line,
    Days, Map), a stop and its edit sheet, the stay, a day (Overview, Itinerary, Stay & pay, Travel), Bookings
    and a booking, Money (Budget, Settle up), Log a spend, Split a receipt, Pay back, a spend's page, Prep
    (Checklist, Packing, Docs), Search, the copilot and its voice screen, and the view-only trip. One frame
    for all of them (`src/boards/travel/jp/shell.tsx`): the trip header with the ₹ / local switch, the stage
    stepper, the trip bar (Overview · Plan · Bookings · Money · Prep and the copilot), the dot-matrix board;
    the motion and the seigaiha in `jp/kit.tsx`. The Japan touches (the name in its script, mincho station
    names, the hanko, stamps, seigaiha) show only on a trip in Japan. Weather is each stop's month normals
    (`weather.ts`) until live weather is chosen. A Trip gains hidden `wallet` (cash and IC) and `keep`.
  - [ ] **8. Trip members** (once a host is chosen): invite the trip's Group; members see, comment and add new
    things; their changes and removals wait in your To check as suggestions; their own ticks; references,
    payment notes and papers stay yours. A synced copy on the host, as Turf web's.
  Another place's look is designed when a trip there is planned (layer 2, *Looks*). *Not in R7g*: live
  weather and crowd data; live Booking.com.
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
      Yes learns the sender. **15 Nov, Rutvij: a payment that comes in is marked
      paid right away**: a bank name whose first name is only one player's, or
      the Person finance linked, counts as known; exact amount within 30 days of
      the game is recorded on its own and the sender learned (up to ₹20 over
      counts too, the extra staying money in); only part payments, more than
      ₹20 over (the question says how much more) and names two players share
      are asked; unmatched money in is looked at
      again on start and after each sync, and so are open questions: one asked
      under the older rule is recorded once its sender is known and the amount
      exact, and one whose share was paid some other way goes); boards can now give To check their own cards
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
- [x] **R10 Automations** — multi-step with data passing, manual run from a
  button or a sentence, model step, run log per step; templates.
  *Built 2 Nov 2026* (branch `claude/r10-automations`; layer 3 *Automations*,
  *As built in R10*): steps with keys and outputs read as `{{steps.s1.x}}`,
  Continue only if, Ask Claude on the brain's key and budget with a fallback,
  Run by hand from the board and "run …" in Talk, Every day once a day, the run
  log per step with Undo and Run again, templates from finance, documents and
  crm; rules from before folded into steps once, no migration. The board's
  screens are a first pass from the kit until `NR-Automations-*`
  (`docs/design/AUTOMATIONS-BRIEF.md`). See `docs/handover/r10-automations.md`.
  *Not yet checked on the phone.*
- [x] **R11 Activity and Links**: Activity board over trackers; Links screen and
  card everywhere, tinted by module. Built 2 Nov 2026 (branch
  `claude/r11-activity-links`; no migration). **Activity** is a Browse board
  (`src/boards/activity`: home, tracker, edit, and the Today tile), over core's
  trackers unchanged; the old `/activity` routes are gone (layer 3, layer 5).
  **Links**: core's `linkGroups` (the word as read from each side) and
  `mostLinked` (`src/core/graph/read.ts`); one Links card (`src/ui/components/LinksCard.tsx`)
  on every record, below a board's own page unless it draws its own
  (`ownLinks`, set by Person), with Remove link and Undo; the Links screen with
  a module legend and the card in full; Browse › Links. Design prompt
  `docs/design/LINKS-BRIEF.md` (`NR-Links-*`, `NR-Activity-*`); hand-over
  `docs/handover/r11-activity-links.md`. **Second pass 15 Nov (v0.0.31)**:
  Links built to the *Links · Noir* artboards L1 to L7 (the map with motion
  and zoom, the card, a link's sheet with Set dates, add with Both ways,
  everything with a time-lapse); words from Fields as the record says them;
  one thing once (`linkRole`: faces, joins); payments an audit trail on the
  timeline, not Links; Turf named once; Activity rebuilt to the A1 to A4
  artboards with *what made a day count* (layer 3, layer 5). **Phone check
  pending.**

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
- [ ] **R17 Ask Money and better parsers** (6 Nov; layers 4 and 5).
  - [x] Everyday money questions answered on the phone (`money_answer`, an AI tool
    with `answers`: the question it can take, read on the phone); the read-only
    money, trip and health tools opened to the question path.
  - [x] Message samples: collected, masked, grouped, exported.
  - [x] Throwaway messages and one-time codes live a week.
  - [ ] Ask Money itself, once its design is agreed.
  - [ ] Better parsers, from the first samples you send.
- [ ] **R16 Docs** — `ARCHITECTURE.md`, `GRAPH.md` and SCOPE §C retired into
  this file; `HANDOFF.md` rewritten for the three tiers.
  - [x] `ARCHITECTURE.md` retired (R0, 4 Oct).
  - [x] *The pass after the 2 Nov merge* (v0.0.27): this layer marks what is
    built, `docs/PLUGINS.md` matches the code (tiles, record sections, the
    provider chain, the encrypted database, retention), the hand-overs' parked
    ideas are in `docs/ADHOC.md`.
  - [ ] `GRAPH.md` and SCOPE §C retired into this file; `HANDOFF.md` rewritten
    for the three tiers.

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

- **OpenRouter's free model** (15 Nov, Rutvij's pick): `nvidia/nemotron-3-ultra-550b-a55b:free`
  (free, tool calling, 1M context) for main and side jobs; the old
  `llama-3.3-70b-instruct:free` is no longer offered. A model you typed in You ›
  Agent is kept.
- **Connect your AI: OpenRouter in one tap** (15 Nov, Rutvij; from broke). You ›
  Agent › OpenRouter has **Connect OpenRouter**: you sign in on OpenRouter's
  own page (OAuth PKCE, key labelled "LifeOS") and the key comes back to the
  phone (`lifeos://openrouter`), kept in secure storage like a typed one. If the
  page cannot come back, **Paste a code instead** opens OpenRouter's page with
  no way back, which shows a code to paste once. Pasting a key still works.

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
check card. Every line says its category above it, in that category's colour,
and an urgent one says when on the right (Late, Today, Tomorrow). The evening
pass updates it. The tiles stay below, as R8 has them.
**What the brief shows** (15 Nov): You › Notifications has one switch per module
that speaks in the brief (Upkeep, Money, Home, Deliveries, People, Turf, Health…).
Off leaves that module out of the brief on Today and out of the morning
notification (Health's sleep and steps, Money's spending line); its cards still
come to To check.

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
   *Built 2 Nov (branch `claude/brain-more`): see* Slices 4 and 6 *below.*
5. **Travel** — packing and before you go.
   *Built 2 Nov with R7d: pack, check in, before you go and back home; see R7d.*
6. **Every module offers candidates** — Turf, People, Money, Documents.
   *Turf and People came with slice 3; Money, Documents, Projects and Assets
   built 2 Nov (branch `claude/brain-more`), see* Slices 4 and 6 *below;
   Health (R6), Deliveries (R7b) and Travel (R7d) came with their milestones,
   all merged by v0.0.27. Left: Habits (R5); Knowledge (R7f) offers none.*

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

### Slices 4 and 6: the fridge photo and more candidates (agreed 2 Nov)
- **Snap the fridge** (Home, HOME-BRIEF screen 5). On Home and on the Fridge
  space. You press it, the camera opens, and the photo goes to Claude with the
  names of the Fridge's pills (and which to use soon), nothing else. Claude says
  what it **cannot see** (only names from the list) and what it **found** that
  is not on it, and one dish from what it sees. The differences come back as
  pills: tap to accept (Not seen: used up · Found: added to the Fridge), hold to
  fix (Not seen: still there · Found: not there); All right closes it. The
  photo is read once and kept nowhere: not in LifeOS, not in the log. The
  Sent to Claude log says *a photo of the fridge* and lists the names that left.
  The daily budget is checked first; no key or over it, the button says so.
- **Cook tonight** (slice 3's slot) gains the photo's dish: once the
  differences are accepted, the dish fills the slot for what is in the Fridge
  now (the same key), so the next pass does not ask again. Another idea (and
  Ask now, before there is a dish) runs a pass at once instead of waiting for
  the next one.
- **A module with a brain brings its own Cycles.** Upkeep's core candidates
  leave out every Cycle on a record of a module that has a brain; such a module
  offers them itself, through core's `cycleCandidates(os, module, now)` (the
  same keys, so nothing is filed twice), in its own words and verbs.

| Module | Kind · shape | When | Code's line | Yes | What leaves |
|---|---|---|---|---|---|
| Money | due · is this right? | a subscription that bills itself renews within 3 days | Netflix: ₹649 renews Thu | Keep it | name, amount, renews on, every |
| Money | due · shall I? | a bill (a subscription with auto-post off) due within 3 days, or late | Electricity: ₹2,140 due tomorrow | Paid (files the expense) | name, amount, due, days late |
| Money | due · is this right? | a SIP or a deposit maturing (its Cycles) | PPF SIP: ₹5,000 on 5 Nov | Right | name, amount, due |
| Money | due · is this right? | one spend in the last 2 days at least 3 times your usual for its category (5 or more in 90 days) and ₹1,000 or more | Swiggy: ₹4,200 yesterday, about 4x your usual Food | Right | payee as filed, category, amount, day, usual |
| Documents | going off · shall I? | a Document's expiry inside its notice (180 days for an ID, 30 else), or past | Passport: expires 12 Mar, in 4 months | Renewed (opens it for the new date) | title, kind, expires, days left |
| Documents | coming up · shall I? | files found in your folders a day or more ago, still new | 3 new files in your folders | Look (Your folders) | how many, their titles, guessed kinds |
| Projects | due · shall I? | an open task past its due day | Send the lease: 3 days late | Done (ticks it; a repeat moves on) | title, project, due, days late, priority |
| Projects | coming up · shall I? | an Event today or tomorrow whose kind needs you (flight, stay, check-in, reservation, appointment, dinner, party, guests, wedding, concert, match, interview, exam), not on a trip (travel's) | Dinner at Bombay Canteen: tomorrow 8 pm | Open | title, kind, when, where, how many people |
| Assets | going off · is this right? | a warranty ending inside 30 days | MacBook: warranty ends in 20 days | Right | thing, category, ends, days left |
| Assets | due · shall I? | a service due by date or km, or late; any other Cycle on an Asset or a Routine | Creta: service due in 5 days or 400 km | Serviced / Done (logs it) | thing, category, cycle, due, days and km left, last done |

Urgent: a bill due today or late; a Document past its expiry, or an ID inside
7 days; a task marked urgent; an Event within 12 hours; a service due today or
late (by date or km); a warranty ending today; any other Cycle as Upkeep has it
(due today or late). Never sent: a bank SMS,
a transaction's raw text or note, a document's text or file, an Event's notes
or attendees' mail.

