import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import { useLive } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { blocks } from '@ui/theme/tokens';
import { IconButton, Screen, Sheet, Text } from '@ui/kit';
import { dayWords, goingOffCandidates, isoDay, justCameIn, runningLow, useByWords, runningOutCandidates, spaces, stockState, type SpaceData, type StockData } from '@modules/inventory';
import { clothesByState } from '@modules/assets';
import { ToCheckBell } from '../../screens/ToCheckBell';
import { AddSheet, usePillActions } from './actions';
import { Card, CookTonight, Hairline, HomeEmpty, Note, PillButton, PillCloud, SectionHead, SourceChip, SpaceTile, StockPill } from './parts';

/**
 * Home (the inventory board's index; NR-Home-Home, its empty state from
 * NR-Home-States): the header with what's in it, the bell and +; Use soon, a
 * strip of cards that bleeds to the edge, what goes off today first and what
 * is past it last; Cook tonight; Running low with why and the way into the
 * shopping list; Spaces, Clothes as the wide tile, with Reorder; Just came in.
 * Snap the fridge is on the Fridge. ?add=1 opens the add sheet (a To check
 * card's Add by hand).
 */

const openSpace = (router: ReturnType<typeof useRouter>, id: string) => router.push({ pathname: '/module/[id]/[page]', params: { id: 'inventory', page: 'space', space: id } } as never);

