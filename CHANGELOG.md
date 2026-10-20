# LifeOS — patch notes

LifeOS is versioned like an app release: **v0** is where it stands on 20 Oct
2026; every update after it is **0.1, 0.2, …**, each with patch notes here
(newest on top, in plain words); **v1** is the first published release. Each
version is a git tag (`v0`, `v0.1`, …) and the app's version in `app.json`.
Turf web has its own numbers and notes (`~/Projects/turf-web/CHANGELOG.md`).

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
