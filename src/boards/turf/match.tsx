import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { LifeOSContext } from '@core/registry/context';
import {
  allGames,
  allPlayers,
  allVenues,
  mePersonId,
  createMatch,
  editMatch,
  followGoals,
  matchDefaults,
  matchInputOf,
  needsFronter,
  setAttendance,
  setMotm,
  setScore,
  setStats,
  splitShare,
  toggleCaptain,
  turfPlayerId,
  turfVenueId,
  autoPick,
  kitOf,
  DEFAULT_KITS,
  KIT_PRESETS,
  ATTENDANCE,
  PAYMENT_TERMS,
  type AppearanceData,
  type GameData,
  type MatchInput,
} from '@modules/games';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { fonts } from '@ui/theme/tokens';
import { Button, ChipRow, DateField, EmptyState, FilterChip, Icon, NumberField, RowItem, RowList, Screen, Segmented, Sheet, StatTrio, SwitchField, Text, TextField, useToast } from '@ui/kit';
import { usePull } from './useTurfSync';
import { Crest, Face, SyncPill } from './teams';
import { BellButton } from './bell-button';
import { SearchBox } from './search';
import { PillButton } from './dues';

/**
 * The Turf board's match screens (docs/MODEL.md layer 3, *Match*; R9c.3):
 * New / Edit match, the score, and one player's night (attendance, goals,
 * assists, saves, own goals, in goal, captain, player of the match). Each
 * change shows at once and is sent to Turf web, which has the last word.
 */

type Props = { ctx: LifeOSContext; params: Record<string, string> };

const TINT = 'health' as const;
const today = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};

function useBack() {
  const router = useRouter();
  return () => (router.canGoBack() ? router.back() : router.replace('/board/turf/games' as never));
}

/* ------------------------------------------------------------------ */

/** New match (no `game`) or Edit match (TF-NewMatch): the venue fills format, cost and kick-off; pick players; the shares split. */
/** A match a player suggested, from the bell's Book it: its day, kick-off and ground, and whoever suggested or backed it. */
function fromSuggestion(os: LifeOSContext, params: Record<string, string>): MatchInput {
  const venue = allVenues(os).find((v) => params.venueTurf && turfVenueId(v.data) === params.venueTurf);
  const ids = (params.players ?? '').split(',');
  return {
    paymentTerms: 'postpaid',
    totalCost: 0,
    ...(venue ? matchDefaults(os, venue.id) : {}),
    date: params.date || today(),
    time: params.time || (venue ? matchDefaults(os, venue.id).time : undefined),
    venueId: venue?.id ?? '',
    playerIds: allPlayers(os).filter((p) => ids.includes(turfPlayerId(p.data) ?? '')).map((p) => p.id),
    suggestionId: params.suggestion,
  };
}

