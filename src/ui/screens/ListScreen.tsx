import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { format } from 'date-fns';
import type { ObjectRecord, FilterClause, FilterGroup, ViewDefinition } from '@core/domain/types';
import type { SavedView } from '@core/repo/sideRepos';
import { useTheme } from '../theme/ThemeProvider';
import { tintForModule } from '../theme/moduleTint';
import { Button, ChipRow, EmptyState, FilterChip, IconButton, ListGroup, RowList, ScreenHeader, Sheet, Text, TextField } from '../kit';
import { RecordRow } from '../components/RecordRow';
import { FilterEditor, describeFilter } from '../components/FilterEditor';
import { useLive, useOS } from '../hooks';

/**
 * Universal list for any entity type: saved views, search, filter/sort/group,
 * list or board layout, quick add. Works for transactions, tasks, people…
 */
export function ListScreen({ type, title, initialView, embedded, linkTo }: { type: string; title?: string; initialView?: ViewDefinition; embedded?: boolean; linkTo?: { id: string; kind: string } }) {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const def = os.registry.object(type);
  const tint = tintForModule(def.module);
  const currencyKey = def.fields.find((f) => f.type === 'money')?.key;
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
  const entities = useLive((o) => o.records.query(type, view, { limit: 500 }), [type, JSON.stringify(view)]);
  const total = useLive((o) => o.records.count(type), [type]);
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

  const controls = (
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
    </>
  );
  // The rows, a day's (or 40 rows') card at a time, so long lists only draw what's on screen.
  const chunks = useMemo(() => {
    const out: Array<{ key: string; label: string | null; meta: string | null; items: ObjectRecord[] }> = [];
    for (const g of groups) {
      const meta = g.totals ? [g.totals.out ? `${os.format.currency(g.totals.out)} out` : null, g.totals.in ? `${os.format.currency(g.totals.in)} in` : null].filter(Boolean).join(' · ') : null;
      for (let i = 0; i < g.items.length; i += 40) out.push({ key: `${g.key ?? '_'}:${i}`, label: i === 0 ? (g.label ?? null) : null, meta: i === 0 ? meta : null, items: g.items.slice(i, i + 40) });
    }
    return out;
  }, [groups, os]);
  const renderChunk = (c: (typeof chunks)[number]) =>
    c.label ? (
      <ListGroup key={c.key} title={c.label} meta={c.meta}>
        {c.items.map((e) => (
          <RecordRow key={e.id} entity={e} />
        ))}
      </ListGroup>
    ) : (
      <RowList key={c.key}>
        {c.items.map((e) => (
          <RecordRow key={e.id} entity={e} />
        ))}
      </RowList>
    );
  const board = layout === 'board' && def.statuses?.length;
  const empty =
    entities.length === 0 ? (
        total === 0 ? (
          <EmptyState icon={def.icon} tint={tint} title={`No ${def.labelPlural.toLowerCase()} yet`} line={`Tell your agent about one, or add it here.`} action={`Add ${def.label.toLowerCase()}`} onAction={() => router.push(newHref as never)} />
        ) : (
          <EmptyState icon="search" tint={tint} title="Nothing matches" line="Try clearing the search or the filter." action="Clear" actionIcon="x" onAction={() => { setSearch(''); setOverride(null); setActiveViewId(null); }} />
        )
    ) : null;
  const sheets = (
    <>
      <Sheet visible={showFilter} onClose={() => setShowFilter(false)} title="Filter & sort" footer={<Button title="Done" block onPress={() => setShowFilter(false)} />}>
        <FilterEditor type={type} value={view} onChange={(v) => setOverride({ ...v, search: undefined })} />
      </Sheet>
      <Sheet visible={showSave} onClose={() => setShowSave(false)} title="Save view" footer={<Button title="Save view" icon="check" block onPress={saveView} />}>
        <TextField label="Name" value={saveName} onChange={setSaveName} placeholder="e.g. Big spends" autoFocus onSubmitEditing={saveView} />
      </Sheet>
    </>
  );

  if (embedded)
    return (
      <View style={{ gap: 16 }}>
        {controls}
        {empty ?? (board ? <Board entities={entities} statuses={def.statuses!} /> : chunks.map(renderChunk))}
        {sheets}
      </View>
    );
  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg.ground }}>
      <FlatList
        data={empty || board ? [] : chunks}
        keyExtractor={(c) => c.key}
        renderItem={({ item }) => renderChunk(item)}
        ItemSeparatorComponent={Gap}
        ListHeaderComponent={
          <View style={{ gap: 18, paddingBottom: empty || board ? 0 : 18 }}>
            <ScreenHeader
              title={title ?? def.labelPlural}
              subtitle={subtitle}
              onBack={() => (router.canGoBack() ? router.back() : router.replace('/browse'))}
              right={
                <>
                  <IconButton icon="filter" accessibilityLabel="Filter and sort" filled onPress={() => setShowFilter(true)} />
                  <IconButton icon="plus" accessibilityLabel={`Add ${def.label}`} filled={t.c.accent.mustard} color={t.c.accent.mustardInk} onPress={() => router.push(newHref as never)} />
                </>
              }
            />
            {controls}
            {empty}
            {board ? <Board entities={entities} statuses={def.statuses!} /> : null}
          </View>
        }
        contentContainerStyle={{ paddingHorizontal: t.layout.gutter, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 }}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={6}
        windowSize={9}
        removeClippedSubviews
      />
      {sheets}
    </View>
  );
}

