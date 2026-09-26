import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { format } from 'date-fns';
import type { Entity, FilterClause, FilterGroup, ViewDefinition } from '@core/domain/types';
import type { SavedView } from '@core/repo/sideRepos';
import { useTheme } from '../theme/ThemeProvider';
import { tintForModule } from '../theme/moduleTint';
import { Button, ChipRow, EmptyState, FilterChip, IconButton, ListGroup, RowList, Screen, Sheet, Text, TextField } from '../kit';
import { EntityRow } from '../components/EntityRow';
import { FilterEditor, describeFilter } from '../components/FilterEditor';
import { useLive, useOS } from '../hooks';

/**
 * Universal list for any entity type: saved views, search, filter/sort/group,
 * list or board layout, quick add. Works for transactions, tasks, people…
 */
export function EntityListScreen({ type, title, initialView, embedded, linkTo }: { type: string; title?: string; initialView?: ViewDefinition; embedded?: boolean; linkTo?: { id: string; kind: string } }) {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const def = os.registry.type(type);
  const tint = tintForModule(def.module);
  const currencyKey = def.fields.find((f) => f.type === 'currency')?.key;
  const views = useLive((o) => o.views.forType(type), [type]);
  const [activeViewId, setActiveViewId] = useState<string | null>(() => views.find((v) => v.isDefault)?.id ?? null);
  const [override, setOverride] = useState<ViewDefinition | null>(initialView ?? null);
  const [search, setSearch] = useState('');
  const [searching, setSearching] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [showSave, setShowSave] = useState(false);
  const [saveName, setSaveName] = useState('');

  const activeView = views.find((v) => v.id === activeViewId) ?? null;
  // Records with money read best by day, as the canvas's Transactions list.
  const view: ViewDefinition = useMemo(() => {
    const v: ViewDefinition = { ...(currencyKey && def.occurredAtField ? { groupBy: 'day' } : {}), ...(activeView?.definition ?? {}), ...(override ?? {}), search };
    // Day and month groups only read right newest-first by the record's own date.
    if (!v.sort?.length && (v.groupBy === 'day' || v.groupBy === 'month')) v.sort = [{ field: 'occurredAt', dir: 'desc' }];
    return v;
  }, [activeView, override, search, currencyKey, def.occurredAtField]);
  const entities = useLive((o) => o.entities.query(type, view, { limit: 500 }), [type, JSON.stringify(view)]);
  const total = useLive((o) => o.entities.count(type), [type]);
  const layout = view.layout ?? 'list';
  const groups = useMemo(() => groupEntities(entities, view.groupBy, os), [entities, view.groupBy, os]);
  const filterCount = countClauses(view.filter);
  const newHref = linkTo ? `/entity/${type}/new?linkId=${linkTo.id}&linkKind=${linkTo.kind}` : `/entity/${type}/new`;
  const out = currencyKey ? entities.reduce((n, e) => n + (e.data.kind === 'expense' ? Number(e.data[currencyKey] ?? 0) : 0), 0) : 0;
  const subtitle = out ? `${os.format.currency(out)} out` : `${total} ${total === 1 ? def.label.toLowerCase() : def.labelPlural.toLowerCase()}`;

  const saveView = () => {
    os.views.save(type, { name: saveName.trim() || 'View', definition: { ...view, search: undefined } });
    setShowSave(false);
    setSaveName('');
  };

  const body = (
    <>
      <ChipRow>
        <FilterChip label="All" selected={!activeViewId && !override} onPress={() => { setActiveViewId(null); setOverride(null); }} />
        {views.map((v) => (
          <FilterChip key={v.id} label={v.name} selected={activeViewId === v.id && !override} onPress={() => { setActiveViewId(v.id); setOverride(null); }} />
        ))}
        {override && filterCount ? <FilterChip label={`Filtered · ${filterCount}`} selected onPress={() => setShowFilter(true)} /> : null}
        <FilterChip label="New view" icon="plus" onPress={() => (override && filterCount ? setShowSave(true) : setShowFilter(true))} />
        <FilterChip label="Search" icon="search" selected={searching} onPress={() => { setSearching((v) => !v); setSearch(''); }} />
      </ChipRow>
      {searching ? <TextField value={search} onChange={setSearch} leading="search" placeholder={`Search ${def.labelPlural.toLowerCase()}`} returnKeyType="search" autoFocus /> : null}
      {override && filterCount ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text variant="caption" color="secondary" style={{ flex: 1 }} numberOfLines={2}>
            {describeFilter(view.filter, def)}
          </Text>
          <Button title="Save view" size="sm" variant="secondary" onPress={() => setShowSave(true)} />
          <IconButton icon="x" accessibilityLabel="Clear filter" onPress={() => setOverride(null)} />
        </View>
      ) : null}
      {entities.length === 0 ? (
        total === 0 ? (
          <EmptyState icon={def.icon} tint={tint} title={`No ${def.labelPlural.toLowerCase()} yet`} line={`Tell your agent about one, or add it here.`} action={`Add ${def.label.toLowerCase()}`} onAction={() => router.push(newHref as never)} />
        ) : (
          <EmptyState icon="search" tint={tint} title="Nothing matches" line="Try clearing the search or the filter." action="Clear" actionIcon="x" onAction={() => { setSearch(''); setOverride(null); setActiveViewId(null); }} />
        )
      ) : layout === 'board' && def.statuses?.length ? (
        <Board entities={entities} statuses={def.statuses} />
      ) : (
        groups.map((g) =>
          g.label ? (
            <ListGroup key={g.key ?? '_'} title={g.label} meta={g.totals ? [g.totals.out ? `${os.format.currency(g.totals.out)} out` : null, g.totals.in ? `${os.format.currency(g.totals.in)} in` : null].filter(Boolean).join(' · ') : null}>
              {g.items.map((e) => (
                <EntityRow key={e.id} entity={e} />
              ))}
            </ListGroup>
          ) : (
            <RowList key="_">
              {g.items.map((e) => (
                <EntityRow key={e.id} entity={e} />
              ))}
            </RowList>
          ),
        )
      )}

      <Sheet visible={showFilter} onClose={() => setShowFilter(false)} title="Filter & sort" footer={<Button title="Done" block onPress={() => setShowFilter(false)} />}>
        <FilterEditor type={type} value={view} onChange={(v) => setOverride({ ...v, search: undefined })} />
      </Sheet>
      <Sheet visible={showSave} onClose={() => setShowSave(false)} title="Save view" footer={<Button title="Save view" icon="check" block onPress={saveView} />}>
        <TextField label="Name" value={saveName} onChange={setSaveName} placeholder="e.g. Big spends" autoFocus onSubmitEditing={saveView} />
      </Sheet>
    </>
  );

  if (embedded) return <View style={{ gap: 16 }}>{body}</View>;
  return (
    <Screen
      title={title ?? def.labelPlural}
      subtitle={subtitle}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/almanac'))}
      right={
        <>
          <IconButton icon="filter" accessibilityLabel="Filter and sort" filled onPress={() => setShowFilter(true)} />
          <IconButton icon="plus" accessibilityLabel={`Add ${def.label}`} filled={t.c.accent.mustard} color={t.c.accent.mustardInk} onPress={() => router.push(newHref as never)} />
        </>
      }
    >
      {body}
    </Screen>
  );
}

