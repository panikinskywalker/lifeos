import React from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { ObjectRecord } from '@core/domain/types';
import { useLive, useOS } from '@ui/hooks';
import { EntityRow } from '@ui/components/EntityRow';
import { EmptyState, ListGroup, Screen } from '@ui/kit';

/** Everything with one tag, grouped by record type. */
export default function TagRoute() {
  const os = useOS();
  const router = useRouter();
  const { name } = useLocalSearchParams<{ name: string }>();
  const tag = decodeURIComponent(name ?? '');
  const items = useLive((o) => o.records.query(null, { filter: { and: [{ field: 'tag', op: 'hasTag', value: tag }] }, sort: [{ field: 'updatedAt', dir: 'desc' }] }, { limit: 300 }), [tag]);
  const byType = new Map<string, ObjectRecord[]>();
  for (const e of items) byType.set(e.object, [...(byType.get(e.object) ?? []), e]);
  return (
    <Screen title={`#${tag}`} subtitle={`${items.length} ${items.length === 1 ? 'record' : 'records'}`} onBack={() => (router.canGoBack() ? router.back() : router.replace('/tag'))}>
      {items.length === 0 ? <EmptyState icon="tag" line="Nothing has this tag any more." /> : null}
      {[...byType.entries()].map(([type, list]) => (
        <ListGroup key={type} title={os.registry.objects.get(type)?.labelPlural ?? type} meta={String(list.length)}>
          {list.map((e) => (
            <EntityRow key={e.id} entity={e} />
          ))}
        </ListGroup>
      ))}
    </Screen>
  );
}