function Board({ entities, statuses }: { entities: ObjectRecord[]; statuses: NonNullable<ReturnType<ReturnType<typeof useOS>['registry']['object']>['statuses']> }) {
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
                onPress={() => router.push(`/entity/${e.object}/${e.id}`)}
                onLongPress={() => {
                  const idx = statuses.findIndex((x) => x.value === e.status);
                  os.records.setStatus(e.id, statuses[(idx + 1) % statuses.length]!.value);
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

export function groupEntities(entities: ObjectRecord[], groupBy: string | undefined, os: ReturnType<typeof useOS>): Array<{ key: string | null; label: string | null; items: ObjectRecord[]; totals?: { out: number; in: number } | null }> {
  if (!groupBy) return [{ key: null, label: null, items: entities }];
  const map = new Map<string, ObjectRecord[]>();
  const labelFor = (e: ObjectRecord): string => {
    if (groupBy === 'status') return os.registry.object(e.object).statuses?.find((s) => s.value === e.status)?.label ?? e.status ?? 'No status';
    if (groupBy === 'occurredAt' || groupBy === 'createdAt' || groupBy === 'month') {
      const ts = groupBy === 'createdAt' ? e.createdAt : e.occurredAt ?? e.createdAt;
      return new Date(ts).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    }
    if (groupBy === 'day') return dayLabel(e.occurredAt ?? e.createdAt);
    const key = groupBy.replace(/^data\./, '');
    const f = os.registry.object(e.object).fields.find((x) => x.key === key);
    const v = e.data[key];
    if (v == null || v === '') return 'None';
    if (f?.type === 'select') return f.options?.find((o) => o.value === v)?.label ?? String(v);
    if (f?.type === 'link') return os.records.ref(String(v))?.title ?? 'None';
    return String(v);
  };
  for (const e of entities) {
    const l = labelFor(e);
    if (!map.has(l)) map.set(l, []);
    map.get(l)!.push(e);
  }
  const currencyKey = entities[0] ? os.registry.object(entities[0].object).fields.find((f) => f.type === 'money')?.key : undefined;
  const sum = (items: ObjectRecord[], kind: string) => items.reduce((n, e) => n + (e.data.kind === kind ? Number(e.data[currencyKey!] ?? 0) : 0), 0);
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

const Gap = () => <View style={{ height: 18 }} />;

function countClauses(g?: FilterGroup): number {
  if (!g) return 0;
  const walk = (x: FilterGroup | FilterClause): number => ('and' in x || 'or' in x ? [...((x as FilterGroup).and ?? []), ...((x as FilterGroup).or ?? [])].reduce((s, y) => s + walk(y), 0) : 1);
  return walk(g);
}

export type { SavedView };