export function HomeScreen({ ctx, params }: { ctx: LifeOSContext; params: Record<string, string> }) {
  const router = useRouter();
  const t = useTheme();
  const [adding, setAdding] = useState(params.add === '1');
  const [reorder, setReorder] = useState(false);
  const pills = usePillActions(ctx);

  const d = useLive((os) => {
    const now = Date.now();
    const all = os.records.query<StockData>('stock', {}, { limit: 5000 });
    const byId = new Map(all.map((s) => [s.id, s]));
    const inHome = all.filter((s) => s.data.quantity > 0);
    const soon = goingOffCandidates(os, now)
      .map((n) => ({ n, st: stockState(byId.get(n.stockId)!.data, now) }))
      .filter(({ st }) => st.state === 'probably gone' || (st.daysLeft ?? 9) <= 2)
      .sort((a, b) => Number(a.st.state === 'probably gone') - Number(b.st.state === 'probably gone') || (a.st.daysLeft ?? 0) - (b.st.daysLeft ?? 0));
    const low = runningOutCandidates(os, now);
    const sp = spaces(os).map((s) => {
      if (s.data.holds === 'clothes') {
        // Clothes are Assets (R7a): the count, and how many are in the wash or packed.
        const c = os.registry.objects.has('asset') ? clothesByState(os, s.id) : { clean: [], wash: [], packed: [] };
        const hints = [c.wash.length ? `${c.wash.length} in the wash` : null, c.packed.length ? `${c.packed.length} packed` : null].filter(Boolean).join(' · ') || null;
        return { space: s, count: c.clean.length + c.wash.length + c.packed.length, hints };
      }
      const here = inHome.filter((x) => x.data.spaceId === s.id);
      const useSoon = here.filter((x) => stockState(x.data, now).state === 'use soon').length;
      const gone = here.filter((x) => stockState(x.data, now).state === 'probably gone').length;
      const lowN = here.filter((x) => runningLow(x.data, now).low).length;
      const hints = [useSoon ? `${useSoon} use soon` : null, gone ? `${gone} gone?` : null, lowN ? `${lowN} low` : null].filter(Boolean).join(' · ') || null;
      return { space: s, count: here.length, hints };
    });
    const arrival = justCameIn(os, now);
    const landed = new Map<string, number>();
    for (const x of arrival?.things ?? []) {
      const sp = byId.get(x.id)?.data.spaceId;
      const name = sp ? os.records.get<SpaceData>(sp)?.title : null;
      if (name) landed.set(name, (landed.get(name) ?? 0) + 1);
    }
    return { all, byId, now, count: inHome.length, soon, low, spaces: sp, arrival, landed: [...landed.entries()].sort((a, b) => b[1] - a[1]), onList: all.filter((s) => s.data.onList).length };
  }, []);

  const toList = () => router.push('/module/inventory/list' as never);
  const plus = <IconButton icon="plus" filled={t.c.accent.mustard} color={t.c.fg.onAccent} accessibilityLabel="Add to Home" onPress={() => setAdding(true)} />;
  const header = { title: 'Home', subtitle: `${d.count} ${d.count === 1 ? 'thing' : 'things'} · ${d.spaces.length} spaces`, onBack: () => (router.canGoBack() ? router.back() : router.replace('/browse' as never)) };
  const add = <AddSheet ctx={ctx} visible={adding} onClose={() => setAdding(false)} />;

  if (!d.all.length) {
    return (
      <Screen {...header} right={plus} contentStyle={{ gap: 14 }}>
        <HomeEmpty title="Nothing at home yet" line="Your next Blinkit order fills this: share its invoice into LifeOS. Or add what’s in the fridge now.">
          <PillButton title="Add by hand" height={44} onPress={() => setAdding(true)} />
          <PillButton title="Data sources" icon="inbox" raised height={44} onPress={() => router.push('/settings/sources' as never)} />
        </HomeEmpty>
        {add}
      </Screen>
    );
  }

  const stock = (id: string) => d.byId.get(id) as ObjectRecord<StockData>;
  const regular = d.spaces.filter((s) => s.space.data.holds !== 'clothes');
  const wide = d.spaces.filter((s) => s.space.data.holds === 'clothes');
  return (
    <Screen
      {...header}
      right={
        <>
          <ToCheckBell />
          {plus}
        </>
      }
      contentStyle={{ gap: 14 }}
    >
      {d.soon.length ? (
        <>
          <SectionHead title="Use soon" sub="Going off in the next 2 days" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: t.layout.gutter }} style={{ marginHorizontal: -t.layout.gutter, flexGrow: 0 }}>
            {d.soon.map(({ n, st }) => {
              const s = stock(n.stockId);
              const gone = st.state === 'probably gone';
              return (
                <View key={n.stockId} style={{ width: 168, padding: 12, borderRadius: 20, backgroundColor: t.c.bg.tile, gap: 8 }}>
                  <View style={{ alignSelf: 'flex-start', maxWidth: '100%' }}>
                    <StockPill title={s.title} state={st.state} quantity={s.data.quantity} guess={n.estimated} size="sm" onPress={() => pills.tap(s)} onLongPress={() => pills.menu(s)} />
                  </View>
                  <Text numberOfLines={1} style={{ fontSize: 12, lineHeight: 16, fontWeight: '600', color: gone ? t.c.fg.secondary : t.dark ? blocks.yellow : '#8A3A10' }}>{gone ? `${useByWords(st.daysLeft, d.now)} · still there?` : useByWords(st.daysLeft, d.now)}</Text>
                  <Text numberOfLines={1} style={{ fontSize: 12, lineHeight: 16, color: t.c.fg.secondary }}>{/^leftover/i.test(s.title) ? n.why.replace(/^bought/, 'made') : n.why}</Text>
                </View>
              );
            })}
          </ScrollView>
        </>
      ) : null}

      <CookTonight />

      <View style={{ marginTop: 6 }}>
        <SectionHead title="Running low" sub={d.low.length ? 'From how often you rebuy' : 'Nothing running low'} action={d.onList ? `List · ${d.onList}` : 'Shopping list'} onAction={toList} />
      </View>
      {d.low.length ? (
        <Card gap={10}>
          {d.low.slice(0, 6).map((n, i) => {
            const s = stock(n.stockId);
            return (
              <React.Fragment key={n.stockId}>
                {i ? <Hairline /> : null}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ flexShrink: 1, maxWidth: '70%' }}>
                    <StockPill title={s.title} state={stockState(s.data, d.now).state} quantity={s.data.quantity} size="sm" onPress={() => pills.tap(s)} onLongPress={() => pills.menu(s)} />
                  </View>
                  <Text numberOfLines={1} style={{ flex: 1, textAlign: 'right', fontSize: 12, lineHeight: 16, fontWeight: '600', color: t.c.fg.secondary }}>{n.why}</Text>
                </View>
              </React.Fragment>
            );
          })}
          <PillButton title="Shopping list" icon="cart" raised style={{ marginTop: 4 }} onPress={toList} />
        </Card>
      ) : null}

      <View style={{ marginTop: 6 }}>
        <SectionHead title="Spaces" action="Reorder" plain onAction={() => setReorder(true)} />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {regular.map((s) => (
          <SpaceTile key={s.space.id} name={s.space.title} icon={s.space.data.icon ?? 'box'} count={s.count} hints={s.hints} onPress={() => openSpace(router, s.space.id)} />
        ))}
        {regular.length % 2 ? <View style={{ flexBasis: '46%', flexGrow: 1 }} /> : null}
      </View>
      {wide.map((s) => (
        <SpaceTile key={s.space.id} wide name={s.space.title} icon={s.space.data.icon ?? 'shirt'} count={s.count} hints={s.hints} onPress={() => openSpace(router, s.space.id)} />
      ))}

      {d.arrival ? (
        <>
          <View style={{ marginTop: 6 }}>
            <SectionHead title="Just came in" />
          </View>
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <SourceChip label={d.arrival.shop} />
              <Text style={{ flex: 1, fontSize: 15, lineHeight: 20, fontWeight: '600', color: t.c.fg.primary, fontVariant: ['tabular-nums'] }}>
                {[d.arrival.amount != null ? ctx.format.currency(d.arrival.amount) : null, `${dayWords(isoDay(d.arrival.at), d.now)} ${ctx.format.time(d.arrival.at).toLowerCase()}`, `${d.arrival.things.length} ${d.arrival.things.length === 1 ? 'thing' : 'things'}`].filter(Boolean).join(' · ')}
              </Text>
            </View>
            <PillCloud gap={6}>
              {d.arrival.things.map((x) => {
                const s = d.byId.get(x.id);
                return s ? <StockPill key={x.id} title={s.title} state={stockState(s.data, d.now).state} quantity={x.quantity} size="sm" onPress={() => pills.open(s)} /> : null;
              })}
            </PillCloud>
            {d.landed.length ? <Text style={{ fontSize: 12, lineHeight: 16, color: t.c.fg.secondary }}>{d.landed.map(([name, n]) => `${name} ${n}`).join(' · ')}</Text> : null}
          </Card>
        </>
      ) : null}
      <Note center>Tap a pill when it’s used up · hold it for half left, still good, move. ~ is LifeOS’s guess.</Note>
      {pills.sheets}
      {add}
      <ReorderSheet ctx={ctx} visible={reorder} onClose={() => setReorder(false)} />
    </Screen>
  );
}

