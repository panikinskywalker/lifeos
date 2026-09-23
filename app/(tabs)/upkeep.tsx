import React, { useState } from 'react';
import { ChipRow, EmptyState, FilterChip, Screen } from '@ui/kit';

const FILTERS = ['All', 'Subscriptions', 'Vehicles', 'Things', 'Chores', 'People', 'Documents'] as const;

/** Upkeep — every cycle by next due. Placeholder until the cycle engine lands in M2. */
export default function UpkeepTab() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('All');
  return (
    <Screen tab title="Upkeep">
      <ChipRow>
        {FILTERS.map((f) => (
          <FilterChip key={f} label={f} selected={filter === f} onPress={() => setFilter(f)} />
        ))}
      </ChipRow>
      <EmptyState icon="repeat" tint="upkeep" line="Cycles arrive in M2: services, recharges, washing, laundry — each with last done and next due." />
    </Screen>
  );
}