export function TurfMatchForm({ ctx, params }: Props) {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const back = useBack();
  const { pull } = usePull();
  const editing = params.game ?? null;
  const venues = useLive((o) => allVenues(o), []);
  const squad = useLive((o) => allPlayers(o), []);
  const me = useLive((o) => mePersonId(o), []);
  // Who has fronted before, most often first (Person ids).
  const fronters = useLive((o) => {
    const n = new Map<string, number>();
    for (const g of allGames(o)) if (g.data.frontedById) n.set(g.data.frontedById, (n.get(g.data.frontedById) ?? 0) + 1);
    return [...n.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
  }, []);
  const [m, setM] = useState<MatchInput>(() => (editing ? matchInputOf(os, editing) : null) ?? (params.suggestion ? fromSuggestion(os, params) : null) ?? { date: today(), venueId: '', totalCost: 0, paymentTerms: 'postpaid', playerIds: [] });
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'available' | 'last' | 'regulars' | 'in'>('all');
  const [showAll, setShowAll] = useState(false);
  // The squad's habits, as Turf web's New match reads them: appearances, last match's players, regulars, who said In.
  const facts = useLive((o) => {
    const games = allGames(o).filter((g) => g.id !== editing && g.data.date <= today());
    const apps = o.records.query<AppearanceData>('appearance', {}, { limit: 100_000 }).filter((a) => !a.archived && a.data.attendance !== 'no_show');
    const count = new Map<string, number>();
    for (const a of apps) count.set(a.data.personId, (count.get(a.data.personId) ?? 0) + 1);
    const last = games[0];
    const lastIds = new Set(apps.filter((a) => a.data.gameId === last?.id).map((a) => a.data.personId));
    const recent = games.slice(0, 12).map((g) => new Set(apps.filter((a) => a.data.gameId === g.id).map((a) => a.data.personId)));
    const regular = (pid: string) => recent.filter((x) => x.has(pid)).length >= Math.max(2, Math.ceil(recent.length / 3));
    const said = editing ? o.records.get<GameData>(editing)?.data.rsvps ?? {} : {};
    return { count, lastIds, lastDate: last?.data.date ?? null, regular, said };
  }, [editing]);
  const [everyone, setEveryone] = useState(false);
  const set = (patch: Partial<MatchInput>) => setM((x) => ({ ...x, ...patch }));

  const pickVenue = (venueId: string) => set(editing ? { venueId } : { ...matchDefaults(os, venueId), venueId });
  const togglePlayer = (id: string) =>
    setM((x) => {
      const on = x.playerIds.includes(id);
      const playerIds = on ? x.playerIds.filter((p) => p !== id) : [...x.playerIds, id];
      return { ...x, playerIds, frontedById: on && x.frontedById === id ? undefined : x.frontedById };
    });

  const meProfile = squad.find((p) => p.data.personId === me)?.id ?? null;
  const picked = useMemo(() => m.playerIds.map((id) => squad.find((p) => p.id === id)).filter((p): p is (typeof squad)[number] => !!p), [m.playerIds, squad]);
  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...squad]
      .sort((a, b) => (a.id === meProfile ? -1 : b.id === meProfile ? 1 : a.data.name.localeCompare(b.data.name)))
      .filter((p) => !q || p.data.name.toLowerCase().includes(q) || (p.data.position ?? '').toLowerCase().includes(q))
      .filter((p) => !m.playerIds.includes(p.id))
      .filter((p) => (filter === 'available' ? p.data.availability === 'AVL' : filter === 'last' ? facts.lastIds.has(p.data.personId) : filter === 'regulars' ? facts.regular(p.data.personId) : filter === 'in' ? facts.said[turfPlayerId(p.data) ?? ''] === 'going' : true));
  }, [squad, search, filter, meProfile, m.playerIds, facts]);
  // Taking off someone with money here: it goes with them (to their latest other match), so say so before saving.
  const paidHere = useLive((o) => (editing ? o.records.query<AppearanceData>('appearance', { filter: { and: [{ field: 'data.gameId', op: 'eq', value: editing }] } }, { limit: 500 }) : []).filter((a) => (a.data.amountPaid ?? 0) > 0), [editing]);
  const leaving = paidHere.map((a) => ({ a, p: squad.find((x) => x.data.personId === a.data.personId) })).filter(({ p }) => p && !m.playerIds.includes(p.id));
  const each = splitShare(m.totalCost || 0, m.playerIds.length);
  const expected = m.expectedPlayers ?? (m.sideSize ? m.sideSize * 2 : m.playerIds.length);
  const f = ctx.format.currency;
  const venue = venues.find((v) => v.id === m.venueId);
  const label = (p: (typeof squad)[number]) => (p.id === meProfile ? 'You' : p.data.name.split(/\s+/)[0] ?? p.data.name);
  // The fronted-by chips: you and whoever usually fronts, among those picked; the rest behind "Someone else…".
  const usual = picked.filter((p) => p.id === meProfile || fronters.slice(0, 3).includes(p.data.personId)).slice(0, 3);
  const frontChips = everyone ? picked : [...usual, ...picked.filter((p) => p.id === m.frontedById && !usual.includes(p))];
  const suggested = nextOn(m.date, venue ? usualDay(os, venue.id) : null);

  const save = () => {
    try {
      if (editing) {
        editMatch(os, editing, m);
        toast.show({ message: 'Match saved · sending to Turf web', icon: 'check' });
        void pull(true);
        back();
      } else {
        const { gameId } = createMatch(os, m);
        toast.show({ message: 'Match made · sending to Turf web', icon: 'check' });
        void pull(true);
        router.replace(`/board/turf/game?game=${gameId}` as never);
      }
    } catch (e) {
      toast.show({ message: (e as Error).message, icon: 'info' });
    }
  };

  if (!venues.length || !squad.length) {
    return (
      <Screen title={editing ? 'Edit match' : 'New match'} subtitle="Turf" onBack={back}>
        <EmptyState icon="target" line="Your venues and players come from Turf web: connect it first." />
      </Screen>
    );
  }
  const card = (title: string, children: React.ReactNode, right?: React.ReactNode) => (
    <View style={{ padding: 14, gap: 10, borderRadius: 24, backgroundColor: t.c.bg.tile }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Text variant="tileTitle" style={{ flex: 1, lineHeight: 20 }}>
          {title}
        </Text>
        {right}
      </View>
      {children}
    </View>
  );
  const wrap = (children: React.ReactNode) => <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{children}</View>;
  const white = (text: string) => (
    <View key={text} style={{ height: 28, paddingHorizontal: 11, borderRadius: 999, justifyContent: 'center', backgroundColor: WHITE }}>
      <Text variant="labelMicro" color={INK}>
        {text}
      </Text>
    </View>
  );
  const divider = <View style={{ height: 1, backgroundColor: HAIR }} />;
  return (
    <Screen title={editing ? 'Edit match' : 'New match'} subtitle="Turf" onBack={back} right={<><SyncPill /><BellButton /></>}>
      {card(
        'Venue',
        <>
          {venues.map((v, i) => {
            const on = m.venueId === v.id;
            return (
              <React.Fragment key={v.id}>
                {i > 0 ? divider : null}
                <Pressable accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={v.data.name} onPress={() => pickVenue(v.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 48 }}>
                  <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: on ? LIME : DIM, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="location" size={16} color={on ? INK : WHITE} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text variant="rowTitle" numberOfLines={1}>{v.data.name}</Text>
                    <Text variant="caption" color="secondary" numberOfLines={1}>{[v.data.sideSize ? `${v.data.sideSize}-a-side` : null, v.data.defaultCost ? f(v.data.defaultCost) : null, v.data.defaultTime ? clock12(v.data.defaultTime) : null, termWord(v.data.paymentTerms ?? 'postpaid')].filter(Boolean).join(' · ')}</Text>
                  </View>
                  <Tick on={on} />
                </Pressable>
              </React.Fragment>
            );
          })}
          {divider}
          <Pressable accessibilityRole="button" onPress={() => router.push('/board/turf/venue' as never)} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 46 }}>
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: DIM, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="plus" size={16} color={WHITE} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="rowTitle">Somewhere else</Text>
              <Text variant="caption" color="secondary">add the ground under Venues, then pick it here</Text>
            </View>
            <Icon name="chevron-right" size={18} color={t.c.fg.tertiary} />
          </Pressable>
          <Text variant="caption" color="tertiary">Picking a venue fills format, usual cost, kick-off and terms. Change any below.</Text>
          {wrap([5, 6, 7, 8, 9, 10, 11].map((n) => <FilterChip key={n} label={`${n}-a-side`} selected={m.sideSize === n} onPress={() => set({ sideSize: n, expectedPlayers: n * 2 })} />))}
        </>,
        venue ? white([venue.data.sideSize ? `${venue.data.sideSize}-a-side` : null, venue.data.defaultCost ? f(venue.data.defaultCost) : null].filter(Boolean).join(' · ') || venue.data.name) : undefined,
      )}

      {card(
        'When',
        <>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 3 }}>
              <DateField label="Day" value={m.date} onChange={(v) => set({ date: typeof v === 'string' ? v : today() })} />
            </View>
            <View style={{ flex: 2 }}>
              <TextField label="Kick-off" value={m.time ?? ''} onChange={(time) => set({ time })} placeholder="20:00" keyboardType="numbers-and-punctuation" />
            </View>
          </View>
          {wrap(
            <>
              {suggested && suggested !== m.date ? <FilterChip label={shortDay(suggested)} icon="calendar" onPress={() => set({ date: suggested })} /> : null}
              {venue?.data.defaultTime && m.time !== venue.data.defaultTime ? <FilterChip label={`${clock12(venue.data.defaultTime)} · usual here`} icon="clock" onPress={() => set({ time: venue.data.defaultTime })} /> : null}
            </>,
          )}
        </>,
        <Text variant="caption" color="secondary">{shortDay(m.date)}</Text>,
      )}

      {card(
        'Cost and players',
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <MoneyInput value={m.totalCost} onChange={(totalCost) => set({ totalCost })} label="Turf cost" />
            </View>
            <PillStepper value={expected} onChange={(expectedPlayers) => set({ expectedPlayers })} label="Expected players" min={2} max={30} />
          </View>
          <Text variant="caption" color="tertiary">{`Expected players · ${m.playerIds.length} added${m.playerIds.length && m.totalCost ? ` · ${f(each)} each` : ''}`}</Text>
        </>,
      )}

      {card(
        'Payment terms',
        <>
          {wrap(
            PAYMENT_TERMS.map((x) => <FilterChip key={x.value} label={termWord(x.value as MatchInput['paymentTerms'])} selected={m.paymentTerms === x.value} onPress={() => set({ paymentTerms: x.value as MatchInput['paymentTerms'] })} />),
          )}
          <View style={{ gap: 8 }}>
            <Text variant="caption" color="secondary">Who fronted the money?</Text>
            {picked.length ? (
              wrap(
                <>
                  {frontChips.map((p) => {
                    const on = m.frontedById === p.id;
                    return (
                      <Pressable key={p.id} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={p.data.name} onPress={() => set({ frontedById: on ? undefined : p.id })} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingLeft: 6, paddingRight: 12, borderRadius: 999, backgroundColor: on ? WHITE : CHARCOAL }}>
                        <Face id={p.data.personId} name={p.data.name} size={24} />
                        <Text variant="caption" color={on ? INK : WHITE} style={{ fontWeight: on ? '700' : '600' }}>{label(p)}</Text>
                      </Pressable>
                    );
                  })}
                  {!everyone && picked.length > frontChips.length ? <FilterChip label="Someone else…" onPress={() => setEveryone(true)} /> : null}
                  {!m.frontedById ? white('nobody yet · pick them below first') : null}
                </>,
              )
            ) : (
              <Text variant="caption" color="tertiary">nobody yet · pick them below first</Text>
            )}
            {m.paymentTerms === 'advance_paid' ? <MoneyInput value={m.advance ?? 0} onChange={(advance) => set({ advance })} label="Advance" hint="paid up front" /> : null}
            {m.paymentTerms === 'tentative' ? <Text variant="caption" color="tertiary">Tentative: no dues until it’s confirmed.</Text> : null}
          </View>
        </>,
      )}

      {card(
        'Kits',
        <>
          {(['A', 'B'] as const).map((side) => {
            const now = side === 'A' ? m.colorA ?? DEFAULT_KITS.A : m.colorB ?? DEFAULT_KITS.B;
            return (
              <View key={side} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Crest kit={kitOf(now, side === 'A' ? DEFAULT_KITS.A : DEFAULT_KITS.B)} size={32} />
                <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {KIT_PRESETS.map((k) => (
                    <Pressable key={k.hex} accessibilityRole="radio" accessibilityState={{ checked: now === k.hex }} accessibilityLabel={`Team ${side} kit ${k.name}`} onPress={() => set(side === 'A' ? { colorA: k.hex } : { colorB: k.hex })} style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: k.hex, borderWidth: now === k.hex ? 3 : 1, borderColor: now === k.hex ? WHITE : 'rgba(245,245,247,0.22)' }} />
                  ))}
                </View>
              </View>
            );
          })}
        </>,
        <Text variant="caption" color="secondary">{`${kitOf(m.colorA, DEFAULT_KITS.A).name} v ${kitOf(m.colorB, DEFAULT_KITS.B).name}`}</Text>,
      )}

      {card(
        'Add players',
        <>
          <SearchBox value={search} onChange={setSearch} placeholder="Name or position" />
          <Pressable accessibilityRole="button" onPress={() => router.push('/board/turf/player-edit' as never)} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 46 }}>
            <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: DIM, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="user" size={14} color={WHITE} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="rowTitle">Add someone new</Text>
              <Text variant="caption" color="secondary">{search.trim() ? `Add “${search.trim()}” · not in the squad yet` : 'Not in the squad yet · added as a player and picked'}</Text>
            </View>
            <Icon name="chevron-right" size={18} color={t.c.fg.tertiary} />
          </Pressable>
          <ChipRow>
            {([['all', 'Everyone'], ['available', 'Available that day'], ['last', facts.lastDate ? `Played ${shortDay(facts.lastDate)}` : 'Last match'], ['regulars', 'Regulars'], ...(Object.values(facts.said).some((x) => x === 'going') ? [['in', `Said In · ${Object.values(facts.said).filter((x) => x === 'going').length}`]] : [])] as Array<[typeof filter, string]>).map(([k, l]) => (
              <FilterChip key={k} label={l} selected={filter === k} onPress={() => setFilter(k)} />
            ))}
          </ChipRow>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text variant="caption" color="tertiary" style={{ flex: 1 }}>{`${squad.filter((p) => p.data.availability === 'AVL').length} available on ${shortDay(m.date)} · auto-pick skips the rest; tick anyone by hand`}</Text>
            {m.sideSize || m.expectedPlayers ? (
              <PillButton
                title={`Auto-pick to ${expected}`}
                icon="star"
                height={36}
                disabled={m.playerIds.length >= expected}
                onPress={() => {
                  const add = autoPick(os, m.playerIds, expected, editing ?? undefined);
                  if (!add.length) return toast.show({ message: 'Nobody else is available', icon: 'info' });
                  set({ playerIds: [...m.playerIds, ...add] });
                  toast.show({ message: `Picked ${add.length}`, icon: 'check' });
                }}
              />
            ) : null}
          </View>
          {divider}
          {picked.length ? (
            <View style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                <Text variant="label" style={{ flex: 1 }}>{`In this match · ${picked.length}`}</Text>
                <Pressable accessibilityRole="button" onPress={() => set({ playerIds: [], frontedById: undefined })}>
                  <Text variant="caption" color="tertiary">clear</Text>
                </Pressable>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {[...picked].sort((a, b) => a.data.name.localeCompare(b.data.name)).map((p) => (
                  <Pressable key={p.id} accessibilityRole="button" accessibilityLabel={`Take ${p.data.name} out`} onPress={() => togglePlayer(p.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingLeft: 4, paddingRight: 6, borderRadius: 999, backgroundColor: 'rgba(215,245,92,0.16)' }}>
                    <Face id={p.data.personId} name={p.data.name} size={26} />
                    <Text variant="caption" color={WHITE} style={{ fontWeight: '600' }}>{`${label(p)}${p.id === meProfile ? ' (you)' : ''}`}</Text>
                    <Icon name="x" size={13} color="rgba(245,245,247,0.42)" />
                  </Pressable>
                ))}
              </View>
              {divider}
            </View>
          ) : null}
          {(() => {
            const limited = !showAll && !search.trim() && filter === 'all';
            const shown = limited ? list.slice(0, 12) : list;
            return (
              <>
                {shown.map((p, i) => {
                  const letter = p.data.name[0]?.toUpperCase() ?? '#';
                  const newLetter = !limited && (i === 0 || shown[i - 1]!.data.name[0]?.toUpperCase() !== letter);
                  const apps = facts.count.get(p.data.personId) ?? 0;
                  const away = p.data.availability === 'INJ' ? 'injured' : p.data.availability === 'OOS' ? 'out of station' : null;
                  return (
                    <React.Fragment key={p.id}>
                      {newLetter ? <Text variant="labelCaps" color="tertiary" style={{ paddingTop: i ? 6 : 0 }}>{letter}</Text> : i > 0 ? divider : null}
                      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: false }} accessibilityLabel={`${p.data.name} in`} onPress={() => togglePlayer(p.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 46 }}>
                        <Tick on={false} />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text variant="rowTitle" numberOfLines={1}>{`${p.data.name}${p.id === meProfile ? ' (you)' : ''}`}</Text>
                          <Text variant="caption" color="secondary" numberOfLines={1}>{[p.data.position, `${apps} ${apps === 1 ? 'app' : 'apps'}`, facts.lastIds.has(p.data.personId) ? 'last match' : null, away].filter(Boolean).join(' · ')}</Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: p.data.availability === 'INJ' ? '#FF5C47' : p.data.availability === 'OOS' ? 'rgba(245,245,247,0.42)' : LIME }} />
                          <Face id={p.data.personId} name={p.data.name} size={30} />
                        </View>
                      </Pressable>
                    </React.Fragment>
                  );
                })}
                {!shown.length ? <Text variant="caption" color="tertiary" style={{ paddingVertical: 8 }}>{search.trim() ? 'No one by that name. Add them above.' : 'Everyone here is in.'}</Text> : null}
                {limited && list.length > shown.length ? <PillButton title={`Show all ${list.length} · A to Z`} height={40} full onPress={() => setShowAll(true)} /> : null}
                {showAll && !search.trim() && filter === 'all' ? <PillButton title="Show fewer" height={36} full onPress={() => setShowAll(false)} /> : null}
              </>
            );
          })()}
        </>,
        white(`${m.playerIds.length} of ${expected}`),
      )}

      {picked.length ? (
        card(
          'Shares',
          <>
            {picked.slice(0, 3).map((p) => (
              <React.Fragment key={p.id}>
                {divider}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                  <Face id={p.data.personId} name={p.data.name} size={30} />
                  <Text variant="rowTitle" numberOfLines={1} style={{ flex: 1 }}>
                    {p.id === meProfile ? `${p.data.name} (you)` : p.data.name}
                  </Text>
                  <Text variant="tileTitle" style={{ fontWeight: '700', lineHeight: 20 }}>
                    {m.frontedById === p.id ? 'Fronted' : f(each)}
                  </Text>
                </View>
              </React.Fragment>
            ))}
            {picked.length > 3 ? (
              <Text variant="caption" color="tertiary">
                {`…and ${picked.length - 3} more at ${f(each)}`}
              </Text>
            ) : null}
          </>,
          <Text variant="caption" color="secondary">{`${f(m.totalCost || 0)} ÷ ${picked.length}`}</Text>,
        )
      ) : null}

      {leaving.map(({ a, p }) => (
        <Text key={a.id} variant="caption" color="secondary">{`${p!.data.name}’s ${f(a.data.amountPaid ?? 0)} here goes with them, as credit on their latest other match.`}</Text>
      ))}
      <Button title={editing ? 'Save match' : 'Create match'} icon="check" block disabled={!m.venueId || !m.playerIds.length} onPress={save} />
      <Text variant="caption" color="tertiary">
        {editing ? 'Everyone kept keeps their team, stats and payments; shares are split again. Anyone taken off takes their money with them.' : 'Saved to Turf web when you tap Create; offline it waits in order.'}
      </Text>
    </Screen>
  );
}

