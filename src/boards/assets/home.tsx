import React from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { format } from 'date-fns';
import type { LifeOSContext } from '@core/registry/context';
import { lastMonths } from '@core/dashboard/overview';
import type { UpkeepItem } from '@core/cycles/upkeep';
import { useLive } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Icon, IconButton, Screen, Text } from '@ui/kit';
import { ASSET_CATEGORIES, assetsOf, clothesByState, clothesSpaces } from '@modules/assets';
import { BigCard, byKm, CATEGORY_PLURAL, Caps, compact, Disc, DoneButton, doneWord, Group, kmText, NothingYet, Pill, shortName, useCycleActions, useDash, whenPill, worthOf, needsALook, QUICK_ADD } from './parts';

/**
 * Assets home (NR-Assets-Home; the module opens here): what needs a look,
 * what you own by category, upkeep spend by month, Clothes in Home, quick add.
 */

function homeData(os: LifeOSContext) {
  const now = Date.now();
  const all = assetsOf(os);
  const known = new Set(ASSET_CATEGORIES.map((c) => c.value));
  const cats = ASSET_CATEGORIES.map((c) => {
    const rows = all.filter((a) => a.data.category === c.value || (c.value === 'other' && !known.has(a.data.category)));
    return { value: c.value, icon: c.icon ?? 'box', rows, worth: rows.reduce((n, a) => n + worthOf(a.data), 0) };
  });
  const months = lastMonths(6, now).map((m) => {
    const from = new Date(`${m.start}T00:00:00`).getTime();
    const to = new Date(`${m.end}T23:59:59`).getTime();
    const row = os.db.get<{ t: number | null }>(`SELECT SUM(json_extract(e.meta,'$.cost')) AS t FROM events e JOIN records r ON r.id = e.record_id WHERE e.kind='cycle.done' AND r.object='asset' AND e.occurred_at BETWEEN ? AND ?`, [from, to]);
    return { label: m.label, start: from, cost: row?.t ?? 0 };
  });
  const top = os.db.get<{ title: string; thing: string; at: number; cost: number }>(`SELECT e.title AS title, r.title AS thing, e.occurred_at AS at, json_extract(e.meta,'$.cost') AS cost FROM events e JOIN records r ON r.id = e.record_id WHERE e.kind='cycle.done' AND r.object='asset' AND e.occurred_at >= ? AND json_extract(e.meta,'$.cost') > 0 ORDER BY cost DESC LIMIT 1`, [months[0]!.start]);
  const by = clothesByState(os);
  return {
    all,
    cats,
    worth: all.reduce((n, a) => n + worthOf(a.data), 0),
    look: needsALook(os, now),
    months,
    top,
    clothes: { count: by.clean.length + by.wash.length + by.packed.length, wash: by.wash.length, packed: by.packed.length, space: clothesSpaces(os)[0]?.id ?? null },
    routines: os.registry.objects.has('routine') ? os.records.query('routine', {}, { limit: 1000 }).length : 0,
  };
}

