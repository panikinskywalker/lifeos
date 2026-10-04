# LifeOS — notes for coding agents

- **Start from `docs/MODEL.md`.** It is the single source of truth (words, Objects, tiers, filing, screens, milestones). Code must match it; what it does not describe is to be removed. `docs/PLUGINS.md` has the code contracts.
- **Vocabulary, everywhere** (docs, code, SQL, UI copy): Object · Field · Record · Link · Event · Fact · Dump · Cycle · Source · Filing · To check · Board. Retired: entity, type (for an Object), relation, edge, connection, timeline event, comment, extraction, ingest, graph view (the network screen is **Links**; "graph" means a chart). Two code-only exceptions, because TypeScript / the DOM own the plain names: a record in code is `ObjectRecord`, an event is `LifeEvent`.
- **Three tiers, one way:** `src/boards` → `src/modules` → `src/core`; `src/ui` → core. A module never imports another module, never imports UI; core imports nothing above it and no React Native (a type-only React import is allowed). `src/core/deps.test.ts` fails the build otherwise.
- **Modules are data only:** Objects (with Fields from the closed list in `src/core/domain/fields.ts`), filing rules, sources, AI tools, triggers, actions. Every module has a companion board in `src/boards/<module>` for its Overview, screens, quick actions and record sections. Register modules in `src/modules/index.ts`, boards in `src/boards/index.ts`.
- Expo SDK 57 / React Native 0.86 / TypeScript 6. Check versions in `node_modules/expo/bundledNativeModules.json` before adding Expo packages (`npx expo install` may not have network access).
- `src/core` is unit-tested with vitest + better-sqlite3 (`npm test`). Never edit a shipped migration in `src/core/db/migrations.ts`; append a version (the migrations test pins a hash per version).
- Routes live in `app/`; `src/platform` is app-shell glue (do not name a folder `src/app` — expo-router would treat it as routes).
- Verify with `npm run typecheck`, `npm test`, and `npx expo export --platform web`; native behaviour on the phone.
- Product and design: `docs/PRODUCT.md`, `docs/DESIGN.md` (inline SVG icons only, tokens from DESIGN.md). `docs/MILESTONES.md` M1–M4 are history; new work is `docs/MODEL.md` §6.
- Parked ideas live in `docs/ADHOC.md`: add to it as they come up; don't build from it until the user picks items to push together.
