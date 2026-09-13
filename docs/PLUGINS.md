# Writing a LifeOS module

A module is one folder under `src/modules/` exporting a `ModuleManifest`, plus one line in `src/modules/index.ts`. This walkthrough builds a small **Plants** module: plants you own, watering logs, a "water today" widget, an automation trigger and an AI tool.

## 1. Entity types

```ts
// src/modules/plants/index.tsx
import { z } from 'zod';
import type { EntityTypeDef, ModuleManifest } from '@core/registry/types';
import { palette } from '@ui/theme/tokens';

export interface PlantData { species?: string; waterEveryDays: number; lastWateredOn?: string; location?: string }

export const plantType: EntityTypeDef<PlantData> = {
  type: 'plant',                 // stable id — never rename
  module: 'plants',
  label: 'Plant', labelPlural: 'Plants', icon: 'leaf',
  schema: z.object({
    species: z.string().optional(),
    waterEveryDays: z.coerce.number().int().positive().default(7),
    lastWateredOn: z.string().optional(),
    location: z.string().optional(),
  }),
  fields: [
    { key: 'species', label: 'Species', type: 'text', summary: true },
    { key: 'waterEveryDays', label: 'Water every (days)', type: 'number', required: true, defaultValue: 7 },
    { key: 'lastWateredOn', label: 'Last watered', type: 'date' },
    { key: 'location', label: 'Location', type: 'text', summary: true },
  ],
  indexed: ['lastWateredOn'],
  statuses: [{ value: 'alive', label: 'Alive' }, { value: 'gone', label: 'Gone', color: palette.gray }],
  defaultViews: [{ name: 'Needs water', definition: { filter: { and: [{ field: 'data.lastWateredOn', op: 'lte', value: '__DAYS_AGO_7__' }] } } }],
};
```

That alone gives you: a list screen with saved views, search and filters; a form; a detail page with timeline, tags, relations, reminders, attachments and comments; full-text search; AI access via `query_entities`/`create_entity`; automation triggers on create/update/status. No migration.

`fields` drive the form, filters and the assistant's understanding. `type: 'relation'` fields with `relationKind` are mirrored into the relations table automatically:

```ts
{ key: 'personId', label: 'Caretaker', type: 'relation', relationTo: 'person', relationKind: 'person' }
```

## 2. A widget

```tsx
import type { WidgetDef, WidgetProps } from '@core/registry/types';
import { useLive } from '@ui/hooks';
import { Card, SectionHeader, Stat } from '@ui/components/primitives';

function WaterTodayWidget({ ctx }: WidgetProps) {
  const due = useLive((os) => os.entities.query<PlantData>('plant', { filter: { and: [{ field: 'status', op: 'eq', value: 'alive' }] } })
    .filter((p) => !p.data.lastWateredOn || daysSince(p.data.lastWateredOn) >= p.data.waterEveryDays), []);
  return (
    <Card onPress={() => ctx.navigate('/entity/plant')}>
      <SectionHeader title="Plants" icon="leaf" color={palette.green} action="All" />
      <Stat value={String(due.length)} unit="need water" />
    </Card>
  );
}

const widgets: WidgetDef[] = [{ type: 'plants.water', module: 'plants', name: 'Water today', icon: 'leaf', sizes: ['small', 'medium'], defaultSize: 'small', component: WaterTodayWidget }];
```

`useLive` re-runs the query whenever data changes. Widgets receive `size` and can adapt.

## 3. A detail section

Anything you export as a `detailSections` entry appears on that type's record page, above the generic tags/relations/timeline blocks:

```tsx
detailSections: [{ entityType: 'plant', key: 'plants.watering', title: 'Watering', order: 10, component: WateringSection }]
```

## 4. Automation: a trigger and an action

Modules can expose domain triggers (mapped from bus events) and actions:

```ts
triggers: [{
  id: 'plants.watered', module: 'plants', label: 'Plant watered', event: 'entity.updated',
  toContext: (p) => {
    const e = p as { entity: Entity; changed: string[] };
    return e.entity.type === 'plant' && e.changed.includes('data.lastWateredOn') ? { entity: e.entity, vars: {} } : null;
  },
}],
actions: [{
  id: 'plants.markWatered', module: 'plants', label: 'Mark watered today',
  run: async (_cfg, ctx, os) => { if (ctx.entity) os.entities.update(ctx.entity.id, { data: { lastWateredOn: today() } }, 'automation'); },
}],
```

Users combine these with core actions (`core.createReminder`, `core.addTag`, `core.notify`, `core.createEntity`…) in the Automation screen, or ask the assistant to create the rule.

For time-based work, register a scheduler handler in `onStart`:

```ts
onStart: async (os) => {
  os.scheduler.registerHandler('plants.check', (_job, o) => { /* emit reminders for thirsty plants */ });
  if (!os.scheduler.get('plants.check')) os.scheduler.schedule({ id: 'plants.check', kind: 'plants.check', at: Date.now(), rrule: 'FREQ=DAILY;INTERVAL=1' });
},
```

## 5. An AI tool

```ts
aiTools: [{
  name: 'plants_needing_water',
  description: 'Plants overdue for watering, with days overdue.',
  input: z.object({}),
  run: async (_i, os) => os.entities.query<PlantData>('plant').map((p) => ({ id: p.id, name: p.title, overdueDays: ... })),
}],
```

Mutating tools should set `confirm: true` so the assistant asks before running them.

## 6. Register it

```ts
export const plantsModule: ModuleManifest = {
  id: 'plants', name: 'Plants', version: '1.0.0', description: 'Keep them alive.', icon: 'leaf', color: palette.green,
  entityTypes: [plantType], widgets, detailSections, triggers, actions, aiTools,
  defaultWidgets: [{ type: 'plants.water' }],
  quickActions: [{ id: 'plants.add', label: 'Plant', icon: 'leaf', route: '/entity/plant/new' }],
};
```

```ts
// src/modules/index.ts
export const installedModules = [..., plantsModule];
```

On next launch the module is installed (default views + widgets seeded), its types are indexed and it shows up in Browse, Search, the widget gallery, the Automation editor and the assistant.

## Rules of the road

- Never rename a `type` or a field `key` once shipped; add a new one and migrate data in `onStart` if needed.
- Keep `schema` permissive with `.default()`/`.optional()` so older records keep validating.
- Don't import another module's internals; link through relations and query by type. (Importing another module's *types/constants* — like finance categories — is fine and explicit via `dependencies`.)
- Use `os.format` for money/dates so locale settings apply everywhere.
- Write through `os.entities`/`os.relations`; never raw SQL for records — the timeline, search index, change log and automations depend on it.