const INK = '#0B0B0D';
const WHITE = '#F5F5F7';
const LIME = '#D7F55C';
const CHARCOAL = '#26262B';
const DIM = 'rgba(255,255,255,0.07)';
const HAIR = 'rgba(255,255,255,0.08)';

/** Turf web's words for the booking terms. */
/** Turf web's Tick: a 26 ring, lime with a check when on. */
function Tick({ on }: { on: boolean }) {
  return (
    <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: on ? LIME : 'transparent', borderWidth: on ? 0 : 1.5, borderColor: 'rgba(245,245,247,0.22)', alignItems: 'center', justifyContent: 'center' }}>
      {on ? <Icon name="check" size={15} color={INK} /> : null}
    </View>
  );
}
const termWord = (terms: MatchInput['paymentTerms']) => (terms === 'postpaid' ? 'Postpaid' : PAYMENT_TERMS.find((x) => x.value === terms)?.label ?? terms);
const shortDay = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '');
/** "20:00" → "8:00 pm". */
const clock12 = (time: string) => {
  const mm = /^(\d{1,2}):(\d{2})/.exec(time);
  if (!mm) return time;
  const h = Number(mm[1]);
  return `${h % 12 || 12}:${mm[2]} ${h < 12 ? 'am' : 'pm'}`;
};
/** The weekday (0 Sunday … 6 Saturday) a venue is usually played on, from its matches. */
function usualDay(os: LifeOSContext, venueId: string): number | null {
  const n = new Map<number, number>();
  for (const g of allGames(os)) if (g.data.venueId === venueId) n.set(new Date(`${g.data.date}T12:00:00`).getDay(), (n.get(new Date(`${g.data.date}T12:00:00`).getDay()) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}
/** The next `day` from today, when it isn't the day already chosen. */
function nextOn(chosen: string, day: number | null): string | null {
  if (day == null) return null;
  const d = new Date();
  d.setDate(d.getDate() + ((day - d.getDay() + 7) % 7));
  const iso = new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  return iso === chosen ? null : iso;
}

/** A money field (TF-NewMatch): a 30 rupee disc, the amount 16/600, a quiet hint. Read-only without `onChange`. */
function MoneyInput({ value, onChange, label, hint }: { value: number; onChange?: (v: number) => void; label: string; hint?: string }) {
  const t = useTheme();
  const [text, setText] = useState(value ? String(value) : '');
  useEffect(() => {
    if ((Number(text) || 0) !== value) setText(value ? String(value) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, paddingHorizontal: 18, borderRadius: 20, backgroundColor: t.c.bg.tile, borderWidth: 1, borderColor: HAIR }}>
      <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: DIM, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="rupee" size={14} />
      </View>
      {onChange ? (
        <TextInput
          value={text}
          onChangeText={(v) => {
            const clean = v.replace(/[^\d.]/g, '');
            setText(clean);
            onChange(Number(clean) || 0);
          }}
          keyboardType="decimal-pad"
          placeholder="0"
          placeholderTextColor={t.c.fg.tertiary}
          accessibilityLabel={label}
          style={{ flex: 1, minHeight: 54, color: t.c.fg.primary, fontFamily: fonts[600], fontSize: 16 }}
        />
      ) : (
        <Text variant="rowTitle" style={{ flex: 1 }} accessibilityLabel={label}>
          {value.toLocaleString('en-IN')}
        </Text>
      )}
      {hint ? (
        <Text variant="labelMicro" color="tertiary">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

/** The − n + pill (TF-NewMatch): 40 discs on charcoal, the number 22/700. */
function PillStepper({ value, onChange, label, min, max }: { value: number; onChange: (v: number) => void; label: string; min: number; max: number }) {
  const disc = (icon: string, by: number, what: string) => (
    <Pressable accessibilityRole="button" accessibilityLabel={`${what} ${label.toLowerCase()}`} disabled={value + by < min || value + by > max} onPress={() => onChange(Math.min(max, Math.max(min, value + by)))} style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 20, backgroundColor: DIM, alignItems: 'center', justifyContent: 'center', opacity: value + by < min || value + by > max ? 0.4 : pressed ? 0.75 : 1 })}>
      <Icon name={icon} size={16} />
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, padding: 4, borderRadius: 999, backgroundColor: CHARCOAL }}>
      {disc('minus', -1, 'Fewer')}
      <Text variant="metric" style={{ minWidth: 28, textAlign: 'center', lineHeight: 29 }} accessibilityLabel={`${label}: ${value}`}>
        {value ? String(value) : '–'}
      </Text>
      {disc('plus', 1, 'More')}
    </View>
  );
}

/* ------------------------------------------------------------------ */

/** The score by hand (it stops following the goals), or back to following them. */
export function ScoreSheet({ gameId, onClose, onChanged }: { gameId: string | null; onClose: () => void; onChanged: () => void }) {
  const os = useOS();
  const toast = useToast();
  const g = useLive((o) => (gameId ? o.records.get<GameData>(gameId) : undefined), [gameId]);
  const [a, setA] = useState<number | undefined>(undefined);
  const [b, setB] = useState<number | undefined>(undefined);
  useEffect(() => {
    setA(g?.data.scoreA);
    setB(g?.data.scoreB);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);
  if (!g) return null;
  const run = (fn: () => unknown, message: string) => {
    try {
      fn();
      toast.show({ message, icon: 'check' });
      onChanged();
      onClose();
    } catch (e) {
      toast.show({ message: (e as Error).message, icon: 'info' });
    }
  };
  return (
    <Sheet visible={!!gameId} onClose={onClose} title="Score" footer={<Button title="Save score" icon="check" block disabled={a == null || b == null} onPress={() => run(() => setScore(os, g.id, a ?? 0, b ?? 0), 'Score saved · sending to Turf web')} />}>
      <View style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <NumberField label="Team A" value={a} onChange={setA} placeholder="0" />
          </View>
          <View style={{ flex: 1 }}>
            <NumberField label="Team B" value={b} onChange={setB} placeholder="0" />
          </View>
        </View>
        <Text variant="caption" color="secondary">
          {g.data.scoreLocked ? 'Set by hand: it no longer follows the goals logged.' : 'Follows the goals logged (own goals count for the other team). Saving a score here sets it by hand.'}
        </Text>
        {g.data.scoreLocked ? <Button title="Follow the goals again" icon="refresh" variant="secondary" onPress={() => run(() => followGoals(os, g.id), 'Score follows the goals · sending')} /> : null}
      </View>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */

/** One player's night: attendance, stats, captain, player of the match. */
export function MatchPlayerSheet({ appearanceId, onClose, onChanged }: { appearanceId: string | null; onClose: () => void; onChanged: () => void }) {
  const os = useOS();
  const toast = useToast();
  const d = useLive((o) => {
    const a = appearanceId ? o.records.get<AppearanceData>(appearanceId) : undefined;
    if (!a || a.object !== 'appearance') return null;
    const g = o.records.get<GameData>(a.data.gameId);
    if (!g) return null;
    const captain = a.data.team === 'A' ? g.data.captainAId === a.data.personId : a.data.team === 'B' ? g.data.captainBId === a.data.personId : false;
    return { a, g, name: o.records.get(a.data.personId)?.title ?? 'Someone', captain, motm: g.data.motmId === a.data.personId };
  }, [appearanceId]);
  const [s, setS] = useState({ goals: 0, assists: 0, saves: 0, ownGoals: 0, inGoal: false });
  useEffect(() => {
    if (d) setS({ goals: d.a.data.goals ?? 0, assists: d.a.data.assists ?? 0, saves: d.a.data.saves ?? 0, ownGoals: d.a.data.ownGoals ?? 0, inGoal: !!d.a.data.inGoal });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appearanceId]);
  if (!d) return null;
  const run = (fn: () => unknown, message: string, close = false) => {
    try {
      if (fn() === null) return;
      toast.show({ message, icon: 'check' });
      onChanged();
      if (close) onClose();
    } catch (e) {
      toast.show({ message: (e as Error).message, icon: 'info' });
    }
  };
  const changed = s.goals !== (d.a.data.goals ?? 0) || s.assists !== (d.a.data.assists ?? 0) || s.saves !== (d.a.data.saves ?? 0) || s.ownGoals !== (d.a.data.ownGoals ?? 0) || s.inGoal !== !!d.a.data.inGoal;
  return (
    <Sheet
      visible={!!appearanceId}
      onClose={onClose}
      title={`${d.name}${d.a.data.team ? ` · Team ${d.a.data.team}` : ''}`}
      footer={<Button title="Save stats" icon="check" block disabled={!changed} onPress={() => run(() => setStats(os, d.a.id, s), 'Stats saved · sending to Turf web', true)} />}
    >
      <View style={{ gap: 14 }}>
        <Segmented options={ATTENDANCE as Array<{ value: AppearanceData['attendance']; label: string }>} value={d.a.data.attendance} onChange={(v) => run(() => setAttendance(os, d.a.id, v), 'Attendance saved · sending')} />
        <StatTrio
          stats={[
            { label: 'Goals', value: String(s.goals) },
            { label: 'Assists', value: String(s.assists) },
            { label: 'Saves', value: String(s.saves) },
          ]}
        />
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <NumberField label="Goals" value={s.goals} onChange={(v) => setS((x) => ({ ...x, goals: v ?? 0 }))} placeholder="0" />
          </View>
          <View style={{ flex: 1 }}>
            <NumberField label="Assists" value={s.assists} onChange={(v) => setS((x) => ({ ...x, assists: v ?? 0 }))} placeholder="0" />
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <NumberField label="Saves" value={s.saves} onChange={(v) => setS((x) => ({ ...x, saves: v ?? 0 }))} placeholder="0" />
          </View>
          <View style={{ flex: 1 }}>
            <NumberField label="Own goals" value={s.ownGoals} onChange={(v) => setS((x) => ({ ...x, ownGoals: v ?? 0 }))} placeholder="0" />
          </View>
        </View>
        <SwitchField label="Played in goal" value={s.inGoal} onChange={(inGoal) => setS((x) => ({ ...x, inGoal }))} />
        <RowList>
          <RowItem
            icon="shirt"
            tint={TINT}
            title={d.captain ? `Captain of team ${d.a.data.team}` : 'Make captain'}
            subtitle={d.a.data.team ? (d.captain ? 'Tap to take it off' : `Of team ${d.a.data.team}`) : 'Put them on a team first'}
            onPress={d.a.data.team ? () => run(() => toggleCaptain(os, d.a.id), d.captain ? 'Captain taken off · sending' : 'Captain · sending') : undefined}
          />
          <RowItem
            icon="star"
            tint={TINT}
            title={d.motm ? 'Player of the match' : 'Make player of the match'}
            subtitle={d.motm ? 'Tap to clear' : null}
            onPress={() => run(() => setMotm(os, d.g.id, d.motm ? null : d.a.id), d.motm ? 'Player of the match cleared · sending' : 'Player of the match · sending')}
          />
        </RowList>
      </View>
    </Sheet>
  );
}
