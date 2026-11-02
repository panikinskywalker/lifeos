import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useLive, useOS } from '@ui/hooks';
import { IconButton, RowList, Screen, Section, Segmented, SwitchField, Text } from '@ui/kit';
import { homeAreas, homeLayout, saveHomeLayout, setHomeAreas, setTileStyle, tileConfig, tileLooks, todayTiles } from '../../src/screens/homeLayout';

/** You › Home screen: what Today shows and in what order; which areas get a card. */
export default function HomeSettings() {
  const os = useOS();
  const router = useRouter();
  const layout = useLive((o) => homeLayout(o), []);
  const areas = useLive((o) => homeAreas(o), []);
  // A tile's looks are the options of its `style` config Field.
  const looks = todayTiles(os).filter((d) => tileLooks(d).length);
  const styles = useLive((o) => Object.fromEntries(looks.map((d) => [d.type, String(tileConfig(o, d.type).style)])), []);
  const name = (id: string) => os.registry.tiles.get(id)?.name ?? id;
  const modules = [...os.registry.modules.values()].filter((m) => os.registry.overviewFor(m.id));
  const move = (i: number, by: number) => {
    const next = [...layout];
    const [x] = next.splice(i, 1);
    next.splice(i + by, 0, x!);
    saveHomeLayout(os, next);
  };
  return (
    <Screen title="Home screen" subtitle="What Today shows, top to bottom" onBack={() => router.back()}>
      <Section title="Sections">
        <RowList>
          {layout.map((x, i) => (
            <View key={x.id} style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <SwitchField label={name(x.id)} hint={os.registry.tiles.get(x.id)?.description} value={!x.hidden} onChange={(v) => saveHomeLayout(os, layout.map((y) => (y.id === x.id ? { ...y, hidden: !v } : y)))} />
              </View>
              <IconButton icon="chevron-up" size={34} accessibilityLabel={`Move ${name(x.id)} up`} disabled={i === 0} onPress={() => move(i, -1)} />
              <IconButton icon="chevron-down" size={34} accessibilityLabel={`Move ${name(x.id)} down`} disabled={i === layout.length - 1} onPress={() => move(i, 1)} />
            </View>
          ))}
        </RowList>
      </Section>
      <Section title="Looks">
        <Text variant="caption" color="secondary">Some sections come in more than one look — pick the one you like.</Text>
        {looks.map((d) => (
          <View key={d.type} style={{ gap: 8 }}>
            <Text variant="label">{d.name}</Text>
            <Segmented<string> options={tileLooks(d).map((o) => ({ value: o.value, label: o.label }))} value={styles[d.type] ?? tileLooks(d)[0]!.value} onChange={(v) => setTileStyle(os, d.type, v)} />
          </View>
        ))}
      </Section>
      <Section title="Area cards">
        <Text variant="caption" color="secondary">Each shows that part of life’s number and trend; tap one on Today for its overview.</Text>
        <RowList>
          {modules.map((m) => (
            <SwitchField key={m.id} label={m.name} value={areas.includes(m.id)} onChange={(v) => setHomeAreas(os, v ? [...areas, m.id] : areas.filter((a) => a !== m.id))} />
          ))}
        </RowList>
      </Section>
    </Screen>
  );
}
