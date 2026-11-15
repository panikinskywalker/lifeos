# Money · design prompt for Claude Design

Paste the prompt below into Claude Design inside the **LifeOS · Money** design
file (https://claude.ai/artifact/SHHrgfxvvRunDDfCjLDuSg), which already holds
the v3 Noir kit on its *Kit* page. Source of truth: `docs/MODEL.md` (layer 2
*Money*, layer 5 *Ask Money*, *Money home*, *Money pages with no artboard*,
*Money on its own*, all dated 14 and 15 Nov). Written 15 Nov from what is built
up to v0.0.65.

---

Redesign **Money** in LifeOS, my personal life-OS app for Android (390 × 844,
edge to edge). I don't like how Money looks right now. This file has the first
pass (*Money · Home* to *Ask · When it cannot answer*), but the app has grown
since it was drawn, and many built screens sit on kit layouts nobody designed.
**Redesign the artboards already here and add the missing ones listed below**, so
every screen, section and state the app has today is in this file. Use the v3
Noir kit on the Kit page for every colour, type style, radius and component; if
a part needs something the kit lacks, draw it on the Kit page and name it.

**How Money works, so the screens say the right things**
- It reads bank texts, payment-app notifications and receipt mails on the phone
  and files payments by itself. I mostly check and correct; I rarely type.
- *Spent* is my share: splits and Turf count only my part. Friends paying me back
  and shop refunds are not income. *Came in* is money I earned.
- Balances follow the bank: the bank's stated figure is the anchor, with "bank
  said, 12 Nov" under it. A credit card shows what I owe, anchored by its
  statement.
- Every figure can open the exact payments behind it, adding up to it.
- Nothing in Money moves money. AI is optional; what goes to it is rounded and
  people's names become placeholders.

**Where it sits.** Money opens from Browse (its module card) and its Today tile.
The app's bottom bar stays on every Money screen (Today · Upkeep · Dump in the
centre · Browse · You), except Ask Money, which has its own box at the bottom and
no bar.

**Copy.** Indian rupees with lakh grouping (₹2,00,076.50); one minus sign (−) for
money out; days in words ("Thu 10 Dec · in 26 days"); the year only when it is
not this year; plain words, no finance jargon; no em dashes. Use one consistent,
realistic Indian data set across all artboards (SBI and ICICI accounts, an ICICI
credit card, Swiggy, Zomato, Amazon, Adobe, Spotify, MSEDCL electricity, SIPs,
Turf games with friends).

## Redesign these (already in the file), with what was added

1. **Money · Home**, top to bottom as built:
   - Top bar: the To check bell and Add (+).
   - The Ask box.
   - Chips: Spend · Transactions · Accounts · Subscriptions · Investments ·
     Reports · Import & export.
   - *Last month* card, only on the 1st to the 3rd: spent against usual, came in,
     saved, the three biggest changes by category, new subscriptions and price
     rises; opens that month in Reports.
   - *This month and the pace*: spent and came in (my share), with month back and
     forward, days of the month you can tap (opens a day sheet with that day's
     payments), and one line: "₹806 a day keeps it under ₹72k", or "₹4,356 over
     your line of ₹72k" once over.
   - *Needs you*: money questions from To check (who a sender is, a payee guess,
     a SIP?).
   - *No category yet · 12 payments in Other* with **Sort with AI** (busy:
     "Sorting…"; done: a toast with Undo).
   - *Who owes whom*: net per person, biggest first, owed to me in lime, I owe in
     coral, "All 6".
   - *Coming up before payday*: card bills (a late one first, in coral), renewals,
     SIPs and bills, soonest first, with their total and "before payday, Mon 1
     Dec".
   - *Your views*: views kept from Ask, live.
   - Two tiles: *Subscriptions* a month, *Net worth*.
   - *Where it went*: categories this month, opens Spend.
   - *Targets*; or, with none set, **A budget for you**: a monthly limit per
     category, what usually comes in, "This leaves ₹18,500 to save" (or how far
     over), **Use these** with Undo.
   - *Accounts*, *Investments* (with the SIP line), *Recent*.
   - The first-run empty home.
2. **Money · Spend**: restyle; filters by period, kind and category;
   *When it went*; Clear filters.
