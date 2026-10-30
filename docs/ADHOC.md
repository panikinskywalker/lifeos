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

### Standalone app + over-the-air updates — 27 Sep
Preview build (no Mac / Metro / Wi-Fi dance), updates arrive by themselves on next open; install over the current app (same signing key, data kept). Carries the app lock (built, needs a build) and anything native from this list.

## Offered, waiting on a decision

- **Notion connector** (28 Sep): internal-integration token pasted once; you share pages / databases with it. Could bring pages in as searchable notes linked to people / projects, a task database as tasks, a journal onto the Time view. *24 Oct: the People CRM part is pushed as R2b (MODEL layer 4, *Notion*); notes, tasks and the journal stay open.*
- **Other token connectors:** GitHub (commits → an Activity tracker "days coded"), Todoist / Linear (tasks), Splitwise (shared expenses). Strava / Spotify need a sign-in flow like Google.
- **Missing-keys warning** (27 Sep): "Your AI keys are missing — add them in You › Agent" instead of dumps quietly waiting.
- **Database encryption** (SQLCipher, key in secure storage) — needs a build.
- **Automatic encrypted backups** to a folder you pick (e.g. Drive).
- **"Replace everything" restore** (restore today only adds / updates).
- **Cloud sync** (backlog) — also enables a web / iPhone client.
- **Activity goals:** "at least 4 days a week" / "at most 2", weeks met / missed, streak of weeks.

## Still to check on the phone

- Gmail accounts (first real run), app lock (after the build), Today cold-start time on the S22.
- Tick M4.2b contacts / calendar / call log once checked on the device.
- Emails in unknown formats are skipped for now (the nightly loop above would pick them up).
