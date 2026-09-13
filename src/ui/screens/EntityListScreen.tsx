import React, { useMemo, useState } from 'react';
import { ScrollView, View, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import type { Entity, FilterClause, FilterGroup, ViewDefinition } from '@core/domain/types';
import type { SavedView } from '@core/repo/sideRepos';
import { useTheme } from '../theme/ThemeProvider';
import { Button, Card, Chip, EmptyState, Icon, IconButton, Input, Screen, Segmented, Text, GroupLabel } from '../components/primitives';
import { EntityRow } from '../components/EntityRow';
import { Sheet } from '../components/Sheet';
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
  const accent = os.registry.colorFor(type) ?? t.colors.tint;
  const views = useLive((o) => o.views.forType(type), [type]);
  const [activeViewId, setActiveViewId] = useState<string | null>(() => views.find((v) => v.isDefault)?.id ?? null);
  const [override, setOverride] = useState<ViewDefinition | null>(initialView ?? null);
  const [search, setSearch] = useState('');
  const [showFilter, setShowFilter] = useState(false);
  const [showSave, setShowSave] = useState(false);
  const [saveName, setSaveName] = useState('');

  const activeView = views.find((v) => v.id === activeViewId) ?? null;
  const view: ViewDefinition = useMemo(() => ({ ...(activeView?.definition ?? {}), ...(override ?? {}), search }), [activeView, override, search]);
  const entities = useLive((o) => o.entities.query(type, view, { limit: 500 }), [type, JSON.stringify(view)]);
  const total = useLive((o) => o.entities.count(type), [type]);
  const layout = view.layout ?? 'list';
  const groups = useMemo(() => groupEntities(entities, view.groupBy, os), [entities, view.groupBy, os]);
  const filterCount = countClauses(view.filter);

  const saveView = () => {
    os.views.save(type, { name: saveName.trim() || 'View', definition: { ...view, search: undefined } });
    setShowSave(false);
    setSaveName('');
  };

  const body = (
    <>
      {/* View tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingHorizontal: embedded ? 0 : 16, paddingBottom: 10 }}>
        <Chip label={`All ${def.labelPlural}`} selected={!activeViewId} onPress={() => { setActiveViewId(null); setOverride(null); }} color={accent} />
        {views.map((v) => (
          <Chip key={v.id} label={v.name} icon={v.icon} selected={activeViewId === v.id} color={accent} onPress={() => { setActiveViewId(v.id); setOverride(null); }} />
        ))}
        <Chip label={filterCount ? `Filter · ${filterCount}` : 'Filter'} icon="line.3.horizontal.decrease" selected={!!override && filterCount > 0} onPress={() => setShowFilter(true)} color={accent} />
      </ScrollView>
      <View style={{ paddingHorizontal: embedded ? 0 : 16, gap: 10 }}>
        <Input value={search} onChangeText={setSearch} placeholder={`Search ${def.labelPlural.toLowerCase()}`} returnKeyType="search" clearButtonMode="while-editing" />
        {override && filterCount ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text variant="footnote" color="secondary" style={{ flex: 1 }} numberOfLines={2}>
              {describeFilter(view.filter, def)}
            </Text>
            <Button title="Save view" small variant="secondary" color={accent} onPress={() => setShowSave(true)} />
            <IconButton icon="xmark.circle.fill" color={t.colors.textTertiary} onPress={() => setOverride(null)} />
          </View>
        ) : null}
        {entities.length === 0 ? (
          <EmptyState icon={def.icon} color={accent} title={total === 0 ? `No ${def.labelPlural.toLowerCase()} yet` : 'Nothing matches'} body={total === 0 ? `Add your first ${def.label.toLowerCase()} to get started.` : 'Try clearing the search or filter.'} action={total === 0 ? `Add ${def.label}` : undefined} onAction={() => router.push(`/entity/${type}/new`)} />
        ) : layout === 'board' && def.statuses?.length ? (
          <Board entities={entities} statuses={def.statuses} accent={accent} />
        ) : (
          groups.map((g) => (
            <View key={g.key ?? '_'}>
              {g.label ? (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4, paddingBottom: 6, paddingTop: 6 }}>
                  <Text variant="footnote" color="secondary" style={{ textTransform: 'uppercase', letterSpacing: 0.3 }}>
                    {g.label}
                  </Text>
                  {g.total != null ? (
                    <Text variant="footnote" color="secondary" style={{ fontVariant: ['tabular-nums'] }}>
                      {os.format.currency(g.total)}
                    </Text>
                  ) : null}
                </View>
              ) : null}
              <Card padded={false}>
                {g.items.map((e, i) => (
                  <EntityRow key={e.id} entity={e} first={i === 0} last={i === g.items.length - 1} />
                ))}
              </Card>
            </View>
          ))
        )}
        <Text variant="caption" color="tertiary" style={{ textAlign: 'center', paddingTop: 4 }}>
          {entities.length} of {total}
        </Text>
      </View>

      <Sheet visible={showFilter} onClose={() => setShowFilter(false)} title="Filter & sort" right={<Button title="Done" small variant="plain" onPress={() => setShowFilter(false)} />}>
        <FilterEditor type={type} value={view} onChange={(v) => { setOverride({ ...v, search: undefined }); }} accent={accent} />
      </Sheet>
      <Sheet visible={showSave} onClose={() => setShowSave(false)} title="Save view">
        <View style={{ paddingHorizontal: 16, gap: 12 }}>
          <Input value={saveName} onChangeText={setSaveName} placeholder="View name" autoFocus onSubmitEditing={saveView} />
          <Button title="Save" onPress={saveView} color={accent} />
        </View>
      </Sheet>
    </>
  );

  if (embedded) return <View>{body}</View>;
  return (
    <Screen
      title={title ?? def.labelPlural}
      padded={false}
      right={
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <IconButton icon="plus" bg onPress={() => router.push(linkTo ? `/entity/${type}/new?linkId=${linkTo.id}&linkKind=${linkTo.kind}` : `/entity/${type}/new`)} color={accent} />
        </View>
      }
    >
      {body}
    </Screen>
  );
}

function Board({ entities, statuses, accent }: { entities: Entity[]; statuses: NonNullable<ReturnType<ReturnType<typeof useOS>['registry']['type']>['statuses']>; accent: string }) {
  const os = useOS();
  const router = useRouter();
  const t = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingBottom: 8 }}>
      {statuses.map((s) => {
        const items = entities.filter((e) => e.status === s.value);
        return (
          <View key={s.value} style={{ width: 260, gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: s.color ?? accent }} />
              <Text variant="footnote" color="secondary" style={{ fontWeight: '600' }}>
                {s.label.toUpperCase()} · {items.length}
              </Text>
            </View>
            {items.map((e) => (
              <Pressable key={e.id} onPress={() => router.push(`/entity/${e.type}/${e.id}`)} onLongPress={() => {
                const idx = statuses.findIndex((x) => x.value === e.status);
                const next = statuses[(idx + 1) % statuses.length];
                os.entities.setStatus(e.id, next.value);
              }}>
                <Card style={{ padding: 12, gap: 2 }}>
                  <Text variant="subhead" numberOfLines={2}>
                    {e.title}
                  </Text>
                  {e.subtitle ? (
                    <Text variant="caption" color="secondary" numberOfLines={1}>
                      {e.subtitle}
                    </Text>
                  ) : null}
                </Card>
              </Pressable>
            ))}
            {!items.length ? <Card style={{ padding: 12, backgroundColor: t.colors.fillSecondary }}><Text variant="caption" color="tertiary">Empty</Text></Card> : null}
          </View>
        );
      })}
    </ScrollView>
  );
}

export function groupEntities(entities: Entity[], groupBy: string | undefined, os: ReturnType<typeof useOS>): Array<{ key: string | null; label: string | null; items: Entity[]; total?: number | null }> {
  if (!groupBy) return [{ key: null, label: null, items: entities }];
  const map = new Map<string, Entity[]>();
  const labelFor = (e: Entity): string => {
    if (groupBy === 'status') return os.registry.type(e.type).statuses?.find((s) => s.value === e.status)?.label ?? e.status ?? 'No status';
    if (groupBy === 'occurredAt' || groupBy === 'createdAt' || groupBy === 'month') {
      const ts = groupBy === 'createdAt' ? e.createdAt : e.occurredAt ?? e.createdAt;
      const d = new Date(ts);
      return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    }
    if (groupBy === 'day') {
      return os.format.date(e.occurredAt ?? e.createdAt, 'relative');
    }
    const key = groupBy.replace(/^data\./, '');
    const def = os.registry.type(e.type);
    const f = def.fields.find((x) => x.key === key);
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
  return [...map.entries()].map(([label, items]) => ({
    key: label,
    label,
    items,
    total: currencyKey ? items.reduce((s, e) => s + (e.data.kind === 'income' ? 1 : e.data.kind === 'expense' ? -1 : 0) * Number(e.data[currencyKey] ?? 0), 0) || null : null,
  }));
}

function countClauses(g?: FilterGroup): number {
  if (!g) return 0;
  const walk = (x: FilterGroup | FilterClause): number => ('and' in x || 'or' in x ? [...((x as FilterGroup).and ?? []), ...((x as FilterGroup).or ?? [])].reduce((s, y) => s + walk(y), 0) : 1);
  return walk(g);
}

export { Segmented, GroupLabel, Icon };
export type { SavedView };
