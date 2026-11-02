# R6 health: hand-over

Branch `claude/r6-health`, from `m1-design-system` at 0c3a9b3 (LifeOS v0.0.17).
No version bump, no CHANGELOG edit, **no migration**, no native change (no new dev
build needed). `npm run typecheck`, `npm test` (498 tests, 12 new) and
`npx expo export --platform web` are green.

## What was built

- **Fields first** (`docs/MODEL.md` layer 2, *Body*, and R6 in layer 6). Keys unchanged.
  - **Measurement**: Metric, Value, Unit (filled from the metric when empty), Date (sleep counts
    for the day you woke), new **Asleep / Awake** (`startAt`, `endAt`) for sleep, Notes; source
    and source key hidden. Health Connect files one per metric per day; yours can be several a
    day, and a day's value is its latest.
  - **Workout**: Type, **Duration** (now the `duration` Field type; still minutes, so old values
    stay), Date, new **Started** (`startAt`), Distance (km), Calories, Intensity, Notes.
- **The sources are declared by `health`** (`src/modules/health/sources.ts`), the way R4 moved
  the calendar: `health` (Health Connect) and `usage` (Usage access) read the phone through a new
  `os.device.health` and `os.device.usage` (`access()`, `read(from, to)`); platform keeps the
  native calls and hands them over in `deviceBridge`. Core runs them (`runSource`) like the
  others, with the same ids, so the Data sources rows keep their state and counts. A first sync
  reads 90 days (Health Connect) or 30 (screen time), then from the day before the last sync.
  `syncHealth` / `syncUsage` are gone from `src/platform/sources.ts`.
- **Health Connect's filing moved to the module** (`src/modules/health/healthConnect.ts`,
  `saveHealthDays`), unchanged except that it now keeps sleep's asleep / awake and a workout's
  start, which the device module already read.
- **Comparisons** (`compareMetric` in `src/core/dashboard/metrics.ts`): this week vs last, and vs
  your usual (the median of the 8 weeks before with data, from two weeks). Shown by a shared
  `MetricCompareCard` (`src/ui/components/MetricCompare.tsx`) on every metric's page and on the
  **Metric screen** (`app/metric/[id].tsx`).
- **AI tools**: `health_today`, `metric_compare`, `workouts`, `log_measurement`.
- **Brain** (layer 8): one candidate, a *due* weigh-in (shape *ask*, Yes = Log weight, which opens
  the Measurement form with weight picked). What leaves: days since and your usual gap, never the
  weight. A skill line keeps the brain from judging numbers.
- **Board** (a first pass from the kit, v3 Noir): the **Health home** (a card per metric with the
  change vs last week and a week of bars; workouts) and **one page per metric** at
  `/module/health/steps · sleep · heart · weight · screen`: the headline, the comparisons card,
  the last 30 days, then what only that metric has (best day and walks; nights with asleep to
  awake; resting and average heart rate by day; weight readings with Log weight; pickups, first
  and last use, apps this week). Each page opens the full Metric screen. Quick actions: Workout,
  Weight, Measurement. The overview line on Today adds "x% above / below your usual week".
  `src/screens/HealthHome.tsx` is gone; the module route draws the board's home.
- **Demo data** (You › Load demo data) gains five weeks of steps, sleep, heart rate and three
  weeks of screen time, so the pages can be seen on the web. Checked in the web export.
