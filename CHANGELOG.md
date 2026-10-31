# LifeOS — patch notes

LifeOS is versioned like an app release: **v0** is where it stands on 20 Oct
2026. Each change after it is a small step — 0.0.1, 0.0.2, … — with patch
notes here (newest on top, in plain words). A published release is a whole
number: **v1** first, then v2, …; changes after v1 are 1.0.1, 1.0.2, …. Each
version is a git tag and the app's version in `app.json`.
Turf web has its own numbers and notes (`~/Projects/turf-web/CHANGELOG.md`).

## v0.0.11 · 31 Oct 2026

**Home** (R7e), built in its own session and merged here. The screens are a
first pass from the kit until the *NR-Home* artboards are drawn.
- **Stock and Space** replace the old inventory items; any you had are
  folded into Stock once, on first open.
- **Home** in Browse › Boards: Use soon, Running low, Spaces, Just came in.
- **A page of pills per space**: tap uses one (with Undo); long-press for
  half left, still good, or move.
- **A Stock page**, the **shopping list** (Copy list, Open Blinkit or
  Zepto; LifeOS never orders), and a **Home tile** on Today.
- **Add several from one line** ("eggs, butter, 2 milk"); each goes to the
  space its name suggests.
- Shelf life is estimated by name until you correct it; how often you rebuy
  is learned from purchases.
- **Blinkit**: its delivery notification, or a bank or UPI SMS naming it,
  puts one card in To check, linked to the payment. A shared invoice will
  stock Home once the phone can read PDFs.
- New AI tools: stock low, use soon, what's in a space, add stock.
- Cook tonight and the fridge photo have their place; they fill in when the
  brain (MODEL.md layer 8) is built.

## v0.0.10 — 30 Oct 2026

**People and your Notion CRM, kept in step both ways** (R2b).
- LifeOS writes **only to the copy, Personal CRM (1)**. The original
  Contacts database is never written: every write checks, and the settings
  screen refuses a link to the original.
- Notion pages match People by their ids, phone, email or a unique name;
  when it isn't sure, it asks in To check.
- Likes ↔ the Likes section, bullets become Facts once, Last Contacted ↔
  Last spoke, tags, birthdays without a year; a few new columns are added
  to the copy once.
- When both sides changed a Field, the newest edit wins and the other value
  shows once in To check.
- **You › Data sources › Notion**: the token (kept in the phone's secure
  store), the copy, Sync now.
- Database upgrade v15. Not yet run against your real Notion: it needs the
  token and the copy shared with the integration.

## v0.0.9 — 30 Oct 2026

**People, redrawn** from the *NR-People* artboards, built in its own session
and merged here.
- **People home**: search, quick filters, the strip with a lime ring when
  something is due, Call or message, Birthdays, Not spoken in a while,
  Groups; the People and Groups list by relationship or A–Z with the rail.
- **A Person's page** and its states (no photo, no phone, overdue, birthday
  today, just added, a vendor, owes you / you owe, plays football); the
  **Group** page with shares, a balance per member and Settle.
- **The form**: relationships you add yourself (Mentor, Neighbour) with
  their own colour, **Likes**, several UPI ids as chips, Works at / Lives
  in with Keep as typed, a birthday with or without the year.
- **Gift ideas and a drafted birthday wish** have their place on the page;
  they fill in when the brain (MODEL.md layer 8) is built.
- **Who is this?** in To check: a payment from a UPI id nobody is known by
  asks once, and the answer is remembered.
- **Pick contacts** with suggestions from your call log; a People tile on
  Today; a birthday today now says today.

## v0.0.8 — 22 Oct 2026

