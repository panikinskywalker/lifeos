# LifeOS — patch notes

LifeOS is versioned like an app release: **v0** is where it stands on 20 Oct
2026. Each change after it is a small step — 0.0.1, 0.0.2, … — with patch
notes here (newest on top, in plain words). A published release is a whole
number: **v1** first, then v2, …; changes after v1 are 1.0.1, 1.0.2, …. Each
version is a git tag and the app's version in `app.json`.
Turf web has its own numbers and notes (`~/Projects/turf-web/CHANGELOG.md`).

## v0.0.138 · 27 Nov 2026

**An old payment no longer settles new shares.** A payment only settles what was owed on the day it was made. An August payment from Parth, matched to him later, had paid off his November Japan-trip expenses and gone to Splitwise. An old payment also no longer sends anything to Splitwise for what's owed only there.

## v0.0.137 · 27 Nov 2026

**Udhari, tidied on the phone.** Each person's tags show what most of the money is for first (the Japan trip before a ₹200 game) and drop the venue ("Turf", not "Turf · Joggers 7"); Pay shows whole rupees; the owed and owe bar no longer prints raw numbers under it.

## v0.0.136 · 27 Nov 2026

**Udhari opens on who owes whom.** The new home, as designed: what you're owed overall, who owes you and whom you owe (biggest first, with what it's for, a Splitwise tag when they're linked, and how long the oldest share has been open), Remind or Pay by UPI right on each row, your net in each group, recent activity, and Splitwise underneath (people linked, groups, the toggle, last sync, sign out). It works from LifeOS's own shares even when you're signed out of Splitwise. Udhari has its own bar now: People, Groups, + Add an expense, Activity, Splitwise.

## v0.0.135 · 27 Nov 2026

**One refused expense no longer stops the Splitwise sync** (merged from `claude/serene-edison-o0lpvy`). If Splitwise turns down a trip expense, a share or a payment, the rest still sync. Money › Splitwise lists what wasn't sent, with what Splitwise said, and **Try again**. A refused one also goes again on its own once you change it here. Being signed out still stops the sync, as before.

## v0.0.134 · 19 Nov 2026

**Everything on Haiku.** Every request LifeOS makes to Claude now goes to Claude Haiku 5.5: Ask Money (still with web search), uploaded statements and fund screens, the brain's passes (including its first day, which used to be Opus), the trip copilot's look-ups, and Talk's smarter tier. A model picked before today in You › Agent moves to Haiku once; you can still choose another there, or turn on Opus for a day.

## v0.0.133 · 19 Nov 2026

**The trip copilot looks things up** (merged from `claude/serene-edison-o0lpvy`, labelled v0.0.131 on GitHub). Ask what's on while you're there, whether anything is closed on your dates, the last train or opening hours, and the copilot searches the web and reads a few pages before it answers, then lists the pages it used under the answer (tap one to open it). When the trip alone can answer, it doesn't search. It still suggests changes that are saved only when you tap Save. The chat is kept for each trip, so it's there when you come back; **New chat** starts again. Web searches cost a little on top of the usual Claude use ($10 per 1,000 searches), inside the same daily budget.

## v0.0.132 · 18 Nov 2026

**Splitwise keeps up on its own.**
- Money from a friend (their UPI payment, read from the bank text or notification) settles what they owe: their shares first, then trip and group expenses, as a payback. If they're linked in Udhari, the payment goes to Splitwise within seconds.
- If they owe you only on Splitwise (something added there, or before you linked them), the payment is still noted in LifeOS and recorded on Splitwise.
- A trip expense with friends who are all linked goes to Splitwise even when the trip isn't mapped to a Splitwise group: as an expense between you, with who paid and each share. Edits and deletes follow. A mapped trip still goes to its Splitwise group.
- A payment a friend records on Splitwise now also clears trip and group expenses in LifeOS, not only shares.

## v0.0.131 · 18 Nov 2026 (needs the new app build)

**Long photos are read.** A photo or screenshot with a side over 8,000 pixels (a long receipt, a 50 MP photo, a long scrolling screenshot) was refused by Claude with an API 400. It is now shrunk on the phone first, in Money's +, a trip's receipt, Upload a statement and Snap the fridge.

## v0.0.130 · 18 Nov 2026

Merged from `claude/serene-edison-o0lpvy`, labelled v0.0.128 and v0.0.129 on GitHub.

**A trip's expenses go to Splitwise.** In Udhari › Groups, a trip's group (Japan trip) can now go to a Splitwise group. Once it does, every expense and payback on the trip goes there with who paid and each person's share, in its own currency; an edit or a delete here follows there; expenses added on Splitwise come into the trip's Money; and what both already have is matched the first time, never doubled. An expense with someone you haven't linked in Udhari waits until you link them.

**A trip's tabs are real tabs.** Overview, Plan, Bookings, Money and Prep now live in one screen under one trip bar: a tap shows the section at once, with nothing sliding in, and each section keeps where you were. A link from one section to another (All notes, Settle up, the map) switches the tab the same way; from a stop, a day or a booking, the trip bar takes you back to the trip on that section.

## v0.0.128 · 18 Nov 2026

**Back buttons, and a receipt's tax.**
- People home and Travel home have a back button again, to Browse.
- A trip's receipt is the printed total, with tax and service charge: what is over the items shows as its own line and is shared in proportion to what each had, as Money's bill split does. Japanese receipts are read the same way (合計 is the total).

## v0.0.127 · 18 Nov 2026

**Trips move as one, People in whole rupees** (merged from `claude/serene-edison-o0lpvy`, labelled v0.0.33 on GitHub). Switching sections on the trip bar crossfades while the header and the bar stay still; a stop, day, booking or spend slides in; Log a spend, Split a receipt, Pay back and the copilot rise from the bottom. **Split a receipt** keeps long receipts whole, takes WebP photos, and picking from your photos no longer asks for a permission. **People** shows balances in whole rupees.

## v0.0.126 · 18 Nov 2026

**A trip's receipt photo is read again.** Claude refused every one before reading it (the question's shape was missing a rule Claude needs). If it ever fails now, the message says why.

## v0.0.125 · 18 Nov 2026

**A trip's receipt is read by Haiku**, like a bill in Money's +: as good for receipts, and costs less.

## v0.0.124 · 18 Nov 2026

