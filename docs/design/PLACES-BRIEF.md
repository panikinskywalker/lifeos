# Places · design prompt for Claude Design

Paste the prompt below into Claude Design on the LifeOS canvas
(https://claude.ai/artifact/RVT9hLfcQ7tvgXvZN1x6cF), page *v3 Noir*. Source of
truth: `docs/MODEL.md` (layer 2 *Places*, R3 in layer 6). R3 is built
(22 Oct). The screens below exist in code as a first pass drawn from
`NR-KitRecords` (Place · card) and `NR-KitTrips` (Header · a place, Map with
the route). This design replaces that first pass. Name the artboards
`NR-Places-*` so the build can read them.

---

Design **Places** for LifeOS, my personal life-OS app for Android (390 × 844, edge to edge, dark). Use the **v3 Noir** page of this canvas for every colour, type style, radius and component: `NR-KitComponents`, `NR-FieldKit`, `NR-KitCharts`, `NR-KitRecords` (its *Place · card* is the starting point), `NR-KitTrips` (*Header · a place* and *Map with the route*), and `NR-People-Parts` for faces and chips, which are already built. Don't invent a theme. If a part needs something the kit lacks, draw it as a new kit piece and name it.

**What Places is.** Everywhere I go and every company I deal with. Places are mostly filled in for me:
- A calendar event's location becomes a Place.
- A table booking mail becomes a reservation at a restaurant.
- Mail from a company's domain lands on that company.
- Bank SMS payees become Organisations.
- Turf brings in football venues.
- A dump like "Toit is in Indiranagar, Bengaluru" files the Place and what it sits in.

What I want from it: **where have I been and how often**, **when was I last there**, **what did I spend there**, **what's near me / near home**, and **who is this company that keeps charging or mailing me**.

**Where it sits.** LifeOS's bottom bar is Today · Upkeep · Dump (centre) · Browse · You. Places opens from Browse › Modules › Places (the teal module; Organisation is indigo) and from a Today tile. A Place or Organisation opens from anywhere it appears: an event, a payment, a person's *works at* / *lives in*, a dump, the Links screen. Keep the app's bottom bar. Places has no section switcher of its own.

**Two Objects. Design to these Fields, nothing more.**
- **Place**: somewhere you go.
  - **Kind**: home · work · city · country · area (neighbourhood) · restaurant / café / bar · venue (turf, ground, hall) · gym · shop · stay (hotel, Airbnb) · airport / station · other.
  - **In**: its parent Place. Koramangala *in* Bengaluru *in* India, so Places nest.
  - **Address**, as written: "80 Ft Rd, Koramangala 4th Block".
  - **Map pin** (coordinates). It is often missing.
  - **Maps link**: tap to open Google Maps.
  - **Notes**.
  - **Derived, not Fields:**
    - **visits**: events *at* the Place;
    - **last here**;
    - **spent here**: payments to Organisations *at* the Place;
    - **the Places inside it**;
    - **km from home**.
- **Organisation**: a company, shop, bank or payee.
  - **Kind**: employer / company · shop / brand · restaurant / food · bank / card / broker · service (telco, utility, insurer, app) · airline / travel · school / college · club / gym · payee (not sure yet) · other.
  - **UPI IDs**: several, learned from payments.
  - **Website**: its domain files that sender's mail to it.
  - **Phone**.
  - **At**: the branch Place I go to. *Toit Brewpub at Toit, Indiranagar.*
  - **Notes**.
  - There is no category Field: finance learns the category per payee.
- **Every record also has:** tags, Facts ("Toit's rooftop is closed on Mondays"), a timeline, and Links to anything (people, trips, payments, mail).
- **Places and travel stay apart.** A Place has no dates. A Trip (Goa, 20–24 Dec) lives in Travel. Once a Trip's destination links to a Place, the Place shows **Trips here**. Design that section now and mark it *later*.
- **Turf venues are Places** of kind venue: Dome Turf, Green Turf Arena. Turf's own Venues screen stays in Turf. A venue's Place page gets one row into Turf, like a person's row into their Turf player profile.
- **Maps are drawn, not tiled.** No map provider is chosen yet, so the map is a drawn plate (as in `NR-KitTrips`) with the pin, the route from home and a km pill. It opens the maps app. Design it so a real tiled map could later drop into the same frame.

**Screens (full scroll for each):**

1. **Places home**
   - Header: "Places", count, a + to add a Place or an Organisation.
   - Quick filters as kind chips: All · Eat & drink · Venues · Gym · Shops · Stays · Work · Organisations.
   - **Near home / Been lately**: the last 30 days, with visit counts and "last Sat".
   - **By city**: a header per city (Bengaluru · 14 places · 3 areas), then Place cards. Areas nest under their city. Design what happens at 60+ Places and with 5 cities.
   - **Organisations**: paid most this month, then everyone else by kind.
   - A search that finds by name, address, area, UPI ID or website.
   - Decide whether a list/map toggle earns its place while the map is drawn.

2. **Place page**: extend `NR-KitRecords`' Place · card and `NR-KitTrips`' header into the full page.
   - **The hero**: the card (photo or the kind's art, the name, the kind pill, the "in" line: *Indiranagar, Bengaluru*), then the map with km from home.
   - **Stats**: visits · last here · spent here.
   - **Actions** as quiet pills: Open in Maps, Directions, Log a visit, Add a note, Share.
   - **Visits**: each event at the Place, with date, who came (faces) and what was paid. "Dinner with Priya · Sat 19 Oct · ₹3,240".
   - **Here**: the Organisations at this Place, with what I paid each. *Toit Brewpub · 6 payments · ₹14,820.*
   - **Inside**: the Places in it. For an area or a city this is the main content. Design the city version (Bengaluru, with areas and places) as its own artboard.
   - **People**: who lives in or works at this Place, from People.
   - **Trips here** (*later*): Goa, 20–24 Dec · ₹42,300 · 3 people. Hidden when there are none.
   - **Details**: kind, in, address, map pin, maps link, notes. Each in its Field type's Noir style from `NR-FieldKit`.
   - **Timeline**: "Reservation for 4 · Toit · from mail", "Visited · from calendar", "Filed from a dump".
   - **If it's a Turf venue**: one row into Turf.

3. **Place states** (one artboard, several phones):
   - **no map pin**: what replaces the map? An address-only card with "Add a pin", "Paste a maps link" and "Use where I am now"?
   - **no address and no pin**: just a name, filed from a calendar event;
   - **never visited**;
   - **home**, where km from home makes no sense;
   - **a country** (India) and **a stay** (a hotel in Goa, from a booking mail);
   - a long name and a short one ("Gym").

4. **Organisation page**
   - **The hero**: logo or initial disc, name, kind, website, the *at* branch.
   - **Stats**: paid this month · paid all time · last paid.
   - **Payments**: from finance, by month, with the category it learned. Tap through to the payment.
   - **Branch**: the Place card and its map, or "Where do you go to?" when none is set.
   - **Mail**: messages from its domain, and what was filed from them (*sent by*): a booking, a bill, a delivery.
   - **People who work here**: from People's *works at*.
   - **Details**: kind, UPI IDs as chips, website, phone, notes.
   - **States**:
     - a bank (HDFC Bank: no branch; payments are fees and the card);
     - an employer (UnifyApps: people, no payments);
     - a payee not sorted yet (kind *payee*, only a UPI ID, "What is this?");
     - an app (Swiggy: many small payments, mail).

5. **New / Edit Place and New / Edit Organisation** (forms)
   - **Place**:
     - name;
     - kind as option pills with their icons;
     - **In**: search my Places, or create the city on the spot;
     - address;
     - **map pin**: paste a maps link, or use where I am now;
     - notes.
   - **Organisation**:
     - name;
     - kind pills;
     - **At**: search my Places;
     - website;
     - phone;
     - UPI IDs as chips you add and remove;
     - notes.
   - Keep `NR-FieldKit`'s form inputs; show focus, filled and error.

6. **To check for Places** (in LifeOS's To check list and on the record): a Place filed from a calendar location with a guess: *"New place from your calendar: Toit, 298 100 Ft Rd, Indiranagar"* with Keep / Same as… / Not a place. Use `V2-ToCheck` only for structure; draw it in Noir.

7. **The Today tile for Places**: the most visited place this month ("Toit · 4× this month"), or the top payee when I've been nowhere ("Swiggy · ₹6,240 this month"). Tapping it opens Places home. Give a small size and a wide size. Also the module card on **Browse › Modules**.

**Shared parts** (design each once):
- **Kind art**: the photo stand-in per kind (warm for food, night for bars, teal for venues, green for gyms and parks). Today these are flat gradients. Make them better and recognisable at 40, 56 and 150 tall.
- **Place row**: kind icon or art, name, the "in" line, and visits or last here on the right. Used by lists, search and pickers.
- **Organisation row**: disc, name, kind chip, and paid this month on the right.
- **"In" breadcrumb**: Koramangala › Bengaluru › India, each part tappable.
- **Map plate**: pin, route from home, km pill, name pill; small (in a row), card and full width.
- **Visit row**: date, title, faces, amount.

**Realistic content, not lorem ipsum.**
- India › Bengaluru › Indiranagar, Koramangala, HSR Layout.
- Home (HSR Layout).
- Toit (restaurant, Indiranagar, 4 visits, ₹14,820 at Toit Brewpub).
- Blue Tokai (café, Koramangala).
- Dome Turf (venue, Turf).
- Cult Fit HSR (gym).
- UnifyApps (work).
- Taj Fort Aguada (stay, Goa).
- Kempegowda International Airport.
- Organisations: Toit Brewpub, Swiggy, HDFC Bank, Airtel, UnifyApps, BESCOM.
- People: Priya Sharma, Arjun Mehta.
- Amounts in ₹ with Indian grouping; km as "5.2 km from home".

**Deliverables:**
- Every screen above at 390 wide, full scroll, as `NR-Places-Home`, `NR-Places-Place`, `NR-Places-City`, `NR-Places-PlaceStates`, `NR-Places-Org`, `NR-Places-Form`, `NR-Places-ToCheck` and `NR-Places-Tile`.
- New kit pieces in a `NR-Places-Parts` artboard.
- **States**:
  - empty Places (nothing yet, calendar and mail not connected);
  - loading;
  - a Place with nothing linked;
  - a lot of Places.
- **No backdrop blur:** the app can't blur cheaply. Draw any frosted surface as the semi-opaque version that ships.
- Dark only: the light theme is undecided.
- Notes on every decision this prompt didn't cover.
