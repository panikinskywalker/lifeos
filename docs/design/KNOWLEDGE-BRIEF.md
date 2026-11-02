# Second Brain · design prompt for Claude Design

Paste the prompt below into Claude Design on the LifeOS canvas
(https://claude.ai/artifact/RVT9hLfcQ7tvgXvZN1x6cF), page *v3 Noir*. Source of
truth: `docs/MODEL.md` layer 2 (*Mind*, *The Second Brain*: Note, Fact, the
names Talk learned) and R7f. The Second Brain is built alongside this design
(2 Nov): the first screens are drawn from the kit and this design replaces
them. Name the artboards `NR-Knowledge-*` so the build can read them.

---

Design the **Second Brain** for LifeOS, my personal life-OS app for Android (390 × 844, edge to edge, dark). Use the **v3 Noir** page of this canvas for every colour, type style, radius and component: `NR-KitComponents`, `NR-FieldKit`, `NR-KitCharts`, `NR-KitRecords`, and the chip and pill pieces from `NR-People-Parts`. Don't invent a theme. If a part needs something the kit lacks, draw it as a new kit piece and name it.

**What the Second Brain is.** Everything I've written or told LifeOS that isn't a number or a date: my **notes** (ideas, a journal, meeting notes, recipes, books) and the **facts**, one line each, that I say in passing ("Dad hates surprises", "Suresh fixes the AC, call him in March"). Talk and the Dump box keep facts on their own as I talk; I can add them by hand too. Notes link to the people, places and things they mention by writing `[[Name]]`, so a note about dinner with Karan shows up on Karan's page. It replaces the old *Memory* screen: nothing Talk knew is lost, it just lives here now.

**Where it sits.** The bottom bar is Today · Upkeep · Dump (centre) · Browse · You. The Second Brain opens from Browse › Boards, and Browse's *Facts* row opens it on its Facts half. Keep the app's bottom bar. It has no tab bar of its own: Notes and Facts are one segmented switch.

**The data (design to these, nothing more).**
- **Note**: title (mine, or the body's first line until I name it), body (plain text with light markdown: `#` headings, `-` bullets, `[[mentions]]`), kind (idea · journal · meeting · reference · recipe · book / article), source (a URL or a book), project, people, **pinned** (the star), written and edited dates.
- **Mention**: `[[Name]]` in a body. When a record has that name it's a link (tap opens it); when none does it's **not linked yet**: faded, and a tap searches for it so I can make it.
- **Fact**: one line, what it's **about** (a record; a name that isn't a record yet, like "Suresh"; or me, *About you*), when it was said, where from (Talk · a dump · Notion · added by me · a correction).
- **What you call things**: names Talk learned ("the landlord" means Mr. Rao), each with how often I've used it.

**Screens (full scroll for each):**

1. **Second Brain** (home)
   - Header: "Second Brain", "12 notes · 48 facts", a + (new note on Notes, remember something on Facts).
   - **Search** across notes and facts together; results in two groups.
   - **Notes · Facts** switch.
   - **Notes**: kind filters (only kinds I've used), **Pinned**, then **Latest**. Each row: kind icon, title, a line of the body, pinned mark.
   - **Facts**: grouped by what they're about, *About you* first, then the biggest groups; each group opens its record. Then **What you call things**.

2. **A note** (draw a meeting note and a recipe)
   - Title, kind chip, pinned, edited date, word count.
   - The body, read comfortably: headings, bullets, mentions as links in the module tint; **not linked yet** mentions faded, with a small "Not linked yet" row of chips under the body.
   - Below, the record page's usual cards (Links, Facts, tags, timeline), but keep the body the hero.
   - Actions: pin, edit, more (link, tags, attach, delete).

3. **Write a note** (the form)
   - Title (placeholder: "The first line, unless you name it"), kind as pills, the body as a big writing area.
   - **Mention**: a button that opens the record picker and writes `[[its title]]` where the cursor is. Show how typing `[[` could suggest names inline (design it; the first build has only the button).
   - Source, project, people below, quieter.

4. **Facts about a record** (the Facts card on a Person page, e.g. Dad)
   - The lines, who said them and when; add one inline; long-press to forget.
   - *Mentioned in*: the notes that `[[mention]]` this record.

5. **A fact's menu**: Open what it's about · About a record… (move a fact about "Suresh" onto a Person once I make one) · Forget (with Undo).

6. **Remember something** (sheet): the line, and "About a person or thing".

7. **Talk answering from it**: the reply card for "what do I know about Karan?" (his facts, the notes that mention him, what I call him) and for "write a note: …" (the note made, which mentions linked, which names it couldn't find).

**Shared parts** (design each once):
- **The mention** in running text: linked and not linked yet.
- **The fact row**: dot, line, about · when · from where, menu.
- **The note row** with its kind icon and pinned mark.
- **The kind icon set**: idea, journal, meeting, reference, recipe, book.
- **The learned-name row**: "the landlord" → Mr. Rao, uses.
- **A toast** with Undo after Forget and after moving a fact.

**Realistic content, not lorem ipsum.**
- Notes: "Japan itinerary ideas" (idea: Tokyo 5 nights → Hakone 1 → Kyoto 4 → Osaka 3; "Ask [[Priya Sharma]] about the ryokan"; "[[Kenji]] knows a sushi place in Osaka", Kenji not linked yet) · "Weekly sync with Arjun" (meeting: plugin loading with [[Arjun Mehta]]) · "Mum's chicken biryani" (recipe) · "Deep Work, Cal Newport" (book) · a journal entry for Sunday · "Pottery class?" (idea, pinned).
- Facts: About you: "I take my coffee black, no sugar". Dad: "Dad hates surprises", "Dad's BP check is every 3 months". Priya Sharma: "Priya prefers late Dec so we catch New Year in Kyoto", "Priya is allergic to peanuts". Suresh (not a record): "Suresh fixes the AC, call him in March". Mr. Rao: "Rent is ₹34,000, due on the 5th".
- What you call things: "the landlord" → Mr. Rao (landlord) · "the car" → Hyundai Creta · "Dad" → Dad.

**Deliverables:**
- Every screen above at 390 wide, full scroll, as `NR-Knowledge-Home` (Notes and Facts halves, and search results), `NR-Knowledge-Note` (meeting and recipe), `NR-Knowledge-Form`, `NR-Knowledge-RecordFacts`, `NR-Knowledge-FactMenu`, `NR-Knowledge-Remember`, `NR-Knowledge-Talk`.
- New kit pieces in a `NR-Knowledge-Parts` artboard.
- States: an empty Second Brain (no notes, no facts: say how facts arrive from Talk), notes but no facts, a long note (2,000 words), many facts about one person (30), a search with nothing found, a loading state.
- **No backdrop blur**: draw sheets as the semi-opaque version that ships.
- Dark only: the light theme is undecided.
- Notes on every decision this prompt didn't cover.