3. **Money · Transaction**, add:
   - The payee's one name on top ("Playo"), the bank's spelling in a field *As
     the bank wrote it* ("PLAYO*BLR").
   - Share lines: your share, owed to you, you owe.
   - **Not income** (a friend's money back): "Not counted in Came in" with
     **Count as income**, which also counts that person from now on, with Undo.
   - *Turf* block for a game's payment, and **Who paid this?** to pick the friend
     by hand.
   - *Source*: the message it came from; then Links and Events.
4. **Money · Split**, **Money · New transaction** (the date shown whole),
   **Money · Today tile**, **Money · Empty and loading**: restyle.
5. **Money · Subscription**, add: *Price history* (Adobe ₹1,516 to ₹699),
   *Billing history*, Mark paid, Pause or Resume, Cancel, Manage. A **bill** is a
   subscription too (MSEDCL electricity, water): due day and amount from the
   bill's text, paid when a payment to that biller matches.
6. **The Ask artboards**, add:
   - Under an answer: "Claude saw 8 payments: payee, amount, date, category".
   - On top: "Reads your records. It cannot move money."
   - *Asked while no model was free*: questions waiting for an answer.
   - *Anything wrong*: **Charged twice** (Both are real / One is wrong, with
     Undo), **A new fee** ("Late payment fee · ₹590"), **A bill went up**
     ("Netflix went from ₹499 to ₹649 · ₹1,800 more a year", Keep it · See it).
   - Two starters answered on the phone: "What's an APR, and what has mine cost
     me?" (the word in one line, then this year's interest and finance charges)
     and "Am I spending more than I make?" (yes or no, with spending by month).

## Add these (built, never drawn)

7. **A bank account's page**: the account's disc, name, "SBI · ··1234"; pills
   for its kind, *In net worth*, a currency other than INR; three numbers:
   **Balance** ("bank said, 12 Nov" or "from opening balance"), **In · NOV**,
   **Out · NOV**; a quick row **Add · Transfer · Set balance · Edit**; *Money out*
   as six months of columns; *Payments* (latest 10, "Transfer in" for money
   arriving); Fields; attachments, tags and reminders.
8. **A credit card's page**: the same, with **Owed** ("bank said, 27 Oct" or
   "from its spends"), **Bill** (amount and due day, "was due" in coral once
   late) and **Limit used** ("62% of ₹3L"), and **Set owed** in the quick row.
9. **The Set balance / Set owed sheet**: "What does the bank show?" (or "What
   does the card app say you owe?"), one amount field, the line "This becomes the
   figure from now on; only payments after it are added. The app shows
   ₹2,00,076.50.", the button; then the toast "Owed set to ₹14,768.76" with Undo.
10. **Subscriptions** (list): every month and every year; *Next to renew*; *Bills*
    in their own group ("3 subscriptions · 1 bill"); *Paused and cancelled*; the
    *No active subscriptions* empty card.
11. **Who owes whom** (list): *To you* and *You owe* totals; one block per person
    with their net and Settle, their open items under it ("Sat 17 Oct · Turf at
    Playground Arena"); *Settled lately*.
12. **A debt's page**: the person's disc, what it was for, who owes whom; pills
    for open or settled, its kind, its group; **Amount**, **Date**, the whole
    **Balance** with that person; **Settle up** (everything with them, Undo) or
    **Reopen**; their page; Edit; *The payment* it came from; *Also open with
    Rohan*; Fields.
13. **Reports**: Spent, Income, Left over; *Over time*; *By day*; *Where it
    went*; **Net worth** as a line ending at today's figure, accounts by kind
    ("Not counted in net worth" apart); *Subscriptions run-rate* by monthly cost.
14. **Import & export**: **Export payments** as CSV for this month, last month, 3
    months, this year or all, through the share sheet. **Import a bank
    statement**: Pick a CSV file; columns guessed and changeable (date,
    description, *One amount column* or *Money out and in apart*); a preview
    ("142 payments · ₹1,84,300 out · ₹96,000 in · 3 rows could not be read");
    pick the account; **Import 142 payments**; a toast with Undo for the whole
    import; the error state for a file it cannot read.
15. **An investment holding's top**: **Invested**, **Now** ("no value yet"),
    **Gain** (+ or −, with its %, coral when down); *Value over time*; its
    transactions.
16. **Money's To check cards** (also shown in *Needs you*):
    - "₹2,000 by NACH on Mon 5 Oct: a SIP?" with each holding, New SIP, Not a SIP.
    - "Spotify, ₹299 every month: track it?" Track it · Not a subscription.
    - Who is this sender, a payee guess, *Turf booked* (a booking matched to a
      game), with Undo where the app acted.
17. **On a person's and a group's page**: the *Money* section (what's open
    between us, Settle) and the group's *Balances*.
18. **Connect your AI** (You › Agent, used by Ask and Sort with AI): **Connect
    OpenRouter** (opens OpenRouter's sign-in, the key comes back by itself),
    *Paste a code instead*, *Or paste a key*; connected and off states.

**Deliver** one artboard per screen, 390 wide, full scroll, on the Money page,
grouped as the list above runs; empty, loading and late or error states where a
screen has them; new kit parts on the Kit page with their names. Keep every
action and number listed here: drop nothing, even where you change the layout.
