# Deliveries · design prompt for Claude Design

Paste the prompt below into Claude Design on the LifeOS canvas
(https://claude.ai/artifact/RVT9hLfcQ7tvgXvZN1x6cF), page *v3 Noir*. Source of
truth: `docs/MODEL.md` layer 2 (*Delivery*) and R7b. Deliveries was built
alongside this design (2 Nov): the first screens are drawn from the kit and
this design replaces them. Name the artboards `NR-Deliveries-*` so the build
can read them.

---

Design **Deliveries** for LifeOS, my personal life-OS app for Android (390 × 844, edge to edge, dark). Use the **v3 Noir** page of this canvas for every colour, type style, radius and component: `NR-KitComponents`, `NR-FieldKit`, `NR-KitCharts`, `NR-KitRecords`, and the pill and chip pieces from `NR-People-Parts` and `NR-Home-Parts`. Don't invent a theme. If a part needs something the kit lacks, draw it as a new kit piece and name it.

**What Deliveries is.** Everything on its way to me, filed on its own: Amazon, Flipkart and Myntra parcels (days, through couriers like Delhivery, Blue Dart, Ekart, Shadowfax), and Instamart, Zepto and Blinkit orders (minutes, the shop's own riders). LifeOS reads the shop's and courier's texts, the shop apps' notifications and shipping mail, and moves each order along: ordered → shipped → out for delivery → delivered. The one thing I need at the door is the **OTP**: it must be the biggest thing on screen while a parcel is on its way, and gone once it has come. LifeOS also links each order to its payment and its shop, so I can see what I paid for it.

**Where it sits.** The bottom bar is Today · Upkeep · Dump (centre) · Browse · You. Deliveries opens from Browse › Modules and from the Morning brief on Today ("Trimmer from Amazon is out for delivery: the OTP is on it"). Keep the app's bottom bar.

**The data (design to these, nothing more).**
- **Delivery**: item ("Philips Trimmer BT3221"; a quick order is just "Blinkit order"), shop (an Organisation), carrier, tracking number, order ID, tracking link, **status** (ordered · shipped · out for delivery · delivered · cancelled · returned), expected day, delivered on, **OTP** (with when it came; stale after 3 days), the **order's payment** (a Transaction: ₹ amount, when, which card), notes.
- Every text that moved it is on its timeline ("Shipped · from Amazon SMS", "Out for delivery · Amazon app").
- **Nudge** (into To check and the Morning brief): *coming up*, a parcel arriving today; urgent when it has an OTP. Its verbs: **Track** (opens the tracking page) or **Open**. The OTP is never written in a nudge (it never leaves the phone): the nudge opens the delivery.

**Screens (full scroll for each):**

1. **Deliveries** (home)
   - Header: "Deliveries", "1 today · 3 on the way", the To check bell.
   - **Arriving today**: a card each, out for delivery first: the item, "out for delivery · Amazon · Delhivery", the four steps, **the OTP large** when it has one, **Track** and **Delivered** (by hand, with Undo).
   - **On the way**: the rest, by expected day ("arrives Wed 4 Nov · Flipkart · Ekart").
   - **Delivered lately**: the last two weeks, quiet. A quick order whose last notification was missed says "probably came".
   - "Every delivery" to the full list.

2. **A delivery** (the record page)
   - The OTP block on top while it is on its way (lime, digits spaced, "1 hour ago", "Give it to the agent only once you have the package").
   - Where it is in one line, the four steps, Track · Delivered.
   - **Shop** and **Paid** rows (₹1,499 · Amazon · Sun 1 Nov, 9:14 pm), each opening its record.
   - Tracking: carrier, tracking number, order ID, the link. The timeline of texts below.
   - Draw it in four states: shipped (no OTP), out for delivery with OTP, delivered, cancelled.

3. **A quick order** (Blinkit, out for delivery): the same page, compressed: "on its way · Blinkit", the OTP if Blinkit sent one, the payment (₹437 via GPay). Show how minutes differ from days without a different screen.

4. **Today**: the Morning brief line for a parcel arriving today, and a **Deliveries tile** in a small and a wide size: what is arriving today and its OTP (the wide one shows the code), else "2 on the way".

5. **To check**: a delivery filed from a text ("Delivery: Philips Trimmer BT3221 · Shipped · by 04/11") and one flagged "Assumed delivered: no update since 22/10", with the usual tick · edit · undo.

6. **Add / edit a delivery** (form): item, shop (pick an Organisation or type), carrier (pills of the usual ones), tracking number, order ID, link, status (the steps as pills), expected, OTP.

**Shared parts** (design each once):
- **The OTP block**, large (record page) and compact (cards, the wide tile).
- **The status steps**: four segments, reached ones lit; cancelled and returned as a coral word in place of the steps.
- **The delivery card** and the **delivery row**; parcel and quick-order icons.
- **A toast** with Undo after Delivered.

**Realistic content, not lorem ipsum.**
- Today: Philips Trimmer BT3221 (Amazon, Delhivery, OTP 739204, out for delivery); a Blinkit order (₹437, on its way, OTP 4821).
- On the way: Nike Revolution 6 (Flipkart, Ekart, arrives Wed 4 Nov); Roadster slim fit jeans (Myntra, Shadowfax, arrives Thu 5 Nov); Prestige kettle 1.5 L (Amazon, Blue Dart, ordered).
- Delivered: boAt Rockerz 255 Pro (Amazon, 29 Oct), an Instamart order (₹612, yesterday), a Zepto order (₹1,212, Sunday).
- Amounts in ₹ with Indian grouping; dates as "Wed 4 Nov".

**Deliverables:**
- Every screen above at 390 wide, full scroll, as `NR-Deliveries-Home`, `NR-Deliveries-Delivery` (its four states), `NR-Deliveries-Quick`, `NR-Deliveries-Today` (the brief line and the tile), `NR-Deliveries-ToCheck`, `NR-Deliveries-Form`.
- New kit pieces in a `NR-Deliveries-Parts` artboard.
- States: nothing yet (orders come in on their own; Data sources), loading, everything delivered, a lot on the way (10+), a long item name, an OTP that has gone stale.
- **No backdrop blur**: draw sheets as the semi-opaque version that ships.
- Dark only: the light theme is undecided.
- Notes on every decision this prompt didn't cover.
