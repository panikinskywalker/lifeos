# R7a assets · hand-over

Branch `claude/r7a-assets`, from `m1-design-system` at 617c509 (v0.0.11). No
migration, no version bump, no CHANGELOG edit.

## What was built

- **Fields first** (`docs/MODEL.md` layer 2 *Things*, *Retired*, layer 3,
  layer 6 R7a): Asset's Fields table, the vehicle fold, R7a marked built.
- **The module** (`src/modules/assets`):
  - `types.ts`: Asset with the categories vehicle · device · appliance ·
    clothing · furniture · jewellery · property · other; vendor →
    Organisation (word `vendor`), where → Place (word `at`, the typed
    `location` kept), **kept in → Space** (word `kept_in`, by Link: no import
    of inventory), clothing **state** clean · in the wash · packed,
    registration, odometer (meter readings), fuel, service every months / km.
    Cycles: `asset.warranty` (fixed, 30 days' notice) and `asset.service`
    (interval by months; for a vehicle either 6 months or 10,000 km unless
    set; written back to next service). Routine stays here until R5.
  - `assets.ts`: `underWarranty`, `services`, `dueForService`,
    `clothesSpaces` (spaces whose data says they hold clothes), `clothes`,
    `clothesByState`, `nextClothesState`, `setClothesState` (with Undo).
    Clothing kept nowhere shows in the first clothes space.
  - `fold.ts`, once on first open (settings `assets.r7a`,
    `assets.r7a.clothes`): `vehicle` records → Assets in place (same id;
    plate, odometer, next service, fuel, notes kept; make / model / year are
    already the title; the Service cycle becomes `asset.service`; Insurance
    and PUC stay as plain Cycles; links with the word `vehicle` → `asset`);
    `electronics` → device; Stock in a clothes space → clothing Assets,
    clean (this waits until Home's spaces exist).
  - `aiTools.ts`: `under_warranty`, `due_for_service`, `clothes`, and
    `create_routine` (moved from types.ts).
  - `assets.test.ts`: 11 tests (the fold, warranty, service by km and by
    months, "the car", Upkeep's Vehicles chip, clothes, the tools).
- **Core, small** (shared with the brain session; each a line or two):
  `asset:vehicle` names an Asset of that category in lifeTools' type words
  ("the car"), Upkeep's Vehicles chip and the cost category (transport);
  `kindOf` in `src/core/cycles/upkeep.ts`; parser and graph aliases send car
  / bike / vehicle to `asset`; `vehicle` left the almanac's and dumps' type
  lists. `vehicle` stays in lifeTools' type words for test fixtures that
  still define one.
- **Tests changed** because the `vehicle` Object is retired (not to make
  them pass): the golden flows and the parser test make the car an Asset of
  category vehicle (`asset.service`, link word `asset`); the dumps golden
  test drops its `fillDefaults(vehicleType …)` line. `scripts/live-agent.ts`
  imports follow.
- **The board** (`src/boards/assets`, a first pass from the kit): the Asset
  page (`AssetHero`, placement top) with a warranty bar and Service (with
  Serviced); a vehicle's odometer, insurance and spend trio, service on both
  clocks, attention, quick actions, warranty and service log; clothing's
  state (Segmented) and its space. The Overview lists due for service,
  warranty ending (90 d) and how many are in the wash. Quick actions: Asset,
  Vehicle, Clothes (with the category prefilled).
- **Home** (`src/boards/inventory`, only for clothes): `clothes.tsx`, the
  Clothes space with clothes pills in Clean · In the wash · Packed; tap
  cycles clean → in the wash → clean (packed comes back clean), hold for the
  other states or Open, + adds clothes kept here. The space tile counts them
  and says how many are in the wash or packed. R7e's note is gone.
- **Demo data**: the Creta is an Asset (insurance as a Cycle), the MacBook a
  device, 11 clothes in Clothes.
- **Design brief**: `docs/design/ASSETS-BRIEF.md`, artboards `NR-Assets-*`,
  with the Clothes space and the packing picker for R7d.
- Checks: `npm run typecheck` clean, `npm test` 431 green, `npx expo export
  --platform web` builds; the Clothes space, a tap with Undo, the Creta and
  the MacBook pages were checked in the web build with the demo data.

## What you must decide

1. **Insurance and PUC on a folded vehicle** stay as Cycles on the Asset.
   Should they become Documents in R7c (the demo already has a Car insurance
   policy Document linked to the car), or stay Cycles?
2. **A packed thing tapped on Home** comes back **clean** (the inverse of
   packing). Or should it go to *in the wash*, since it came back worn?
3. **The form shows every section** for every category (a shirt's form has
   Vehicle and Service sections). A Field that shows only for some
   categories needs a small core / ui change; do it now, or wait for
   NR-Assets-Form?
4. **Things on the Upkeep tab**: the Things chip (`asset`, `stock`) now also
   shows vehicles, since they are Assets. Keep, or exclude vehicles there?
5. **Vendor** now links to an Organisation; old vendor links to a Person
   stay as Links but the Field shows only Organisations. Fine?
6. **Meters**: only km (odometer). MODEL.md once said "km, hours"; add an
   hours meter (a generator, an inverter) when one is needed?

## Patch notes for the merge

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

## Follow-up, 4 Nov (from your answers)

Branch `claude/r7a-assets` continued from `m1-design-system` at 665aec9
(v0.0.28), since R7a was merged as v0.0.12.

- **Insurance and PUC are Documents** about the vehicle (kind insurance; PUC a
  certificate), each with the Renew Cycle Documents already have. The car's
  page reads the insurance from its Document (tap opens it, or *Add* when
  there is none), and a paper running out shows in its attention card with
  *Open*, since renewing is a new expiry date on the Document. Demo data: the
  policy and a PUC certificate, no Cycle on the car.
- **A packed thing tapped on Home goes in the wash**, as travel's *Back home*
  does (it came back from the trip worn).
- **The form shows only the chosen category's Fields**: core's
  `Field.showFor` and `fieldShown` (`src/core/domain/fields.ts`), used by the
  form (`src/ui/screens/FormScreen.tsx`). A shirt's form has no Registration,
  Odometer, Service or Warranty; an appliance's has Service by months and
  Warranty; a vehicle's has all of them. The record page already showed only
  Fields with a value.
- Kept as they were: vehicles in Upkeep's Things chip; vendor → Organisation
  (you have no old vendor links); km is the only meter.
- Checks: typecheck clean; 631 tests, 630 green. The one red is in
  deliveries (`coming up, urgent with an OTP…`) and fails on the base
  without these changes, so it is not from this work. The web export builds;
  the clothing form and the Creta page were checked with the demo data.

**Patch notes for the merge**
- A car's insurance and PUC are its Documents now, each with an expiry; the
  car's page shows the insurance from there.
- The Asset form shows only what fits the category: no registration on a
  shirt, no warranty on clothes.
- On Home, a packed thing tapped goes in the wash, as when you're back from
  a trip.
