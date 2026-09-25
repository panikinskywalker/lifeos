# LifeOS — feature scope (v2, locked 23 Sep 2026)

Tags: **[P1]** phase 1 build · **[P2]** later. Section E lists the decisions Rutvij locked on 23 Sep; everything else is unchanged from v1 unless marked *(changed)*.

---

## A. Core platform (every module gets this for free)

### A1. Objects
- Every record is an object with: title, status, tags, colour, priority, custom fields, attachments, comments/notes, reminders, cycles, relations, full timeline. **[P1]**
- Relations are typed and bidirectional; shown on both records. **[P1]**
- Soft delete with 30-day restore; version history per record (what changed, when, by whom — you / agent / notification / automation). **[P1]**
- Duplicate, archive, star/pin. **[P1]**
- Merge two records keeping all links. **[P2]**
- Custom fields per type (text, number, money, date, select, multi-select, checkbox, link-to-object). **[P1]**
- Developer Mode: define new object types on the phone. **[P2]**

### A2. Timeline
- Automatic events: created, edited (diff), status change, linked, commented, attached, reminder set/done, cycle done. **[P1]**
- Manual events on any object ("tyres changed", "met for coffee") with date, cost, odometer, note, attachment. **[P1]**
- Cross-object activity feed (Today › Recent). **[P1]**
- Per-object timeline view, filterable by kind. **[P1]**

### A3. Cycles (the recurrence engine)
- Kinds: every N days/weeks/months/years · fixed date (expiry) · meter delta (km, hours, uses) · whichever-first (time OR meter). **[P1]**
- Fields: last done, next due, lead time, overdue behaviour, cost estimate, vendor (person), notes. **[P1]**
- "Mark done" → timeline event, roll next-due, optional cost → transaction. **[P1]**
- Snooze / set next due manually / skip. **[P1]**
- Meter tracking on the object (odometer readings; cycles compute from them). **[P1]**
- History & stats per cycle: average achieved interval, total cost, last 5 events. **[P1]**
- Predictive next-due from history. **[P2]**
- Cycle templates per type (new Vehicle → service/insurance/PUC pre-filled). **[P1]**

### A4. Reminders & notifications
- Reminder on any object or standalone; one-off or RRULE recurring; snooze presets; tap opens the record. **[P1]**
- Cycle-driven reminders (N days before, on due, when overdue). **[P1]**
- Quiet hours; per-module toggles. **[P1]**
- Morning brief notification at a chosen time. **[P1]**
- Channels: notification only. Email/WhatsApp-to-self **[P2]**.

### A5. Search, views, filters
- Global instant search across everything (title, fields, notes, comments, tags, facts). **[P1]**
- Semantic search via embeddings. **[P2]**
- Universal filter DSL, sort, group; saved views with dynamic dates. **[P1]**
- Layouts: list, board **[P1]** · calendar, timeline, gallery **[P2]**.
- Command palette. **[P1]**
- Tag browser and tag pages. **[P1]**

### A6. Attachments & documents
- Attach photos/PDFs/files/links to any object; camera capture; **Share to LifeOS** from any app → pick object or let the agent decide. **[P1]**
- Thumbnails, PDF preview; storage stats and cleanup. **[P1]**
- OCR receipts/documents → text + auto-fill. **[P2]**

### A7. Automation
- Rules: WHEN (created/updated/status/tag/cycle due/cycle done/reminder due/notification matched/daily/time) · IF (conditions) · THEN (tag, set status/field, remind, notify, create record, link, roll cycle, comment). **[P1]**
- Templates: big spend flag, document expiry, subscription auto-post, contact nudge, km-based service. **[P1]**
- Run log with retry; enable/disable; run now. **[P1]**
- "Run agent prompt" action. **[P2]**

### A8. Home / dashboards
- Today tab bento grid; widgets from every module; drag-to-reorder; sizes 1×1/2×1/2×2. **[P1]**
- Multiple dashboards. **[P1]**
- Android home-screen widgets. **[P2]**

### A9. Data & privacy
- Offline-first SQLite, everything local. **[P1]**
- Encrypted backup export/import (manual) **[P1]**; scheduled to Drive **[P2]**.
- Supabase sync + web client. **[P2]**
- Biometric app lock. **[P1]**
- Import phone contacts **[P1]**; CSV transactions, calendar **[P2]**.
- Export any list as CSV. **[P1]**

### A10. Settings ("You")
- Locale/currency/date; theme light/dark/system. **[P1]**
- Modules enable/disable/order. **[P1]**
- Notification sources allow-list. **[P1]**
- Agent: API key, provider, default + escalation model, confirmation policy, spend cap alerts. **[P1]**
- Backups, storage, danger zone. **[P1]**
- Developer Mode. **[P2]**

---

## B. The agent (Talk)

### B1. Input
- Text; hold-to-speak (Android STT); share-sheet (text/link/image → agent). **[P1]**
- Quick capture from a persistent notification / lock-screen shortcut. **[P2]**