**Udhari.** The Splitwise board is now called Udhari (Browse › Boards › Udhari, and in Money's menu). Splitwise keeps its name where it means the service.

## v0.0.123 · 18 Nov 2026

**Splitwise is its own board.** Find it in Browse › Boards. Money's menu and a person's "Splitwise says" line still open it.

## v0.0.122 · 16 Nov 2026

**One bottom bar on Travel.** Travel home showed the app's bar twice; now it shows once. A trip's own screens keep their trip bar and no longer get the app's bar on top of it.

## v0.0.121 · 16 Nov 2026

**Trips, as designed** (R7g, the trip template, merged from
`claude/serene-edison-o0lpvy`, labelled v0.0.32 on GitHub). Every trip now has the five sections of the
*Trip template · Noir (Japan)* design, with the trip bar at the bottom
(Overview, Plan, Bookings, Money, Prep) and the copilot beside it. **Travel**
shows your next trip as a card with its countdown on a platform LED board.
The **trip page** changes with the trip: before it, the stage stepper, the
hero with the nights hanko, the boarding pass, what needs attention, what's
coming up until you fly and when seats open; while away, **Today** (leave by,
the next train, the last connection, cash and IC card, the stamp you
collected, tomorrow); after, the **Recap** with the stamp book. **Plan** has
the line of stops, the days and the map; each stop has its station board,
the legs either side and its things to do. **Bookings** and every booking,
each **day** with its travel. **Money** works like Splitwise: the budget
with paid, booked and estimates, cost by day, log a spend, split a receipt
photo, pay back, settle up. **Prep** has the checklist, packing and papers
with the emergency numbers. **Search** the trip, ask the **copilot** (it
proposes changes, saved only when you say), or share a **view-only** copy.
Money shows in rupees or the local currency at a tap. Japan gets its own
touches: names in Japanese, mincho station boards, seigaiha waves, stamps.
Import a trip from the trip app's file under Travel › + › Import a trip.

## v0.0.120 · 17 Nov 2026

**Splitwise hears within seconds.** A linked person's share made, changed, settled or deleted (a Turf game, a split, a payment that settles it) syncs to Splitwise a few seconds later, not at the next background sync. A Turf share paid in parts is paid back on Splitwise for exactly what was sent.

## v0.0.119 · 17 Nov 2026

**One way to settle.** A payment recorded on Splitwise settles shares the same way a bank text does, and leaves Turf's shares to Turf too.

## v0.0.118 · 17 Nov 2026

**Pay, remind, settle on its own, and split a bill by item.**
- Money from someone who owes you (or to someone you owe) settles their
  shares on its own, oldest first, as soon as the payment is tied to them.
- *Pay ₹450 by UPI* on a person you owe opens your UPI app with everything
  filled in; their UPI ID is asked for once and kept on their record.
- *Remind* writes a friendly WhatsApp message with Haiku (their name stays on
  the phone), in a tone you pick.
- "1200 dinner with Arjun and Priya, Arjun paid" in Money's + is split
  equally on Save.
- A scanned bill shows *Split by item*: who had what, portions, a line no
  one took shared by all, tax and service in proportion, to the paisa.

## v0.0.117 · 17 Nov 2026

**Splitwise, kept in step.** Money › Splitwise: sign in on Splitwise's own page
inside LifeOS, link your People to your Splitwise friends, and new shares for
linked people (Turf, trips, splits) go to Splitwise on their own. Deleting one
here deletes it there; settling up here records the payment there; a payment
recorded on Splitwise settles them here. A person's Money section shows what
Splitwise says. Needs the new app build (the sign-in page is a WebView).

## v0.0.116 · 17 Nov 2026

**Links, second pass, merged in (from claude/r11-activity-links).** Payments are an audit trail, not Links: they are never a Link on a card, the map, Browse › Links or the add sheet, but an Event on the timeline of each record they touch. Links read as the record would say them, one thing shows once (a player is their person, a game share is one row), the Links · Noir design (the card, a link's sheet with dates and how sure it is, the map that draws out with pinch and pan, Browse › Links showing everything), and Activity rebuilt to A1 to A4. Turf stays the games card in Browse.

## v0.0.115 · 17 Nov 2026

**Funds and SIPs from screenshots, for real.** Statements and fund screens are now read by Claude Sonnet 5.5, asked to think little and given room for a long list (Haiku's thinking used up the space, so lists came back cut off). It is told which figures on a fund app's holdings screen are the value and the amount invested. When nothing can be updated, the sheet says what was read and which screen to try. The CAMS / KFintech CAS PDF is suggested for all your funds at once.

## v0.0.114 · 17 Nov 2026

**No payments from the future.** A bank text whose date came out after the day it arrived (your ₹1,96,958 salary filed as 13 Feb, years ahead) now takes the day it arrived, and a payment dated after today never counts in a balance. HSBC is back to what your bank shows.

## v0.0.113 · 17 Nov 2026

**A merge keeps the real account's balance.** Merging a copy added its payments on top of the real account's figure (HSBC showed ₹3,60,382 instead of ₹1,63,424). The real account's figure is now kept as it was; the copy's payments join its history only.

## v0.0.112 · 17 Nov 2026

**Merge a copied account.** An account's page has *This is a copy of another account*: its payments move to the real one, which keeps its balance and learns the copy's digits, and the copy goes, with Undo.

## v0.0.111 · 17 Nov 2026

**Before payday in colour.** Each card on Money home is coloured by what it is (late coral, bill or card bill blue, renewal lilac, SIP green), labelled, with its category as a pill and a legend under the row.

## v0.0.110 · 17 Nov 2026

**What you owe looks owed.** Card and loan amounts are minus figures in red on a
dark band ("−₹33,207"), on the wheel and on the card's page, and *On your cards*
is a red minus total.

## v0.0.109 · 17 Nov 2026

**A bank balance goes only to a bank account.** Forex and debit cards are no longer offered when a bank balance asks which account.

## v0.0.108 · 17 Nov 2026

**A bank balance never goes to a loan.** When a balance asks which account, your loans and cards are not among the choices.

## v0.0.107 · 17 Nov 2026

**Which account, in order.** The account chips on an unclear balance are listed by name.

## v0.0.106 · 17 Nov 2026

**Subscriptions by screenshot, and every account from one screenshot.** Upload
a screenshot of your subscriptions (an app, Google Play, App Store or a renewal
mail) to add new ones or update a known one's price and renewal. A screenshot
of all your balances updates each account; one that could be several accounts
asks which, with a chip for each, instead of making a new account.

## v0.0.105 · 17 Nov 2026

**Upload and Add a payment start fresh.** If the app went away while a statement
or bill was being read, reopening the sheet showed the old reading with its
Apply or Save where a tap could land. Each opening now starts at the beginning.

## v0.0.104 · 17 Nov 2026

**Loan statements.** An uploaded loan statement is read as a loan, not a bank
balance: it finds the loan by its last digits, makes it a Loan if it was filed
as something else, and sets what you owe (with Undo). A loan's card says *Loan ·
you owe*.

## v0.0.103 · 17 Nov 2026

**A bill says how it was paid.** A snapped or attached bill is read for "Paid:
CASH" or the card's last digits, so *Paid with* starts on Cash or that card
instead of "Someone else paid".

## v0.0.102 · 17 Nov 2026

**Screenshots of bills are read.** A PNG or screenshot attached as a bill (or
snapped for the fridge) failed: the picker said PNG for what it had turned into
a JPEG, and Claude refused the mismatch. Every photo now goes with the type its
own bytes say, and a failed bill says why.

## v0.0.101 · 17 Nov 2026

**Bills, statements and the fridge are read by Haiku.** A snapped or attached
bill, an uploaded statement and Snap the fridge now go to Claude Haiku 5.5,
whatever model the brain uses for its other work: quicker and cheaper.

## v0.0.100 · 17 Nov 2026

**A forex card in several currencies.** Set balance on a forex card asks what
it holds in each currency (dinar, yen, dollar, pound…). Spends abroad come off
the right currency; its page lists *On the card* with each in rupees at today's
rate, and the wheel shows them in one line over the rupee total. Rates and bank
texts now cover EUR, KWD, BHD, OMR, SAR, QAR, SGD, THB, AUD, CAD and CHF too.

## v0.0.99 · 17 Nov 2026

**Forex cards look right.** A forex card says *Spending abroad* on its own, with
no name or Ask Money needed. A forex or debit card whose figure is below zero
(left over from when it was read as a credit card) shows *Set balance* instead of
a minus amount.

## v0.0.98 · 17 Nov 2026

**Debit and forex cards.** An account can now be a Debit card or a Forex card
(prepaid). They count with your bank money in *In your accounts*, have their
own card colours, and a forex card gets its uses like a credit card (Ask Money
knows it is for spending abroad). Set it with Edit › Type on the card's page.

## v0.0.97 · 17 Nov 2026

**No more guessed card uses.** A card named only by its bank no longer gets
uses guessed from what goes through it (it told you to use a forex card for
bills); those guesses are taken off. Its page asks which card it is, and once
you name it, Ask Money fills its uses from that card's real rewards.

## v0.0.96 · 17 Nov 2026

**Cards come with what to use them for.** When Accounts and cards opens, Ask
Money fills in the uses of every card that has none, once per card, as pills
(Shopping, Forex, Fuel) on the card in front and on its page. A card still
without uses opens Ask Money already asking about that card, instead of an
empty Ask screen.

## v0.0.95 · 17 Nov 2026

**Polish on Who owes whom and a debt.** A person's card shows their latest four
open items and "N more", which opens their page; Settle up all on a debt is
white under its coloured card, as in the design.

## v0.0.94 · 16 Nov 2026

**Turf looks like Turf web, screen for screen.** Each screen is rebuilt from
Turf web's own, piece for piece:
- **Games:** Match centre (the season card with played, goals and per match,
  Upcoming with the match wallet or Nothing booked, the activity grid with its
  months and days, the month, When you play) and Match history.
- **Match:** the vote card, "Who's in" before kick-off with Add players and the
  RSVP link, the payment summary's buttons, the Team view (pitch and
  formations, match stats, each side's players, Log stats · Pick teams ·
  share) and Match history as its own sheet.
- **Pick teams** (suggest, reshuffle, random, captains, kits, formations) and
  **Log stats** (the score, each side, the counters).
- **New match:** venues as a list, format chips, the day and kick-off, cost,
  terms, kits beside their crests, and Add players with who said In, last
  match, regulars, In this match and the A to Z list.
- **Player profile:** the hero and Overview, Matches, Stats and Dues tabs.
- **Squad, Dues and Venues**, and Home's Copy details and Copy short.

Ratings count best on their team, as Turf web's do.

## v0.0.93 · 17 Nov 2026

**Who owes whom and a debt's page, redesigned.** Who owes whom has a lime *To
you* tile and a *You owe* tile, then a card per person with what is open and a
full-width Settle up. A debt's page puts the amount on a lime (to you) or orange
(you owe) card with the whole balance with that person, Settle up all, and what
else is open with each day.

**Cards say what to use them for.** A new *Use it for* Field shows on the card
in front of the wheel and as a tile on the card's page; Ask Money writes it
when it says which card to use for what (`card_use`, with Undo).

**Card balances show at the top.** Accounts and cards shows *On your cards*
next to *In your accounts*, so setting what a card owes moves a big figure.

## v0.0.92 · 16 Nov 2026

**Turf's Leaders is Turf web's Leaders.** The page is rebuilt from Turf web's,
piece for piece: the season picker ("Monsoon 2026 · now", each past season, All
time; Turf web now sends its seasons), the thirteen tables, the position
control, search, the table's title and how it ranks, the podium (crown, medal
rings, steps 2 · 1 · 3), the table from 4th with ▲▼ since the last match and
form, Not ranked yet, and Share. Best overall opens it, as on Turf web.

**The bell is on every Turf screen**, as on Turf web's headers; all of them
share one look a minute.

## v0.0.91 · 16 Nov 2026

**Ask Money calls your cards by name.** The agent writes a card's ref and the
phone puts the card's own name and last digits there ("ICICI Bank card
••8013"), so answers no longer say "cards 4 and 6"; the digits still never
leave the phone. The line under an agent's chart now says what Claude really
saw (rounded totals by category and shop) instead of "0 payments", and the
sent log names Sonnet 5.5.

## v0.0.90 · 16 Nov 2026

**Ask Money answers card questions instead of asking first.** When a card is
only "ICICI Bank card", it now gives its best advice straight away from the
bank and what you buy on that card (Amazon on an ICICI card is probably the
Amazon Pay card), says what it assumed, and asks one short question. Tell it
which card it is and it renames the card in the app (with Undo), so it knows
next time. When much of your spending sits in Other, it says so and offers to
sort it, since advice is only as good as the categories.

## v0.0.89 · 16 Nov 2026

**Ask Money gets smarter: Claude Sonnet 5.5, the web, and your cards.**
- It now runs on Claude Sonnet 5.5 instead of Haiku, for much better judgement.
- **It can search the web** and read pages: today's FD and savings rates, a
  fund's returns and costs, tax rules and deadlines, card rewards and offers.
  Every search shows in its steps ("Searched the web: ICICI Amazon Pay card
  cashback"); it never puts your names, account digits or exact figures in one.
- **Which card for what:** it sees what goes through each of your cards by
  category and shop (rounded), looks up each card's rewards, and tells you which
  card to use for which spend and what that saves a month, with fees and caps.
  When a card is only "ICICI Bank card", it asks you which one it is.

## v0.0.88 · 16 Nov 2026

**A SIP screenshot sets up your SIP.** Upload a screenshot of your fund
dashboard or SIP list (Groww, Coin, Kuvera, a CAMS mandate) and each SIP becomes
the monthly SIP on that fund, on its day (taken from the next instalment date
when that is what the screen shows): it then shows under Subscriptions › SIPs,
in Before payday and in Upkeep. A fund the app does not know yet is added with
its SIP.

## v0.0.87 · 16 Nov 2026

**Uploads match the right card.** A statement or screenshot is matched by the
card's or account's last digits first: if exactly one of yours ends in them,
that's the one, even when the bank was misread (a "new Axis card ••6931" was
your ICICI card). Account names that already carry their digits show them once.

## v0.0.86 · 16 Nov 2026

**Screenshots upload and read.** Upload a statement now tells what a file
really is from its first bytes, so a screenshot the picker turned into a JPEG
is no longer sent as a PNG (Claude refused those). A screenshot too big to send
says so and asks for a crop, and when Claude can't read something the reason
is shown.

## v0.0.85 · 16 Nov 2026

**The card wheel opens on your main account on Android too.** It had started
on whichever card came first, because Android ignored where it was told to
start.

## v0.0.84 · 16 Nov 2026

**Upload a statement and Money updates itself from it.** In the + sheet, the
grid menu or on Accounts and cards, upload a PDF or a screenshot: a bank or card
statement, a CAMS or broker summary, your bank or fund app. Claude reads it once
(because you pressed the button), and Money lists what it would change, each
ticked: a bank balance, what a card owes with its bill and due date, a fund's
value, what you put in and its SIP, or a new account, card or holding it does
not know yet. Untick anything wrong and Apply; Undo puts it all back.

## v0.0.83 · 16 Nov 2026

**Ask Money reads well and the keyboard no longer hides your typing.** The
agent's answers show as real text: bold where it means bold, bullet points as
bullets, its "What to do:" lines as headings, never raw asterisks or dashes.
When the keyboard opens, the box you type in rises above it.

## v0.0.82 · 16 Nov 2026

**Ask Money's agent answers everything you type.** With a Claude key, a typed
question always goes to the agent; before, a question that looked like one of
the phone's fixed answers ("where did my money go") got that fixed answer
instead. The starter buttons still answer at once on the phone. The agent also
digs further now: it compares with last month or your usual month, finds what
drives a number down to the shop or bill, and ends with one to three concrete
steps in rupees.

## v0.0.81 · 16 Nov 2026

**The Analytics chart's period is a real dropdown.** Tap "This week" on Money
home's orange chart to pick This week (by day), This month or Last month (by
week), 3 months or This year (by month); the columns and the total follow.

