# R4 projects: hand-over

Branch `claude/r4-projects`, from `m1-design-system` at 617c509 (LifeOS v0.0.11).
No version bump, no CHANGELOG edit, no migration. `npm run typecheck`, `npm test`
(427 tests) and `npx expo export --platform web` are green.

## What was built

- **Fields first** (`docs/MODEL.md` layer 2, *Agenda*, and R4 in layer 6): Event's, Task's
  and Project's Fields, keys unchanged. The module name `projects` stands (layer 3 and R4 say
  so, and the code); *Agenda* is only the group's name in layer 2.
- **Task**: a due date is the task's **Due Cycle** (a one-off Cycle, `fixed`), so an open task
  with a due date is in Upkeep. New **Repeats** Field (every day, week, 2 weeks, month, 3 months,
  year) makes the Cycle repeat: ticking marks it done (a *cycle done* Event on the task) and
  moves Due on; the task stays open. Done in Upkeep finishes a one-off task. Taking the due date
  off leaves the Cycle undated (out of Upkeep). A done task's Cycle leaves Upkeep.
- **Project**: Description is labelled Aim; progress, overdue, next task, its Events and spend
  (expenses linked to it, read through Links) are derived.
- **Event**: gains a Project link. Its other Fields are as they were.
- **The fold** (once, setting `projects.foldedR4`): open tasks with a due date get their Due
  Cycle; the core templates backfill already ran on the phone, so it would not add them.
- **The calendar source is declared by projects** (`src/modules/projects/sources.ts`), reading
  the phone through a new `os.device.calendar` (`access()`, `read(from, to)`) like crm's contacts
  and call log. The calendar code (`calendarKey`, the dedupe, `saveCalendarEvents`) moved from
  `src/core/sources/phone.ts` (removed) to `src/modules/projects/calendar.ts` unchanged. Platform
  hands expo-calendar over as `calendarBridge` and runs the source with contacts and the call log.
- **AI tools**: `agenda_today`, `tasks_overdue`, `project_status` (by name or id);
  `tasks_overview` kept (tool names stay until R12).
- **Tests** (`src/modules/projects/projects.test.ts`, 7): Due and Repeats as Cycles, Undo, done in
  Upkeep, the fold, the agenda, overdue and a project's status, and the calendar source through
  the bridge, including that its Events still link *at* their Place (R3) and move *last spoke*
  (R2), and that a re-sync files nothing new.
- **Board** (a first pass from the kit, v3 Noir): the Projects home (Today, Overdue, Projects
  with progress, Coming up), and the Task, Project and Event pages drawn whole. Checked rendering
  in the web export on demo data. `docs/design/PROJECTS-BRIEF.md` asks for the `NR-Projects-*`
  artboards.

## What you must decide

1. **Goal.** MODEL.md's *Retired* table drops `goal` (activity goals parked in ADHOC), and R4's
   line names Goal. I did not pick: the Goal Object and its records are untouched, off the
   Projects home and out of the brief. Drop it (fold each goal into a Project: target date, why
   it matters as the Aim, the numbers as a Fact) or keep it (and take it out of *Retired*).
2. **Tasks in Upkeep.** Since due dates are Cycles, every open task with a due date is now in
   Upkeep and in its notifications (*Due · Pay rent*). That is what "due dates as Cycles" means;
   say if Upkeep should keep tasks out.
3. **Event in core or in projects.** Layers 1 and 3 call Event a core Object. The code has two:
   core's timeline (`LifeEvent`, the `events` table) and the Event Object that `projects`
   declares. Written down in layer 2; joining them is not R4.
4. **People on an Event, two link words.** The calendar links attendees *with*; the form's
   People Field links *person*. Both move last spoke and both show on the Event page. One word?
5. **The brain's *coming up*.** There is no candidates contract on this branch (inventory has
   plain functions of its own), so no Events candidates function was written. When the brain's
   contract lands, *coming up* from Events is `eventsOn(os, now, days)` in `projects/lib.ts`,
   filtered to the kinds that need something from you (a flight, guests, a match).

## What needs the phone

- **The calendar**: allow Calendar in You › Data sources; the next sync files Events (a month
  back, two ahead), shows the count and last sync on the Calendar row, and the Projects home
  shows today's. Check: one Event for a meeting that is in several accounts, attendees who are in
  People linked and their last spoke moved, a location with an address linked *at* a Place (and
  the new Place in To check), a meeting link left as text.
- **The fold** on first open: tasks with a due date appear in Upkeep; ticking one there finishes
  it on the Projects home.
- **A repeating task**: tick it on its page; the toast says when it is next due; Undo puts the
  date back.
- **Notifications**: tasks due now get Upkeep's nudges.

## Patch notes for the merge

- **New: Projects, rebuilt (R4).** The Projects home shows today's events and tasks, what's
  overdue, your projects with their progress and what's coming up. Tasks, projects and events
  have their own pages.
- **New: repeating tasks.** A task can repeat (every day to every year); ticking it moves its due
  date on.
- **Tasks are in Upkeep.** A task with a due date is a Cycle, due and overdue like the rest.
- **Events can belong to a project.**
- **The calendar is Projects' own source** now; nothing changes in how it syncs.
- **Ask Claude**: today's agenda, what's overdue, and how a project is going.
- *For whoever merges*: shared files touched, each a small edit: `src/core/registry/context.ts`
  (`CalendarEvent`, `DeviceBridge.calendar`), `src/core/dashboard/day.ts` (one line: a record
  already in My day is not listed again for its Cycle; the brain session works on Today, so look
  here first on a conflict), `src/platform/phoneSources.ts` and `src/platform/sources.ts`,
  `docs/MODEL.md` (layer 2 *Agenda*, R4), `docs/PLUGINS.md` (Sources). `src/core/sources/phone.ts`
  is gone. Two tests (`src/modules/phone.golden.test.ts`, `src/modules/places/places.test.ts`)
  import `saveCalendarEvents` from its new home; no assertion changed.