export function AssetsHome({ ctx }: { ctx: LifeOSContext; params: Record<string, string> }) {
  const t = useTheme();
  const router = useRouter();
  const d = useLive(homeData, []);
  const count = d.all.length;
  const right = (
    <>
      <IconButton icon="search" filled accessibilityLabel="Search Assets" onPress={() => router.push('/module/assets/list' as never)} />
      <IconButton icon="plus" filled={t.c.accent.mustard} color={t.c.accent.mustardInk} accessibilityLabel="Add an Asset" onPress={() => router.push('/entity/asset/new' as never)} />
    </>
  );
  const subtitle = count ? [`${count} ${count === 1 ? 'thing' : 'things'}`, d.worth ? compact(ctx, d.worth) : null].filter(Boolean).join(' · ') : 'Nothing yet';
  return (
    <Screen title="Assets" subtitle={subtitle} right={right} onBack={() => (router.canGoBack() ? router.back() : router.replace('/browse' as never))} contentStyle={{ gap: 24 }}>
      {count ? <NeedsALook items={d.look} /> : <NothingYet />}
      {count ? <ByCategory ctx={ctx} cats={d.cats} total={count} clothesSpace={d.clothes.space} /> : null}
      <UpkeepSpend ctx={ctx} months={d.months} top={d.top} />
      {d.clothes.count && d.clothes.space ? (
        <LinkRow icon="shirt" title="Clothes" titleNote="in Home" line={[`${d.clothes.count} clothes`, d.clothes.wash ? `${d.clothes.wash} in the wash` : null, d.clothes.packed ? `${d.clothes.packed} packed` : null].filter(Boolean).join(' · ')} onPress={() => router.push({ pathname: '/module/[id]/[page]', params: { id: 'inventory', page: 'space', space: d.clothes.space } } as never)} />
      ) : null}
      {d.routines ? <LinkRow icon="repeat" title="Routines" line={`${d.routines} ${d.routines === 1 ? 'routine' : 'routines'}: chores with no thing to them`} onPress={() => router.push('/entity/routine' as never)} /> : null}
      <View style={{ gap: 10 }}>
        <Caps tone="tertiary" style={{ paddingHorizontal: 4 }}>QUICK ADD</Caps>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {QUICK_ADD.map((a) => (
            <Pressable key={a.id} accessibilityRole="button" accessibilityLabel={`Add ${a.label}`} hitSlop={4} onPress={() => router.push(a.route as never)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: 16, borderRadius: 999, backgroundColor: t.c.bg.tileRaised, opacity: pressed ? 0.8 : 1 })}>
              <Icon name={a.icon} size={14} color={t.c.accent.gold} />
              <Text variant="label">{a.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </Screen>
  );
}

/** Needs a look: a row with its tick, or by km with a chevron into the record. */
function NeedsALook({ items }: { items: UpkeepItem[] }) {
  const t = useTheme();
  const router = useRouter();
  const actions = useCycleActions();
  const dated = items.filter((i) => !byKm(i)).length;
  const open = (i: UpkeepItem) => router.push(`/entity/asset/${i.entity.id}` as never);
  return (
    <View style={{ gap: 10 }}>
      <View style={{ paddingTop: 6, paddingHorizontal: 4 }}>
        <Text variant="heading">Needs a look</Text>
        <Text variant="caption" color="secondary">
          {items.length ? (dated ? `${dated} this month · most urgent first` : 'Close by km') : 'Nothing due this month'}
        </Text>
      </View>
      {items.length ? (
        <Group style={{ paddingVertical: 14, gap: 8 }}>
          {items.map((i) => {
            const title = `${shortName(i)} · ${i.entity.title}`;
            if (byKm(i)) {
              const date = i.cycle.nextDueAt ? ` · or ${format(i.cycle.nextDueAt, 'd MMM')}` : '';
              return (
                <Pressable key={i.cycle.id} accessibilityRole="button" accessibilityLabel={title} onPress={() => open(i)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 56, opacity: pressed ? 0.7 : 1 })}>
                  <Disc icon="gauge" />
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <Text variant="rowTitle" numberOfLines={1}>{title}</Text>
                    <Text variant="caption" color="secondary" numberOfLines={1}>{`${kmText(i.status.meterLeft!)} km to go${date}`}</Text>
                  </View>
                  <Icon name="chevron-right" size={18} color={t.c.fg.tertiary} />
                </Pressable>
              );
            }
            const pill = whenPill(i);
            return (
              <View key={i.cycle.id} style={{ flexDirection: 'row', gap: 14, minHeight: 64, paddingVertical: 6 }}>
                <Pressable accessibilityRole="button" accessibilityLabel={`Open ${i.entity.title}`} onPress={() => open(i)} hitSlop={4}>
                  <Disc icon={i.cycle.template === 'asset.service' ? 'wrench' : 'shield'} />
                </Pressable>
                {/* The pill runs under the button: its line is longer than the room beside one. */}
                <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={() => open(i)} style={{ flex: 1, minWidth: 0 }}>
                      <Text variant="rowTitle" numberOfLines={1}>{title}</Text>
                    </Pressable>
                    <DoneButton label={doneWord(i)} onPress={() => actions.done(i, i.entity)} />
                  </View>
                  <View style={{ flexDirection: 'row' }}>
                    <Pill label={pill.label} tone={pill.tone} />
                  </View>
                </View>
              </View>
            );
          })}
        </Group>
      ) : null}
      {actions.sheet}
    </View>
  );
}