## v0.0.80 · 16 Nov 2026

**Every card its own face; SIPs next to Subscriptions.**
- **The card wheel is prettier:** each account and card has its own colour and
  pattern (half rounds, stripes, rings, quarter rounds, dots, waves, a mountain
  and its sun, a half sun), always the same for that account. Cards behind the
  front one sit a little crooked like a real pile, fan in when the screen
  opens, and give under your finger with a tap of feedback. Amounts show their
  paise small.
- **Subscriptions has tabs:** Subscriptions, Bills and **SIPs**. SIPs lists every
  holding with a monthly SIP, when it next goes, and what you invest a month.

## v0.0.79 · 16 Nov 2026

**The card wheel opens on your main account in the middle**, with cards above
and below it, instead of starting at the top with empty space above.

## v0.0.78 · 16 Nov 2026

**Accounts and cards is a wheel.** Your accounts and cards sit on a wheel like
the iPhone's time picker: the one in front full size, the others stacked behind
it, their names above and their amounts below, smaller and tilted away the
further they are. Scroll to turn it; it snaps card by card with a small tick.
Tap a card behind to bring it forward, tap the front one to open it. A card
whose bill is late is coral.

## v0.0.77 · 16 Nov 2026

**Accounts and cards shows your main account in full.** Your bank account with
the most in it is drawn as a full card at the top, and your other accounts and
cards tuck under it as their edges (cards first), instead of a long run of
edges with the full card hidden at the bottom. Also: Ask Money's agent (v0.0.72)
and the new + (v0.0.73) now reach the phone; those two updates had been built
for a different app runtime and were skipped.