### B2. Understanding & actions
- Intents: log event on object · create/update/link · settle a debt / split a bill · roll/set a cycle · set reminder · ask (query/aggregate/compare) · plan (trip/project → creates the set) · define an automation · remember a fact. **[P1]**
- Entity resolution with disambiguation ("which Priya?") and learned aliases ("the car" = Creta). **[P1]**
- Multi-step commands ("log service, split with Dad, remind me to claim"). **[P1]**
- Confirmation policy: money & people ask; rest auto-file with Undo. Per-type overrides. **[P1]**
- Reply cards: record, cycle, list, number, chart. **[P1]**

### B3. Memory — the Second Brain *(changed: locked as "knows everything")*
The agent must know **everything Rutvij has ever told it**, not just structured records. Implementation:
- **Three stores, one index.** Records (typed objects) · Notes (long-form) · Facts (one-line things said in passing: "I pay rent from HDFC", "Dad hates surprises", "landlord's name is Suresh"). All three go into the same full-text index. **[P1]**
- **Facts** have: text, subject (linked object if any), source (talk / notification / note), date, confidence, and an "active" flag. Editable list at Browse › Memory; "what do you know about X?" and "forget that" work. **[P1]**
- **Every Talk message is mined.** After acting on a message, the agent extracts any residual facts and files them (silently, undoable). **[P1]**
- **Retrieval before every answer:** keyword FTS over records + notes + facts, plus the linked object's timeline and relations, plus recent conversation. Semantic/embeddings retrieval **[P2]**. **[P1]**
- **Links are relations.** `[[Creta]]` in a note or fact creates a relation; every record shows backlinks (notes and facts that mention it). **[P1]**
- Preferences learned from corrections ("no, that's always Groceries") become facts with subject = category/merchant. **[P1]**
- Graph view **[P2]**.

### B4. Proactive
- Morning brief: overdue, due today, running out, spend pace, one insight. **[P1]**
- Weekly review (Sunday). **[P2]**
- Nudges (unused subscription, price change, long gap since a person, budget pace). **[P2]**

### B5. Models & cost *(changed: parser-first, free-tier friendly)*
- **Parser first.** A deterministic on-device intent parser handles the common sentences (did X, recharged X, X paid me, spent N on X, split, remind me, add a chore, remember …) with no network and no cost; the LLM is called only when the parser isn't confident. **[P1]**
- **Provider chain:** Groq (free, fast) → Gemini (free) → Claude (paid, optional), each with its own key; automatic fall-through on rate limits or outages, rate-limited providers cool down. OpenRouter and Ollama (Mac over Tailscale) also supported. Provider order, model and keys chosen in You › Agent. **[P1]**
- Usage meter and a monthly cap per provider; the agent stops calling the model at the cap. **[P1]**
- On-device small model (Gemma/Qwen class) as a provider for fully offline, private use. **[P2]**

---

## C. Modules

### C1. Finance
Objects: Account · Transaction · Debt · Subscription · Budget · Category · Merchant · **Group** *(changed)*.
- Accounts: bank/card/cash/wallet/investment/loan; opening + computed balance; credit limit/utilisation. **[P1]**
- Transactions: expense/income/transfer; receipt; link trip/person/project/vehicle/asset. **[P1]** Split across categories, recurring detection **[P2]**.
- **Debts & splits (Splitwise-style)** *(changed: P1)*: I owe / owes me; **Groups** (Goa gang, flat, family) with members; "split this" on any transaction → equal / exact / percentage / shares → one Debt per person; partial settlements; **balances per person and per group** with simplified "who pays whom"; settle-up creates the transaction. **[P1]**
- Subscriptions: cycle-driven; auto-post transaction on due; price history. **[P1]** "Unused?" flag **[P2]**.
- Budgets: per category per period; pace; rollover. **[P1]**
- **Reports** *(changed: locked)* **[P1]**: (1) **Month view** — spend/income/net with category bars, (2) **Subscriptions** — monthly/yearly run-rate and what's due, (3) **Net worth over time**. Remaining reports (by merchant, by person, by trip, 6/12-month trend, year summary) **[P2]**.
- **Notification ingestion** *(changed: locked P1)* → proposed transactions from **GPay, PhonePe, Paytm, HDFC Bank, Amex** to start; allow-list editable in You › Notification sources; parser rules per app with a generic amount/merchant fallback; dedupe against existing transactions by amount+time window. **[P1]**
- Bank statement CSV import. **[P2]**

### C2. Upkeep (cross-module view of Cycles) *(changed: chores added)*
- All cycles: overdue / this week / this month / later; filter chips by type — **Subscriptions · Vehicles · Things · Chores · People · Documents**; mark done; snooze; add cost. **[P1]**
- **This week view**: a 7-day strip (Mon–Sun) showing each day's dues, chores drawn as checkable pills; swipe to next week. **[P1]**
- "What will this month cost me" — sum of estimated cycle costs due. **[P1]**
- Calendar view. **[P2]**

