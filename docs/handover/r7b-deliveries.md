# R7b deliveries · hand-over

Branch `claude/r7b-deliveries` from `m1-design-system` at 0c3a9b3 (v0.0.17). No
version bump, no CHANGELOG edit, **no migration** (Fields live in record JSON).
Typecheck, `npm test` (61 files, 498 tests) and `npx expo export --platform web`
are green.

## Built

- **Delivery's Fields** written into MODEL.md layer 2 (*Things*, after Document)
  before the code; layer 6 marks R7b built.
- **Module** `src/modules/deliveries`:
  - `types.ts`: `shopId` (link → Organisation, word `vendor`), `paymentId`
    (link → Transaction, word `bought_in`), the tracking link as a url Field.
    Old keys unchanged, so existing records keep working.
  - `lib.ts`: `onTheWay`, `otpOf` (shown while on its way, not after 3 days),
    `arrivesToday`, `isQuick`, the steps and their words.
  - `filing/quick.ts` (new): Instamart, Zepto, Blinkit texts and notifications;
    the shop apps' notifications (Amazon, Flipkart, Myntra read as their
    shipping texts). Offers and payments are left out.
  - `filing/delivery.ts` (the parcel parser, kept): shops and carriers
    (Delhivery, Blue Dart, Ekart, Shadowfax, XpressBees, India Post…).
  - `filing/links.ts` (new): `shopOrg` (the Organisation named so, else one made
    once, kind shop), `paymentFor` (the newest spend whose title names the shop,
    2 days before the first text), and `deliveries.payments`, a parser after the
    money parser that links a later payment to the shop's open delivery.
  - `filing/deliveries.ts`: one record per order; quick orders matched within 6
    hours instead of 30 days; shop and payment linked on create and on update.
  - `brain.ts`: *coming up* candidates, `actions.ts`: Delivered by hand + Undo.
- **Board** `src/boards/deliveries`: the Deliveries home (`/module/deliveries/index`),
  the Delivery page's top (OTP block, status steps, Track, Delivered, Shop and
  Paid rows), the Overview on `onTheWay` / `otpOf`, a quick action. Parts in
  `parts.tsx`. Checked in the web export with demo data (screenshots fine, no
  page errors).
- **Design brief** `docs/design/DELIVERIES-BRIEF.md` (artboards `NR-Deliveries-*`).
- **Tests**: `filing/quick.test.ts` (parsers), `deliveries.test.ts` (the
  pipeline with real finance and places: shop and payment Links, payment after,
  refunds not linked, app notifications, quick orders, the 6-hour rule, the
  brain's candidate with no OTP leaving, Delivered + Undo).

## Decisions (where MODEL.md did not say; please confirm)

1. **Quick commerce is a Delivery** (the task said so), but never a nudge, and
   one not heard of for 6 hours is no longer on its way (shown "probably came"),
   with no record change. Swiggy food and Zomato stay out.
2. **Shop link word `vendor`** (as Asset's) and **order link word `bought_in`**
   (as Stock's): no new core link words. The Organisation page shows deliveries
   under "Vendor" both ways, as it already does for Assets.
3. **Shop Organisation by exact name, else made** (kind shop). Finance's payee
   matching then lands Amazon payments on the same "Amazon". Payees finance
   already made as "Amazon Pay India" are not merged.
4. **Payment match by title**: the Transaction's title (finance's merchant)
   against a pattern per shop (Instamart = Swiggy, Zepto = KiranaKart,
   Blinkit = Blink Commerce / Grofers); only `kind: expense`; never one already
   another delivery's. No amount check (shipping texts rarely carry one).
5. **The OTP never leaves the phone**: not in the candidate's line nor record
   (`has_otp` only). The nudge says it is ready on the delivery.
6. **Delivered by hand** on the card and the page, with Undo (a toast).
7. The *Assumed delivered* flag now uses a colon in place of a dash (house rule).

## Shared edits outside my module and board (small)

- `src/platform/seed.ts`: two demo deliveries (Amazon out for delivery with an
  OTP, Flipkart shipped) when the delivery Object is installed.
- No core edits. Finance's `notificationsSource` still lists
  `modules: ['finance', 'inventory']`; deliveries reads notifications through its
  parser's `packages`, so it works, but the list could name deliveries too
  (finance's file, left alone).

## Phone checks (S22)

1. Notification access on; an Amazon / Flipkart / Myntra order: the app's
   notifications move the Delivery along; the OTP shows large on the home and
   the page; Delivered clears it.
2. A Blinkit, Zepto and Instamart order: one record from placed to delivered;
   Home's Blinkit card (R7e) still comes; the UPI payment is linked as the Order.
3. A courier SMS (Delhivery, Ekart, Blue Dart, Shadowfax): the tracking number
   and link; Track opens the page.
4. A card payment SMS before the shipped text, and a GPay payment after it:
   both end up as the Order, and the Shop row opens "Amazon".
5. The morning pass on a day a parcel comes: one *coming up* nudge, urgent if
   it has an OTP, with no code in its text; Track opens the link.
6. The package names in `filing/quick.ts` `SHOP_APPS` are from memory: check
   each app's real one (`in.swiggy.android` for Instamart, `com.zeptoconsumerapp`).

## Real samples needed

Every parser is written against **plausible samples** in the tests, not real
ones. Wanted, from the parser export (You › Data sources › Export for the parser):
- Instamart, Zepto, Blinkit: their order SMS and notifications from placed to
  delivered, and one with a delivery OTP / PIN if they send it.
- Amazon, Flipkart, Myntra app notifications (shipped, out for delivery with
  OTP, delivered), and one promotional notification each (to keep them out).
- Delhivery, Blue Dart, Ekart, Shadowfax SMS (each status).
- A bank SMS and a UPI notification for each shop, to check the payee names
  the payment match reads.

## Patch notes

- Deliveries now come from shop apps' notifications as well as texts and mail.
- Instamart, Zepto and Blinkit orders are tracked too.
- A delivery shows its shop and the payment that paid for it.
- The delivery OTP is large on a new Deliveries screen and on the delivery, and
  goes once it has come; Delivered marks one by hand.
- A parcel arriving today comes up in the Morning brief, its code kept on the phone.
