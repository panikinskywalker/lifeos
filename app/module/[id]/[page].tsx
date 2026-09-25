import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { useOS } from '@ui/hooks';
import { EmptyState } from '@ui/components/primitives';

export default function ModuleScreenRoute() {
  const os = useOS();
  // The segment is [page], not [screen]: expo-router reserves `screen` for nested navigation, which made it undefined.
  const { id, page, ...params } = useLocalSearchParams<{ id: string; page: string }>();
  const m = os.registry.modules.get(id ?? '');
  const s = m?.screens?.find((x) => x.key === page);
  if (!m || !s) return <EmptyState icon="cube" title="Screen not found" />;
  const C = s.component;
  return <C ctx={os} params={params as Record<string, string>} />;
}