/** Reorder on Spaces: up and down on each space, kept as its order. */
function ReorderSheet({ ctx, visible, onClose }: { ctx: LifeOSContext; visible: boolean; onClose: () => void }) {
  const t = useTheme();
  const list = useLive((os) => spaces(os), []);
  const swap = (i: number, j: number) => {
    const next = [...list];
    [next[i], next[j]] = [next[j]!, next[i]!];
    ctx.db.transaction(() => next.forEach((s, order) => ctx.records.update<SpaceData>(s.id, { data: { order } }, 'user')));
  };
  return (
    <Sheet visible={visible} onClose={onClose} title="Reorder spaces">
      <View style={{ gap: 4 }}>
        {list.map((s, i) => (
          <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 52 }}>
            <Text numberOfLines={1} style={{ flex: 1, fontSize: 16, lineHeight: 21, fontWeight: '500', color: t.c.fg.primary }}>{s.title}</Text>
            <IconButton icon="chevron-up" filled accessibilityLabel={`Move ${s.title} up`} disabled={i === 0} onPress={() => swap(i, i - 1)} />
            <IconButton icon="chevron-down" filled accessibilityLabel={`Move ${s.title} down`} disabled={i === list.length - 1} onPress={() => swap(i, i + 1)} />
          </View>
        ))}
      </View>
    </Sheet>
  );
}
