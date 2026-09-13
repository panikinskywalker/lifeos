# LifeOS architecture

## Goals that shaped it

1. **Entity-driven, not app-driven.** People, accounts, trips, tasks… are defined once and referenced everywhere. A transaction is *the same record* whether you reach it from Finance, a Trip, a Person or search.
2. **Offline-first, own-your-data.** Everything is in one SQLite file on the device. No server is required for anything; sync is an optional later layer.
3. **Modules without core changes.** New functionality plugs in through a manifest. Core never imports a module.
4. **A schema that lasts years.** Adding a type or a field is a code change, not a migration. Migrations are reserved for structural changes and are append-only.
5. **One way to query.** Screens, widgets, automations and the AI all speak the same filter language.

## Layers

```
┌─────────────────────────────────────────────────────────────┐
│ app/ (expo-router)      thin routes                          │
├─────────────────────────────────────────────────────────────┤
│ src/ui                  design system · generic screens ·    │
│                         hooks (useOS, useLive)               │
├─────────────────────────────────────────────────────────────┤
│ src/modules/*           ModuleManifest: entity types, screens│
│                         widgets, triggers, actions, AI tools │
├─────────────────────────────────────────────────────────────┤
│ src/core                LifeOSContext ("os")                 │
│   registry · repos · query DSL · search · automation · ai    │
├─────────────────────────────────────────────────────────────┤
│ src/core/db             DatabaseAdapter → expo-sqlite /      │
│                         better-sqlite3 (tests) / future sync │
└─────────────────────────────────────────────────────────────┘
```

`src/core` has **no React Native imports** — it runs in Node for tests and could back a desktop or CLI later. `src/ui` knows React Native but not any module. Modules know core + ui.

## Data model

### The envelope

```sql
entities(id, type, title, subtitle, data JSON, status, starred, archived,
         occurred_at, created_at, updated_at, deleted_at, version)
```

- `id` is UUIDv7 (time-ordered; merges cleanly across devices later).
- `data` holds the type-specific fields, validated on every write by the type's **zod schema**. This is what makes the schema evolve for years without migrations: a new module ships new types and fields as code.
- Hot fields get **expression indexes** (`json_extract(data,'$.category')`) declared per type via `indexed: [...]` and created idempotently at boot.
- `occurred_at` is the domain time (transaction date, trip start, event start) so cross-type timelines and "this month" views need no per-type logic.
- Soft delete via `deleted_at`; `version` bumps on every write.

Trade-off: JSON columns are slower than dedicated tables for very large scans. For a single person's data (tens of thousands of rows) SQLite + expression indexes are more than fast enough, and the flexibility is worth far more than the last 20% of throughput. If a type ever needs it, it can be promoted to its own table behind the same `EntityRepo` API.

### Universal side tables

| Table | Purpose |
|---|---|
| `relations` | typed, bidirectional edges `(from, to, kind)`; a relation field in `data` (e.g. `accountId`) is mirrored here automatically |
| `timeline_events` | every create/update/status/comment/attachment/relation/reminder on a record, with actor (user / automation / assistant) |
| `attachments` | files, images, receipts, links — stored in the app's documents directory |
| `reminders` | one-off or recurring (`rrule`), optionally attached to a record; drive local notifications |
| `tags` + `entity_tags` | case-insensitive tags |
| `custom_field_defs` | user-defined fields per type; values live in `data.custom_<key>` |
| `comments` | notes on any record |
| `saved_views` | serialised `ViewDefinition` per type |
| `dashboards` | ordered widget instances |
| `automation_rules` / `automation_runs` / `scheduled_jobs` | the automation engine |
| `changes` | append-only log of every mutation (sync readiness) |
| `entities_fts` | FTS5 (native) or plain table with LIKE (web) |

### Migrations

`src/core/db/migrations.ts` is a versioned, append-only list. Never edit a shipped migration. A migration may declare `fallback` statements for platforms lacking a feature (FTS5 on web).

## Plugin API

A module is a `ModuleManifest` (see `src/core/registry/types.ts`):

```ts
export const habitsModule: ModuleManifest = {
  id: 'habits', name: 'Habits', version: '1.0.0', icon: 'flame', color: '#FF9500',
  entityTypes: [habitType, habitLogType],   // EntityTypeDef: zod schema + FieldDefs + statuses + relations + views
  widgets,                                  // dashboard widgets (component + sizes)
  quickActions,                             // global "+" menu entries
  detailSections,                           // extra sections on the generic record page
  triggers, actions, aiTools,               // automation + assistant contributions
  onInstall, onStart,                       // lifecycle hooks (seed views/rules, register jobs)
  dependencies: ['crm'],                    // topologically sorted at boot
};
```