function Board({ entities, statuses }: { entities: Entity[]; statuses: NonNullable<ReturnType<ReturnType<typeof useOS>['registry']['type']>['statuses']> }) {
  const os = useOS();
  const router = useRouter();
  const t = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -t.layout.gutter }} contentContainerStyle={{ gap: 12, paddingHorizontal: t.layout.gutter, paddingBottom: 8 }}>
      {statuses.map((s) => {
        const items = entities.filter((e) => e.status === s.value);
        return (
          <View key={s.value} style={{ width: 264, gap: 8 }}>
            <Text variant="label" color="secondary" style={{ paddingHorizontal: 4 }}>
              {s.label} · {items.length}
            </Text>
            {items.map((e) => (
              <Pressable
                key={e.id}
                accessibilityRole="button"
                accessibilityHint="Long-press to move to the next status"
                onPress={() => router.push(`/entity/${e.type}/${e.id}`)}
                onLongPress={() => {
                  const idx = statuses.findIndex((x) => x.value === e.status);
                  os.entities.setStatus(e.id, statuses[(idx + 1) % statuses.length]!.value);
                }}
                style={({ pressed }) => ({ backgroundColor: pressed ? t.c.bg.pressed : t.c.bg.tile, borderRadius: t.radius.card, padding: 14, gap: 2 })}
              >
                <Text variant="body" numberOfLines={2}>
                  {e.title}
                </Text>
                {e.subtitle ? (
                  <Text variant="caption" color="secondary" numberOfLines={1}>
                    {e.subtitle}
                  </Text>
                ) : null}
              </Pressable>
            ))}
            {!items.length ? (
              <View style={{ borderRadius: t.radius.card, borderWidth: 1.5, borderStyle: 'dashed', borderColor: t.c.line, padding: 14 }}>
                <Text variant="caption" color="tertiary">
                  Empty
                </Text>
              </View>
            ) : null}
          </View>
        );
      })}
    </ScrollView>
  );
}

