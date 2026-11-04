import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { LifeOSContext } from '@core/registry/context';
import { useLive } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { blocks } from '@ui/theme/tokens';
import { Button, EmptyState, Icon, IconButton, Screen, Text, TextField, useToast, type IconName } from '@ui/kit';
import { stockState } from '@modules/inventory/stock';
import type { StockData } from '@modules/inventory/types';
import { backHome, KIND_WORDS, packingList, pack, stillPacked, tripPhase, type ClothesKind, type PackingList, type TripData } from '@modules/travel';
import { Chip28, dayLabel, Note, plural, routes, SectionHead, YELLOW_SOFT } from './parts';

/**
 * Packing (NR-Travel-Packing): what LifeOS suggests for the days and the kind
 * of place, your clothes as pills (in the wash ones faded), Home's Bathroom,
 * the other things, then the bag and Pack. Pack sets the clothes *packed* and
 * links them to the trip; when it is over, Back home puts them in the wash.
 */

const OUTLINE = 'rgba(245,245,247,0.55)';
const FADED = 'rgba(255,255,255,0.05)';
const climateWord = { beach: ', at the beach', cold: ', cold', city: '' } as const;

export function PackScreen({ ctx, params }: { ctx: LifeOSContext; params: Record<string, string> }) {
  const router = useRouter();
  const toast = useToast();
  const tripId = params.trip ?? '';
  const d = useLive((os) => {
    const trip = os.records.get<TripData>(tripId);
    if (trip?.object !== 'trip') return null;
    const list = packingList(os, trip);
    const bath = new Set(list.items.filter((i) => i.from === 'bathroom').map((i) => i.title));
    const low = bath.size && os.registry.objects.has('stock') ? os.records.query<StockData>('stock', {}, { limit: 2000 }).filter((s) => bath.has(s.title) && ['use soon', 'probably gone'].includes(stockState(s.data).state)).map((s) => s.title) : [];
    return { trip, list, still: stillPacked(os, trip.id), low };
  }, [tripId]);
  const back = () => (router.canGoBack() ? router.back() : router.replace(routes.home as never));
  if (!d) {
    return (
      <Screen title="Packing" onBack={back}>
        <EmptyState icon="bag" tint="travel" line="That trip isn’t here any more." />
      </Screen>
    );
  }
  return <Picker key={`${tripId}:${d.trip.version}`} ctx={ctx} trip={d.trip} list={d.list} still={d.still} low={d.low} onBack={back} toast={toast} />;
}

interface Suggestion {
  key: string;
  label: string;
  clothes: string[];
  thing?: string;
}

/** What LifeOS suggests: each kind of clothes it counted, then each thing that isn't from the Bathroom. */
function suggestionsOf(list: PackingList): Suggestion[] {
  const out: Suggestion[] = [];
  for (const kind of Object.keys(list.counts) as ClothesKind[]) {
    const picked = list.clothes.filter((c) => c.suggested && c.kind === kind);
    if (!picked.length) continue;
    const counted = kind === 'top' || kind === 'bottom' || kind === 'warm';
    const word = KIND_WORDS[kind][picked.length === 1 ? 0 : 1];
    out.push({ key: `kind:${kind}`, label: counted ? `${picked.length} ${word}` : word.replace(/^\w/, (c) => c.toUpperCase()), clothes: picked.map((c) => c.id) });
  }
  for (const i of list.items) if (i.from !== 'bathroom') out.push({ key: `thing:${i.title}`, label: i.title, clothes: [], thing: i.title });
  return out;
}

/** A sentence's list: "a, b and c". */
const joinAnd = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

