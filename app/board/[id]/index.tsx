import React from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useOS } from '@ui/hooks';
import { tintForModule } from '@ui/theme/moduleTint';
import { EmptyState, RowItem, RowList, Screen, Section } from '@ui/kit';

/** A browse board's home: its own 'index' screen when it has one, else its screens and quick actions as rows. */
export default function BoardRoute() {
  const os = useOS();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const b = os.registry.boards.get(id ?? '');
  const back = () => (router.canGoBack() ? router.back() : router.replace('/browse'));
  if (!b) {
    return (
      <Screen title="Not found" onBack={back}>
        <EmptyState icon="box" line="That board isn’t installed." />
      </Screen>
    );
  }
  const home = b.screens?.find((s) => s.key === 'index');
  if (home) {
    const C = home.component;
    return <C ctx={os} params={{}} />;
  }
  const tint = tintForModule(b.id);
  return (
    <Screen title={b.name} onBack={back}>
      <Section title="On this board">
        <RowList>
          {(b.screens ?? []).map((sc) => (
            <RowItem key={sc.key} icon="grid" tint={tint} title={sc.title} onPress={() => router.push(`/board/${b.id}/${sc.key}` as never)} />
          ))}
          {(b.quickActions ?? []).map((q) => (
            <RowItem key={q.id} icon={q.icon} tint={tint} title={q.label} onPress={() => (q.route ? router.push(q.route as never) : q.run?.(os))} />
          ))}
        </RowList>
      </Section>
    </Screen>
  );
}
