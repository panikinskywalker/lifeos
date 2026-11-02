import React from 'react';
import { useRouter } from 'expo-router';
import { mostLinked } from '@core/graph/read';
import { useLive, useOS } from '@ui/hooks';
import { tintForModule } from '@ui/theme/moduleTint';
import { EmptyState, RowItem, RowList, Screen, Section } from '@ui/kit';

/** Browse › Links (MODEL.md layer 5): the records with the most links, each opening its Links screen. */
export default function LinksIndex() {
  const os = useOS();
  const router = useRouter();
  const rows = useLive((o) => mostLinked(o, 30), []);
  return (
    <Screen title="Links" subtitle="How your records connect" onBack={() => (router.canGoBack() ? router.back() : router.replace('/browse'))}>
      {rows.length ? (
        <Section title="Most linked">
          <RowList>
            {rows.map((r) => {
              const def = os.registry.objects.get(r.type);
              return <RowItem key={r.id} icon={def?.icon ?? 'link'} tint={tintForModule(r.module ?? undefined)} title={r.title} subtitle={def?.label} value={`${r.links}`} meta={r.links === 1 ? 'link' : 'links'} onPress={() => router.push(`/links/${r.id}` as never)} />;
            })}
          </RowList>
        </Section>
      ) : (
        <EmptyState icon="link" line="Nothing is linked yet. Say who was there, where, or what it was for, and the links appear here." />
      )}
    </Screen>
  );
}