function Picker({ ctx, trip, list, still, low, onBack, toast }: { ctx: LifeOSContext; trip: { id: string; title: string; data: TripData }; list: PackingList; still: number; low: string[]; onBack: () => void; toast: ReturnType<typeof useToast> }) {
  const t = useTheme();
  const packedAlready = list.clothes.some((c) => c.packedHere);
  const [bag, setBag] = useState<Set<string>>(() => new Set(list.clothes.filter((c) => (packedAlready ? c.packedHere : c.suggested && c.state === 'clean')).map((c) => c.id)));
  const [things, setThings] = useState<Set<string>>(() => new Set(list.items.filter((i) => i.packed).map((i) => i.title)));
  const [extra, setExtra] = useState<string[]>([]);
  const [typed, setTyped] = useState('');
  const [removed, setRemoved] = useState<Set<string>>(() => new Set());
  const suggestions = useMemo(() => suggestionsOf(list).filter((s) => !removed.has(s.key)), [list, removed]);
  const bathroom = list.items.filter((i) => i.from === 'bathroom');
  const others = useMemo(() => [...list.items.filter((i) => i.from !== 'bathroom').map((i) => i.title), ...extra.filter((x) => !list.items.some((i) => i.title.toLowerCase() === x.toLowerCase()))], [list.items, extra]);
  const flip = <T,>(set: Set<T>, v: T) => {
    const n = new Set(set);
    if (n.has(v)) n.delete(v);
    else n.add(v);
    return n;
  };
  const addAll = () => {
    setBag((s) => new Set([...s, ...suggestions.flatMap((x) => x.clothes)]));
    setThings((s) => new Set([...s, ...suggestions.flatMap((x) => (x.thing ? [x.thing] : []))]));
  };
  const removeSuggestion = (x: Suggestion) => {
    setRemoved((s) => new Set(s).add(x.key));
    setBag((s) => new Set([...s].filter((id) => !x.clothes.includes(id))));
    if (x.thing) setThings((s) => new Set([...s].filter((v) => v !== x.thing)));
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
  const days = plural(list.days, 'day');
  const inBag = [...list.clothes.filter((c) => bag.has(c.id)).map((c) => c.title), ...[...things]];
  const clean = list.clothes.filter((c) => c.state === 'clean' || c.packedHere).length;
  const learned = list.items.some((i) => i.from === 'brain');

  return (
    <Screen contentStyle={{ gap: 24 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <IconButton icon="chevron-left" accessibilityLabel="Back to the trip" filled onPress={onBack} />
        <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
          <Text variant="caption" color="secondary" numberOfLines={1}>{trip.data.destination} · {list.daysGuessed ? `${days} (no dates yet)` : days}</Text>
          <Text variant="title" accessibilityRole="header">Packing</Text>
        </View>
        {trip.data.startDate ? <Chip28 label={dayLabel(trip.data.startDate)} /> : null}
      </View>

      {over && still ? <Button title={`Back home: ${still} to the wash`} icon="drop" onPress={unpack} /> : null}

      <View style={{ padding: 16, borderRadius: 24, backgroundColor: t.c.bg.tile, gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Icon name="sparkle" size={14} color={t.c.accent.gold} />
          <Text variant="labelCaps" color={t.c.accent.gold} accessibilityRole="header" style={{ flex: 1 }}>LIFEOS SUGGESTS</Text>
          {suggestions.length ? (
            <Pressable accessibilityRole="button" onPress={addAll} hitSlop={12}>
              <Text style={{ fontSize: 13, lineHeight: 17, fontWeight: '600', color: t.c.fg.secondary }}>Add all</Text>
            </Pressable>
          ) : null}
        </View>
        <Text style={{ fontSize: 20, lineHeight: 26, fontWeight: '600', letterSpacing: -0.4 }}>
          {days}{climateWord[list.climate]}{list.abroad ? ', abroad' : ''}{suggestions.length ? ': ' : '.'}
          {suggestions.length ? <Text style={{ fontSize: 20, lineHeight: 26, fontWeight: '600', letterSpacing: -0.4, color: t.c.fg.secondary }}>{joinAnd(suggestions.map((s) => s.label.toLowerCase()))}.</Text> : null}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {suggestions.map((s) => (
            <View key={s.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingLeft: 14, paddingRight: 6, borderRadius: 999, backgroundColor: t.c.bg.tileRaised, maxWidth: '100%' }}>
              <Text numberOfLines={1} style={{ fontSize: 14, lineHeight: 18, fontWeight: '600', flexShrink: 1 }}>{s.label}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${s.label}`} onPress={() => removeSuggestion(s)} hitSlop={10} style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: t.c.bg.dim, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="x" size={12} color={t.c.fg.primary} />
              </Pressable>
            </View>
          ))}
        </View>
        {shortLine ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 16, backgroundColor: t.c.alert.coralFill }}>
            <Icon name="alert" size={16} color={t.c.alert.coralText} />
            <Text style={{ flex: 1, fontSize: 13, lineHeight: 18, fontWeight: '600', color: t.c.alert.coralText }}>Short on {shortLine}</Text>
          </View>
        ) : null}
      </View>

      <View style={{ gap: 12 }}>
        <SectionHead title="Clothes" sub="From Home › Clothes · tap to add to the bag" right={<Text style={{ fontSize: 13, lineHeight: 17, fontWeight: '600', color: t.c.fg.secondary, fontVariant: ['tabular-nums'] }}>{clean} clean</Text>} />
        {list.clothes.length ? (
          <PillCloud>
            {list.clothes.map((c) => {
              const away = !c.packedHere && c.state !== 'clean';
              if (away) return <Pill key={c.id} look="away" icon="drop" iconColor={blocks.sky} title={`${c.title} · ${c.state === 'wash' ? 'in the wash' : 'packed elsewhere'}`} />;
              const on = bag.has(c.id);
              return <Pill key={c.id} look={on ? 'in' : 'lime'} icon={on ? 'bag' : undefined} title={c.title} selected={on} onPress={() => setBag((s) => flip(s, c.id))} />;
            })}
          </PillCloud>
        ) : (
          <Text variant="caption" color="secondary" style={{ paddingHorizontal: 4 }}>No clothes yet. Clothes are Assets: add them in Home › Clothes and they show here.</Text>
        )}
      </View>

      {bathroom.length ? (
        <View style={{ gap: 12 }}>
          <SectionHead title="Bathroom" sub="From Home › Bathroom" />
          <PillCloud>
            {bathroom.map((i) => {
              const on = things.has(i.title);
              const running = low.includes(i.title);
              return <Pill key={i.title} look={on ? 'in' : running ? 'yellow' : 'out'} icon={on ? 'check' : undefined} title={running && !on ? `${i.title} · running low` : i.title} selected={on} onPress={() => setThings((s) => flip(s, i.title))} />;
            })}
          </PillCloud>
        </View>
      ) : null}

      <View style={{ gap: 12 }}>
        <SectionHead title="Things" sub={learned ? 'By kind of trip, and what Claude added' : 'By kind of trip'} />
        <PillCloud>
          {others.map((title) => {
            const on = things.has(title);
            const brain = list.items.find((i) => i.title === title)?.from === 'brain';
            return <Pill key={title} look={on ? 'in' : 'out'} icon={on ? 'check' : brain ? 'sparkle' : undefined} title={title} selected={on} onPress={() => setThings((s) => flip(s, title))} />;
          })}
        </PillCloud>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <TextField value={typed} onChange={setTyped} placeholder="Add a thing (power bank)" onSubmitEditing={addThing} returnKeyType="done" />
          </View>
          <Button title="Add" size="sm" variant="secondary" onPress={addThing} />
        </View>
      </View>

      <View style={{ padding: 16, borderRadius: 24, backgroundColor: t.c.bg.tile, gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
          <Text variant="heading" accessibilityRole="header" style={{ flex: 1 }}>The bag</Text>
          <Text style={{ fontSize: 13, lineHeight: 17, fontWeight: '600', color: t.c.fg.secondary, fontVariant: ['tabular-nums'] }}>{plural(inBag.length, 'thing')}</Text>
        </View>
        {inBag.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {inBag.map((title) => (
              <View key={title} style={{ height: 34, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1.5, borderColor: OUTLINE, justifyContent: 'center', maxWidth: '100%' }}>
                <Text numberOfLines={1} style={{ fontSize: 13, lineHeight: 17, fontWeight: '600' }}>{title}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text variant="caption" color="secondary">Nothing in the bag yet.</Text>
        )}
        <Button title={packedAlready ? 'Save the bag' : `Pack ${plural(inBag.length, 'thing')}`} icon="bag" block onPress={doPack} />
        <Text style={{ fontSize: 13, lineHeight: 18, color: t.c.fg.secondary }}>Pack marks the clothes packed in Home. Once you are back, LifeOS asks “Back home?” and moves them to in the wash.</Text>
      </View>

      <Note icon="lock">{learned ? `For this list Claude saw the trip (${trip.data.destination}, ${days}) and how many clean clothes you have. The list it learned stays on this phone for the next ${list.days}-day trip.` : `This list comes from the days and the kind of place, on this phone. Close to the trip Claude may add to it, seeing only the trip and how many clean clothes you have.`}</Note>
      <View style={{ height: 8 }} />
    </Screen>
  );
}

function PillCloud({ children }: { children: React.ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{children}</View>;
}

/** A packing pill: in the bag (outlined), clean (soft lime), out (raised), running low (soft yellow), away (faded, no tap). */
function Pill({ look, title, icon, iconColor, selected, onPress }: { look: 'in' | 'lime' | 'out' | 'yellow' | 'away'; title: string; icon?: IconName; iconColor?: string; selected?: boolean; onPress?: () => void }) {
  const t = useTheme();
  const c = { in: { bg: 'transparent', fg: t.c.fg.primary }, lime: { bg: t.c.accent.mustardSoft, fg: t.c.accent.gold }, out: { bg: t.c.bg.tileRaised, fg: t.c.fg.primary }, yellow: { bg: YELLOW_SOFT, fg: blocks.yellow }, away: { bg: FADED, fg: t.c.fg.secondary } }[look];
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ selected: !!selected, disabled: !onPress }} disabled={!onPress} onPress={onPress} hitSlop={2} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, maxWidth: '100%', paddingHorizontal: 14, borderRadius: 999, backgroundColor: c.bg, borderWidth: look === 'in' ? 1.5 : 0, borderColor: OUTLINE, opacity: pressed ? 0.75 : 1 })}>
      {icon ? <Icon name={icon} size={14} color={iconColor ?? c.fg} /> : null}
      <Text numberOfLines={1} style={{ fontSize: 14, lineHeight: 18, fontWeight: '600', color: c.fg, flexShrink: 1 }}>{title}</Text>
    </Pressable>
  );
}
