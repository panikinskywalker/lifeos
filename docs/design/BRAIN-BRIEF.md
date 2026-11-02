# Brain · design prompt for Claude Design

Paste the prompt below into Claude Design on the LifeOS canvas
(https://claude.ai/artifact/RVT9hLfcQ7tvgXvZN1x6cF), page *v3 Noir*. Source of
truth: `docs/MODEL.md` layer 8 (*The brain*, *The contract*: Nudge, Skill,
the Sent to Claude log, the Morning brief). The brain's first pass is being
built alongside this design (31 Oct, branch `claude/brain-v1`): the first
screens are drawn from the kit and this design replaces them. Name the
artboards `NR-Brain-*` so the build can read them.

---

Design **the brain** for LifeOS, my personal life-OS app for Android (390 × 844, edge to edge, dark). Use the **v3 Noir** page of this canvas for every colour, type style, radius and component: `NR-KitComponents`, `NR-FieldKit`, `NR-KitCharts`, `NR-KitRecords`, the pill and chip pieces from `NR-People-Parts`, and Home's pieces from `NR-Home-Parts`. Don't invent a theme. If a part needs something the kit lacks, draw it as a new kit piece and name it.

**What the brain is.** LifeOS comes to me first. Twice a day (a morning pass from 7, an evening pass from 7 pm) the code looks through my records for what might need me, sends Claude the short list, and Claude judges what matters today, joins things up and words each one so I can act in a glance. What it brings me is a **nudge**. Nudges wait in **To check** and show in a **Morning brief** on top of Today. LifeOS never sends, pays or orders on its own: the last step is always mine (Send in WhatsApp, Call, open Blinkit). What it learns is kept on my phone, and I can see exactly what left it.

**Where it sits.** The bottom bar is Today · Upkeep · Dump (centre) · Browse · You. The Morning brief is the first thing on Today, above the tiles. Nudges are cards in To check (the bell in every header). The brain's settings are You › Agent › Brain. Keep the app's bottom bar.

**The data (design to these, nothing more).**
- **A nudge**: its **kind** (running out · going off · due · coming up), its **module** (Home, Upkeep, People, Turf), the **line** (Claude's words, or LifeOS's own when Claude was not asked: "Paneer: bought Mon, use by tomorrow"), whether it is **urgent**, the record it opens, and its **shape**:
  - **done, undo?**: LifeOS did it on its own ("Amul butter: on the shopping list"). Keep · Undo.
  - **is this right?**: it is guessing ("Milk: bought Thu, probably gone. Still there?"). Right (or the module's word, "It's gone") · Not this.
  - **shall I?**: something outward, ready for me ("Karan's birthday today: turns 30", with the wish drafted). The verb (Send wish · Call · Remind · Open match) · Not this · Later.
  - **Not this** means never this one again, and the module gets fewer nudges if I keep saying it.
- **Limits**: at most two nudges per module a day in To check; at most three phone notifications a day across LifeOS, urgent first.
- **A pass**: morning, evening, or one I ran by hand; when it ran; how many nudges it filed; whether Claude was asked (no key, over budget, nothing new and Claude failed are all normal outcomes: the nudges then come in LifeOS's own words).
- **The Sent to Claude log**: per send, when, why ("morning pass"), the model, how many records, tokens in / out / from cache, ok or failed, and line by line what left ("People · coming up · name=Karan Shah, turns=30, likes=filter coffee/RCB"). Never a phone number, a message, a mail or a photo.
- **What it has learned**: answers by question (gift ideas for Karan from these likes; Karan's wish this year; tonight's dish from what's in the fridge), facts (paneer keeps 4 days), and my Not this's. Each can be forgotten.
- **Skills**: short rules it works by, per module ("Things that go off come before things that run out"). Built in, learned from Claude, or mine. Exported as one Markdown file.
- **The daily budget**: tokens a day, today's use against it.
- **Fills** Claude makes for other boards: Home's **Cook tonight** (a dish and what it uses), People's **gift ideas** (3 to 5) and the **drafted wish**.

**Screens (full scroll for each):**

1. **Today: the Morning brief**
   - On top of Today, above the tiles. A header ("Morning brief"), and when it was written: "7:02 am", or **"Updated 7 pm"** after the evening pass.
   - A few lines (up to six, then Cook tonight), urgent first, each tinted by module, each opening its record or its card. Lines I already answered look quieter.
   - States: the first morning (nothing ran yet: the section is hidden, or a quiet line, you choose and say why); a calm day ("Nothing needs you today"); a busy day (six lines and the dish); the evening update.

2. **To check: the nudge cards** (in Noir; use `V2-ToCheck` only for structure)
   - A group per pass ("Today 7:02 am · From the brain"), above or mixed with filed dumps and SMS (decide).
   - The card in each **shape** (done, undo? · is this right? · shall I?) and each **kind**, with the module and the record it opens. Urgent visibly different.
   - What happens after a tap: the toast ("Got it, not this one again"), the card leaving, and Yes opening WhatsApp or the dialler.

3. **You › Agent › Brain**
   - On / off for the morning and evening passes, their times, and **Run a pass now** with its outcome.
   - **Claude**: the key (saved / missing, paste, Get a key), the model (Haiku 5.5 by default · Sonnet 5.5 · Opus 5.5), and **Opus 5.5 for today** (a stronger model until midnight; the first day the brain runs starts on it). Say which model today's passes use ("Today: Opus 5.5, then back to Haiku 5.5").
   - **Daily budget**: today's tokens against it, the number to change.
   - **Sent to Claude**: the log, each entry expanding to its lines. This is what makes the privacy believable: make it calm and readable, not a debug dump.
   - **What it has learned**: answers, facts, Not this's, each with Forget; **Skills** with where each came from; **Copy as Markdown**.

4. **The fills on other boards**
   - Home's **Cook tonight** card filled: the dish, the things it uses as pills (the ones going off marked), Another idea.
   - People's **gift ideas** filled (ideas, not likes) on the birthday card and the profile, and the **wish** card with Claude's draft in the box, edit before sending.

5. **The notification**: a nudge on the lock screen and in the shade (module, line), and the urgent one.

**Shared parts** (design each once):
- **The nudge card** in three shapes, with a kind mark and the module tint.
- **The brief line**: tint dot, text, chevron; answered and urgent states.
- **The pass stamp**: "7:02 am" · "Updated 7 pm" · "Ran by hand 3:14 pm".
- **The sent entry** (collapsed and open) and **the learned row** with Forget.
- **The source mark** that says a line is Claude's words vs LifeOS's own.

**Realistic content, not lorem ipsum.**
- Home: "Spinach: use it today, it turns tomorrow" (urgent) · "Paneer and cream go well tonight: palak paneer?" · "Amul butter: on the shopping list (every 3 wk · 18 d)" · "Milk: bought Thu, probably gone. Still there?".
- Upkeep: "Water filter: 12 days late" · "Car insurance renews in 6 days".
- People: "Karan's birthday today: turns 30" (wish drafted: "Happy 30th, Karan! Here's to more Sunday filter coffees and an RCB season that finally ends well.") · "Dad: 10 days since you spoke" · gift ideas for Priya: "A Hario V60", "Blue Tokai sampler", "Pottery class at Clay Station".
- Turf: "Tomorrow at Playground Arena: 7 in of 12, 5 short" (urgent) · "Arjun owes ₹250 for 1 game since 17 Oct".
- Sent to Claude: "Sat 31 Oct, 7:02 am · morning pass · claude-opus-5-5 · 1.2k in · 640 out · 3.1k from cache · 7 records". Budget 40k tokens a day, 4.9k used.

**Deliverables:**
- Every screen above at 390 wide, full scroll, as `NR-Brain-Brief` (Today's section in all its states), `NR-Brain-ToCheck`, `NR-Brain-Agent`, `NR-Brain-Fills` (Cook tonight, gift ideas, the wish), `NR-Brain-Notify`.
- New kit pieces in a `NR-Brain-Parts` artboard.
- States: no Claude key (nudges still come, in LifeOS's words: show how that reads), over budget, a failed send, an empty log, a lot learned (50+ rows).
- **No backdrop blur**: draw sheets as the semi-opaque version that ships.
- Dark only: the light theme is undecided.
- Notes on every decision this prompt didn't cover.

---

## Addendum, 2 Nov: slices 4 and 6 (branch `claude/brain-more`)

Paste after the prompt above, or on its own once the first artboards exist.
Source: `docs/MODEL.md` layer 8, *Slices 4 and 6*.

**More modules bring nudges.** Money, Documents, Projects and Assets now
bring their own (and their Cycles stop coming as Upkeep's). The nudge card
and the brief line stay as drawn; add these to the realistic content and
draw one card of each in `NR-Brain-ToCheck`:
- Money: "Netflix: ₹649 renews Thu" (is this right?, Keep it) · "Electricity: ₹2,140 due tomorrow" (shall I?, Paid; urgent on the day) · "HDFC FD: matures on 14 Nov" · "Swiggy: ₹1,800 today, about 4x your usual Food & Drink" (is this right?, Right).
- Documents: "Passport: expires 12 Mar, in 4 months" (shall I?, Renewed opens it) · "4 new files in your folders: Lease 2026, Payslip Oct, Scan 0042 and 1 more" (Look).
- Projects: "Send the lease: 3 days late" (Done) · "Dinner at Bombay Canteen: tomorrow 8 pm, Lower Parel" (Open).
- Assets: "MacBook Air: warranty ends in 20 days, on 22 Nov" (Right) · "Hyundai Creta: service 200 km overdue" (Serviced, urgent).

**Cook tonight, two states more** (`NR-Brain-Fills`): no dish yet, with
**Ask now** (a pass runs at once; "Asking…" while it does), and the filled
card's **Another idea** in its asking state. Say where a dish came from when
it came from the fridge photo, or decide it needn't.

**Snap the fridge** is drawn in the Home brief (`NR-Home-Snap`, screen 5).
What it needs from this one: the Sent to Claude entry for a photo, which
reads "Mon 2 Nov, 6:40 pm · you pressed Snap the fridge · claude-haiku-5-5 ·
1.9k in · 120 out", lines "Home · a photo of the fridge: read once, not kept"
and "Home · in_the_fridge=Amul butter/Malai paneer/Milk/Eggs, use_soon=Malai
paneer". Mark it as a photo entry (not a pass) and keep it as calm as the rest.
The build (a first pass from the kit) adds to screen 5 what `NR-Home-Snap`
should also show: the reading state (the photo small, "Claude is looking…"),
tap = accept and hold = fix on each pill with its result under it ("used up",
"still there", "added", "not there"), the photo's dish as a Cook tonight card,
Take another, and a failed state ("Nothing changed": no key, over budget,
Claude didn't answer, the photo too big).

**Deliverables**: the new cards in `NR-Brain-ToCheck`, the two Cook tonight
states in `NR-Brain-Fills`, the photo entry in `NR-Brain-Agent`.
