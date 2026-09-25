import React, { useState } from 'react';
import { ChipRow, EmptyState, FilterChip, Screen } from '@ui/kit';

const FILTERS = ['All', 'Subscriptions', 'Vehicles', 'Things', 'Chores', 'People', 'Documents'] as const;

/** Upkeep (canvas 02) — every cycle by next due. The cycle engine lands in M2. */
export default function UpkeepTab() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('All');
  return (
    <Screen tab title="Upkeep" subtitle="Everything that comes around again">
      <ChipRow>
        {FILTERS.map((f) => (
          <FilterChip key={f} label={f} selected={filter === f} onPress={() => setFilter(f)} />
        ))}
      </ChipRow>
      <EmptyState icon="repeat" tint="upkeep" title="Cycles arrive in M2" line="Services, recharges, washing, laundry — each with when it was last done and when it’s due next." />
    </Screen>
  );
}
