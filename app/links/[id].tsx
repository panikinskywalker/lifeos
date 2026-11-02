import { useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { egoGraph } from '@core/graph/read';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { shortNameForModule, tintForModule } from '@ui/theme/moduleTint';
import { Button, EmptyState, Screen, Segmented, Text } from '@ui/kit';
import { LinksView } from '@ui/components/LinksView';
import { LinksCard } from '@ui/components/LinksCard';

/** Links (MODEL.md layer 5): the network around a record, tinted by module; tap walks to a record, long-press opens it; its Links in full below. */
export default function LinksScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const { height } = useWindowDimensions();
  const [centre, setCentre] = useState(String(id));
  const [hops, setHops] = useState<'1' | '2'>('2');
  const g = useLive((o) => egoGraph(o, centre, { hops: Number(hops), limit: 40 }), [centre, hops]);
  const e = useLive((o) => o.records.get(centre), [centre]);
  const open = (nid: string, type: string) => router.push(`/entity/${type}/${nid}` as never);
  const modules = [...new Set(g.nodes.filter((n) => n.hop > 0).map((n) => n.module ?? ''))];
  const back = () => (router.canGoBack() ? router.back() : router.replace('/links' as never));
  return (
    <Screen title={e?.title ?? 'Links'} subtitle={g.nodes.length > 1 ? `${g.nodes.length - 1} linked · tap to walk, hold to open` : undefined} onBack={back} right={e ? <Button title="Open" size="sm" variant="secondary" icon="arrow-right" onPress={() => open(e.id, e.object)} /> : undefined}>
      <View style={{ gap: 12 }}>
        <Segmented<'1' | '2'> options={[{ value: '1', label: 'Direct links' }, { value: '2', label: 'Two steps out' }]} value={hops} onChange={setHops} />
        {g.nodes.length > 1 ? (
          <>
            <LinksView nodes={g.nodes} edges={g.edges} height={Math.max(320, height - 360)} onSelect={setCentre} onOpen={(n) => open(n.id, n.type)} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: 4 }} accessibilityLabel="Colours by module">
              {modules.map((m) => {
                const tint = t.tints[tintForModule(m || undefined)];
                const name = m ? shortNameForModule(m, os.registry.modules.get(m)?.name ?? m) : 'Other';
                return (
                  <View key={m} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: tint.fill, borderWidth: 1, borderColor: tint.ink }} />
                    <Text variant="caption" color="secondary">{name}</Text>
                  </View>
                );
              })}
            </View>
          </>
        ) : e ? null : (
          <EmptyState icon="link" line="That record is gone." />
        )}
        {centre !== id ? (
          <Text variant="label" color="secondary" style={{ textAlign: 'center' }} onPress={() => setCentre(String(id))}>
            Back to {os.records.get(String(id))?.title ?? 'the start'}
          </Text>
        ) : null}
        {e ? <LinksCard entity={e} full /> : null}
      </View>
    </Screen>
  );
}
