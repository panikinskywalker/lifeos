import React from 'react';
import { useRouter } from 'expo-router';
import { useLive } from '@ui/hooks';
import { EmptyState, RowItem, RowList, Screen } from '@ui/kit';

export default function TagsRoute() {
  const router = useRouter();
  const tags = useLive((o) => o.tags.counts(), []);
  return (
    <Screen title="Tags" subtitle={`${tags.length} in use`} onBack={() => (router.canGoBack() ? router.back() : router.replace('/browse'))}>
      {tags.length === 0 ? (
        <EmptyState icon="tag" line="Tag any record — “#car”, “#goa-trip” — and every tag gets a page here." />
      ) : (
        <RowList>
          {tags.map((tag) => (
            <RowItem key={tag.id} icon="tag" title={`#${tag.name}`} value={String(tag.count)} valueTone="secondary" onPress={() => router.push(`/tag/${encodeURIComponent(tag.name)}`)} chevron />
          ))}
        </RowList>
      )}
    </Screen>
  );
}
