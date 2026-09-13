# LifeOS

A personal operating system for your phone. One entity-driven, offline-first app instead of a dozen trackers: money, tasks, people, trips, health, habits, documents, assets, notes — all linked, all searchable, all automatable, all askable in plain language.

Built with **Expo (React Native) + TypeScript + SQLite**. Runs on iOS, Android and (for development) the web.

## What's in phase 1

| Layer | Status |
|---|---|
| **Core** — entity envelope + JSON data, relations, timeline, attachments, reminders, tags, custom fields, comments, saved views, dashboards, change log (sync-ready), FTS search, universal filter DSL | ✅ complete, unit-tested |
| **Plugin API** — modules register entity types, screens, widgets, quick actions, triggers, actions, AI tools, detail sections | ✅ complete |
| **Automation** — trigger → conditions → actions rules, persistent scheduler with recurrence, local notifications | ✅ complete |
| **AI assistant** — Claude tool-use loop over the data layer (your API key, stored in the keychain) | ✅ complete |
| **UI** — Apple-Health-style design system, dark mode, generic list/detail/form for every type, drag-to-reorder dashboards, global search + command palette | ✅ complete |
| **Finance** — accounts, transactions, budgets, subscriptions (auto-posting), net worth, per-category and per-day charts | ✅ end to end |
| **Projects & Tasks** — projects, tasks, goals, events; today view, board, progress rings | ✅ end to end |
| **Dashboard** — configurable home screens, widget gallery, edit mode | ✅ end to end |
| Habits (streaks + heat map), People/CRM (keep-in-touch, birthdays, shared expenses), Travel (budget vs spend, companions), Health (workouts, measurements) | ✅ working with widgets/sections |
| Assets & Vehicles, Documents (expiry reminders), Second Brain (notes), Inventory (low stock), Automation UI | ✅ CRUD + views on the shared foundation |
| Multi-device sync | ⏳ schema is ready (UUIDv7 ids, versions, tombstones, change log); backend not built |

## Run it

```bash
npm install            # also applies patches/ (see below)
npx expo start         # scan the QR code with Expo Go, or press i / a for simulators
```

`expo-sqlite`, `expo-notifications`, `expo-background-task` and `expo-secure-store` need a development build for full functionality (Expo Go works for everything except background scheduling and some notification behaviours):

```bash
npx expo prebuild
npx expo run:ios       # or run:android
```

Then, in the app: **Browse → Settings → Load demo data** to see every module populated, and **Settings → Assistant** to add a Claude API key.

### Checks

```bash
npm run typecheck      # tsc --noEmit
npm test               # vitest — core data layer against real SQLite
npx expo export --platform web   # metro bundle sanity check
```

## Layout

```
app/                     expo-router routes — thin wrappers around src/ui screens
src/core/                framework-agnostic core (no React Native imports)
  db/                    DatabaseAdapter interface, expo + better-sqlite3 drivers, migrations
  domain/                Entity envelope, field/type definitions, view & filter types, UUIDv7
  registry/              Plugin API (ModuleManifest) + registry + LifeOSContext
  repo/                  EntityRepo and side repos (relations, tags, reminders, comments…)
  query/                 Universal filter DSL → SQL
  search/                FTS5 index (LIKE fallback where FTS5 is unavailable)
  automation/            Rule engine, conditions/templates, persistent scheduler, recurrence
  ai/                    LLM provider interface, Claude provider, tool-use Assistant
  coreModule.ts          Generic triggers, actions and AI tools every module inherits
  lifeos.ts              createLifeOS(): boot sequence
src/ui/                  Design system, hooks (useOS, useLive), generic screens
src/modules/<name>/      One folder per module; each exports a ModuleManifest
src/platform/            App-shell glue: boot, notifications, background task, seed, export
patches/                 patch-package fixes applied on install
docs/                    ARCHITECTURE.md, PLUGINS.md
```

## Key ideas (short version — see `docs/ARCHITECTURE.md`)

- **One envelope, many types.** Every record lives in `entities` with typed columns for what's universal (title, status, dates, versions) and a JSON `data` column validated by the type's zod schema. New types and fields never need a migration; hot fields get expression indexes declared by the type.
- **Everything universal is a side table.** Relations, timeline, attachments, reminders, tags, comments, custom fields work on any entity, so a transaction can belong to a trip, involve people, carry receipts, and show up in a timeline without finance knowing about travel.
- **Modules are plain objects.** A `ModuleManifest` declares what it contributes; core imports nothing from modules. Adding a module = one import in `src/modules/index.ts`.
- **One query language.** `ViewDefinition` (filter/sort/group/layout) drives list screens, widgets, automation conditions and AI tools. Saved views are just serialised definitions, with dynamic date tokens (`__MONTH_START__`, `__DAYS_AHEAD_30__`) so they stay correct forever.
- **The assistant is a client, not a backdoor.** It calls the same repos through registered tools; validation, timeline, automation and search all apply. Mutating tools ask for confirmation.

## Known limitations

- `patches/expo-sqlite+57.0.3.patch` fixes an upstream bug in expo-sqlite's *web* sync bridge (results over 255 bytes were truncated). Native is unaffected. Worth reporting upstream.
- Web is a development target: no FTS5 (LIKE fallback), no notifications, no background tasks.
- Keyboard shortcuts: the command palette (Search tab) is the shortcut surface; hardware-keyboard bindings for iPad/web are a follow-up.
- Rule conditions in the UI are a simple field/op/value editor; the engine supports nested AND/OR (the assistant can create those).
