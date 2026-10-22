import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import { allOrgs, allPlaces, mapsLink, parentChain, visitsOf, PLACE_KINDS, type PlaceData } from '@modules/places';
import { useLive } from '@ui/hooks';
import { Button, ChipRow, EmptyState, FilterChip, Screen } from '@ui/kit';
import { kindIcon, kindLabel, PlaceCard, PlaceHeader } from './art';
import { placeLine } from './sections';

/**
 * Places (the board's home, R3): your places by city — a Header · a place
 * for each city, then its Place · cards, most visited first — with a chip
 * per kind. Countries, cities and areas are the headers, not cards.
 */

type Props = { ctx: LifeOSContext; params: Record<string, string> };
const CONTAINERS = new Set(['city', 'country']);

interface Group {
  city: ObjectRecord<PlaceData> | null;
  places: Array<{ p: ObjectRecord<PlaceData>; visits: number; line: string }>;
}

export function PlacesHome({ ctx }: Props) {
  const router = useRouter();
  const [kind, setKind] = useState<string | null>(null);
  const data = useLive(
    (os) => {
      const places = allPlaces(os);
      const groups = new Map<string, Group>();
      for (const p of places) {
        if (CONTAINERS.has(p.data.kind) || (kind && p.data.kind !== kind)) continue;
        const city = parentChain(os, p).find((x) => x.data.kind === 'city') ?? null;
        const key = city?.id ?? '';
        if (!groups.has(key)) groups.set(key, { city, places: [] });
        groups.get(key)!.places.push({ p, visits: visitsOf(os, p.id, { inside: true }).length, line: placeLine(os, p) });
      }
      const list = [...groups.values()];
      for (const g of list) g.places.sort((a, b) => b.visits - a.visits || a.p.title.localeCompare(b.p.title));
      list.sort((a, b) => (a.city ? 0 : 1) - (b.city ? 0 : 1) || b.places.reduce((n, x) => n + x.visits, 0) - a.places.reduce((n, x) => n + x.visits, 0));
      const kinds = PLACE_KINDS.filter((k) => !CONTAINERS.has(k.value) && places.some((p) => p.data.kind === k.value));
      return { groups: list, kinds, places: places.length, orgs: allOrgs(os).length };
    },
    [kind],
  );
  const back = () => (router.canGoBack() ? router.back() : router.replace('/browse'));
  const open = (id: string) => router.push(`/entity/place/${id}` as never);
  return (
    <Screen title="Places" subtitle={`${data.places} places · ${data.orgs} organisations`} onBack={back}>
      {data.kinds.length > 1 ? (
        <ChipRow>
          <FilterChip label="All" selected={!kind} onPress={() => setKind(null)} />
          {data.kinds.map((k) => (
            <FilterChip key={k.value} label={k.label} icon={k.icon} selected={kind === k.value} onPress={() => setKind(kind === k.value ? null : k.value)} />
          ))}
        </ChipRow>
      ) : null}
      {!data.groups.length ? (
        <View style={{ gap: 12 }}>
          <EmptyState icon="location" line="Places come from your calendar, booking mails and what you say (“dinner at Toit in Indiranagar”)." />
          <Button title="Add a place" icon="plus" onPress={() => router.push('/entity/place/new' as never)} />
        </View>
      ) : (
        data.groups.map((g) => (
          <View key={g.city?.id ?? 'elsewhere'} style={{ gap: 10 }}>
            <PlaceHeader title={g.city?.title ?? 'Elsewhere'} sub={g.city ? parentChain(ctx, g.city).map((x) => x.title).join(' · ') || `${g.places.length} places` : `${g.places.length} places`} share={g.city ? `${g.city.title} ${mapsLink(g.city)}` : null} />
            {g.places.map(({ p, visits, line }) => (
              <PlaceCard key={p.id} place={p} badge={{ icon: kindIcon(p.data.kind), color: '#F6E27F', label: visits ? `${visits} visit${visits === 1 ? '' : 's'}` : kindLabel(p.data.kind) }} pill={kindLabel(p.data.kind)} line={line || null} onPress={() => open(p.id)} />
            ))}
          </View>
        ))
      )}
    </Screen>
  );
}
