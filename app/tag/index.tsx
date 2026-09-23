import React from 'react';
import { useRouter } from 'expo-router';
import { useLive } from '@ui/hooks';
import { EmptyState, RowItem, Screen, SectionCard } from '@ui/kit';

export default function TagsRoute() {
  const router = useRouter();
  const tags = useLive((o) => o.tags.counts(), []);
  return (
    <Screen title="Tags" onBack={() => (router.canGoBack() ? router.back() : router.replace('/browse'))}>
      {tags.length === 0 ? (
        <EmptyState icon="tag" line="Tag any record — “#car”, “#goa-trip” — and every tag gets a page here." />
      ) : (
        <SectionCard flush>
          {tags.map((tag, i) => (
            <RowItem key={tag.id} icon="tag" title={`#${tag.name}`} value={String(tag.count)} valueTone="secondary" divider={i < tags.length - 1} onPress={() => router.push(`/tag/${encodeURIComponent(tag.name)}`)} />
          ))}
        </SectionCard>
      )}
    </Screen>
  );
}