- **Tests** (`src/modules/health/health.test.ts`, 12): both sources through the bridge (first and
  later windows, re-sync files nothing, no access no read, only new days counted), the
  comparisons (per-day averages, the median usual, weight, a day's latest reading), the tools,
  and the weigh-in candidate (and when it stays quiet).
- `docs/design/HEALTH-BRIEF.md` asks for the `NR-Health-*` artboards.

## Decisions made (not covered by the model; the simplest picked)

1. **Screen time is not a Measurement.** Layer 2 said it was, "with per-app breakdown in data".
   It stays in core's `usage_daily` / `usage_app_daily`: the per-app list has no Field type
   (`json` is retired), and Activity, Time and Today already read those tables. Layer 2 now says
   so. Say if you want it moved to records; that is a fold and touches core's Activity and Time.
2. **A week is the last 7 days**, as the Metric screen already counted it, not Monday to Sunday.
3. **A week's value is its average per day with data** (steps a day, hours a night), so a day the
   watch was off is not a zero; weight's is its latest reading.
4. **Your usual** is the median of the 8 weeks before this one that have data (last week
   included), and needs two of them.
5. **Several readings on a day**: the latest counts (a small change to core's `metricDays`
   sort).
6. **Heart rate is one page** with resting and the day's average.
7. **Today's tiles still open the Metric screen** (layer 5: every tile opens one); Health's cards
   open the metric's page, which links to the Metric screen.
8. **The brain**: only a weigh-in fits the four nudge kinds (*due*); readings that come on their
   own need nothing from you, so they offer nothing.
9. **Not built**: custom metrics with their own name (*other* stays unnamed); a sentence-parser
   rule for "weighed 72" (the model files it through the Object's schema or `log_measurement`).

## What needs the phone

- **Health Connect**: open the app; the next sync runs Health's own source. Data sources keeps
  the row's last sync and count. The Health page shows a card per metric; tap one for its page.
- **Sleep times**: only nights synced from now on get asleep and awake (the sync re-reads from
  the day before the last sync), so the Nights list shows times for the newest nights first.
- **Screen time**: still on in Data sources; the Screen time page lists this week's apps,
  pickups, first and last use.
- **Comparisons**: after two weeks of data, *Your usual* fills; the Steps tile on Today opens the
  Metric screen, which now has the comparisons card under the chart.
- **Log weight**: + on the Weight page or the quick action opens the form with weight picked.
- **The weigh-in nudge**: after three weights by hand and twice your usual gap, the morning pass
  files it in To check; Log weight opens the form.

## Patch notes for the merge

- **New: Health, rebuilt (R6).** A card per metric (steps, sleep, heart rate, weight, screen
  time), each opening its own page.
- **New: this week vs last, and vs your usual**, on every metric's page and on the full chart.
- **Sleep shows when you fell asleep and woke**; workouts keep when they started.
- **Log a weight** in one tap from the Weight page or the + menu.
- **A gentle weigh-in reminder** if you weigh yourself by hand and it has been a while.
- **Ask Claude**: today's body numbers, how a metric compares, your workouts; log a reading.
- **Health Connect and screen time are Health's own sources** now; nothing changes in how they
  sync.
- *For whoever merges*: shared files touched, each a small edit:
  `src/core/registry/context.ts` (`HealthDay`, `UsageDay`, `DeviceBridge.health` and `.usage`),
  `src/core/sources/deviceData.ts` (the Health Connect section moved out; `metricDays` sorts a
  day's readings oldest first so the latest wins), `src/core/dashboard/metrics.ts` (adds
  `compareMetric`, nothing else changed), `src/ui/components/MetricCompare.tsx` (new),
  `app/metric/[id].tsx` (the comparisons card), `app/module/[id]/index.tsx` (Health's home from
  its board), `src/platform/sources.ts` (the bridge gains health and usage; usage and health run
  through the registry), `src/platform/seed.ts` (demo Body), `docs/PLUGINS.md` (Sources),
  `docs/MODEL.md` (layer 2 *Body*, R6, and R1's deferred line). `src/screens/HealthHome.tsx` is
  gone. Six tests (`src/core/sources/deviceData.test.ts`, `src/modules/activity.golden.test.ts`,
  `almanac.golden.test.ts`, `notify.golden.test.ts`, `overviews.golden.test.ts`,
  `today.metrics.test.ts`) and `scripts/bench-today.ts` import `saveHealthDays` from its new home;
  no assertion changed.