### C3. Things (Assets, Vehicles, Items, Routines)
- Asset: category, purchase date/price, current value, warranty cycle, serial, location, vendor, attachments, insurance. **[P1]**
- Vehicle: make/model/year/reg; odometer log; cycles service (time OR km), insurance, PUC, tyre rotation, battery; TCO; documents. **[P1]** Fuel log with ₹/km **[P2]**.
- Item: quantity, location, category; cycles (wash/replace); restock threshold; low-stock list. **[P1]**
- **Routine (chores)** *(changed)*: a cycle with no physical object — laundry, clean AC filter, water plants, haircut, change bedsheets. Has a `kind` (chore / personal / home), an estimated minutes, and an optional weekday preference ("Sundays"). Shows in Upkeep › Chores, in This-week view, and on Today as a "Chores" tile with checkboxes. Agent: "did laundry" → mark done; "add a chore: vacuum every Saturday". **[P1]**
- Home: rooms as locations. **[P2]**

### C4. People
- Person: relationship, contact details, company/role, birthday (yearly cycle), keep-in-touch cadence (cycle), notes, tags. **[P1]**
- One page with everything: debts, splits, groups, shared expenses, trips, events, tasks, notes, documents, facts mentioning them, timeline. **[P1]**
- Import from phone contacts. **[P1]**
- Birthday reminders **[P1]**; gift ideas **[P2]**.
- Interaction log via agent resets contact cycle. **[P1]**
- **Groups** *(changed: P1, shared with Finance)*. **[P1]**

### C5. Tasks & Projects
- Task: due, priority, project, goal, people, recurring (cycle). **[P1]** Subtasks **[P2]**.
- Project: status, target date, area, tasks, notes, spend, people; progress ring. **[P1]**
- Goal: numeric or milestone; linked tasks/projects. **[P1]**
- Views: Today, Upcoming, Board, per project. **[P1]**
- Events as objects **[P1]**; device calendar sync **[P2]**.

### C6. Travel
- Trip: dates, destination, companions, budget, local currency, status; spend vs budget; per-day; linked bookings, events, notes. **[P1]** Packing list, itinerary by day **[P2]**.
- "Plan a trip to Goa with Rahul in October" via agent. **[P1]**

### C7. Documents
- Document: kind, number, issuer, issued/expires (cycle), links, file. **[P1]**
- Expiry reminders; "expiring soon" view. **[P1]**
- OCR auto-fill. **[P2]**

### C8. Habits & Health *(changed: locked)*
- Habit: daily/weekdays/N-per-week; check-in; streaks; heat map; reminders; agent check-in. **[P1]**
- Workout: type, duration, distance, notes; weekly minutes. **[P1]** PRs **[P2]**.
- Measurement: weight, sleep, steps, water, custom metric; **trend chart** (7/30/90 days). **[P1]**
- Health Connect / Google Fit import. **[P2]**
- Medical records & medications. **[P2]**

### C9. Notes (part of the Second Brain, see B3)
- Note: markdown body, kind (idea/journal/meeting/reference/recipe), `[[links]]` to any object, tags, backlinks. **[P1]**
- Web clipper via share-sheet (link + title + excerpt). **[P1]**
- Daily journal / on-this-day, graph view, reading/media lists. **[P2]**

### C10. Automation (UI)
- Rule editor (When/If/Then), templates, run log. **[P1]**

---

## D. Cross-cutting quality bar
- Every screen has a teaching empty state. **[P1]**
- Undo for every destructive or agent action (toast, 8 s). **[P1]**
- Sub-100 ms interactions on local data; virtualised lists. **[P1]**
- Designed dark mode. **[P1]**
- 48dp targets, dynamic type, contrast AA. **[P1]**
- No telemetry leaves the phone. **[P1]**
- Tests: core unit-tested; agent tool contracts with fake provider; golden tests for the sample sentences in `docs/PRODUCT.md` §8. **[P1]**

---

## E. Decisions locked 23 Sep 2026
1. **Notification ingestion — P1.** Start allow-list: GPay, PhonePe, Paytm, HDFC Bank, Amex. Editable.
2. **Splits — P1, Splitwise-style.** Groups, equal/exact/percent/share splits, per-person and per-group balances, simplified settle-up.
3. **Health — P1 as log + trend chart.** Health Connect in P2.
4. **Second Brain — P1, "knows everything".** Records + notes + facts in one index; every Talk message mined for facts; retrieval before every answer; `[[links]]` as relations with backlinks. Embeddings and graph view P2.
5. **Chores — P1** as Routines with cycles; Upkeep › Chores filter, This-week view, Today chores tile.
6. **Finance reports — P1:** Month view, Subscriptions run-rate, Net worth over time. (Default pick; swap any one if you prefer.)