**Places** (R3), built in its own session and merged here.
- **Place**: twelve kinds (Turf's venues stay venues), address, map pin, what
  it is *in* (Koramangala in Bengaluru in India), a maps link. A Place's city
  and country become Places of their own, once; a maps link sitting in notes
  moves to its Field.
- **Organisation**: ten kinds, UPI ids, website, phone, the branch it is
  *at*. Known by any of its UPI ids, like a Person.
- **Filed on their own**: an Event with a location is linked *at* its Place
  (one you have, or a new one shown in To check with Undo); a hotel stay is
  at the hotel, in its city. A table booking by mail becomes a reservation at
  the restaurant; mail from an Organisation's website lands on its timeline.
  From a dump, "Toit is a brewpub in Indiranagar" files Toit, a restaurant,
  in Indiranagar, Bengaluru.
- **Tools**: places been, place info (visits, last here, spent there, km from
  home), places near, organisations.
- **The Places board** in v3 Noir: Places by city, the Place card and its
  drawn map, visits, what is here and inside; an Organisation's payments and
  branch. The map is drawn, not a real map, until a provider is chosen.

## v0.0.7 — 22 Oct 2026

**People** (R2), built in its own session and merged here.
- **Person**: phone and email you can call or write to, a photo, About,
  *Works at* an Organisation and *Lives in* a Place (what you typed is kept
  when nothing is picked), and **Keep in touch** as a cadence — every week to
  every year.
- **Group**: a Sport kind (the Football group moves to it once), a default
  split, a place and a photo.
- **Contacts and the call log** are crm's own sources now: pick the contacts
  that become People; a call moves *Last spoke*.
- **Last spoke** also moves with an Event with them or a payment, and rolls
  the Keep in touch nudge.
- **Who is this?** One lookup for a UPI id, a learned sender, the mobile
  number inside a UPI id, or an email. Finance's payee matching and Turf's
  SMS payments both ask it, so a player with two UPI ids is known by either.
- **Tools**: people to call, last met, who is.
- **The People board** in v3 Noir: the Profile at the top of a Person, People
  home with the strip, Call or message, Birthdays and Groups.

## v0.0.6 — 22 Oct 2026

The rest of the Turf board (R9c.5 and R9c.6), every screen drawn from the
*Turf · Noir* artboards.
- **Home**: money at a glance, the next match as the lime card with its RSVP
  link, the recent games as a wallet of match cards, Turf's To check items,
  who still owes with Copy all, and what's sending.
- **The section switcher** on every screen: Home · Games · + · Players ·
  Venues.
- **Dues** (owed to you, you owe, settled, credit held; tick to mark paid,
  open a row for one game at a time, reminders to copy or share) and the
  **Audit log** from Turf web.
- **Games**: the Match centre (season so far, what's booked as a stack of
  cards, 13 weeks of activity, a month calendar, when you play) and Match
  history (search, paid / partial / unpaid).
- **Match**: the Payment checklist and the pay sheet redrawn, every WhatsApp
  text (payment status, short, who's still to pay, details, result), **Log
  stats** for the whole match at once, and the formation picker with mini
  pitches.
- **New match** redrawn: venue defaults, a suggested day, kick-off chips,
  steppers, who fronted, the squad picker with availability, the shares.
- **Players**: the Squad (search, unpaid / clear, availability), **Leaders**
  (Turf web's thirteen tables: podium, places with ▲▼, not ranked yet,
  share), the **Player** profile (attributes, overall and form, stats, kits,
  availability, their dues), the **Stats card**, and **Edit player** with
  availability. New players are made here too.
- **Venues** and **Edit venue**, new venues included.
- **Turf settings** redrawn, with the squad name and your UPI from Turf web.
- **States**: not connected, loading, offline with what's waiting, couldn't
  reach Turf web; the sync pill says which.
- **SMS**: money in that pays a share is recorded on its own when the sender
  is known and the amount exact (with Undo in To check); otherwise To check
  asks, and a Yes teaches LifeOS that sender.
- **Friends' profile submissions** arrive in To check; review and approve or
  turn down (needs Turf web online).
- **Today** gets a Turf tile: the next match, who's in, what's still to
  collect.
- Not yet: photos, squad-join requests, and undo from the audit log (all on
  Turf web); the stats card shares as text, not an image.

## v0.0.5 — 22 Oct 2026

Teams and the generator, on the new kit (R9c.4), drawn from the *Turf · Noir*
artboards (4b Team view, 4d Pick teams).
- **Match** screen redrawn: crests in the kit colours, the score in big Bebas
  numerals (tap to change it), scorers, venue / format / paid pills, player of
  the match, and the two tab pills.
- **Team view**: the pitch with each side in its formation — faces in kit
  rings, goals as a football, the captain's C, the keeper's glove, the star —
  then both sides as lists with positions and G / A / S, and **Pick teams**.
- **Pick teams**: tap L or S (or the kit letters) on each player; **Balance
  by rating** runs Turf web's own generator (every split tried: keepers split,
  the two strongest apart, the closest average overall, then positions and who
  plays well together), with its reasons and **Reshuffle**; **Shuffle** for a
  quick random split; each side's **formation**; **Save teams** sends one
  change per player who moved.
- Turf web's ratings (match ratings, overall, form) are copied in, so the
  numbers match on both phones and work offline.
- Kit names and letters come from the match's colours (Lime, Sky, Blue…);
  Bebas Neue added for the Turf numerals and letters.
- Not yet on the S22: "play well with" picks, side wishes and kit votes, which
  Turf web doesn't sync yet; captains are suggested on Turf web.

## v0.0.4 — 22 Oct 2026

The app wears **v3 Noir**, the design language from the canvas (NR artboards).
- Dark is Noir and the default: near-black ground, charcoal cards, lime
  accent, text at 100 / 62 / 42 %; module discs in each module's colour.
- Type and shapes from the kit: 22/700 titles with the caption above, 17/600
  section headers, 16/600 rows, tight big numbers; pill buttons, round
  actions, 24 row cards, 28 tiles, 32 sheets. JetBrains Mono added for
  numbered labels and readouts.
- New nav: a dark pill of icon discs (lime = where you are) with the lime
  Dump disc beside it.
- Chips and segments go white when selected; status pills lime / coral /
  grey; the toast is a white pill; inputs get a white focus ring.
- Colour-block tiles: a filled tile is the module's colour with everything
  on it black. Today's Spend is the orange block; My day is the checklist
  with ticks and time pills.
- Browse shows the modules as the gradient stack.
- Light appearance is unchanged in colour for now (You › Appearance).

## v0.0.3 — 22 Oct 2026

Matches are run from the S22 too (R9c.3).
- **New match** (Games): pick the venue and it fills kick-off, format, cost
  and booking terms; pick the day and the players; the shares split as you
  go (₹1,800 ÷ 12 = ₹150 each); choose who fronted the cost (needed for
  prepaid and advance-paid bookings; they count as paid).
- **Edit** a match from its screen: day, kick-off, venue, cost, terms, squad.
  Shares are split again; everyone kept keeps their team, stats and
  payments; someone who has paid needs a refund before being taken off.
- **Tap a player in Team view**: on time / late / no-show, goals, assists,
  saves, own goals, played in goal, captain of their team, player of the
  match.
- **Score**: follows the goals logged (own goals count for the other team),
  as on Turf web; set it by hand, or let it follow the goals again.
- Everything shows at once, is sent to Turf web, waits while offline, and is
  put back exactly if Turf web says no. A match made here gets Turf web's id
  when it arrives, so it never appears twice; changes made to it before then
  go with the right id.
- No sync while a change is still waiting to send, so it can't be overwritten.

## v0.0.2 — 22 Oct 2026

Payments recorded on the S22 reach Turf web (R9c.2).
- On a match's Payment checklist, tap a player: their share, paid so far,
  what's still owed (or their credit) and every entry. Record a payment (part
  payments allowed), a refund or a correction, with a note; or **Mark paid**
  for what's still owed in one tap.
