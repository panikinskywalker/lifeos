# LifeOS — product definition (v3, 23 Sep 2026)

## 0. In one line

**Jarvis with a filing cabinet.** You tell LifeOS what happened in your life, in plain words; it turns that into linked records, remembers it forever, and tells you what's due next.

## 1. What it is

A personal life operating system on Rutvij's Android phone. Not an app with features — a memory with an agent in front of it.

- **You talk to it** ("did the car service today", "recharged Jio", "washed the white sneakers", "Priya paid me back the 2,600"). It creates or updates the right records, links them (car → service → invoice → expense), and schedules what follows (next service in 6 months / at 35,000 km).
- **It watches what it's allowed to** (payment and bank notifications on Android) and files those the same way, asking when unsure.
- **It remembers everything** — records, and also the things you say that aren't records ("I prefer paying rent from HDFC", "Dad hates surprises"). Every fact has a source and a date. It knows everything you have ever told it.
- **It tells you before you ask** — what's due today, what's running out, who you owe, what's expiring.
- **You can always browse the cabinet yourself** — every record, every link, every timeline, searchable and editable.

## 2. Principles (priority order)

1. **Say it once.** Capture by talking (text or voice) is the primary input. Forms are the fallback and for corrections.
2. **Everything is an object; nothing is duplicated.** One Person, one Car, one Subscription — referenced from everywhere.
3. **Everything has a timeline.** The car's history, a friend's history, a shoe's history. Never lost.
4. **Everything recurring has a cycle.** Subscriptions, services, renewals, washing, laundry, haircuts, filters — the system knows *last done* and *next due*.
5. **The agent proposes; you confirm what matters.** Money and people: confirm. Everything else: auto-file, undo in one tap.
6. **Offline-first, single device, your data.** The phone is the source of truth. Encrypted backup export. No server in phase 1.
7. **Grows for decades.** New object types, fields and modules without changing the core.
8. **Native quality.** Feels like a first-party Android app: real icons, big legible numbers, designed dark mode, calm pastel bento.

## 3. Cycles — the concept the whole app hangs on

A Cycle is "this thing recurs" attached to any object:

| Object | Cycle | Trigger | Nudge |
|---|---|---|---|
| Jio recharge (Subscription) | every 84 days | time | "Jio runs out in 3 days" |
| Creta (Vehicle) | service every 6 months **or** 10,000 km | time or odometer | "Service due in 12 days or 800 km" |
| White sneakers (Item) | wash every 3 weeks | time since last | "Sneakers: last washed 24 days ago" |
| Laundry (Routine) | every 4 days | time since last | "Laundry's due" |
| Passport (Document) | expires 2031 | date | "Passport expires in 9 months" |
| Water filter (Asset) | replace every 6 months | time | "Filter replacement due" |
| Dad (Person) | call weekly | time since last contact | "Haven't called Dad in 9 days" |

"Did X today" → find the object, log a **timeline event** (cost/odometer/notes if said), **roll the cycle**. "X runs out on the 30th" → set next-due directly.

**Upkeep** is the page that shows every cycle in one list — overdue, this week, this month — filtered by type, including chores.

## 4. Objects

**Life admin:** Person · Group · Account · Transaction · Debt · Subscription · Budget · Document · Asset · Vehicle · Item · Routine (chores)
**Doing:** Project · Task · Goal · Event · Habit
**Body:** Workout · Measurement
**Mind:** Note · Fact
**Places:** Trip · Location

Every object has: title · status · tags · custom fields · attachments · comments · reminders · **cycles** · relations · full timeline.

## 5. The agent

- **Input:** typed or spoken message; Android notifications from allowed apps (GPay, PhonePe, Paytm, HDFC, Amex to start); share-sheet.
- **Understanding:** intent (log / ask / set / remind / plan / split / remember), entities (which car, which friend, how much, when), cycle effects.
- **Acts through the same rules as the UI.** Money and people writes ask first; the rest auto-file with Undo.
- **Memory (second brain):** records + notes + facts in one index. Every message is mined for residual facts. The agent retrieves from all three before answering. "What did I say about the landlord?" works.
- **Proactive:** morning brief (due, overdue, running out, spend pace, one insight) as a notification and the top of Today.
- **Boundaries:** reads notifications; never sends messages or emails; never pays. Runs on-phone with the user's Claude key (Haiku default, Sonnet escalation); only the slice of data needed leaves the phone.

## 6. Information architecture

**Bottom bar:** Today · Upkeep · **Talk** (centre, raised) · Browse · You.

- **Today** — the brief, then bento tiles (overdue, due today, chores, spend this month, running out, people to call, habits). Configurable.
- **Upkeep** — every cycle by next due; chips: Subscriptions · Vehicles · Things · Chores · People · Documents; This-week strip.
- **Talk** — the agent thread; type or hold to speak; inline record cards with Undo.
- **Browse** — modules → types → lists → records; global search; Memory (facts).
- **You** — settings, modules, notification sources, agent/API key, backups.

**Five screen types:** Module home · List · Record · Form · Agent thread. Nothing more than three taps deep.

## 7. Flows that must be excellent (golden tests)

1. "Did the car service today, 6,400 at Hyundai" → Service event on Creta, Transaction linked, cycle rolled, card with Undo. One message, zero taps.
2. "Recharged Jio 719 for 84 days" → subscription next-due computed, transaction logged.
3. "Washed the white sneakers" / "did laundry" → item/routine event, cycle rolled.
4. "Priya paid me back 2,600" → debt settled, transaction in, person timeline updated (confirm card).
5. "Dinner was 3,600, split with Arjun and Priya" → transaction + two debts (confirm card).
6. UPI notification → proposed transaction → confirm, or "that was dinner with Arjun, split it".
7. Morning brief → "Jio in 3 days · service in 12 days · sneakers overdue · call Dad · ₹12,400 this week, 30% over".
8. "When did I last change tyres" / "how much on the car this year" / "who owes me money" / "what did I say about the landlord".
9. "Remember that the landlord's name is Suresh and rent is due on the 5th" → fact + (offer) rent routine.
10. Browse a Person → everything about them.

## 8. Non-goals (phase 1)
Sending messages/emails, payments, iOS/web clients, sync, photo scanning, bank APIs, shared accounts, Developer Mode.

## 9. Decisions log
- ✅ Android native only (Expo/RN); offline-first; no server in phase 1. Web/iPhone via Supabase sync in phase 2.
- ✅ Ingestion: Android notification listener only; GPay, PhonePe, Paytm, HDFC, Amex first.
- ✅ Agent never drafts/sends messages or pays. Photo tagging dropped.
- ✅ INR default, multi-currency stored not converted.
- ✅ Developer Mode → phase 2. Android widgets → phase 2.
- ✅ Voice input in phase 1 (Android STT).
- ✅ Splitwise-style splits and groups in phase 1.
- ✅ Health: log + trend chart in phase 1; Health Connect phase 2.
- ✅ Second brain: unified index of records + notes + facts, "knows everything", phase 1; embeddings/graph phase 2.
- ✅ Design: Apple-Health-style bento, calmer pastels (see `docs/DESIGN.md`).
