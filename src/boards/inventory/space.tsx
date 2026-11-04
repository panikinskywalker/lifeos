import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import { useLive } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { blocks } from '@ui/theme/tokens';
import { IconButton, Screen, Text } from '@ui/kit';
import { stockState, useByWords, type SpaceData, type StockData, type StockState } from '@modules/inventory';
import { AddSheet, usePillActions } from './actions';
import { ClothesSpace } from './clothes';
import { HomeEmpty, Note, PillButton, PillCloud, SectionHead, SnapFridge, StockPill } from './parts';

/**
 * A space (NR-Home-Space, NR-Home-States): every thing as a pill, in sections
 * by what needs you: Probably gone, Use soon (with when), Fresh; one cloud
 * called Everything when nothing does. Past 40 pills the cloud goes small and
 * the fresh ones fold away. Tap = used up, hold = half left · still good ·
 * move. The Fridge has Snap the fridge (./snap). A space that holds clothes
 * draws its clothing Assets instead (./clothes, R7a).
 */

const ORDER: Record<StockState, number> = { 'probably gone': 0, 'use soon': 1, fresh: 2, 'used up': 3 };
/** Past this many pills the cloud goes small; this many fresh ones show before the rest fold away. */
const MANY = 40;
const FRESH_SHOWN = 24;

/** "dal · use today", "paneer, spinach · use by tomorrow": the use soon pills, by when. */
function whenLines(items: Array<{ s: ObjectRecord<StockData>; st: ReturnType<typeof stockState> }>): string[] {
  const by = new Map<string, string[]>();
  for (const { s, st } of items) {
    const when = useByWords(st.daysLeft);
    by.set(when, [...(by.get(when) ?? []), s.title.split(/\s+/).pop()!.toLowerCase()]);
  }
  return [...by.entries()].map(([when, names]) => `${names.join(', ')} · ${when}`);
}

export function SpaceScreen({ ctx, params }: { ctx: LifeOSContext; params: Record<string, string> }) {
  const router = useRouter();
  const t = useTheme();
  const pills = usePillActions(ctx);
  const [adding, setAdding] = useState(false);
  const [unfolded, setUnfolded] = useState(false);
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
  if (space.data.holds === 'clothes') return <ClothesSpace ctx={ctx} space={space} onBack={back} />;

  const gone = here.filter((x) => x.st.state === 'probably gone');
  const soon = here.filter((x) => x.st.state === 'use soon');
  const fresh = here.filter((x) => x.st.state === 'fresh');
  const subtitle = [`${here.length} ${here.length === 1 ? 'thing' : 'things'}`, soon.length ? `${soon.length} to use soon` : null, gone.length ? `${gone.length} probably gone` : null].filter(Boolean).join(' · ');
  const right = <IconButton icon="plus" filled={t.c.accent.mustard} color={t.c.fg.onAccent} accessibilityLabel={`Add to ${space.title}`} onPress={() => setAdding(true)} />;

  const pill = ({ s, st }: (typeof here)[number], size: 'lg' | 'sm' = 'lg') => <StockPill key={s.id} title={s.title} state={st.state} quantity={s.data.quantity} guess={st.estimated} size={size} onPress={() => pills.tap(s as ObjectRecord<StockData>)} onLongPress={() => pills.menu(s as ObjectRecord<StockData>)} />;
  const many = here.length > MANY;
  const shownFresh = unfolded ? fresh : fresh.slice(0, FRESH_SHOWN);

  return (
    <Screen title={space.title} subtitle={subtitle} onBack={back} right={right} contentStyle={{ gap: 18 }}>
      {!here.length ? (
        <HomeEmpty icon={space.data.icon ?? 'box'} title={`Nothing in the ${space.title.toLowerCase()}`} line="Add what’s here, or share an order’s invoice into LifeOS.">
          <PillButton title="Add" height={44} onPress={() => setAdding(true)} />
        </HomeEmpty>
      ) : many ? (
        <>
          <PillCloud gap={6}>
            {gone.map((x) => pill(x, 'sm'))}
            {soon.map((x) => pill(x, 'sm'))}
            {shownFresh.map((x) => pill(x, 'sm'))}
          </PillCloud>
          {fresh.length > shownFresh.length ? <PillButton title={`${fresh.length - shownFresh.length} more fresh`} raised height={44} onPress={() => setUnfolded(true)} /> : null}
        </>
      ) : (
        <>
          {gone.length ? (
            <View style={{ gap: 10 }}>
              <SectionHead title="Probably gone" sub="Past how long they keep: still there? Hold one to say it’s still good." />
              <PillCloud>{gone.map((x) => pill(x))}</PillCloud>
            </View>
          ) : null}
          {soon.length ? (
            <View style={{ gap: 10 }}>
              <SectionHead title="Use soon" sub="In the last 2 days of how long they keep" />
              <PillCloud>{soon.map((x) => pill(x))}</PillCloud>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, paddingHorizontal: 4 }}>
                {whenLines(soon).map((line) => (
                  <Text key={line} style={{ fontSize: 12, lineHeight: 16, fontWeight: '600', color: t.dark ? blocks.yellow : '#8A3A10' }}>{line}</Text>
                ))}
              </View>
            </View>
          ) : null}
          {fresh.length ? (
            <View style={{ gap: 10 }}>
              <SectionHead title={gone.length || soon.length ? 'Fresh' : 'Everything'} />
              <PillCloud>{fresh.map((x) => pill(x))}</PillCloud>
            </View>
          ) : null}
        </>
      )}
      {here.length ? <Note>Tap when it’s used up · hold for half left, still good, move. ~ is LifeOS’s guess: it can’t see you eat it, so it waits for you.</Note> : null}
      {space.title === 'Fridge' ? <SnapFridge /> : null}
      {pills.sheets}
      <AddSheet ctx={ctx} visible={adding} onClose={() => setAdding(false)} spaceId={space.id} />
    </Screen>
  );
}