`createLifeOS()` registers `coreModule` (generic triggers/actions/AI tools) then each module in dependency order, installs new ones (default views, default widgets, `onInstall`), ensures indexes, starts the automation engine and scheduler, runs `onStart`.

Because manifests are plain objects, a future plugin loader only has to produce a manifest (from a bundle, a remote package, or a JSON-only "declarative" module) — nothing else changes.

See `docs/PLUGINS.md` for a walkthrough.

## The `os` context

Every module, widget, action and AI tool receives `LifeOSContext`:

```ts
os.entities   // create/get/update/delete/query/count/aggregate/groupBy/series + timeline + search
os.relations  // link/unlink/forEntity/targets/sources
os.tags, os.comments, os.attachments, os.reminders, os.customFields, os.views, os.dashboards
os.automation // rules repo + engine
os.scheduler  // persistent jobs with recurrence
os.settings, os.modules, os.format, os.navigate, os.notify
```

This is the whole surface area. Nothing reaches into SQL from a module (though `os.db` exists for escape hatches).

## Universal query DSL

```ts
interface ViewDefinition {
  filter?: FilterGroup;            // { and: [...], or: [...] } of { field, op, value }
  sort?: SortSpec[]; groupBy?: string; layout?: 'list'|'board'|...; includeArchived?; search?;
}
```

`field` is an envelope column (`title`, `status`, `occurredAt`…), `data.<key>`, `tag` (with `hasTag`) or `relation.<kind>` (with `relatedTo`). `src/core/query/filter.ts` compiles it to SQL with bound parameters. Dynamic date tokens (`__TODAY__`, `__MONTH_START__`, `__DAYS_AHEAD_30__`…) are resolved at query time, so saved views never go stale.

The same DSL powers `aggregate`, `groupBy` and `series` (time buckets) — which is how the finance charts, budget progress and AI "how much did I spend" answers are all one code path.

## Events → automation → UI

`src/core/events/bus.ts` is a typed in-process bus. Every repo write emits (`entity.created`, `entity.status`, `relation.added`, `reminder.due`, `schedule.tick`…).

- **UI**: `useLive(fn)` re-runs a synchronous query whenever any data event fires (batched per microtask). With a local SQLite this is simpler and more correct than a cache.
- **Automation**: the engine subscribes to everything. A rule = registered trigger id + config (e.g. `{ entityType: 'transaction' }`), a list of conditions evaluated against the triggering entity (`data.amount gt 5000`), and registered actions with template-able config (`"Review {{title}}"`). A depth guard prevents rule loops. Runs are logged.
- **Scheduler**: jobs live in SQLite with an `rrule`; `tick()` runs on boot, on foreground and from `expo-background-task`. Modules register handlers by job kind (finance uses one to post due subscriptions).
- **Reminders** roll forward on completion when recurring, and are mirrored to local notifications on boot and on change.

## AI assistant

`src/core/ai/assistant.ts` is a tool-use loop over `registry.aiTools`. Tools are `{ name, description, zod input, run(input, os), confirm? }`. Core provides the generic set (`list_entity_types`, `search`, `query_entities`, `aggregate`, `get_entity`, `create_entity`, `update_entity`, `link_entities`, `create_reminder`, `create_automation`…); modules add domain summaries (`finance_summary`, `tasks_overview`, `people_to_contact`, `habits_status`…).

The provider is an interface (`LLMProvider`); `createClaudeProvider` talks to the Messages API over `fetch` with the user's key from SecureStore. Only tool inputs/outputs for the current question leave the device. Conversations persist in `ai_messages`.

## Sync readiness (not built yet)

Every mutable table has `version`, `updated_at`, `deleted_at`, and every write appends to `changes`. A sync engine needs to: (1) push unsynced `changes` rows with their row contents, (2) pull remote changes and apply last-writer-wins per row (or CRDT-merge `data` if wanted later), (3) `markSynced`. No data migration will be needed to add it.

## Testing strategy

- `src/core/core.test.ts` runs the whole core against better-sqlite3: entity CRUD, DSL queries, aggregates, relations, tags, recurrence, automation end-to-end, scheduler, nested transactions, assistant tool loop with a fake provider.
- `npx expo export --platform web` proves the Metro bundle; the web build in Chromium is used for smoke tests of every screen.
- Native behaviours (notifications, background task, file persistence) are exercised on device.
