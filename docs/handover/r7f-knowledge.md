# R7f knowledge · hand-over

Branch `claude/r7f-knowledge`, from `m1-design-system` at 0c3a9b3 (v0.0.17). No
migration, no version bump, no CHANGELOG edit.

## What was built

- **MODEL.md first** (layer 2 *Mind*, *The Second Brain*; layer 6 R7f):
  Note's Fields, mentions, Facts per record and in one place, the fold,
  search and the tools; R7f marked built.
- **The module** (`src/modules/knowledge`):
  - `types.ts`: Note, keys unchanged (`body`, `kind`, `source`, `projectId`,
    `personIds`). New: `computeTitle` (the body's first line, marks and
    brackets dropped, 60 characters), so a note you don't name follows its
    first line; a named one keeps its name (core's record repo already does
    this). `noteSnippet` for the line under it.
  - `brain.ts`: `mentionsIn` (each `[[Name]]` with its record or null),
    `notes` (pinned first, by kind, searched), `factGroups` (About you, then
    the biggest groups), `searchBrain` (notes and facts together),
    `whatIKnow` (a record or a name: facts, notes that mention it, what you
    call it).
  - `fold.ts`, once on first open (setting `knowledge.r7f`): name facts move
    onto the record that now has that name; a deleted record's facts keep
    its name beside the record id; every Note's mentions are synced again.
  - `aiTools.ts`: `write_note`, `find_notes`, `what_i_know`.
  - `knowledge.test.ts`: 9 tests (titles, mentions, lists and search, fact
    groups, what I know, the fold, once-only, the three tools).
- **The board** (`src/boards/knowledge`, a first pass from the kit):
  - Placement is now **browse**: *Second Brain* is a tile in Browse › Boards.
  - `home.tsx`: one search over notes and facts; Notes · Facts switch; kind
    filters, Pinned, Latest; `FactsScreen` for `/board/knowledge/facts`.
  - `facts.tsx`: facts by what they're about with a menu (Open · About a
    record… · Forget with Undo), What you call things (hold to forget, with
    Undo), Remember something. This is the old `app/memory.tsx`, moved and
    extended.
  - `note.tsx`: `NoteBody`, the note's top section (headings, bullets,
    mentions as links in the memory tint; unknown ones faded and searched on
    tap, listed as *Not linked yet*); `NoteForm`, the form override (title
    optional, kind pills, body, **Mention** inserts `[[title]]` at the
    cursor, then source, project, people).
  - `overview.ts`: notes, facts, this month; pinned and latest.
- **App shell, small**: `app/memory.tsx` redirects to the Facts half (old
  links and search's fact hits keep working); Browse's *Memory* row is now
  *Facts*; `app/search.tsx` takes `?q=` (a not-linked-yet mention opens it)
  and labels fact hits *Fact*.
- **Demo data**: the two notes mention Priya, Kenji (no record) and Arjun;
  facts about Dad, about you and about Suresh (a name); "the landlord" as a
  learned name.
- **Design brief**: `docs/design/KNOWLEDGE-BRIEF.md`, artboards
  `NR-Knowledge-*`.
- Checks: `npm run typecheck` clean, `npm test` 495 green (60 files),
  `npx expo export --platform web` builds. In the web build with the demo
  data: the Second Brain's Notes and Facts halves, search, `/memory`, a
  note's page (Priya linked, Kenji faded) and the note form, no console
  errors.

## Shared core edits (each a line or a few)

1. `src/core/repo/factRepo.ts`: `setSubject(id, { subjectId, subjectKey })`,
   reindexes the fact and puts it on the new record's timeline.
2. `src/core/repo/aliasRepo.ts`: `all()`, every learned name on a live
   record.
3. `src/core/registry/types.ts`: `EntityDetailSection.fields?: string[]`;
   `src/ui/screens/RecordScreen.tsx` leaves those Fields out of the Details
   card (so a note's body isn't drawn twice).
4. `src/core/ai/assistant.ts`: `find_notes` and `what_i_know` added to
   `READ_ONLY_TOOLS`, so the Dump box's question path can use them.
5. `src/platform/seed.ts`: the demo lines above.

## Decisions taken (the simplest where MODEL.md was silent)

1. **Facts stay in core's `facts` table**; the Second Brain reads them. No
   Fact Object records, no migration.
2. **Talk's memory** is the facts plus the learned names (`aliases`); both are
   in the Facts half. Conversations (`ai_messages`) are not part of it.
3. **Kinds** keep recipe and book / article beside layer 2's four, because
   records already use them.
4. **Pinned** is the record's star, not a new Field.
5. **A title you don't type** follows the first line; clearing a title in the
   form makes it follow again.
6. **An unknown mention** links nothing (as `syncMentions` already did) and a
   tap opens Search with the name, where *New person* etc. make it; once a
   record has that name, the next save of the note links it. The fold links
   old notes once; later notes link when they're saved.
7. **A deleted record's facts** keep the record id and gain its name, so a
   restored record gets them back.
8. **Second Brain moved to Browse › Boards** (placement browse) since it is
   now the home of Facts too; the module page still reaches it.

## What you must decide

1. **Layer 5's Memory line** (*Also in the app*) still says Memory stays
   until the Second Brain replaces it. It is outside R7f's sections, so I
   left it: at merge, replace it with "Facts: the Second Brain's Facts half
   (R7f)", and Browse's *everything else* list's "Memory (facts)" likewise.
2. **`[[` suggestions while typing** in the note body (the brief asks for a
   design); the first build has only the Mention button. Build when the
   artboard lands?
3. **Re-linking when a record is made later**: a note's mentions are synced
   when the note is saved (and once by the fold), not when a matching record
   appears. Add a listener on record created that re-syncs notes naming it?
4. **Facts made by the brain or Notion** show their source; should a Notion
   fact be editable here, or only in Notion?

## Phone checks

- First open after the merge: the fold runs once. Facts Talk kept under a
  name you have since added as a Person now show on that Person; nothing is
  missing from the Facts half compared with the old Memory screen (count
  should match).
- Browse › Boards › Second Brain; Browse › Facts opens its Facts half.
- New note: type a title-less note, Mention a person, save; the person's page
  lists it under *Mentioned in*; edit the first line and the title follows.
- A note with an unknown `[[Name]]`: faded, tap opens Search with it.
- Fact menu: About a record… moves it (Undo puts it back); Forget with Undo.
- Hold a learned name to forget it (Undo).
- Dump box: "what do I know about Dad?" and "write a note: … [[Priya
  Sharma]] …".

## Patch notes for the merge

**Second Brain** (R7f), built in its own session and merged here. The
screens are a first pass from the kit until the *NR-Knowledge* artboards are
drawn.
- **Memory is now the Second Brain**: your notes and everything you've told
  LifeOS, in one place (Browse › Boards). Facts are grouped by who or what
  they're about, with the names Talk learned ("the landlord") below them.
  Nothing is lost: facts Talk kept under a name move onto that person once
  they're in LifeOS.
- **Notes link to what they mention**: write `[[Karan]]` (or tap Mention) and
  the note shows on Karan's page. A name with no record yet is faded; tap it
  to find or make it.
- **No title needed**: a note is named by its first line until you name it.
- **Pin** notes to keep them on top; filter by kind; one search over notes
  and facts.
- Put a fact on the right person later with *About a record…*.
- Ask "what do I know about Dad?" or say "write a note: …" in the Dump box.
