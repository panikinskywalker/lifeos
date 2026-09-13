import React from 'react';
import { useRouter } from 'expo-router';
import { useLive } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Card, IconButton, Row, Screen, Text } from '@ui/components/primitives';

export default function TagsRoute() {
  const router = useRouter();
  const t = useTheme();
  const tags = useLive((o) => o.tags.counts(), []);
  return (
    <Screen title="Tags" padded={false} right={<IconButton icon="xmark" bg onPress={() => router.back()} />}>
      <Card padded={false} style={{ marginHorizontal: 16 }}>
        {tags.length === 0 ? <Text color="tertiary" style={{ padding: 16 }}>Tag any record to see it here.</Text> : tags.map((tag, i) => <Row key={tag.id} title={`#${tag.name}`} icon="tag" iconColor={tag.color ?? t.colors.accents.yellow} value={String(tag.count)} last={i === tags.length - 1} onPress={() => router.push(`/tag/${encodeURIComponent(tag.name)}`)} />)}
      </Card>
    </Screen>
  );
}
