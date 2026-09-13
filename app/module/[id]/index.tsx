import React from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useOS } from '@ui/hooks';
import { EmptyState } from '@ui/components/primitives';
import { EntityListScreen } from '@ui/screens/EntityListScreen';

/** Module home: the module's own "index" screen, or its first entity list. */
export default function ModuleHomeRoute() {
  const os = useOS();
  const router = useRouter();
  const { id, ...params } = useLocalSearchParams<{ id: string }>();
  const m = os.registry.modules.get(id ?? '');
  if (!m) return <EmptyState icon="cube" title="Module not installed" action="Back" onAction={() => router.back()} />;
  const home = m.screens?.find((s) => s.key === 'index');
  if (home) {
    const C = home.component;
    return <C ctx={os} params={params as Record<string, string>} />;
  }
  const first = os.registry.typesForModule(m.id).find((x) => !x.hidden);
  if (first) return <EntityListScreen type={first.type} />;
  return <EmptyState icon={m.icon} title={m.name} body={m.description} />;
}