## v0.0.76 · 16 Nov 2026

**Turf: Auto-pick and a searchable audit log.**
- **Auto-pick** in New match and Edit match fills the squad to the number
  expected, as Turf web does: who said In, keepers until there are two, who said
  Maybe, last match's players, then most appearances, only people available.
- **The audit log** has a search (names, amounts, who made the change).
- Faces find their photo with one small lookup each, so long lists stay quick.

## v0.0.75 · 16 Nov 2026

**Turf gets the votes, kit wishes and partner picks.** Turf web now sends them
(its v0.0.71), so on the phone:
- **The vote** shows once it closes: votes for player of the match, and best on
  each team.
- **Suggest teams** weighs "plays well with" picks, the side someone asked for
  and the kit they wished for, as Turf web does (they only break ties).
- **A player's page** says who they play well with.
- **Part payment** on a player's page, as on Dues: oldest games first, anything
  over waits as credit.
- **Profile changes** show the ratings a player gave themselves, on their 1 to 5
  scale.

The first sync after this update reads Turf web from the start once, to pick
these up.

## v0.0.74 · 15 Nov 2026

**Turf's match screen catches up with Turf web.**
- **The header** reads as Turf web's: "Kick-off · tomorrow" with the big
  kick-off time before a match, "Full time" after it, the chips centred
  (who's in before, who's paid after), captains under the crests, and player
  of the match with goals, assists and saves.
- **Player of the match:** while the vote is open it says until when; a tied
  vote says to pick from the team view.
- **Payment summary** shows the whole WhatsApp text, with Copy details and
  Copy short.
- **Add players** from the match: who said In or Maybe first, then who's free,
  then everyone else, with a search; the shares split again.
- **Suggest captains:** last match's player of the match, else the regular who
  has led least lately, as Turf web picks them.
- **Match history** on each match (goals, sides, captains, edits) with **Undo**;
  the **audit log** is now money only, with Undo, like Turf web's.
- **Kits** can be picked in New match and Edit match.
- **Photos:** players' and venues' Turf web photos show (initials and the
  painted turf while there are none).
- **Search** on the payment checklist, Pick teams and Log stats once a match has
  more than 8 players.

## v0.0.73 · 15 Nov 2026

**The + in Money takes a bill, or just your words.** Tap + on Money home or
Spend: **Snap a bill** or **Attach** one (Claude reads the total, the shop, the
date, the items and the tax), **Type it** for the full form, or write it as you
would say it ("₹640 at Shree Sagar, paid in cash, half is Arjun's"). You see
what was read, pick **Paid with**: Cash, any of your accounts or cards, or
someone else paid, and Save, with Undo. Paid in cash comes off your Cash
account (made the first time). If someone shares it, its page opens so you can
split it. The bill's photo goes to Claude only because you pressed the button,
and is deleted from the phone once read.

## v0.0.72 · 15 Nov 2026

**Ask Money is an agent: your money guru.** With a Claude key in You › Agent,
a question in Ask Money goes to an agent on Claude Haiku 5.5 that works it out
in steps you can see, answers in its own words with a chart and the payments
behind it, and says what to do. It can change things for you: move every
payment to a shop into a category (and learn it), put a live card on Money
home ("a card that tracks Swiggy this month"), and, after asking, set a
monthly line or a category limit. Each change shows with Undo. It never moves
money and makes no buy or sell calls. Every figure is still worked out on the
phone, and only rounded amounts and placeholders for people leave it. The
agent is made once with your key; each conversation has a small spend cap.
Without a Claude key, Ask works as before.

## v0.0.71 · 15 Nov 2026

**Accounts look like their cards; Subscriptions and Reports follow.**
- **An account's page** opens with the account drawn as its card: SBI in lime,
  a credit card in lilac (coral once its bill is late), the balance or what
  you owe on it, and where that figure came from ("bank said, 14 Nov"). Under
  it: the bank and last digits, In and Out this month (or the bill and how
  much of the limit is used), then Add, Transfer, Set balance or Set owed, and
  Edit.
- **Subscriptions** shows them as a row of logos under what they cost.
- **Reports** opens with what came in and what you spent, then one line on how
  this month compares with last ("8% less than last month").
- Money's lists leave room for the bar at the bottom.

## v0.0.70 · 15 Nov 2026

**Spend reads at a glance, and the form wears its kind.**
- **One period control:** the arrows step between this month and last month;
  the middle ("November · 1 to 15") picks any period.
- **What to count shows its totals:** Spent, Came in, Investing and All, each
  with its figure; the one you picked is lime.
- **Categories are chips** with their colour and how many payments; tap to
  filter, All to clear.
