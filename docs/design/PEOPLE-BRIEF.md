# People · design prompt for Claude Design

Paste the prompt below into Claude Design on the LifeOS canvas
(https://claude.ai/artifact/RVT9hLfcQ7tvgXvZN1x6cF), page *v3 Noir*. Source of
truth: `docs/MODEL.md` (layer 2 *People*, R2 in layer 6). R2 is built
(22 Oct): the screens below exist in code as a first pass drawn from
`NR-KitRecords` (Person · Profile, People strip); this design replaces that
first pass. Name the artboards `NR-People-*` so the build can read them.

---

Design **People** for LifeOS, my personal life-OS app for Android (390 × 844, edge to edge, dark). Use the **v3 Noir** page of this canvas for every colour, type style, radius and component: `NR-KitComponents`, `NR-FieldKit`, `NR-KitCharts` and above all `NR-KitRecords`, whose *Person · Profile* (ref 2) and *People strip* are the starting point. Don't invent a theme. If a part needs something the kit lacks, draw it as a new kit piece and name it.

**What People is.** Everyone in my life in one place: family, friends, colleagues, the plumber. A person is mostly filled in for me. I pick them from my phone's contacts, my call log moves *last spoke*, bank SMS and UPI payments link to them, and Turf brings in my football friends. What I want from it: **who should I call** (a keep-in-touch rhythm per person), **whose birthday is coming**, **when did I last see someone and what do we share** (trips, dinners, money), and **who owes whom**.

**Where it sits.** LifeOS's bottom bar is Today · Upkeep · Dump (centre) · Browse · You. People opens from Browse › Modules › People (the pink module) and from a Today tile. A person opens from anywhere a person appears: a payment, a trip, a dump, the Links screen. Keep the app's bottom bar. People has no section switcher of its own.

**The data (design to these, nothing more).**
- **Person**:
  - Relationship: family · friend · partner · colleague · client · vendor / service · acquaintance.
  - Phone and email: tap to call, message or mail.
  - **UPI IDs**: several, e.g. `priya.s@okicici`.
  - Birthday, with the year optional.
  - **Works at**: an Organisation, or just the typed name. **Role**.
  - **Lives in**: a Place, or just the typed city.
  - **Keep in touch**: off · every week · 2 weeks · month · 3 months · 6 months · year.
  - **Last spoke**: moves on its own with a call, an event with them, or a payment.
  - Photo.
  - **About**: long text.
- **Every record also has:** tags, Facts (one-liners said in passing: "Priya's moving to Pune in March"), Cycles (Keep in touch, Birthday), a timeline (calls, meetings, payments, edits), and Links to anything (trips, dinners, payments, the Football group, her company).
- **Group**: name; kind (home · trip · friends · family · work · sport); members, each with a default share; default split (equally / by shares); a place; a photo; about.
- **Money with a person**: an open balance (*owes you* / *you owe*), the shared expenses behind it, and **Settle**.
- **Senders**: a payment from a UPI ID LifeOS has never seen asks once, "Who is priya.s@okicici?". The answer is remembered.

**Screens (full scroll for each):**

1. **People home**
   - Header: "People", count, a + to add.
   - Quick filters: Everyone · Family · Friends · Work · Groups · Pick contacts.
   - **The People strip**: faces, and a lime ring means something is due (call, birthday). Design what happens at 40+ people.
   - **Call or message**: who is due or overdue on keep in touch, with last spoke, "12 d overdue", and Call / Log contact right on the row.
   - **Birthdays coming up** (30 days): the day, "turns 32", and a gift or wish action.
   - **Not spoken in a while**: people with no rhythm set whom I haven't spoken to in months, as a gentle suggestion to set one.
   - **Groups**: faces stacked, member count, and the group balance if there is one.
   - A search that finds by name, company, city or UPI ID.

2. **Person · Profile**: extend `NR-KitRecords` ref 2 into the full page.
   - **The hero**: photo edge to edge, the handle, Edit, the name on two lines, and the three stats (last spoke · owes you / you owe / settled · shared).
   - **Actions** as quiet pills: Call, Message, Mail, Log contact, Add IOU, Add expense.
   - **Keep-in-touch nudge** when overdue: "20 days since you last spoke · you aim for every 2 weeks", with Call / Log contact.
   - **Connections**: the latest linked things (a trip, a dinner, a payment), **Shared expenses** with Settle, Notes (Facts), and All → the Links screen.
   - **Photos**, then **Last note**.
   - **Details**: relationship, phone, email, UPI IDs, works at, role, lives in, birthday, keep in touch, about. Each in its Field type's Noir style from `NR-FieldKit`.
   - **Groups they're in**.
   - **Cycles**: Keep in touch, Birthday.
   - **Timeline**: "Called Priya · 5 min", "Dinner at Toit", "+₹1,620 from Priya · UPI", "Met at the gym (from a dump)".
   - **If they play football**: one row into their Turf player profile. Turf's own profile stays in Turf.
   - **The money section**: the balance and the open IOUs. Today this is a finance card under the profile. Decide whether it folds into the hero's "owes you" or stays a card.

3. **Profile states** (one artboard, several phones):
   - no photo: what replaces the photo? Today it's the People gradient, `#F25CA2 → #8E1F60`. Design something better, e.g. their initial large, or their disc colour.
   - no phone (no Call / Message);
   - overdue on keep in touch;
   - **birthday today**;
   - never spoken / just added from contacts;
   - a vendor (the plumber: role, last job, what I paid, no keep in touch);
   - a person who owes me vs one I owe;
   - a long name and a one-word name ("Dad").

4. **New / Edit person** (form):
   - **Photo**: pick, or use the contact's photo.
   - Name, relationship as option pills, phone, email.
   - **UPI IDs** as chips you add and remove.
   - **Works at**: search my Organisations, or keep the typed name ("Zomato, not in your organisations yet").
   - **Lives in**: the same, over Places.
   - **Birthday**, where the year can be left out.
   - **Keep in touch** as cadence pills.
   - About.
   - Keep `NR-FieldKit`'s form inputs; show focus, filled and error.

5. **Group**
   - The record: cover photo, name, kind, member faces with each one's share, default split, place.
   - **Balances per member**, with Settle on each.
   - Shared expenses, and the group's timeline.
   - **Add / edit members**, including setting shares.
   - Real groups: Flat 4B (home, 3 people, by shares), Football (sport, 18 players, from Turf), Goa trip (trip, 5 people).

6. **People list and Groups list**: the generic list screen as it applies to People. A person's row has face, name, relationship chip, and last spoke on the right. Include filters (relationship), sort (name · last spoke · birthday), and grouping (A–Z index or by relationship). Design the row once so the list, search results and pickers all use it.

7. **Pick contacts** (You › Data sources › Contacts, and from People home)
   - My phone's contacts with search; tick several.
   - **Already in People** is marked; ticking one only fills its gaps.
   - "Add 4" at the top.
   - The permission state before access is given.
   - Never the whole phonebook: say so.

8. **Who is this? (To check)**: payment senders.
   - **A new sender**: "Who is priya.s@okicici? · ₹147 in · Sat 19 Sep · HDFC SMS". Choices: pick a person (search, with suggestions by name), a new person, or "it's a shop / company". The answer is remembered: say so.
   - **A guess**: "We think JOHN D is John Doe", with Yes / Not them.
   - Both appear in LifeOS's To check list, the bell in every header, and on the payment's own page. Use `V2-ToCheck` only for structure; draw it in Noir.

9. **The Today tile for People**: "3 to call", the first face with "Priya · 12 d overdue", the next birthday. Tapping it opens People home. Give a small size and a wide size.

**Shared parts** (design each once):
- **Face / disc**: photo or initial on a colour block, in 4 sizes (24 in rows of faces, 36, 40 for list rows, 56 for the strip). Add the lime ring for "due" and a stacked-faces row for groups.
- **Last-spoke chip**: "today", "3 d", "2 mo". It turns lime when due and coral when well overdue.
- **Balance chip**: *owes you ₹1,620* vs *you owe ₹400*, clearly told apart.
- **Call / Message / Log contact** as one trio, used on the profile, the nudge and the home rows.
- **Toast** with Undo after Log contact and after Settle.

**Realistic content, not lorem ipsum.**
- Priya Sharma (friend, Bengaluru, works at Zomato, keep in touch every 2 weeks, owes me ₹1,620, birthday 2 Nov, turns 32).
- Dad and Mom (family, weekly). Nani (family, birthday today).
- Kendal Rao (designer at Swiggy, imported from contacts).
- Arjun Mehta (colleague at UnifyApps, monthly).
- Ramesh (vendor, plumber, last paid ₹650).
- Karan Mehta (Football group).
- Groups: Flat 4B, Football, Goa trip. Amounts in ₹ with Indian grouping.

**Deliverables:**
- Every screen above at 390 wide, full scroll, as `NR-People-Home`, `NR-People-Profile`, `NR-People-ProfileStates`, `NR-People-Form`, `NR-People-Group`, `NR-People-List`, `NR-People-Contacts`, `NR-People-WhoIs` and `NR-People-Tile`.
- New kit pieces added to `NR-KitRecords`, or a `NR-People-Parts` artboard.
- States: empty People (no one yet, contacts not allowed), loading, a person with nothing linked, a lot of people.
- **No backdrop blur:** the app can't blur cheaply behind a sheet. Draw the profile's frosted sheet as the semi-opaque version that ships (`rgba(22,22,26,0.62)` over the photo, with the fade to ground), not as real glass.
- Dark only: the light theme is undecided.
- Notes on every decision this prompt didn't cover.
