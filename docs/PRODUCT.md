# LifeOS — product definition (v4, 25 Sep 2026)

**Supersedes v3. What changed:** v3 was agent-first ("say it once, we file it"). v4 is **data-first**: LifeOS is a personal data dashboard and an almanac of Rutvij's life, fed automatically wherever possible, by brain-dumps otherwise, and browsed as charts and records. The agent is one of three inputs, not the product.

## 0. In one line

**Everything about my life, collected automatically, dumped freely, shown as data, and remembered forever.**

## 1. The five things that matter (in order)

### 1.1 Today is a data dashboard
Open the app and see numbers and charts about *me*, right now: steps today vs. yesterday, sleep last night, screen time by app, spend so far this month against the usual pace, streaks, and what's coming up. Charts are the point — sparklines, bars, rings, heat maps, comparisons — not counts and lists.

Sources feeding it (all automatic, all local):
- **Health Connect** — steps, sleep, heart rate, workouts, weight, from whatever watch/app writes to it. **P1.**
- **Android UsageStats** — screen time per app, pickups, first unlock / last use. **P1.** (Mac screen time via a helper script once sync exists — P2. iPhone has no Screen Time API — not planned.)
- **Bank SMS + payment-app notifications** — spend, income, balances. **P1** (see 1.5).
- Everything the user has filed: upkeep dues, tasks, events, habits, people.

Each tile opens a full-screen chart with a period switcher (day / week / month / year) and the underlying records.

### 1.2 The second brain is an almanac
A browsable reference to everything: every person, thing, place, subscription, fact, note, number — with history. Not just "the agent remembers what I said": a surface you can open and read.
- **Almanac tab** (replaces Browse): search on top; then *People · Things · Money · Body · Mind · Places · Time*; each opens lists → records → related records.
- **Time view**: any day / month / year — what happened, what was spent, what was logged, what I dumped. "On this day."
- **Facts** are first-class records (one line, subject, source, date) and show on the subject's page.
- One full-text index across records, notes, facts and dumps. Semantic search later (P2).

### 1.3 Brain dump is a first-class input
One box, always one tap away: type or talk, dump anything — half thoughts, lists, rants, quotes, plans, "made a new friend today". Rules:
- The raw dump is **stored verbatim, forever**, timestamped. Never edited, never lost.
- Afterwards (seconds later, in the background) the agent extracts what it can — people, tasks, facts, events, spend, cycle updates — creates or updates the records, and links every one back to the dump. The dump page shows "extracted: 1 person, 2 facts, 1 task" with Undo per item.
- Extraction never blocks the dump. Offline → extraction runs when back online.
- The Dump box is the centre button. Talk (Q&A with the agent) is inside the same screen as a toggle, not a separate tab.

### 1.4 Photos
Skipped for now.

### 1.5 Messages and notifications feed the expense tracker
- **SMS reader** (Android, sideloaded app so Play's READ_SMS restriction does not apply): reads bank/card/UPI alert SMS — debits, credits, balances, card spends, EMIs — and files Transactions with amount, direction, merchant/VPA, account last-4, balance-after. **P1.**
- **First-run history import**: parse all existing bank SMS on the phone (months of history) so the expense tracker is populated on day one. Dedupe, review screen, bulk-confirm. **P1.**
- **Notification listener** for UPI/payment apps (GPay, PhonePe, Paytm, bank apps) as the second source; dedupe against SMS by amount + time window. **P1.**
- Sender detection is learned: the app lists SMS senders that look like banks (DLT headers like `VM-HDFCBK`, `AX-ICICIB`, `JD-SBIINB`, Amex, cards) and the user ticks which to trust. Parsers per bank with a generic fallback; every parse keeps the raw text.
- Merchant → category learning; confirm only when the parser is unsure.

## 2. The agent (Dump / Talk)
The agent's job is to turn language into records — **any** record type — and to answer questions from everything it knows.
- **Creates anything from a sentence.** "Made a new friend today, Karan, works at Zomato, met at the gym" → Person *Karan* (company Zomato), fact "met at the gym on 25 Sep", relation to Rutvij, optional keep-in-touch cycle offered. "Bought a Dyson for 32k" → Asset + Transaction. "Started reading Project Hail Mary" → Book (Mind). No form, sensible defaults, everything editable after.
- **Updates and links.** "Did the car service, 6,400 at Hyundai" → event on Creta + transaction + cycle rolled.
- **Answers from everything.** Records + notes + facts + dumps + health/usage/spend data. "How much did I sleep on average last week vs. the week before?" is a legitimate question.
- **Confirmation:** money and people-related writes show a confirm card; everything else auto-files with Undo.
- **Cost:** parser-first for common sentences; provider chain (Groq → Gemini → Claude) for the rest; usage cap. Already built.

## 3. Cycles and Upkeep (unchanged)
Everything recurring is a cycle on an object (subscriptions, services, renewals, chores, keep-in-touch). Upkeep shows them all by due date. Already built; keep.

## 4. Information architecture (v4)

**Bottom bar:** **Today** · **Upkeep** · **Dump** (centre, raised) · **Almanac** · **You**

- **Today** — the dashboard (1.1).
- **Upkeep** — cycles by due date, chores, this-week strip.
- **Dump** — the box. Toggle at the top: *Dump* (default) / *Talk*. Below: recent dumps with what was extracted.
- **Almanac** — search; People · Things · Money · Body · Mind · Places · Time; recent.
- **You** — settings: data sources (Health Connect, Usage access, SMS, notifications), agent providers, backups, appearance.

## 5. Flows that must be excellent (golden tests)
1. Open app → Today shows steps, sleep, screen time, spend, upcoming — all from real device data, all as charts, within 1 s.
2. Tap steps → full chart, week/month/year, vs. previous period.
3. Dump: "made a new friend today, Karan, works at Zomato, met at the gym" → Person created with company + fact + link to dump; card with Undo.
4. Dump: "bought a Dyson for 32k on the HDFC card, warranty 2 years" → Asset + Transaction + warranty cycle.
5. Dump a 6-line rant with one task buried in it → task extracted, rant stored verbatim, nothing else invented.
6. First run: SMS import finds N bank messages → review screen → confirm → Money shows months of history by category.
7. New SMS "debited INR 1,240 at SWIGGY" → transaction appears within seconds, categorised Food.
8. Talk: "how much did I spend on food this month vs. last?" / "when did I last meet Karan?" / "what did I dump about the landlord?"
9. Almanac › Time › March 2026 → spend, dumps, events, health averages for that month.
10. "Did the car service, 6,400 at Hyundai" → event + transaction + cycle rolled.

## 6. Non-goals (phase 1)
Photos, sending messages/emails, payments, iOS/web client, sync, Mac/iPhone screen time, bank APIs, Developer Mode.

## 7. Decisions log
- ✅ Android native (Expo/RN), offline-first, sideloaded (not Play Store) — enables READ_SMS.
- ✅ Data-first: Today = dashboard; Health Connect + UsageStats + SMS in P1.
- ✅ Dump is the primary input; raw dumps immutable; extraction async and undoable.
- ✅ Almanac replaces Browse; Time view in P1.
- ✅ Agent can create any entity type from a sentence.
- ✅ Parser-first + provider chain (Groq → Gemini → Claude), usage cap.
- ✅ Splits/groups P1; chores as routines P1; finance reports: month, subscriptions, net worth.
- ✅ Photos, Developer Mode, sync, widgets → phase 2.
- ⬜ Which watch/app feeds Health Connect; which banks send SMS (parsers are built generic + learned; specific fixtures added when known).
