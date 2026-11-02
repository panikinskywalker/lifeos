# Ad-hoc list — discussed, not built yet

Things we've talked about and parked. Nothing here gets built until we go
through the list together and pick what to push at once (one build where a
build is needed). Newest discussion first within each group. Keep this file
current: add as we talk, move items out when they ship.

## Agreed in principle

### Nightly leftovers loop (via Gmail) — 28 Sep
What the app couldn't handle goes through a nightly Claude run and comes back filed.
- **Leftovers list in the app:** dumps not (fully) filed, texts / notifications / emails set aside as "didn't understand", anything marked "redo this".
- **~11 pm, phone:** emails the day's leftovers to yourself (same Gmail app password, over SMTP), plus context (people, places, categories, trackers). Locked with a passphrase only the app and the Mac job know.
- **~2 am, Mac:** a scheduled Claude session (Claude desktop scheduled task; Mac must be awake) reads that email, decides what to file, and emails back a results file: the same actions the app's own filing uses (create person, log spend, record event, tick habit, "nothing to file"…), each tied to its leftover, plus a short note of what it did.
- **Morning, phone:** Gmail sync picks up the results mail and runs each action through normal filing — deduped, linked, in To check as "From your review" with Undo; leftovers marked done; running the same file twice changes nothing. The morning brief says what came in.
- Needs: a build (sending mail is native). Manual fallback: export / import the same files by hand.

### Import file — 28 Sep
A friendly "LifeOS import" file (records + links, not raw backup rows) that goes through normal filing, opened via Share → LifeOS or the file picker. The results file above is a superset; build them together.

## Offered, waiting on a decision

- **Notion connector** (28 Sep): internal-integration token pasted once; you share pages / databases with it. Could bring pages in as searchable notes linked to people / projects, a task database as tasks, a journal onto the Time view. *24 Oct: the People CRM part is pushed as R2b (MODEL layer 4, *Notion*); notes, tasks and the journal stay open.*
- **Other token connectors:** GitHub (commits → an Activity tracker "days coded"), Todoist / Linear (tasks), Splitwise (shared expenses). Strava / Spotify need a sign-in flow like Google.
- **Missing-keys warning** (27 Sep): "Your AI keys are missing — add them in You › Agent" instead of dumps quietly waiting.
- **Automatic encrypted backups** to a folder you pick (e.g. Drive).
- **"Replace everything" restore** (restore today only adds / updates).
- **Cloud sync** (backlog) — also enables a web / iPhone client.
- **Activity goals:** "at least 4 days a week" / "at most 2", weeks met / missed, streak of weeks.

## Parked by the 2 Nov milestones (from their hand-overs)

Not built; each hand-over in `docs/handover/` has the detail.
- **Dumps deleted, not only cleared** (R15): after 15 days a dump leaves the
  Dump list and search but its row stays. Deleting rows needs a migration
  replacing the `dumps_never_deleted` trigger, and would empty On this day's
  dumps and "Dumps that mention it".
- **The Talk tools renamed to the vocabulary** (R12, carried from R0):
  `create_entity`, `connections`… with the golden fixtures re-recorded.
- **One retry on the Mac** before the cloud (R12): saves cloud tokens, doubles
  the wait on a bad reply.
- **Automations** (R10): a *wait* step (the scheduler holds a run), real
  branches beyond Continue only if, a budget of their own, by-hand buttons as
  a Today tile, and "No automation called …" when "run …" matches nothing.
- **Links** (R11): guessed Links with Right / Not this on the Links card; tap a
  day on an Activity grid to see what made it count; a search on Browse ›
  Links.
- **Health** (R6): custom metrics with their own name; a sentence rule for
  "weighed 72"; screen time as Measurement records (today it stays in core's
  usage tables).
- **Deliveries** (R7b): Swiggy and Zomato food orders; finance's notifications
  source naming deliveries in its `modules` list.
- **Travel** (R7d): the airlines' web check-in deep links (once checked on the
  phone); payments made in the trip's city linked on their own.
- **Second Brain** (R7f): `[[` suggestions while typing; notes re-linked when a
  record with a mentioned name is made later; Notion's facts editable here or
  only in Notion.
- **The brain** (slices 4 and 6): a category's month over its target as a
  nudge; a floor for renewal heads-ups (say ₹500); calendar Events with
  attendees or a place counting as "needs you".

## Still to check on the phone

- Everything merged on 2 Nov (v0.0.18 to v0.0.27): the list is in
  `docs/handover/merge-r5-r15.md`.
- Gmail accounts (first real run), app lock (after the build), Today cold-start time on the S22.
- Tick M4.2b contacts / calendar / call log once checked on the device.
- Emails in unknown formats are skipped for now (the nightly loop above would pick them up).
