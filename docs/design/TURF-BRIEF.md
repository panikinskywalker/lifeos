# Turf · design prompt for Claude Design

Paste the prompt below into Claude Design with your design system attached.
Source of truth: `docs/MODEL.md` (layer 2 *Games*, layer 3 *Turf*, layer 4
*Turf web*). The flow is Turf Ledger's
(github.com/panikinskywalker/Turf-App), which Rutvij already uses.

---

Design **Turf** in two places that share one design: the **Turf board** inside LifeOS, my personal life-OS app for Android (390 × 844, edge-to-edge), and **Turf web**, the same app as a website I save to my iPhone's home screen and that my friends open from links. Use the attached design system for every colour, type style, radius and component. Don't invent a theme; if a part needs something the system lacks, name it and note it.

**What Turf is.** I run a weekly football game with friends: I book a turf, people play, everyone owes a share (usually ₹140–150) and I chase who hasn't paid. Today this lives in my web app, Turf Ledger, which my friends also use (RSVP links, profile invites). I'm rebuilding it: the data lives on Turf web, and I run games from either phone — the Turf board in LifeOS on my Android, or Turf web signed in on my iPhone. **Keep Turf Ledger's flow exactly; I'm used to it. Only the look changes.**

**Where it sits.**
- *In LifeOS (Android):* LifeOS has its own bottom bar (Today · Upkeep · Dump in the centre · Browse · You). Turf opens from Browse › Boards or a Today tile. Inside it, the board has its own section switcher: **Home · Games · + (new match) · Players · Venues**. Design that switcher so it doesn't compete with the app's bottom bar.
- *On Turf web (iPhone, organiser):* the same five sections as the site's own bottom bar, safe areas for the iPhone home indicator, a sign-in screen (email, then a one-time code), installed to the home screen.
- *On Turf web (friends, no sign-in):* the public pages — a match page with RSVP (in / out / maybe, team preference), lineup, teams and score; the squad and leaders; a public player profile; the profile invite form (a friend fills in their own details and photo; I approve them); availability.

**Screens (full scroll for each):**

1. **Home**
   - Money at a glance: games this season, collected so far, outstanding, games played. Each one opens its list.
   - The next match card: date, kick-off, venue, format (e.g. 6-a-side), RSVPs in / needed.
   - Recent games: venue, date, score, "9 of 12 paid".
   - **Who still owes** (follow-ups): faces, amount, how many games, oldest first, with a **Settle up** action and a "remind on WhatsApp" share.

2. **Games**, with two tabs:
   - **Match centre**: the upcoming match; counts (matches, venues, players); the last 13 weeks as an activity grid; a month calendar with game days marked; games by day of the week.
   - **Match history**: filter All / Paid / Partial / Unpaid; search by venue or player; each row shows date, venue, score, total cost and the paid fraction.

3. **New match / Edit match** (from +)
   - Venue picker: picking a venue fills its format, usual cost and kick-off.
   - Date and time; total cost; expected players.
   - Payment terms: Tentative, Prepaid, Advance paid or Postpaid. With Prepaid or Advance paid it asks who fronted the money, plus the advance.
   - Pick players from the squad, with their availability shown.
   - Shares split automatically, with an edit per person.

4. **Match**
   - Header: venue, date, kick-off; score A–B in the team colours; captains; player of the match.
   - Tab **Payment checklist**: every player with their share, what they've paid (tap to pay the full share; long-press or a sheet for a part payment, a refund or a correction, with a note), what's left or their credit, and attendance (confirmed / late / no-show), plus "9 of 12 paid". Who fronted counts as paid. A tentative game shows dues as paused. Each share's payment entries ("+₹100 · iPhone · Sat 9:40 pm") are one tap away.
   - Tab **Team view**: the two teams side by side, with positions, goals, assists, saves and who kept goal.
   - Share the match / lineup / payment summary to WhatsApp.

5. **Players**, with two tabs:
   - **Squad**: search by name, role or skill; filter All / Unpaid / Clear and by availability (available / injured / out of station). Each row shows face, name, main position, and dues if any.
   - **Leaders**: switch between Overall, Goals, Assists, G+A, Appearances, Wins, Win rate, Form, Most improved, Saves, Saves per game, Clean sheets and Player of the match.

6. **Player profile**
   - Photo, name, jersey number, positions (preferred, comfortable, emergency GK), preferred foot, playing style.
   - The six-attribute chart: pace, stamina, defending, passing, dribbling, shooting. Also an overall rating, plus a note when it lacks data.
   - Stats: appearances, goals, assists, saves, wins.
   - Kit colours and clubs supported.
   - Availability with its periods.
   - **Their dues**: open shares by game, with a Settle up action.
   - Share a stats card.

7. **Venues**: your turfs with photo, format, usual cost, usual kick-off, payment terms, a maps link and notes. Include Add / Edit venue.

**Shared parts** (design each one, in both places where it applies):
- **Sending**: a change made on a phone (a payment, new match, score) shows *sending* until Turf web confirms it. Offline, changes wait in order. Show the row state and a small "3 changes waiting" banner.
- **Sync state**: last synced time, pull to refresh, and an error state ("Couldn't reach Turf web, showing what you had at 9:40").
- **To check card**: when a bank SMS matches an open share: *"Priya paid her ₹147 for Sat 19 Sep?"* with Yes / Not this. LifeOS only: it appears in LifeOS's To check list and on Turf Home.
- **Debts**: an unpaid share is either *owes you* (you fronted) or *you owe* (someone else fronted). Show both, clearly told apart.
- **Turf settings**: Turf web address, the access key (a hidden field: "saved on this phone", replace or remove, never shown again), connection status with the last sync ("17 new, 2 changed"), a Sync now button, and "Which player is you". That player is marked *(you)* in every list.
- **Not connected yet** (LifeOS): the empty state names the action, *Connect Turf web in You › Data sources*.
- **Profile submissions**: a friend's submitted profile waiting for my approval, shown side by side with what's there now, Approve / Reject.
- **The Today tile for Turf** (LifeOS): the next match, plus "₹1,170 still to collect".

**Realistic content, not lorem ipsum.** Green Turf Arena (Andheri West, 6-a-side, ₹1,800, 8 pm) and Dribble Box (Powai, 7-a-side, ₹2,100). Players include Priya Shah, Karan Mehta, Aditi Rao, Rohan Kulkarni and Sameer Iyer. Scores look like 7–5.

**Deliverables:**
- Every screen above at 390 wide, full scroll, in LifeOS and on Turf web (organiser and friends' pages).
- States: empty, loading, offline / sending, error, a tentative match, a fully settled match.
- Notes on every decision this prompt didn't cover.
