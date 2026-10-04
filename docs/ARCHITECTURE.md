# LifeOS architecture — superseded

Retired on 4 Oct 2026 by R0 of the reset. What this file described now lives in:

- **The three tiers, the module and board contracts, the one-way rule** → `docs/MODEL.md` §3 and `docs/PLUGINS.md`.
- **Objects, Fields, Records and the storage envelope** → `docs/MODEL.md` §1–2 and `docs/PLUGINS.md` (one `records` table, Object fields in JSON, expression indexes per Object, append-only migrations).
- **Filing, sources, To check** → `docs/MODEL.md` §4; code in `src/core/filing`.
- **Screens** → `docs/MODEL.md` §5.
- **Query DSL, events bus, automation engine, scheduler, AI tool loop** → unchanged in code (`src/core/query`, `src/core/events`, `src/core/automation`, `src/core/ai`); described briefly in `docs/PLUGINS.md`.

Still true from the old text and worth keeping in one line each: `src/core` has no React Native imports and runs in Node for tests; every write appends to `changes` so sync can be added without a data migration; migrations are append-only with a web fallback where FTS5 is missing.
