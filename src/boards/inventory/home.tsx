import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import { useLive } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Button, IconButton, Screen, Text } from '@ui/kit';
import { goingOffCandidates, justCameIn, runningLow, useByWords, runningOutCandidates, spaces, stockState, type StockData } from '@modules/inventory';
import { ToCheckBell } from '../../screens/ToCheckBell';
import { AddSheet, usePillActions } from './actions';
import { BrainSlot, Card, HomeEmpty, PillCloud, SectionHead, SpaceTile, StockPill, Why } from './parts';

/**
 * Home (the inventory board's index; a first pass from the kit until the
 * NR-Home-Home artboard, laid out as docs/design/HOME-BRIEF.md screen 1):
 * the header with what's in it and +, Use soon (next 2 days, most urgent
 * first), Cook tonight (a slot: it needs the brain), Running low with why and
 * the way into the shopping list, Spaces, and Just came in.
 */

export function HomeScreen({ ctx }: { ctx: LifeOSContext; params: Record<string, string> }) {
  const router = useRouter();
  const t = useTheme();
  const [adding, setAdding] = useState(false);
  const pills = usePillActions(ctx);

  const d = useLive((os) => {
    const now = Date.now();
    const all = os.records.query<StockData>('stock', {}, { limit: 5000 });
    const byId = new Map(all.map((s) => [s.id, s]));
    const inHome = all.filter((s) => s.data.quantity > 0);
    const soon = goingOffCandidates(os, now).filter((n) => {
      const st = stockState(byId.get(n.stockId)!.data, now);
      return st.state === 'probably gone' || (st.daysLeft ?? 9) <= 2;
    });
    const low = runningOutCandidates(os, now);
    const sp = spaces(os).map((s) => {
      const here = inHome.filter((x) => x.data.spaceId === s.id);
      const useSoon = here.filter((x) => stockState(x.data, now).state === 'use soon').length;
      const gone = here.filter((x) => stockState(x.data, now).state === 'probably gone').length;
      const lowN = here.filter((x) => runningLow(x.data, now).low).length;
      const hints = [useSoon ? `${useSoon} use soon` : null, gone ? `${gone} gone?` : null, lowN ? `${lowN} low` : null].filter(Boolean).join(' · ') || null;
      return { space: s, count: here.length, hints, urgent: useSoon + gone + lowN };
    });
    return { all, byId, count: inHome.length, soon, low, spaces: sp, arrival: justCameIn(os, now), onList: all.filter((s) => s.data.onList).length };
  }, []);

  const right = (
    <>
      <ToCheckBell />
      <IconButton icon="plus" filled={t.c.accent.mustard} color={t.c.fg.onAccent} accessibilityLabel="Add to Home" onPress={() => setAdding(true)} />
    </>
  );
  const usedSpaces = d.spaces.filter((s) => s.space.data.holds !== 'clothes').length;
  const header = { title: 'Home', subtitle: `${d.count} ${d.count === 1 ? 'thing' : 'things'} · ${usedSpaces} spaces`, right, onBack: () => (router.canGoBack() ? router.back() : router.replace('/browse' as never)) };
  const add = <AddSheet ctx={ctx} visible={adding} onClose={() => setAdding(false)} />;

  if (!d.all.length) {
    return (
      <Screen {...header} contentStyle={{ gap: 24 }}>
        <HomeEmpty title="Nothing at home yet" line="Your next Blinkit order fills this: share its invoice into LifeOS. Or add what's in the fridge now.">
          <Button title="Add by hand" size="sm" onPress={() => setAdding(true)} />
          <Button title="Data sources" size="sm" variant="secondary" onPress={() => router.push('/settings/sources' as never)} />
        </HomeEmpty>
        {add}
      </Screen>
    );
  }

  const stock = (id: string) => d.byId.get(id) as ObjectRecord<StockData>;
  return (
    <Screen {...header} contentStyle={{ gap: 14 }}>
      {d.soon.length ? (
        <>
          <SectionHead title="Use soon" sub="Going off in the next 2 days" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: 2 }} style={{ marginHorizontal: -2 }}>
            {d.soon.map((n) => {
              const s = stock(n.stockId);
              const st = stockState(s.data);
              return (
                <View key={n.stockId} style={{ width: 168, padding: 12, borderRadius: 20, backgroundColor: t.c.bg.tile, gap: 8 }}>
                  <StockPill title={s.title} state={st.state} quantity={s.data.quantity} guess={n.estimated} size="sm" onPress={() => pills.tap(s)} onLongPress={() => pills.menu(s)} />
                  <Why urgent={n.urgent}>{useByWords(st.daysLeft)}</Why>
                </View>
              );
            })}
          </ScrollView>
        </>
      ) : null}

      <BrainSlot title="Cook tonight" line="A dish from what's fresh and what to use soon. Comes with the brain (layer 8)." icon="food" />

      <SectionHead title="Running low" sub={d.low.length ? 'From how often you rebuy' : 'Nothing running low'} action={d.onList ? `List · ${d.onList}` : 'Shopping list'} onAction={() => router.push('/module/inventory/list' as never)} />
      {d.low.length ? (
        <Card gap={10}>
          {d.low.slice(0, 6).map((n) => {
            const s = stock(n.stockId);
            return (
              <View key={n.stockId} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <StockPill title={s.title} state={stockState(s.data).state} quantity={s.data.quantity} size="sm" onPress={() => pills.tap(s)} onLongPress={() => pills.menu(s)} />
                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                  <Why>{n.why}</Why>
                </View>
              </View>
            );
          })}
          <Button title="Shopping list" icon="cart" size="sm" variant="secondary" onPress={() => router.push('/module/inventory/list' as never)} />
        </Card>
      ) : null}

      <SectionHead title="Spaces" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {d.spaces.map((s) => (
          <SpaceTile key={s.space.id} name={s.space.title} icon={s.space.data.icon ?? 'box'} count={s.count} hints={s.space.data.holds === 'clothes' ? 'with Assets, soon' : s.hints} onPress={() => router.push({ pathname: '/module/[id]/[page]', params: { id: 'inventory', page: 'space', space: s.space.id } } as never)} />
        ))}
        {d.spaces.length % 2 ? <View style={{ flexBasis: '46%', flexGrow: 1 }} /> : null}
      </View>

      {d.arrival ? (
        <>
          <SectionHead title="Just came in" />
          <Card>
            <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: '600', color: t.c.fg.primary }}>
              {[d.arrival.shop, d.arrival.amount != null ? ctx.format.currency(d.arrival.amount) : null, `${ctx.format.date(d.arrival.at, 'relative')} ${ctx.format.time(d.arrival.at)}`, `${d.arrival.things.length} ${d.arrival.things.length === 1 ? 'thing' : 'things'}`].filter(Boolean).join(' · ')}
            </Text>
            <PillCloud>
              {d.arrival.things.map((x) => {
                const s = d.byId.get(x.id);
                return s ? <StockPill key={x.id} title={s.title} state={stockState(s.data).state} quantity={x.quantity} size="sm" onPress={() => pills.open(s)} /> : null;
              })}
            </PillCloud>
          </Card>
        </>
      ) : null}
      <Text style={{ fontSize: 12, lineHeight: 16, color: t.c.fg.tertiary, textAlign: 'center', paddingTop: 4 }}>
        Tap a pill when it’s used up · hold it for half left, still good, move
      </Text>
      {pills.sheets}
      {add}
    </Screen>
  );
}