- It shows at once, marked **Sending…**, and counts straight away in who owes
  and the Debts. It's sent to Turf web right after, and the confirmed entry
  replaces the sending one on the next sync.
- Offline, changes wait on the phone in order and go when you're back; Home
  lists what's **Sending**. Nothing is applied twice, however often it's sent.
- If Turf web says no, what it showed is undone and Home lists it under
  **Not sent** with Turf web's reason, until you dismiss it.
- You › About shows the real version (it said 0.1.0).
- Under the hood: one new table (`outbox`, migration v14, in backups) and a
  `send` step on sources that also write.

## v0.0.1 — 22 Oct 2026

The Turf board now syncs from **Turf web** instead of Turf Ledger (R9c.1).
- You › Data sources › **Turf web**: the address and this phone's key (`tw_…`,
  made in Turf web › Settings › Connected phones), kept in the secure store.
- Each sync asks only for what changed since the last change number; the first
  brings everything. The board syncs when it opens and every minute while it's
  open; pull down to sync now. "Sync everything again" starts from zero.
- Every payment entry (payments, refunds, corrections, the opening entries from
  Turf Ledger) is on its Appearance's timeline; **paid so far** is their sum, so
  part payments show ("₹200 paid") and count in who owes and the Debts.
- Deleted on Turf web → archived here, never deleted; back when it returns.
- RSVPs are kept even before a player is in the lineup; own goals synced.
- "Which player is you" now comes from Turf web's settings, so both phones agree.
- Guests become People but not members of the Football group.
- Still read-only: changes made in LifeOS reach Turf web next (R9c.2).

## v0 — 20 Oct 2026

Where LifeOS stands before versioning starts. 166 commits since 13 Sep 2026.

**The app**
- Five tabs: Today · Upkeep · Dump (the raised centre) · Browse · You, with To
  check behind the bell in every header.
- Twelve data modules (finance, crm, projects, travel, assets, inventory,
  documents, health, habits, knowledge, places, deliveries), each with a
  companion board, and the generic screens every module gets: Overview, List,
  Record, Form, Metric, Links.
- Filing: what you type, say or share in Dump becomes records; bank SMS,
  payment notifications and mail are read on the phone and filed as
  transactions, deliveries and trips, with what's unsure in To check.
- Automations, Activity, Tags, Memory, Reminders and Spend, all kept.

**Since the 4 Oct reset (docs/MODEL.md)**
- R0: the code speaks the model's words (Object, Field, Record, Link, Event,
  Fact, Dump, Cycle, Source, Filing, To check, Board); a closed list of Field
  types; modules are data only; boards → modules → core enforced by a test.
- R1 finance: Accounts, Transactions, Debts, Subscriptions, Investments;
  category targets instead of Budgets; the money parser and sources in the
  finance module; spend, subscriptions, net worth and portfolio tools; Spend
  as a board screen; Investment and Subscription records.
- R9a (LifeOS side): the `games` module (Game, Appearance, Player profile,
  Venue) and a read-only Turf board over Turf Ledger.

**Known**
- Not opened on the S22 since the reset: migrations v11–v14 and the R1 folds
  run on first open.
