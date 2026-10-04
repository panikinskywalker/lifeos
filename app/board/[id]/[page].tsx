import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { useOS } from '@ui/hooks';
import { EmptyState } from '@ui/components/primitives';

export default function BoardScreenRoute() {
  const os = useOS();
  const { id, page, ...params } = useLocalSearchParams<{ id: string; page: string }>();
  const b = os.registry.boards.get(id ?? '');
  const s = b?.screens?.find((x) => x.key === page);
  if (!b || !s) return <EmptyState icon="cube" title="Screen not found" />;
  const C = s.component;
  return <C ctx={os} params={params as Record<string, string>} />;
}