/** By category: a 2-column grid, then Add something for what you have none of. */
function ByCategory({ ctx, cats, total, clothesSpace }: { ctx: LifeOSContext; cats: ReturnType<typeof homeData>['cats']; total: number; clothesSpace: string | null }) {
  const t = useTheme();
  const router = useRouter();
  const dash = useDash();
  const have = cats.filter((c) => c.rows.length);
  const none = cats.filter((c) => !c.rows.length && c.value !== 'clothing').map((c) => CATEGORY_PLURAL[c.value]!.toLowerCase());
  const open = (c: (typeof cats)[number]) => {
    if (c.value === 'vehicle' && c.rows.length === 1) router.push(`/entity/asset/${c.rows[0]!.id}` as never);
    else if (c.value === 'clothing' && clothesSpace) router.push({ pathname: '/module/[id]/[page]', params: { id: 'inventory', page: 'space', space: clothesSpace } } as never);
    else router.push({ pathname: '/module/[id]/[page]', params: { id: 'assets', page: 'list', category: c.value } } as never);
  };
  const tile = { height: 132, padding: 14, borderRadius: 24, justifyContent: 'space-between', flexBasis: '47%', flexGrow: 1, maxWidth: '48.6%' } as const;
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, paddingTop: 6, paddingHorizontal: 4 }}>
        <Text variant="heading" style={{ flex: 1 }}>By category</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={`All ${total}`} hitSlop={12} onPress={() => router.push('/module/assets/list' as never)} style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          <Text color="secondary" style={{ fontSize: 13, lineHeight: 17, fontWeight: '600' }}>{`All ${total}`}</Text>
          <Icon name="chevron-right" size={14} color={t.c.fg.secondary} />
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {have.map((c) => (
          <Pressable key={c.value} accessibilityRole="button" accessibilityLabel={`${CATEGORY_PLURAL[c.value]}, ${c.rows.length}`} onPress={() => open(c)} style={({ pressed }) => [tile, { backgroundColor: t.c.bg.tile, opacity: pressed ? 0.85 : 1 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Disc icon={c.icon} size={36} />
              <Text style={{ fontSize: 26, lineHeight: 28, fontWeight: '700', letterSpacing: -0.5, fontVariant: ['tabular-nums'] }}>{c.rows.length}</Text>
            </View>
            <View>
              <Text variant="tileTitle">{CATEGORY_PLURAL[c.value]}</Text>
              <Text variant="caption" color="secondary">{c.worth ? compact(ctx, c.worth) : ' '}</Text>
            </View>
          </Pressable>
        ))}
        <Pressable accessibilityRole="button" accessibilityLabel="Add something" onPress={() => router.push('/entity/asset/new' as never)} style={({ pressed }) => [tile, { borderWidth: 1.5, borderStyle: 'dashed', borderColor: dash, opacity: pressed ? 0.7 : 1 }]}>
          <Disc icon="plus" size={36} color={t.c.accent.gold} />
          <View>
            <Text variant="tileTitle">Add something</Text>
            <Text variant="caption" color="secondary" numberOfLines={1}>{none.length ? none.slice(-3).join(', ') : 'anything else you own'}</Text>
          </View>
        </Pressable>
      </View>
    </View>
  );
}

const shortCost = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k` : String(Math.round(n)));

/** Upkeep spend by month: six columns, this month lime; drawn once something has been spent. */
function UpkeepSpend({ ctx, months, top }: { ctx: LifeOSContext; months: ReturnType<typeof homeData>['months']; top: ReturnType<typeof homeData>['top'] }) {
  const t = useTheme();
  const total = months.reduce((n, m) => n + m.cost, 0);
  if (!total) return null;
  const max = Math.max(...months.map((m) => m.cost));
  const line = top ? `${format(top.at, 'MMMM')} was ${top.thing}’s ${top.title.replace(/ done$/, '').toLowerCase()}, ${ctx.format.currency(top.cost)}.` : null;
  return (
    <BigCard>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="tileTitle">Upkeep spend by month</Text>
          <Text color="secondary" style={{ fontSize: 13, lineHeight: 17, fontWeight: '500' }}>costs logged when a job was done</Text>
        </View>
        <Pill label="6 months" height={28} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 5, flexWrap: 'wrap' }}>
        <Text style={{ fontSize: 36, lineHeight: 37, fontWeight: '700', letterSpacing: -1.5, fontVariant: ['tabular-nums'] }}>{ctx.format.currency(total)}</Text>
        <Text color="secondary" style={{ fontSize: 13, fontWeight: '600' }}>{`since ${format(months[0]!.start, 'MMMM')}`}</Text>
      </View>
      <View accessible accessibilityRole="image" accessibilityLabel={`Upkeep spend: ${months.map((m) => `${m.label} ${Math.round(m.cost)}`).join(', ')}`} style={{ flexDirection: 'row', gap: 10 }}>
        {months.map((m, i) => {
          const last = i === months.length - 1;
          const h = m.cost ? Math.max(14, (m.cost / max) * 110) : 4;
          return (
            <View key={m.label} style={{ flex: 1, alignItems: 'stretch', gap: 4 }}>
              <View style={{ height: 130, justifyContent: 'flex-end', alignItems: 'stretch', gap: 4 }}>
                {m.cost ? <Text numberOfLines={1} color={last ? t.c.accent.gold : 'secondary'} style={{ fontSize: 11, lineHeight: 14, fontWeight: '600', textAlign: 'center' }}>{shortCost(m.cost)}</Text> : null}
                <View style={{ height: h, borderRadius: Math.min(10, h / 2), backgroundColor: last ? t.c.accent.mustard : m.cost ? t.c.bg.pressed : t.c.line }} />
              </View>
              <Text color={last ? t.c.accent.gold : 'secondary'} style={{ fontSize: 11, lineHeight: 14, fontWeight: last ? '700' : '600', textAlign: 'center' }}>{m.label}</Text>
            </View>
          );
        })}
      </View>
      {line ? <Text variant="caption" color="secondary">{line}</Text> : null}
    </BigCard>
  );
}

function LinkRow({ icon, title, titleNote, line, onPress }: { icon: string; title: string; titleNote?: string; line: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={({ pressed }) => ({ paddingVertical: 14, paddingHorizontal: 16, borderRadius: 24, backgroundColor: t.c.bg.tile, flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 72, opacity: pressed ? 0.85 : 1 })}>
      <Disc icon={icon} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text variant="rowTitle" numberOfLines={1}>
          {title}
          {titleNote ? <Text color="secondary" style={{ fontSize: 13, fontWeight: '500' }}>{` · ${titleNote}`}</Text> : null}
        </Text>
        <Text variant="caption" color="secondary" numberOfLines={1}>{line}</Text>
      </View>
      <Icon name="chevron-right" size={18} color={t.c.fg.tertiary} />
    </Pressable>
  );
}
