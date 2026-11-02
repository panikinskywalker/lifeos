# Automations · design prompt for Claude Design

Paste the prompt below into Claude Design on the LifeOS canvas
(https://claude.ai/artifact/RVT9hLfcQ7tvgXvZN1x6cF), page *v3 Noir*. Source of
truth: `docs/MODEL.md` layer 3 (*Automations*, as built in R10, 2 Nov) and R10.
Automations was built alongside this design (2 Nov): the first screens are
drawn from the kit and this design replaces them. Name the artboards
`NR-Automations-*` so the build can read them.

---

Design **Automations** for LifeOS, my personal life-OS app for Android (390 × 844, edge to edge, dark). Use the **v3 Noir** page of this canvas for every colour, type style, radius and component: `NR-KitComponents`, `NR-FieldKit`, `NR-KitCharts`, `NR-KitRecords`, and the chips from `NR-People-Parts`. Don't invent a theme. If a part needs something the kit lacks, draw it as a new kit piece and name it. Automations uses the Tasks disc (lilac).

**What Automations is.** A board connects modules for *seeing*; an automation connects them for *doing*. Think Apple Shortcuts, small and personal: *when* something happens (a payment comes in, a document is added, every morning, or I start it by hand), *if* it holds, do a few **steps in order**, each able to use what the steps before it made. One step can **ask Claude** (a prompt I wrote, filled in from the record; it counts against the brain's daily budget and shows in the *Sent to Claude* log). Every run is kept step by step, and a run can be **undone** where its steps allow. The design has to make three things legible at a glance: what starts it, what it does in what order, and what happened last time.

**Where it sits.** The bottom bar is Today · Upkeep · Dump (centre) · Browse · You. Automations opens from Browse › Boards. Keep the app's bottom bar. A manual automation can also be started by typing "run month close" in the Dump / Talk box: it answers with a toast and Undo, no chat.

**The data (design to these, nothing more).**
- **Automation**: name, on / off, **trigger** (Record created · Record updated · Status changed · Record deleted · Tag applied · Reminder due · Transaction added · Task completed · **Every day** after a time · **Run by hand** with a phrase), **conditions** (field · is / more than / contains / is empty … · value; all must hold), **steps**, how many times it ran, when last.
- **Step**: one action, its settings, and a key (`s1`, `s2`…). Actions: Add tag · Set status · Add a fact · Create reminder · Send notification · Create record · Star · Create task · Create transaction · Find who's due a catch-up · **Continue only if** (ends the run quietly) · **Ask Claude** (prompt, longest answer, fallback words). A text setting can carry `{{title}}`, `{{data.amount}}` (the record that started it) and `{{steps.s1.title}}` (an earlier step's output). Each action says what it hands on (id, title, text, count, names…).
- **Run**: when, what started it (a record, a sentence, its button), status (done · failed · skipped · undone), and per step: what went in (the filled settings), what came out, its line ("Tagged #review", "Reminder: Review Croma (₹42,000)", Claude's answer), and done · failed · stopped here · undone; whether it can be undone. The last 200 runs are kept.
- **Templates**: Big spend flag · Subscription auto-post · Document expiry · Contact nudge (with Claude). Picking one opens the editor filled in.

**Screens (full scroll for each):**

1. **Automations (home)**
   - Header: "Automations", "5 rules · 4 on", a + to add.
   - **Run by hand**: a big button per manual automation ("Month close · 3 steps" · Run), and the hint that "run …" works in Talk.
   - **Rules**: a row per automation: name, trigger in words ("Transaction added · 2 steps"), ran 12×, an on / off toggle. Off ones look off.
   - **Templates**: the four, each with one line of what it does.
   - **Recent runs**: rule, what it did in a line, done / failed / undone, time; "31 skipped" counted, not listed.
   - A way to Reminders.

2. **An automation** (draw Big spend flag and Contact nudge)
   - The trigger as a sentence and the conditions as chips ("kind is expense", "amount more than ₹10,000").
   - The steps as a **numbered chain**, each with its key and a summary of its settings; show the data passing between them (Contact nudge: s1 finds Kunal → s2 continues only if count > 0 → s3 asks Claude with s1's name → s4 notifies with s3's text). Mark the Claude step distinctly.
   - On / off, **Run now** (by-hand and every-day ones), Edit.
   - Its runs.

3. **Edit / new** (the editor)
   - Name. **When**: the trigger picker and its settings (record type, time, phrase). **Only if**: condition rows (field · is · value), add / remove. **Steps**: cards in order, move up / down, remove, the action's settings as fields, and under each step the **outputs it can use** from earlier steps as tappable tokens (`{{steps.s1.first}}`). **Add a step** as a grouped list (Records · Money · Tasks · People · Claude · Flow).
   - Draw it filled from the Contact nudge template, and a new empty one.
   - The Ask Claude step's card: the prompt (with the tokens visible inside it), longest answer, fallback words, and a line saying only this prompt leaves the phone and it counts against today's budget (e.g. "1,240 of 40,000 tokens used today").

4. **A run** (the step log)
   - What started it (the record, or "Run by hand: “run month close”"), when, status.
   - Each step as a card: status chip, its line, **Went in** and **Came out** as key / value rows. A failed step in alert with the reason ("Claude not asked: no Claude key"); steps after it greyed as not run; a "stopped here" step for Continue only if.
   - **Undo this run** (3 steps), with what stays as it is ("Send notification can't be undone"); **Run again** for a failed one.

5. **Run from Talk**: the Dump box with "run month close" typed, then the toast: "Month close: 3 steps done · Undo"; and the failed version with Open.

6. **Today and Browse**: the Automations board tile in Browse › Boards, and (for R8 to place) a small Today tile with the by-hand buttons.

**Shared parts** (design each once):
- **The step card** in the editor and the step row in the chain, with its key badge (`s1`).
- **The output token** (`{{steps.s1.title}}`) as a pill, inside a text field and on its own.
- **The trigger sentence** and **condition chip**.
- **The run row** and its **status chip** (done · failed · skipped · undone · stopped here).
- **The Claude mark** for the model step, the same one the brain's Sent to Claude log uses.
- **A toast** with Undo after a run, and with Open after a failed one.

**Realistic content, not lorem ipsum.**
- Big spend flag: Transaction added · kind is expense · amount more than ₹10,000 → s1 Add tag "review" → s2 Create reminder "Review: Croma (₹42,000)" tomorrow. Ran 12×; last run on Croma ₹42,000, 2 Nov 6:40 pm.
- Subscription auto-post: Transaction added · note is "Auto-posted subscription" → tag #subscription → notify "Netflix renewed · ₹649 posted for 1 Nov".
- Document expiry: Record created · Document · expires on is not empty → reminder "Renew Passport" 30 days before 14 Mar 2027.
- Contact nudge: Every day after 10:00 → s1 Find who's due a catch-up (Kunal Mehta, 20 days) → s2 Continue only if s1.count more than 0 → s3 Ask Claude "Write one short, warm opening line for a WhatsApp message to Kunal…" → "Kunal! Long time, still on for chai this week?" → s4 notify "Catch up with Kunal".
- Month close (by hand, "run month close"): Create task "Pay credit card bill" · Ask Claude "Summarise …" · Send notification.
- A failed run: Contact nudge at 10:02, "Claude not asked: over today's budget", no fallback.
- Amounts in ₹ with Indian grouping.

**Deliverables:**
- Every screen above at 390 wide, full scroll, as `NR-Automations-Home`, `NR-Automations-Rule` (Big spend flag and Contact nudge), `NR-Automations-Edit` (from a template and new), `NR-Automations-Run` (done, failed, undone), `NR-Automations-Talk`, `NR-Automations-Tile`.
- New kit pieces in a `NR-Automations-Parts` artboard.
- States: no automations yet (templates lead), loading, a rule that's off, a run that was skipped, 30+ rules, a step whose action no longer exists (a module removed), a long rule name and a long Claude answer.
- **No backdrop blur**: draw sheets as the semi-opaque version that ships.
- Dark only: the light theme is undecided.
- Notes on every decision this prompt didn't cover.
