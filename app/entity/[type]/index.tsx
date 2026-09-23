import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import type { FilterClause } from '@core/domain/types';
import { EntityListScreen } from '@ui/screens/EntityListScreen';
import { useOS } from '@ui/hooks';
import { EmptyState, Screen } from '@ui/kit';

/**
 * /entity/<type>?category=..&from=..&to=..&projectId=..&personId=..&tag=..
 * Query params become an initial filter so any screen can deep-link a list.
 */
export default function EntityListRoute() {
  const os = useOS();
  const { type, ...params } = useLocalSearchParams<{ type: string; [k: string]: string }>();
  if (!type || !os.registry.hasType(type)) return (
      <Screen title="Not found">
        <EmptyState icon="box" line={`There is no record type called “${type}”.`} />
      </Screen>
    );
  const and: FilterClause[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (!v) continue;
    if (k === 'from') and.push({ field: 'data.date', op: 'gte', value: v });
    else if (k === 'to') and.push({ field: 'data.date', op: 'lte', value: v });
    else if (k === 'tag') and.push({ field: 'tag', op: 'hasTag', value: v });
    else if (k === 'personId') and.push({ field: 'relation.person', op: 'relatedTo', value: v });
    else if (k === 'status') and.push({ field: 'status', op: 'eq', value: v });
    else and.push({ field: `data.${k}`, op: 'eq', value: v });
  }
  return <EntityListScreen type={type} initialView={and.length ? { filter: { and } } : undefined} />;
}
