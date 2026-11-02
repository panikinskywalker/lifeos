import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import type { LifeOSContext } from '@core/registry/context';
import { useLive } from '@ui/hooks';
import { Button, EmptyState, Screen, Section, TextField, useToast } from '@ui/kit';
import { backHome, KIND_WORDS, packingList, pack, stillPacked, tripPhase, type PackingList, type TripData } from '@modules/travel';
import { Hint, PackPill, PillCloud } from './parts';

/**
 * The packing picker (R7d; ASSETS-BRIEF screen 5, a first pass until
 * NR-Travel-Pack): the suggested set on top from the days and the kind of
 * place, your clothes as pills (in the wash ones faded), the things that are
 * not clothes, then Pack. Pack sets the clothes *packed* and links them to
 * the trip; when it is over, Back home puts them in the wash.
 */

const climateWord = { beach: 'beach', cold: 'cold', city: null } as const;

export function PackScreen({ ctx, params }: { ctx: LifeOSContext; params: Record<string, string> }) {
  const router = useRouter();
  const toast = useToast();
  const tripId = params.trip ?? '';
  const d = useLive((os) => {
    const trip = os.records.get<TripData>(tripId);
    return trip?.object === 'trip' ? { trip, list: packingList(os, trip), still: stillPacked(os, trip.id) } : null;
  }, [tripId]);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/module/travel/index' as never));
  if (!d) {
    return (
      <Screen title="Packing" onBack={back}>
        <EmptyState icon="bag" tint="travel" line="That trip isn’t here any more." />
      </Screen>
    );
  }
  return <Picker key={`${tripId}:${d.trip.version}`} ctx={ctx} trip={d.trip} list={d.list} still={d.still} onBack={back} toast={toast} />;
}

function Picker({ ctx, trip, list, still, onBack, toast }: { ctx: LifeOSContext; trip: { id: string; title: string; data: TripData }; list: PackingList; still: number; onBack: () => void; toast: ReturnType<typeof useToast> }) {
  const packedAlready = list.clothes.some((c) => c.packedHere);
  const [bag, setBag] = useState<Set<string>>(() => new Set(list.clothes.filter((c) => (packedAlready ? c.packedHere : c.suggested && c.state === 'clean')).map((c) => c.id)));
  const [things, setThings] = useState<Set<string>>(() => new Set(list.items.filter((i) => i.packed).map((i) => i.title)));
  const [extra, setExtra] = useState<string[]>([]);
  const [typed, setTyped] = useState('');
  const items = useMemo(() => [...list.items.map((i) => i.title), ...extra.filter((x) => !list.items.some((i) => i.title.toLowerCase() === x.toLowerCase()))], [list.items, extra]);
  const flip = <T,>(set: Set<T>, v: T) => {
    const n = new Set(set);
    if (n.has(v)) n.delete(v);
    else n.add(v);
    return n;
  };
  const addThing = () => {
    const v = typed.trim();
    if (!v) return;
    setExtra((x) => [...x, v]);
    setThings((s) => new Set(s).add(v));
    setTyped('');
  };
  const doPack = () => {
    const undo = pack(ctx, trip.id, [...bag], [...things]);
    toast.show({ message: `Packed for ${trip.data.destination}: ${bag.size + things.size}`, icon: 'bag', undo });
    onBack();
  };
  const unpack = () => {
    const r = backHome(ctx, trip.id);
    toast.show({ message: `${r.count} in the wash`, icon: 'drop', undo: r.undo });
  };
  const over = tripPhase(trip.data) === 'back';
  const shortLine = list.short.map((s) => `${KIND_WORDS[s.kind][1]}: ${s.have ? `only ${s.have} clean` : 'none clean'}`).join(' · ');
  const subtitle = [list.daysGuessed ? `${list.days} days (no dates yet)` : `${list.days} days`, climateWord[list.climate], list.abroad ? 'abroad' : null].filter(Boolean).join(' · ');

  return (
    <Screen title={`Packing · ${trip.data.destination}`} subtitle={subtitle} onBack={onBack} contentStyle={{ gap: 14 }}>
      {over && still ? <Button title={`Back home: ${still} to the wash`} icon="drop" onPress={unpack} /> : null}
      <Section title="Clothes" meta={`${bag.size} in the bag`}>
        <Hint>LifeOS suggests {list.line.split(' · ').pop()}{shortLine ? `. Short: ${shortLine}` : ''}.</Hint>
        {list.clothes.length ? (
          <PillCloud>
            {list.clothes.map((c) => {
              const away = !c.packedHere && c.state !== 'clean';
              return <PackPill key={c.id} title={c.title} state={away ? 'away' : bag.has(c.id) ? 'in' : c.suggested ? 'suggested' : 'out'} note={away ? (c.state === 'wash' ? 'in the wash' : 'packed elsewhere') : null} onPress={() => setBag((s) => flip(s, c.id))} />;
            })}
          </PillCloud>
        ) : (
          <Hint>No clothes yet. Clothes are Assets: add them in Home › Clothes and they show here.</Hint>
        )}
      </Section>
      <Section title="Things" meta={`${things.size} ticked`}>
        <PillCloud>
          {items.map((title) => {
            const from = list.items.find((i) => i.title === title)?.from;
            return <PackPill key={title} title={title} state={things.has(title) ? 'in' : 'out'} mark={from === 'brain' ? '✦' : null} note={from === 'bathroom' ? 'Bathroom' : null} onPress={() => setThings((s) => flip(s, title))} />;
          })}
        </PillCloud>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <TextField value={typed} onChange={setTyped} placeholder="Add a thing (power bank)" onSubmitEditing={addThing} returnKeyType="done" />
          </View>
          <Button title="Add" size="sm" variant="secondary" onPress={addThing} />
        </View>
        {list.items.some((i) => i.from === 'brain') ? <Hint>✦ from Claude, kept for trips like this one.</Hint> : null}
      </Section>
      <Button title={packedAlready ? 'Save the bag' : 'Pack'} icon="bag" block onPress={doPack} />
      <View style={{ height: 8 }} />
    </Screen>
  );
}
