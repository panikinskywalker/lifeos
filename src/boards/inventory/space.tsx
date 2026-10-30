import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import { useLive } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Button, IconButton, Screen, Text } from '@ui/kit';
import { stockState, type SpaceData, type StockData, type StockState } from '@modules/inventory';
import { AddSheet, usePillActions } from './actions';
import { BrainSlot, HomeEmpty, PillCloud, SectionHead, StockPill } from './parts';

/**
 * A space (HOME-BRIEF screen 2; a first pass until NR-Home-Space): every
 * thing as a pill. A flat cloud, not grouped by kind: Stock has no kind
 * Field yet (an open question for the artboard), so the cloud is ordered by
 * what needs you — probably gone, then use soon, then fresh — so the faded
 * ones that wait for you come first. Tap = used up, long-press = half left
 * · still good · move. Snap the fridge is a slot until the brain. Clothes
 * hold Assets, which arrive with R7a.
 */

const ORDER: Record<StockState, number> = { 'probably gone': 0, 'use soon': 1, fresh: 2, 'used up': 3 };

export function SpaceScreen({ ctx, params }: { ctx: LifeOSContext; params: Record<string, string> }) {
  const router = useRouter();
  const t = useTheme();
  const pills = usePillActions(ctx);
  const [adding, setAdding] = useState(false);
  const id = params.space ?? '';

  const d = useLive((os) => {
    const space = os.records.get<SpaceData>(id);
    if (space?.object !== 'space') return null;
    const now = Date.now();
    const here = os.records
      .query<StockData>('stock', { filter: { and: [{ field: 'data.spaceId', op: 'eq', value: id }] } }, { limit: 2000 })
      .filter((s) => s.data.quantity > 0)
      .map((s) => ({ s, st: stockState(s.data, now) }))
      .sort((a, b) => ORDER[a.st.state] - ORDER[b.st.state] || (a.st.daysLeft ?? 999) - (b.st.daysLeft ?? 999) || a.s.title.localeCompare(b.s.title));
    return { space, here };
  }, [id]);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/module/inventory/index' as never));
  if (!d) return <Screen title="Not found" onBack={back}><HomeEmpty title="That space isn’t here" line="It may have been removed." /></Screen>;

  const { space, here } = d;
  const counts = { gone: here.filter((x) => x.st.state === 'probably gone').length, soon: here.filter((x) => x.st.state === 'use soon').length };
  const subtitle = [`${here.length} ${here.length === 1 ? 'thing' : 'things'}`, counts.soon ? `${counts.soon} to use soon` : null, counts.gone ? `${counts.gone} probably gone` : null].filter(Boolean).join(' · ');
  const right = space.data.holds === 'clothes' ? null : <IconButton icon="plus" filled={t.c.accent.mustard} color={t.c.fg.onAccent} accessibilityLabel={`Add to ${space.title}`} onPress={() => setAdding(true)} />;

  if (space.data.holds === 'clothes') {
    return (
      <Screen title={space.title} subtitle="Clean · in the wash · packed" onBack={back} contentStyle={{ gap: 16 }}>
        <HomeEmpty icon="shirt" title="Clothes are Assets" line="They don't run out, so they aren't Stock. They arrive here with R7a, when an Asset can be clothing and kept in a space; tap will cycle clean → in the wash." />
      </Screen>
    );
  }

  const group = (state: StockState, label: string, items: typeof here) =>
    items.length ? (
      <View key={state} style={{ gap: 10 }}>
        <SectionHead title={label} sub={state === 'probably gone' ? 'Past how long they keep: still there? Hold one to say it’s still good.' : null} />
        <PillCloud>
          {items.map(({ s, st }) => (
            <StockPill key={s.id} title={s.title} state={st.state} quantity={s.data.quantity} guess={st.estimated} onPress={() => pills.tap(s as ObjectRecord<StockData>)} onLongPress={() => pills.menu(s as ObjectRecord<StockData>)} />
          ))}
        </PillCloud>
      </View>
    ) : null;

  return (
    <Screen title={space.title} subtitle={subtitle} onBack={back} right={right} contentStyle={{ gap: 18 }}>
      {here.length ? (
        <>
          {group('probably gone', 'Probably gone', here.filter((x) => x.st.state === 'probably gone'))}
          {group('use soon', 'Use soon', here.filter((x) => x.st.state === 'use soon'))}
          {group('fresh', counts.gone || counts.soon ? 'Fresh' : 'Everything', here.filter((x) => x.st.state === 'fresh'))}
          <Text style={{ fontSize: 12, lineHeight: 16, color: t.c.fg.tertiary }}>Tap when it’s used up · hold for half left, still good, move. ~ is LifeOS’s guess.</Text>
        </>
      ) : (
        <HomeEmpty icon={space.data.icon ?? 'box'} title={`Nothing in the ${space.title.toLowerCase()}`} line="Add what's here, or share an order's invoice into LifeOS.">
          <Button title="Add" size="sm" onPress={() => setAdding(true)} />
        </HomeEmpty>
      )}
      {space.title === 'Fridge' ? <BrainSlot title="Snap the fridge" line="A photo, compared with the pills: what's gone, what's new. Comes with the brain; the photo goes to Claude only when you press it." icon="camera" /> : null}
      {pills.sheets}
      <AddSheet ctx={ctx} visible={adding} onClose={() => setAdding(false)} spaceId={space.id} />
    </Screen>
  );
}
