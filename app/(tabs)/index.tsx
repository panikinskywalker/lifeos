import React, { useEffect, useState } from 'react';
import { InteractionManager, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { format } from 'date-fns';
import type { TileDef } from '@core/registry/types';
import { useLive, useOS } from '@ui/hooks';
import { BentoGrid, Icon, IconButton, Screen, Text } from '@ui/kit';
import { ToCheckBell } from '../../src/screens/ToCheckBell';
import { homeLayout, tileConfig } from '../../src/screens/homeLayout';
import { MorningBrief } from '../../src/screens/MorningBrief';
import { DemoNote } from '../../src/screens/DemoNote';

function greeting(d = new Date()) {
  const h = d.getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

/**
 * Today (docs/MODEL.md layer 5, *What Today is made of*): the Morning brief,
 * then the tiles boards register, in your order (You › Home screen). Today
 * lays them out and reads nothing else: each tile reads its own data.
 */
export default function TodayTab() {
  const router = useRouter();
  const os = useOS();
  // Your layout; re-read whenever settings change.
  const layout = useLive((o) => homeLayout(o), []);
  // Cold start: the first screenful now, the rest once it's on screen.
  const [rest, setRest] = useState(false);
  useEffect(() => {
    const h = InteractionManager.runAfterInteractions(() => setRest(true));
    return () => h.cancel();
  }, []);
  const shown = layout.map((x) => (x.hidden ? null : os.registry.tiles.get(x.id))).filter((d): d is TileDef => !!d);

  // Pair small tiles into rows; medium tiles take a row of their own.
  const rows: TileDef[][] = [];
  for (const d of shown) {
    const last = rows[rows.length - 1];
    if (d.defaultSize === 'small' && last && last.length === 1 && last[0]!.defaultSize === 'small') last.push(d);
    else rows.push([d]);
  }

  return (
    <Screen
      tab
      compact
      title={greeting()}
      subtitle={format(new Date(), 'EEEE d MMM')}
      right={
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <ToCheckBell />
          <IconButton icon="user-circle" accessibilityLabel="You" filled onPress={() => router.navigate('/you')} />
        </View>
      }
    >
      <DemoNote />
      <MorningBrief />
      {(rest ? rows : rows.slice(0, 3)).map((r) =>
        r.length === 2 ? (
          <BentoGrid key={r.map((d) => d.type).join()}>
            {r.map((d) => (
              <TodayTile key={d.type} def={d} />
            ))}
          </BentoGrid>
        ) : (
          <TodayTile key={r[0]!.type} def={r[0]!} alone />
        ),
      )}
      <Pressable accessibilityRole="button" onPress={() => router.push('/settings/home' as never)} style={{ alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, padding: 10 }}>
        <Icon name="edit" size={14} />
        <Text variant="caption" color="secondary">Choose what’s on Today</Text>
      </Pressable>
    </Screen>
  );
}

/** One registered tile. `alone`: it has the row to itself, so a small tile draws medium (People and Home their wide 4 × 2). */
function TodayTile({ def, alone }: { def: TileDef; alone?: boolean }) {
  const os = useOS();
  const config = useLive((o) => tileConfig(o, def.type), [def.type]);
  const C = def.component;
  return <C size={alone && def.sizes.includes('medium') ? 'medium' : def.defaultSize} config={config} ctx={os} />;
}
