# R10 automations · hand-over

Branch `claude/r10-automations`, from `m1-design-system` at 0c3a9b3 (v0.0.17).
**No migration**, no version bump, no CHANGELOG edit.

## What was built

- **The model first** (`docs/MODEL.md` layer 3 *Automations*, "As built in
  R10"; layer 6 R10 marked built). `docs/PLUGINS.md` *Automations* now
  describes the code.
- **Steps with data passing** (`src/core/automation/engine.ts`): a rule is a
  trigger, conditions and **steps** in order, each `{ key, action, config }`
  (`s1`, `s2`, …). Each step hands back an output; later steps' text settings
  and conditions read it as `{{steps.s1.title}}` (`resolvePath` knows
  `steps.`). An action may now return a `StepResult` (line, output, undo,
  stop), declare its `outputs`, and offer `undo`; returning a string still
  works.
- **Continue only if** (`core.continueIf`): ends the run quietly when a
  field, op and value don't hold. This stands in for *branch*.
- **Ask Claude** (`core.askModel`): prompt (filled in), longest answer (400
  tokens by default), fallback words. Goes through `os.automation.ask`:
  Claude via `os.automation.modelProvider` (platform sets it at boot to the
  brain's key and model, `src/platform/boot.ts`), the brain's daily budget
  checked first, each send written to *Sent to Claude* with pass
  `automation`. No key, over budget or an error: the fallback, else the step
  fails and the run stops.
- **Manual runs**: the trigger `core.manual` (*Run by hand*, optional
  phrase). From its **Run** button on the board, **Run now** on the rule, and
  a sentence in Talk: `os.automation.findManual("run month close")` matches a
  phrase or name, and OneBox runs it before anything else, answering with a
  toast and Undo (or Open when it failed). No model involved.
- **Every day** (`core.schedule.daily`) now has a time and fires once a day
  after it (a setting per rule), not on every scheduler tick.
- **The run log per step**: each run keeps, per step, the filled settings,
  the output, its line, done · failed · stopped · undone, and what Undo needs;
  what started it (record id and title, vars, or by hand with the sentence).
  `undoRun` undoes last step first where the action can be undone and returns
  what it kept; `retry` runs a rule again on the same record. Last 200 runs
  kept. Runs from before R10 still read (their lines).
- **Undo** on core's Set status, Add tag (not when the tag was already
  there), Add a fact, Create reminder, Create record, Star; finance's Create
  transaction and projects' Create task. Notification and Ask Claude can't be
  undone, and the log says so.
- **Templates** (`ModuleManifest.templates`, `registry.templates`,
  `os.automation.templates()`): Big spend flag and Subscription auto-post
  (finance), Document expiry (documents; its install-time rule now uses the
  template), Contact nudge (crm: a new action *Find who's due a catch-up*
  from the keep-in-touch Cycle, then Continue only if, Ask Claude with a
  fallback, notify; `src/modules/crm/automation.ts`).
- **Existing rules migrated once** (`AutomationRepo.migrateSteps`, setting
  `automation.stepsV1`): every rule, deleted ones too, rewritten in place
  from `[{ id, config }]` to steps; id, name, trigger, conditions, on / off
  and run count kept. `rules.save` still takes the old `actions` shape (the
  `create_automation` AI tool, the demo seed, a module install).
- **The board** (`src/boards/automation`, a first pass from the kit): home
  (Run by hand, Rules with on / off, Templates, Recent runs with skipped ones
  counted, Reminders), a rule (conditions, numbered steps with keys, Run now,
  runs), the editor (When, Only if, Steps with move / remove, the outputs of
  earlier steps listed under each, from a template), and a run (each step's
  status, line, Went in / Came out, Undo this run, Run again). `/automation*`
  routes redirect to the board; `src/ui/screens/RuleEditor.tsx` is gone.
- **Demo data**: a by-hand *Month close* (create a task, Ask Claude with a
  fallback that uses the task's title, notify).
- **Design brief**: `docs/design/AUTOMATIONS-BRIEF.md`, artboards
  `NR-Automations-*`.
- **Tests**: `src/core/automation/automation.test.ts` (13: data passing,
  Continue only if, a failing step and Retry, Ask Claude, fallback, budget,
  manual by sentence, Every day, Undo, the migration, old shape, templates),
  `src/modules/crm/automation.test.ts` (3), `src/modules/finance/automation.test.ts` (3).
- Checks: `npm run typecheck` clean, `npm test` 505 green (486 before),
  `npx expo export --platform web` builds. In the web build with the demo
  data: the home, Run on Month close (toast with Undo), its run log (s1's
  title passed into s2's fallback) and the editor from the Contact nudge
  template were checked.

## Shared core edits (small; each listed for the merge)

- `src/core/registry/types.ts`: `TriggerDef.event` optional; `AutomationContext.steps`;
  `StepResult`; `ActionDef.outputs`, `undo`, `run` may return a `StepResult`;
  `AutomationTemplate`; `ModuleManifest.templates`.
- `src/core/registry/registry.ts`: `templates` map, filled in `register`.
- `src/core/automation/conditions.ts`: `steps.` paths.
- `src/core/automation/engine.ts`: rewritten (steps, runs, manual, daily, undo, retry, ask, migration).
- `src/core/coreModule.ts`: triggers (`core.manual`, daily time), actions
  (outputs, undo, `core.continueIf`, `core.askModel`), `create_automation`'s description.
- `src/platform/boot.ts`: one line setting `os.automation.modelProvider`.
- `src/screens/OneBox.tsx`: the "run …" path before a question or a dump.
- `app/board/[id]/index.tsx`: the Automations special case removed (the board has a home now).
- Module edits outside the new files: finance, projects (actions return
  outputs and undo), documents (template), crm (actions, templates).

## Decisions taken (the simplest where MODEL.md was open)

1. **Steps live in the old `actions` column**, runs in the old `log` column:
   no migration. The column keeps its name.
2. **Every step is an action.** Branch is *Continue only if*; *wait*,
   *link* and *roll a cycle* are not steps yet.
3. **The model step shares the brain's key, model and daily budget**, and
   its log, rather than a budget of its own.
4. **Manual buttons are on the Automations board**, not Today: Today is R8's,
   built in another session. `BoardManifest.buttons` stays unused.
5. **A sentence runs a rule only by "run" or "start" + its phrase or name**,
   exactly (ignoring case, "the" and punctuation); no fuzzy match, no model.
6. **Run now** is offered for by-hand and every-day rules only (the others
   need a record to start from).
7. **Skipped runs** (conditions not met) are still logged, as before, but
   only counted on the home; the log keeps the last 200 runs.
8. **Subscription auto-post** is a template that reacts to Finance's own
   daily posting (tag and notify). Posting itself stays Finance's built-in
   job, so nothing posts twice.

## What you must decide

1. **Today's by-hand buttons**: add a Today tile for them in R8, or keep them
   on the board?
2. **Wait and branch steps**: wanted (wait needs the scheduler to hold a run),
   or is Continue only if enough?
3. **A separate budget for automations**, or keep sharing the brain's?
4. **"run …" in Talk with no match**: today it falls through to a dump or a
   question. Should it say "No automation called …"?

## Phone checks

- Browse › Boards › Automations: the four rules from before are there with
  their run counts; toggle one off and on.
- Run *Month close* (demo, or make one by hand): toast with Undo; Undo
  removes the task. With a Claude key, the notification carries Claude's
  line and You › Agent › Brain › Sent to Claude shows the prompt.
- Type "run month close" in the Dump box: the same toast, no dump filed.
- New automation from *Big spend flag*, save, log a ₹12,000 expense: it is
  tagged #review with a reminder; open the run, Undo this run.
- *Contact nudge* with a keep-in-touch Person overdue, trigger time a few
  minutes ahead: one notification that day, not one per background tick.
- An old link to `/automation` opens the board.

## Patch notes for the merge

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
