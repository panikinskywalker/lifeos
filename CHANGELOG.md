# LifeOS — patch notes

LifeOS is versioned like an app release: **v0** is where it stands on 20 Oct
2026. Each change after it is a small step — 0.0.1, 0.0.2, … — with patch
notes here (newest on top, in plain words). A published release is a whole
number: **v1** first, then v2, …; changes after v1 are 1.0.1, 1.0.2, …. Each
version is a git tag and the app's version in `app.json`.
Turf web has its own numbers and notes (`~/Projects/turf-web/CHANGELOG.md`).

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