- **The total card** says how it compares in plain words ("₹1,540 less than
  last month by today") instead of a percentage pill.
- **A calendar of the month:** every date box shows what you spent that day,
  more lime for more, the biggest day solid lime, today ringed; tap a day for
  its payments. Then the ring with every category.
- **New transaction:** the amount card takes the kind's colour: Spent orange,
  Received lime, Transfer blue, Investment lilac.

## v0.0.69 · 15 Nov 2026

**Money's new home, its own bar, and Accounts and cards.**
- **Money has its own bottom bar:** Money home · Spend · Accounts and cards ·
  Subscriptions, with Ask Money's sparkle as the raised button.
- **Money home leads with where it went:** the ring with your categories and
  Set a budget (which opens the suggested budget), the pace line, this week as
  the orange Analytics chart, what needs you, Before payday as day cards you
  swipe (a late bill in coral), your views, then one line each for your
  accounts and for who owes whom, and Recent. A back button goes to Browse;
  the grid button opens the other Money screens.
- **Accounts and cards** is a new screen: what is in your accounts, what the
  cards owe and your net worth, the accounts drawn as a stacked wallet (each
  kind its own colour, a late card in coral), this month in and out, and your
  investments.

## v0.0.68 · 15 Nov 2026

**Turf catches up with Turf web on money and lists.**
- **Part payments from Dues:** open a person, type what came in and tap
  Record. It pays their oldest games first; anything over waits as credit.
  Undo is on the toast.
- **Credit shows on the match:** a share paid partly from credit says so ("₹28
  from credit"), as Turf web does.
- **Search** on Dues, Venues and Leaders; on Leaders a player keeps their place
  and the podium steps aside while you search.
- **10 and 11-a-side:** formations for both, and venues take any size from 5 to
  11 (it was 5, 6, 7 and "8+").

## v0.0.67 · 15 Nov 2026

**Turf has the bell.** Turf's Home has Turf web's bell, with a count of what
waits for you: "I've paid" from players (Confirm, Not yet, or Confirm part when
only some came in), numbers players logged themselves (Approve or Reject), join
requests and profile changes, matches players suggested (Book it opens New match
filled in and closes the suggestion; or Decline), and the latest answers to
upcoming matches, including who moved up from the waiting list. It needs Turf
web to answer; what you decide comes back with the next sync.

## v0.0.66 · 15 Nov 2026

**Turf: take anyone off a match.** Editing a match refused anyone who had money
on it, even credit Turf moved there by itself. Like Turf web (its v0.0.70),
their money now goes with them, onto their latest other match, where it pays
what they owe or waits as credit; the edit screen says so before you save, and
the next sync shows it. It's refused only when they have no other match to keep
it on, and the message names them.

## v0.0.65 · 15 Nov 2026

**Cards owe what the bank says.** A card used to add up every spend since its
first text, minus only the payments LifeOS matched to it, so one missed bill
payment left it lakhs in debt (ICICI ••8013 read ₹2,00,076). Now a card
statement text sets what you owe from its day, and each card's page has **Set
owed** to type what the card app shows, with Undo.

## v0.0.64 · 15 Nov 2026

**Ask Money's box is clear of the bottom bar.** A screen with its own box at the
bottom (Ask Money) shows no bottom bar. When more goes out than comes in, *Can I
afford something?* says so instead of a minus sign, and the note under the
starters says what the privacy gate sends.

## v0.0.63 · 15 Nov 2026

**LifeOS no longer opens itself (the real cause).** The background sync of your
contacts asked Android for contacts permission each time it ran. On Android,
asking opens the permission screen inside LifeOS even when permission is already
given, and that pulled LifeOS to the front a few seconds after you left it. Now
it only checks, and asks only while you are in the app; the notifications
permission on start works the same way.

## v0.0.62 · 15 Nov 2026

**LifeOS no longer opens itself.** With the app lock on, leaving the app asked
for your fingerprint while it was in the background, and on Android that prompt
brings the app back to the front. Now it covers the app as you leave and only
asks once you open it again.

## v0.0.61 · 15 Nov 2026

**Import and export.** Money has an *Import & export* screen: export your
payments for any period as a CSV for a spreadsheet, or import a bank statement's
CSV. The columns are guessed (and yours to change), a preview says what will be
added, payments already here are skipped, and Undo takes the whole import back.

## v0.0.60 · 15 Nov 2026

**Ask Money catches what is easy to miss.** Bank charges (interest, late fees,
forex markup, GST on charges, annual fees) are filed as Fees by their words, and
a new one shows in *Did anything look wrong?*, along with any bill that crept up
10% or more over the year. Ask "What's an APR, and what has mine cost me?" or
"Am I spending more than I make?" and it answers on the phone.

## v0.0.59 · 15 Nov 2026

**A budget made for you.** With no targets set, Money home suggests one from
your last 3 months: a limit per category, what usually comes in, and what that
leaves to save. **Use these** sets them, with Undo.

## v0.0.58 · 15 Nov 2026

**AI sorts what is left in Other.** Money home shows how many payments have no
category, with **Sort with AI**: your model gets only the shop names and a
rounded typical amount (never people, never your texts), and each shop it is
sure of is learned, so its next payment files itself. Undo puts them back.

## v0.0.57 · 15 Nov 2026

**Ask Money sends a summary, not your details.** Amounts go rounded and
people's names go as placeholders ("Person 3"), in your question too; the phone
puts the names back in the answer and works out every exact figure it shows.
Shops keep their names. Who owes whom is answered on the phone only.

## v0.0.56 · 15 Nov 2026

**OpenRouter in one tap.** You › Agent › OpenRouter has **Connect OpenRouter**:
sign in on OpenRouter's page and the key comes back to the phone, nothing to
copy. If it does not come back, **Paste a code instead** gets a one-time code
from OpenRouter to paste.

## v0.0.55 · 15 Nov 2026

**Balances follow the bank.** Each account page has **Set balance**: type what
the bank shows and that is the balance from now on (with Undo). A payment made
later on the same day as a bank's balance text now counts. Cashing out a mutual
fund adds to your bank account instead of taking money out. A debit card spend
lands on your account at that bank instead of making a new credit card. A text
that only states your balance sets it, and a repeat text still does.

## v0.0.54 · 15 Nov 2026

**No more merged or doubled payments.** Two payments used to become one
whenever they had the same amount within 10 minutes, so three friends each
sending ₹161 showed as one. Now a payment is a repeat only when it is the same
bank reference, the bank's text and its app's notification within half an hour,
or the very same text sent twice. A text that arrives late no longer doubles a
payment, a receipt email only confirms a payment with a matching name, and a
repeat text still updates the account's balance.

## v0.0.53 · 15 Nov 2026

**Came in is money you earned.** Friends paying you back no longer count as
income: a payment from a person, or a name the app does not know as a shop,
says *Not income · Money back* with **Count as income**, and once you count
someone's, theirs count from then on. Money back from a shop you paid in the
last 90 days is a refund in that category, so it comes off spending. Salary and
money from businesses stay income. A card bill paid through CRED ("…; CRED
credited") is a transfer, not spending. Your earlier money in is sorted the
same way once, leaving alone anything you changed.

## v0.0.52 · 15 Nov 2026

**SIP questions never go dead.** "Read my texts again" replaces payments it
filed itself; a "A SIP?" question on one of those was left behind with buttons
that did nothing. Now reading again closes questions on the payments it
replaces (the new payment asks again, and Undo brings the old ones back), and
an old question whose payment is gone closes when you tap it, saying why.

## v0.0.51 · 15 Nov 2026

**One Turf.** Browse had Turf twice: a tile under Boards that opened the Turf
app, and a card under Modules that opened a plain list of its records. Now the
card opens the Turf app and the extra tile is gone.

## v0.0.50 · 15 Nov 2026

**Turf's card shows the match, not a person.** With a match booked, Browse's
Turf card shows its day ("SAT 21") with the venue. With none booked, it takes
turns every few seconds between what friends owe and BOOK. A module card can
now take turns between faces like this.

## v0.0.49 · 15 Nov 2026

**No cut names on Turf's card.** A name longer than 8 letters ("Rushikesh")
shows what they owe in dots instead of being cut short.

## v0.0.48 · 15 Nov 2026

**Module cards can say a word, not just a number.** The dot letters on a
Browse card can be a name, a place or a day. Turf's card now shows the next
match's day ("SAT 21", with the venue under it), or with no match booked, the
name of whoever owes most ("KARAN", with what everyone owes under it).

## v0.0.47 · 15 Nov 2026

**The last module card really shows its number now.** v0.0.46 said it did, but
the change had not made it in.

## v0.0.46 · 15 Nov 2026

**The last module card always shows its number.** It is never covered by
another card, so even while a card above it is open, it keeps its line and
dot headline instead of sitting empty.

## v0.0.45 · 15 Nov 2026

**Browse's module cards fit on the phone.** Their colour now fills each card
to its rounded corners (on Android it stopped short on the right and the
bottom), and opening a card higher up makes room for the cards below it, so
the last one no longer runs under the rows that follow.

## v0.0.44 · 15 Nov 2026

**A little extra is fine.** When a friend you know sends up to ₹20 more than
they owe, Turf marks the share paid on its own and the extra counts as money
in. Anything more is still asked, and the question now says how much more:
"Vishwesh sent ₹472, ₹402 more than the ₹70 for Fri, 30 Oct?". Questions
already waiting are reworded the same way.

## v0.0.43 · 15 Nov 2026

**Old Turf questions answer themselves.** Payments that came in before
v0.0.40, like a friend's ₹472 for a Friday game, were still asking "paid for
this?" in To check, because each payment was only ever looked at once. Now,
when the app starts and after each Turf sync, open questions are looked at
again. If the sender is known and the amount is exactly what they owe, the
share is marked paid and the question goes. If the share was paid some other
way, the question goes too.

## v0.0.42 · 15 Nov 2026

**The bottom bar stays when you open a board or module.** Inside Turf it turns
into Turf's own: Home, Games, Players and Venues, with the big lime button as
New match instead of Dump. Turf's switcher at the top is gone, since the bar
does its job. Money and every other page keep the app's bar, so Today, Browse
and the rest are one tap away.

## v0.0.41 · 15 Nov 2026

**Only what is finished is shown.** Money and Turf for now: other modules stay
out of Browse, Today, Upkeep, the brief and search, while still collecting in
the background. You › Modules has a switch for each and "Show every module";
demo data shows everything. The SMS senders list no longer says "undefined".

## v0.0.40 · 15 Nov 2026

**A friend's payment marks their Turf share paid right away.** Money in from a
squad member (their UPI id, the person Money matched, or a bank name whose
first name is only one player's) for exactly what they owe, within 30 days of
the game, is recorded on its own and the sender remembered; To check shows it,
with Undo. Only part payments and names two players share are asked. Money in
already filed is looked at again on start and after each sync.

**"Who paid this?"** On a money-in payment, the Turf section lists who owes you;
pick one and their oldest shares are marked paid, with Undo.

## v0.0.39 · 15 Nov 2026

**Turf moves like Turf web.** Recent games slide and flip in 3D when you open
one (and flip back with ×); the next match's dot pulses; the Leaders podium
rises in; a player's tick pops when you add them to a match.

## v0.0.38 · 15 Nov 2026

**Browse's module stack moves.** Tap a module's strip and it springs open in
place (the cards below slide down) with what matters now and its number in dot
numerals ("PUNE IN 10 DAYS" · 10 DAYS, Money's 81.5K); tap the open card to go
in. A press squeezes the card a little and gives a light tick. Games is called
Turf.

## v0.0.37 · 15 Nov 2026

**Payee names cleaned up.** Payees an older version named with a reference
number ("Playo Refno 387827…", "Piyush Sunil Refno …") get their name back; a
copy of a payee that exists is merged into it, and its payments take the clean
name.

## v0.0.36 · 15 Nov 2026

**One name per payee.** "Playo" and "PLAYO" (or any bank's spelling) now show
as the same payee's name; "As the bank wrote it" keeps the bank's spelling.

**Less kept for nothing.** A delivery's one-time code goes the moment it is
delivered. After 90 days a payment keeps its amount, date, account, category and
who it was paid to, but its activity thread and links to the bank account go;
anything you wrote or changed on it stays.

## v0.0.35 · 15 Nov 2026

**Ads from payment apps are no longer payments.** CRED's "use your CRED cash
amount of ₹20,00,000 to make the most of this sale season" was filed as ₹20
lakh spent, and "tap to check" became a payee called "check". Notifications
that sell something are skipped; a call to action is never a payee; CRED's
"Axis Bank account has been successfully credited" is the card's side of a bill
paid from your bank, joined with that debit as one transfer.

## v0.0.34 · 15 Nov 2026

**Read my texts again** (You › Data sources › SMS): payments filed by older
versions (a loan offer read as ₹20 lakh, card bills and money to yourself
counted as spending, "Refno" in names) are filed again with today's rules.
Payments you edited, split or linked by hand stay as they are; Undo puts the old
ones back.

**Figures are readable on the phone again.** A number with no colour of its own
(Money home's Spent, an account's balance) was drawn in black on Android.

## v0.0.33 · 15 Nov 2026

**The Dump box files straight away again.** Opening Dump with nothing waiting
left the filing run stuck as "running", so anything said after it sat on
"Reading it…" until LifeOS was restarted. Everyday sentences ("spent 400 on
auto") now file in a moment, and something said while a run is going is filed
right after it.

## v0.0.32 · 15 Nov 2026

**Ask Money.** An ask box on top of Money home opens it.
- Five starting questions answered on the phone, each with a live line: where
  the money went, what is due before payday, anything wrong, can I afford it, a
  chart of my spending.
- Every answer is a sentence, one block (a number, bars, a line, a calendar or a
  list) and *See the payments*, which adds up to the figure. Follow-ups (compare
  with last month, only one category, by week, leave out rent) are worked out on
  the phone.
- A typed question goes to the model in You › Agent with only payee, amount,
  date and category; the phone works out every figure. It is logged in Sent to
  Claude, and waits for a model when none is free.
- *Keep on Money home* keeps a view (the question, not the numbers) under Your
  views.
- *Anything wrong*: charged twice, a new fee and price changes, with Both are
  real, One is wrong (with Undo), That is fine and Keep it. Double charges and
  new fees also come to the morning brief.

**You choose what the morning brief shows**: You › Notifications has a switch
per module. Off keeps it out of the brief; its cards still come to To check.

**OpenRouter's free model is now Nemotron 3 Ultra** (the old free Llama is gone).

## v0.0.31 · 15 Nov 2026

**Money counts what you actually spent, and keeps itself up to date.**
- **Your share**: a split, a Turf game you fronted, a friend paying you back and a
  refund now count only your part. Settle up finds the real payment.
- **Read from your own texts**: card bills paid from another account are one
  transfer; your own name moves money between your accounts, not into spending;
  balances follow the bank's own figure; card statements give the amount due and
  the day. One-time codes and passwords are never kept.
- **Money home answers four things**: a day's allowance against your monthly line
  (You › Categories › Monthly line), who owes whom, what is coming up before
  payday, and (on the 1st to the 3rd) last month closed.
- **On its own**: a nameless NACH debit for a SIP counts as investing (or asks
  once); the heads-up before a card charge sets that subscription's next charge;
  a new price goes to To check and the morning brief; three payments a month
  apart are offered as a subscription; electricity, water and other bills come
  from their due texts and are marked paid when the payment arrives.
- **Built from the Noir kit**: the expense ring, donut, hour ticks, columns in
  tracks and the instrument tile; new pages for an account, a debt,
  Subscriptions (with Bills) and Who owes whom; Reports' net worth line now ends
  at today's figure.
- The parser export moved to You › Data sources › Message samples.

## v0.0.30 · 5 Nov 2026

**The app now looks like its design files.** Money, Habits, Health, Deliveries,
Documents, Travel, Journal, Projects, Assets, Home, Automations, the brain's
screens, Today and Browse are rebuilt from their v3 Noir artboards: the plain
rows of the first passes are gone. A module now opens on its own board instead
of a generic page. Browse says Money and Journal. Demo data is remade each new
day, so "today" always has something in it.

## v0.0.29 · 4 Nov 2026

**The Morning brief says what each line is about.** Every line now has its
category above it (Home, Upkeep, Deliveries, People, Tasks), in that category's
colour, and an urgent one says when on the right: Late, Today or Tomorrow.
Before, urgent lines all turned the same red dot and hid where they came from.

## v0.0.28 · 4 Nov 2026

**Demo data, as a switch** (You › Demo data). On: LifeOS restarts with fresh
sample data on every board, in its own database, with the morning brief filled
and files in Your folders. Off: LifeOS restarts with your own data, ready to
link your accounts. The two never mix: while the demo is on nothing is read
from the phone, nothing goes to Turf web or Notion, and no notification is
scheduled. A line on Today and on Data sources says when you are looking at the
sample. It replaces *Load demo data*, which added sample records to your own.

## v0.0.27 · 2 Nov 2026

**The brain, more of it** (MODEL.md layer 8, slices 4 and 6), built in its
own session and merged here. The screens are a first pass from the kit until
the artboards are drawn.
- **Snap the fridge** on Home and the Fridge: take one photo, Claude compares
  it with the pills and lights up the differences ("Not seen: butter · Found:
  coriander"). Tap to accept, hold to fix. The photo goes to Claude only
  because you pressed the button, and LifeOS keeps it nowhere; Sent to Claude
  shows it left.
- **Cook tonight** takes the dish from the fridge photo, and **Ask now** /
  **Another idea** ask straight away instead of waiting for the next pass.
- **Money** brings renewals coming up, bills to pay (Paid files the
  expense), a deposit maturing, and a spend far above your usual.
- **Documents** brings papers expiring (Renewed opens it) and new files in
  your folders you haven't looked at.
- **Projects** brings late tasks (Done) and the dinner, appointment or match
  coming up today or tomorrow.
- **Assets** brings a warranty about to end and a service due by date or km.
- Fixed: something due today in Upkeep now comes as a nudge.

## v0.0.26 · 2 Nov 2026

**Second Brain** (R7f), built in its own session and merged here. The
screens are a first pass from the kit until the *NR-Knowledge* artboards are
drawn.
- **Memory is now the Second Brain**: your notes and everything you've told
  LifeOS, in one place (Browse › Boards). Facts are grouped by who or what
  they're about, with the names Talk learned ("the landlord") below them.
  Nothing is lost: facts Talk kept under a name move onto that person once
  they're in LifeOS. Browse's Memory row is now **Facts**.
- **Notes link to what they mention**: write `[[Karan]]` (or tap Mention)
  and the note shows on Karan's page. A name with no record yet is faded;
  tap it to find or make it.
- **No title needed**: a note is named by its first line until you name it.
- **Pin** notes to keep them on top; filter by kind; one search over notes
  and facts.
- Put a fact on the right person later with *About a record…*.
- Ask "what do I know about Dad?" or say "write a note: …" in the Dump box.

## v0.0.25 · 2 Nov 2026

**Travel** (R7d, with layer 8's travel slice), built in its own session and
merged here. The screens are a first pass from the kit until the
*NR-Travel* artboards are drawn. The mail parsers are written against
plausible samples until real ones come.
- **Trips make themselves from mail**: IndiGo, Air India and MakeMyTrip
  tickets and MakeMyTrip, Booking.com and Airbnb stays land in one *booked*
  trip, the return flight sets when it ends, and the fare is its first
  expense.
- **Spend vs budget** on every trip: spent, what's left, per day left, by
  category. Payments from the trip's days that are on no trip are offered
  with an Add button.
- **Packing**: a list from the days and the kind of place, picked from your
  clean clothes and Home's Bathroom; Pack marks the clothes packed, Back home
  puts them in the wash.
- **The brain comes to you** before a trip: check in for tomorrow's flight,
  pack for Friday, what to do before you go, and unpacking when you're back.
- A trip's destination is now a Place, and a Place's page shows **Trips
  here**.
- New AI tool: what a trip cost against its budget.

## v0.0.24 · 2 Nov 2026

**Deliveries** (R7b), built in its own session and merged here. The screens
are a first pass from the kit until the *NR-Deliveries* artboards are drawn.
The parsers are written against plausible samples until real ones come.
- **Deliveries come from shop apps' notifications** (Amazon, Flipkart,
  Myntra) as well as texts and mail, and couriers' texts (Delhivery, Blue
  Dart, Ekart, Shadowfax, XpressBees, India Post).
- **Instamart, Zepto and Blinkit orders are tracked too**, one record from
  placed to delivered.
- **A delivery shows its shop and the payment that paid for it**, even when
  the payment comes after the shipping text.
- **The delivery OTP is large** on a new Deliveries screen and on the
  delivery, and goes once it has come; **Delivered** marks one by hand, with
  Undo.
- **A parcel arriving today comes up in the Morning brief**, its code kept on
  the phone.

## v0.0.23 · 2 Nov 2026

**Health, rebuilt** (R6), built in its own session and merged here. The
screens are a first pass from the kit until the *NR-Health* artboards are
drawn.
- **A card per metric** (steps, sleep, heart rate, weight, screen time) on
  Health, each opening its own page: best days and walks, nights from asleep
  to awake, resting heart rate, weight readings, apps this week.
- **This week vs last, and vs your usual** (the median of your last eight
  weeks), on every metric's page and on the full chart.
- **Sleep shows when you fell asleep and woke**; workouts keep when they
  started.
- **Log a weight** in one tap from the Weight page or the + menu.
- **A gentle weigh-in reminder** in To check if you weigh yourself by hand
  and it has been a while.
- **Ask Claude**: today's body numbers, how a metric compares, your
  workouts; log a reading.
- **Health Connect and screen time are Health's own sources** now; nothing
  changes in how they sync.

## v0.0.22 · 2 Nov 2026

**Automations** (R10), built in its own session and merged here. The screens
are a first pass from the kit until the *NR-Automations* artboards are drawn.
- **Automations do several steps in order**, and a step can use what the
  steps before it made ("Review: {{steps.s1.title}}").
- **Ask Claude as a step**: your prompt, filled in from the record, within
  the brain's daily budget and in the Sent to Claude log; with fallback
  words for when Claude can't be asked.
- **Run by hand** from its button on the Automations board, from Run now,
  or by typing "run month close" in the Dump box; a toast tells you what it
  did, with Undo.
- **Every run is kept step by step**: what went in, what came out, what
  failed. Undo a run where its steps allow; run a failed one again.
- **Continue only if** stops a run quietly when something doesn't hold.
- **Templates**: Big spend flag, Subscription auto-post, Document expiry,
  Contact nudge.
- **Every day** automations now run once a day after their time.
- Your existing automations moved over as they were.

## v0.0.21 · 2 Nov 2026

**Activity and Links** (R11), built in its own session and merged here. The
screens are a first pass from the kit until the *NR-Links* and
*NR-Activity* artboards are drawn.
- **Activity is a board** in Browse › Boards: every tracker with "2 of 4
  done today", New tracker, On Today, each tracker's page. Its tile on Today
  is unchanged.
- **Every record has a Links card**: grouped by link word, coloured by
  module, payments summed, a small map when two or more are linked. Hold a
  row to Open, Show in Links or Remove link (with Undo); Link adds one.
- **The Links screen** shows which colour is which module and lists every
  Link under the network; **Browse › Links** lists your most linked records.

## v0.0.20 · 2 Nov 2026

**Today and Time** (R8), built in its own session and merged here.
- **Today's tiles now come from the boards that own them** (People, Home,
  Turf, Health, Money, Habits, Time, and a Today board for My day, Overdue,
  Upcoming and the rest). Nothing changes on screen; your order, switches
  and looks carry over.
- **Time is a board** in Browse › Boards, at `/time`. A day shows **On this
  day**: what happened on that date a month, six months and years before,
  each item opening its record or dump. The On this day tile opens it.

## v0.0.19 · 2 Nov 2026

**Your Mac first** (R12, the code side), built in its own session and merged
here. The run on the Mac is still to do (steps in
`docs/handover/r12-mac-model.md`).
- **Talk and filing try a model on your Mac** (Ollama over Tailscale,
  `qwen3:8b`) before any cloud provider; the cloud is used only when the Mac
  is off or gets it wrong. A sleeping Mac is skipped for two minutes, so
  nothing waits on it.
- **You › Agent › Your Mac**: the Mac's address and model, and a **Test the
  Mac** button that says what to fix. The cloud providers are listed below
  it, in the order they are tried.
- **Budgets are cloud only**: the Mac is free, never capped, shown as free in
  usage.
- Your Mac's old `…/v1` address keeps working.

## v0.0.18 · 2 Nov 2026

**Build and ship** (R15), built in its own session and merged here. Needs a
new APK: install it over the current one (data kept); this version does not
arrive as an update.
- **Your database can be encrypted** (SQLCipher, AES-256). You › Lock &
  backup › Database: *Try on a copy* checks it without changing anything;
  *Encrypt the database* moves it on the next start, checked table by table
  before it switches. The key stays in the phone's secure store and in no
  backup: keep making backup files to move to a new phone. New installs
  start encrypted.
- **The daily clean-up**: To check items you haven't touched in 15 days are
  ticked; dumps filed more than 15 days ago leave the Dump tab and search
  (still on their records); texts' wording goes after 60 days as before. The
  last run is shown in You › Lock & backup.
- **App lock fixes**: removing the phone's screen lock no longer locks you
  out of LifeOS; Back does nothing while locked; the lock can be turned off
  even when the phone has no screen lock.

## v0.0.17 · 2 Nov 2026

- **Today**: a small tile alone on its row (Overdue, Steps, Sleep) is drawn
  short and wide, not as a full-width square.

## v0.0.16 · 2 Nov 2026

**Documents, from your own folders** (R7c). LifeOS no longer needs its own
copy of your papers.
- **Your folders** (Documents › Your folders): pick the folders where your
  papers already are (Documents, Download, a Scans folder). Every file in
  them shows up as a Document that points at the file; nothing is copied.
- **Search inside them**: PDFs' text is read on the phone (15 per rescan)
  and never leaves it. A scan is found by its name.
- **Kind guessed** from the name and the text (ID, insurance, ticket,
  receipt, tax, medical, contract, certificate); add expiry, tags and
  links as before.
- **Kept current** on every sync and with Rescan now: new files arrive as
  *new*, a renamed or moved file keeps its record, a deleted one is marked
  *missing* instead of vanishing.
- **Open** opens the file in the phone's own viewer; **Filed** clears it
  from New in your folders.
- From this version, changes that don't touch the phone's native code
  reach the app as updates on their own, without a new APK.

## v0.0.15 · 2 Nov 2026

**The first build to install on the phone** since the 4 Oct reset: a
standalone APK with everything up to v0.0.14 in it.
- **Home reads a shared invoice PDF on the phone** (R7e, built in its own
  session and merged here). Share Blinkit's invoice into LifeOS and it
  stocks Home; a scan or a locked PDF gives a "Couldn't read this invoice"
  card in To check instead.
- A Turf dues nudge says the date as "17 Oct", not "2026-10-17".

## v0.0.14 · 31 Oct 2026

**The brain, a first pass** (MODEL.md layer 8), built in its own session and
merged here. LifeOS now comes to you first. The screens are a first pass
from the kit until the *NR-Brain* artboards are drawn.
- **Morning and evening passes**: twice a day LifeOS looks through Home,
  Upkeep, People and Turf for what needs you and asks Claude to judge and
  word it. At most two nudges per module a day; at most three notifications
  a day, urgent first, never in quiet hours.
- **A Morning brief on Today**, above the tiles: today's nudges and what to
  cook tonight, each opening its record. "Updated 7 pm" after the evening
  pass.
- **Nudges in To check**, in three shapes: done, undo? (butter put on the
  shopping list) · is this right? (milk probably gone) · shall I? (call Dad,
  send Karan's wish, remind Arjun, open Thursday's match). Not this means
  never again.
- **Cook tonight** on Home, **gift ideas** on People's birthday cards and
  profile, and **a drafted wish** in the wish card, from Claude.
- **You › Agent › Brain**: the Claude key, the model (Opus 5.5 on the first
  day, Haiku 5.5 after; Opus for today when you want it), a daily budget,
  the **Sent to Claude** log (exactly what left the phone: records only),
  what it has learned and its Skills, Copy as Markdown, Run a pass now.
- It learns: an answer it already has never costs a call again, and what it
  learns stays on the phone (in backups), never in Claude.
- Without a key, or over the budget, nudges still come in LifeOS's own
  words.
- Database upgrade v16. Not yet run on the phone.

## v0.0.13 · 31 Oct 2026

**Projects, rebuilt** (R4), built in its own session and merged here. The
screens are a first pass from the kit until the *NR-Projects* artboards are
drawn.
- **The Projects home** shows today's events and tasks, what's overdue, your
  projects with their progress and what's coming up. Tasks, projects and
  events have their own pages.
- **Repeating tasks**: a task can repeat (every day to every year); ticking
  it moves its due date on.
- **Tasks are in Upkeep**: a task with a due date is a Cycle, due and
  overdue like the rest.
- **Events can belong to a project.**
- **Goals are Projects now**: each goal became a Project with its target
  date and why it matters; its numbers are kept as a note on it.
- **The calendar is Projects' own source** now; nothing changes in how it
  syncs.
- **Ask Claude**: today's agenda, what's overdue, and how a project is going.

## v0.0.12 · 31 Oct 2026

**Assets** (R7a), built in its own session and merged here. The screens are a
first pass from the kit until the *NR-Assets* artboards are drawn.
- **Vehicles are Assets now**: your car keeps its readings, service,
  insurance and the spends linked to it; it is folded in once, on first open.
- **Clothes are Assets**, kept in Home's **Clothes** space as pills: clean,
  in the wash, packed. Tap moves one between clean and in the wash (with
  Undo); hold for packed or to open it.
- **The Asset page**: the warranty as a bar with days left, the service with
  *Serviced*, and for a vehicle its km and next service on both clocks.
- **Service by months** for anything (the AC every 6 months), and by km too
  for a vehicle (6 months or 10,000 km unless you set it).
- New AI tools: what's under warranty, what's due for service, the clothes by
  state.
- Add an Asset, a vehicle or clothes from the quick actions.

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