export function groupEntities(entities: Entity[], groupBy: string | undefined, os: ReturnType<typeof useOS>): Array<{ key: string | null; label: string | null; items: Entity[]; totals?: { out: number; in: number } | null }> {
  if (!groupBy) return [{ key: null, label: null, items: entities }];
  const map = new Map<string, Entity[]>();
  const labelFor = (e: Entity): string => {
    if (groupBy === 'status') return os.registry.type(e.type).statuses?.find((s) => s.value === e.status)?.label ?? e.status ?? 'No status';
    if (groupBy === 'occurredAt' || groupBy === 'createdAt' || groupBy === 'month') {
      const ts = groupBy === 'createdAt' ? e.createdAt : e.occurredAt ?? e.createdAt;
      return new Date(ts).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    }
    if (groupBy === 'day') return dayLabel(e.occurredAt ?? e.createdAt);
    const key = groupBy.replace(/^data\./, '');
    const f = os.registry.type(e.type).fields.find((x) => x.key === key);
    const v = e.data[key];
    if (v == null || v === '') return 'None';
    if (f?.type === 'select') return f.options?.find((o) => o.value === v)?.label ?? String(v);
    if (f?.type === 'relation') return os.entities.ref(String(v))?.title ?? 'None';
    return String(v);
  };
  for (const e of entities) {
    const l = labelFor(e);
    if (!map.has(l)) map.set(l, []);
    map.get(l)!.push(e);
  }
  const currencyKey = entities[0] ? os.registry.type(entities[0].type).fields.find((f) => f.type === 'currency')?.key : undefined;
  const sum = (items: Entity[], kind: string) => items.reduce((n, e) => n + (e.data.kind === kind ? Number(e.data[currencyKey!] ?? 0) : 0), 0);
  return [...map.entries()].map(([label, items]) => ({
    key: label,
    label,
    items,
    totals: currencyKey ? { out: sum(items, 'expense'), in: sum(items, 'income') } : null,
  }));
}

/** Canvas day groups: Today, Yesterday, then "Sat 20 Sep". */
function dayLabel(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const y = new Date(today);
  y.setDate(today.getDate() - 1);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today)) return 'Today';
  if (same(d, y)) return 'Yesterday';
  return format(d, d.getFullYear() !== today.getFullYear() ? 'EEE d MMM yyyy' : 'EEE d MMM');
}

function countClauses(g?: FilterGroup): number {
  if (!g) return 0;
  const walk = (x: FilterGroup | FilterClause): number => ('and' in x || 'or' in x ? [...((x as FilterGroup).and ?? []), ...((x as FilterGroup).or ?? [])].reduce((s, y) => s + walk(y), 0) : 1);
  return walk(g);
}

export type { SavedView };
