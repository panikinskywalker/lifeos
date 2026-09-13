import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { useOS } from '@ui/hooks';
import { EmptyState } from '@ui/components/primitives';

export default function ModuleScreenRoute() {
  const os = useOS();
  const { id, screen, ...params } = useLocalSearchParams<{ id: string; screen: string }>();
  const m = os.registry.modules.get(id ?? '');
  const s = m?.screens?.find((x) => x.key === screen);
  if (!m || !s) return <EmptyState icon="cube" title="Screen not found" />;
  const C = s.component;
  return <C ctx={os} params={params as Record<string, string>} />;
}
