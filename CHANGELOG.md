# LifeOS — patch notes

LifeOS is versioned like an app release: **v0** is where it stands on 20 Oct
2026. Each change after it is a small step — 0.0.1, 0.0.2, … — with patch
notes here (newest on top, in plain words). A published release is a whole
number: **v1** first, then v2, …; changes after v1 are 1.0.1, 1.0.2, …. Each
version is a git tag and the app's version in `app.json`.
Turf web has its own numbers and notes (`~/Projects/turf-web/CHANGELOG.md`).

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
