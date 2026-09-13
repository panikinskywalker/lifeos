import React from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useLive } from '@ui/hooks';
import { Card, IconButton, Screen, Text } from '@ui/components/primitives';
import { EntityRow } from '@ui/components/EntityRow';

export default function TagRoute() {
  const router = useRouter();
  const { name } = useLocalSearchParams<{ name: string }>();
  const tag = decodeURIComponent(name ?? '');
  const items = useLive((o) => o.entities.query(null, { filter: { and: [{ field: 'tag', op: 'hasTag', value: tag }] }, sort: [{ field: 'updatedAt', dir: 'desc' }] }, { limit: 300 }), [tag]);
  return (
    <Screen title={`#${tag}`} padded={false} right={<IconButton icon="xmark" bg onPress={() => router.back()} />}>
      <Card padded={false} style={{ marginHorizontal: 16 }}>
        {items.length === 0 ? <Text color="tertiary" style={{ padding: 16 }}>Nothing tagged.</Text> : items.map((e, i) => <EntityRow key={e.id} entity={e} showType last={i === items.length - 1} />)}
      </Card>
    </Screen>
  );
}
