# LifeOS — the life graph (architecture v2, 26 Sep 2026)

**The idea:** LifeOS is Jarvis with a UI. You say anything — a dump, a day, an update on a record's page, a question — and it files, updates and links everything itself, never asking. Under it sits a personal knowledge graph in the enterprise-search sense (entity extraction → identity resolution → typed graph → graph-aware retrieval), on the phone, from free models.

## 1. What any sentence is made of

| Part | Example | Becomes |
|---|---|---|
| Mentions | Kendal, Canada, Zomato, the Creta | a node: resolved to an existing record or created |
| Attributes | birthday 8 Sept; favourite colour pink | a field if the type has one, else a line in the record's Notes (`• Favourite colour: pink`, updated in place) |
| Occurrences | took a flight on 8 Sept; had dinner at Toit | an **event node**: a kind (flight, dinner, hike…), a date/time, and role edges |
| Roles | with Kendal · from US · to Canada · at Toit · part of the Canada trip | edges from the event to the nodes |
| Relationships | Kendal is Priya's sister; works at Zomato | an edge between two nodes |
| Commitments | need to call the plumber; remind me Friday | task / reminder nodes |
| Questions | when did I last see Kendal? | retrieval over the graph, then an answer |

Nothing is special-cased: a flight is an occurrence with three roles; a concert, a wedding or a hike is the same shape with another kind.

## 2. The model

- **Nodes** = `entities` (unchanged table). New types: **Place** (city, country, venue, address), **Organisation** (employer, shop, airline). Existing types stay.
- **Events** = the `event` type, generalised: `kind` (free label — flight, dinner, meeting, concert…; the ones we know get extra fields, e.g. flight: from, to, airline, flight no.), start/end, and no fixed person/trip fields — those become role edges. Kinds used often can be promoted to their own types later.
- **Edges** = `relations`, promoted to first class: any node to any node, a small open vocabulary (`with`, `at`, `from`, `to`, `part_of`, `works_at`, `knows`, `family_of`, `owns`, `paid_for`, `about`), plus **provenance** (source: dump / record-voice / manual / sms; source id), **confidence**, and an optional **valid time**. Type-declared relation kinds keep working.
- **Attributes** = typed fields; everything else goes to Notes as a tidy bullet list the agent maintains.
- **Provenance everywhere**: every node, edge and field change the agent makes is logged with where it came from. That log powers To check, Undo and the audit trail.

## 3. The pipeline (one path for every input)

1. **Store** the raw input verbatim (dump table; record-page speech is a dump with a subject).
2. **Understand**: the parser for one-line everyday sentences; otherwise the agent on the free chain with the graph tools — `resolve`, `upsert_node`, `set_attributes`, `add_note_line`, `log_event` (kind, time, roles), `link`, `create_task`. Questions go to the answer path instead.
3. **Resolve identities**: exact title and aliases, then fuzzy match within the type, then context (the record whose page you're on; nodes created earlier in the same dump). Best match wins; low-confidence matches are flagged.
4. **Write** nodes, edges and attributes in one transaction, each with provenance.
5. **Review**: everything written lands in **To check** (the bell). Tick, edit or cancel; cancel reverses exactly that change. Flagged guesses sort first.

Never asks. Free models only in this phase: requests are kept small (only the relevant tools, a compact context), and long dumps are split by sentence groups.

## 4. Retrieval (answers and search)

Hybrid: keyword search (FTS) to find the starting nodes → walk their edges (1–2 hops, filtered by time and kind) → pack the subgraph (nodes, events by date, facts, note lines) into the model's context. "When did I last see Kendal?" = the latest event with a `with` edge to Kendal. Semantic search (embeddings) comes later.

## 5. UI

- **Centre tab** = one box: speak or type; statements are filed, questions answered. No Dump/Talk toggle.
- **Bell** (header) with a count → **To check**: everything filed, unticked; each item with tick / edit / cancel.
- **Record pages**: a mic ("tell me about Kendal…") that files into this record; a **Connections** section (people, places, events, trips linked, grouped by edge word); Notes as the bullet list.
- **Graph view** around any record: a force-directed network, 1–2 hops, tap to re-centre. A whole-life view with filters is in the backlog.
- **Almanac** (M4.4) browses nodes by kind; its Time view is events by date.

## 6. What stays from M4.1

Dumps (verbatim, immutable), background extraction with retries, extraction rows + per-item Undo, the no-key waiting state. The fixed-schema extractor is replaced by the agent pipeline above.
