import { useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { egoGraph } from '@core/graph/read';
import { useLive, useOS } from '@ui/hooks';
import { Button, EmptyState, Screen, Segmented, Text } from '@ui/kit';
import { GraphView } from '@ui/components/GraphView';

/** The graph around a record, full screen: tap a node to walk to it, long-press (or Open) to go to its page. */
export default function GraphScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const os = useOS();
  const router = useRouter();
  const { height } = useWindowDimensions();
  const [centre, setCentre] = useState(String(id));
  const [hops, setHops] = useState<'1' | '2'>('2');
  const g = useLive((o) => egoGraph(o, centre, { hops: Number(hops), limit: 40 }), [centre, hops]);
  const e = os.entities.get(centre);
  const open = (nid: string, type: string) => router.push(`/entity/${type}/${nid}` as never);
  return (
    <Screen title={e?.title ?? 'Graph'} subtitle={g.nodes.length > 1 ? `${g.nodes.length - 1} linked · tap to walk, long-press to open` : undefined} onBack={() => router.back()} right={e ? <Button title="Open" size="sm" variant="secondary" icon="arrow-right" onPress={() => open(e.id, e.type)} /> : undefined}>
      <View style={{ gap: 12 }}>
        <Segmented<'1' | '2'> options={[{ value: '1', label: 'Direct links' }, { value: '2', label: 'Two steps out' }]} value={hops} onChange={setHops} />
        {g.nodes.length > 1 ? (
          <GraphView nodes={g.nodes} edges={g.edges} height={Math.max(360, height - 260)} onSelect={setCentre} onOpen={(n) => open(n.id, n.type)} />
        ) : (
          <EmptyState icon="link" line={`Nothing is linked to ${e?.title ?? 'this'} yet. Say something about it — who was there, where, what it’s part of — and the links appear here.`} />
        )}
        {centre !== id ? (
          <Text variant="caption" color="secondary" style={{ textAlign: 'center' }} onPress={() => setCentre(String(id))}>
            Back to {os.entities.get(String(id))?.title ?? 'the start'}
          </Text>
        ) : null}
      </View>
    </Screen>
  );
}
