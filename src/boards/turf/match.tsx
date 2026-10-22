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
  ATTENDANCE,
  PAYMENT_TERMS,
  type AppearanceData,
  type GameData,
  type MatchInput,
} from '@modules/games';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { fonts } from '@ui/theme/tokens';
import { Button, DateField, EmptyState, FilterChip, Icon, NumberField, RowItem, RowList, Screen, Segmented, Sheet, StatTrio, SwitchField, Text, TextField, useToast } from '@ui/kit';
import { usePull } from './useTurfSync';
import { Face, SyncPill } from './teams';

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
  const [m, setM] = useState<MatchInput>(() => (editing ? matchInputOf(os, editing) : null) ?? { date: today(), venueId: '', totalCost: 0, paymentTerms: 'postpaid', playerIds: [] });
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'available' | 'regulars' | 'guests'>('all');
  const [pickDay, setPickDay] = useState(false);
  const [otherTime, setOtherTime] = useState(false);
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
      .filter((p) => (filter === 'available' ? p.data.availability === 'AVL' : filter === 'regulars' ? !p.data.guest && p.data.availabilityMode !== 'window_only' : filter === 'guests' ? !!p.data.guest : true));
  }, [squad, search, filter, meProfile]);
  const each = splitShare(m.totalCost || 0, m.playerIds.length);
  const expected = m.expectedPlayers ?? (m.sideSize ? m.sideSize * 2 : m.playerIds.length);
  const f = ctx.format.currency;
  const venue = venues.find((v) => v.id === m.venueId);
  const label = (p: (typeof squad)[number]) => (p.id === meProfile ? 'You' : p.data.name.split(/\s+/)[0] ?? p.data.name);
  // The fronted-by chips: you and whoever usually fronts, among those picked; the rest behind "Someone else…".
  const usual = picked.filter((p) => p.id === meProfile || fronters.slice(0, 3).includes(p.data.personId)).slice(0, 3);
  const frontChips = everyone ? picked : [...usual, ...picked.filter((p) => p.id === m.frontedById && !usual.includes(p))];
  const suggested = nextOn(m.date, venue ? usualDay(os, venue.id) : null);
  const times = [...new Set([m.time, ...venues.map((v) => v.data.defaultTime)].filter((x): x is string => !!x))].sort().slice(0, 3);

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
    <Screen title={editing ? 'Edit match' : 'New match'} subtitle="Turf" onBack={back} right={<SyncPill />}>
      {card(
        'Venue',
        <>
          {wrap(
            <>
              {venues.map((v) => (
                <FilterChip key={v.id} label={v.data.name} icon={m.venueId === v.id ? 'location' : undefined} selected={m.venueId === v.id} onPress={() => pickVenue(v.id)} />
              ))}
              <FilterChip label="Add…" icon="plus" onPress={() => router.push('/board/turf/venue' as never)} />
            </>,
          )}
          {venue ? wrap([m.sideSize ? `${m.sideSize}-a-side` : null, m.totalCost ? f(m.totalCost) : null, m.time ? clock12(m.time) : null, termWord(m.paymentTerms)].filter((x): x is string => !!x).map(white)) : null}
          <Text variant="caption" color="tertiary">
            {editing ? 'Changing the venue keeps the format, cost and kick-off set below.' : 'Picking a venue fills format, usual cost and kick-off. Change any below.'}
          </Text>
        </>,
      )}

      {card(
        'When',
        <>
          {wrap(
            <>
              <FilterChip label={shortDay(m.date)} icon="calendar" selected onPress={() => setPickDay((x) => !x)} />
              {suggested ? <FilterChip label={shortDay(suggested)} onPress={() => set({ date: suggested })} /> : null}
              <FilterChip label="Pick a day" selected={pickDay} onPress={() => setPickDay((x) => !x)} />
            </>,
          )}
          {pickDay ? <DateField value={m.date} onChange={(v) => set({ date: typeof v === 'string' ? v : today() })} /> : null}
          {wrap(
            <>
              {times.map((time) => (
                <FilterChip key={time} label={clock12(time)} icon={m.time === time && !otherTime ? 'clock' : undefined} selected={m.time === time && !otherTime} onPress={() => (setOtherTime(false), set({ time }))} />
              ))}
              <FilterChip label="Other" selected={otherTime || (!m.time && !times.length)} onPress={() => setOtherTime(true)} />
            </>,
          )}
          {otherTime ? <TextField label="Kick-off" value={m.time ?? ''} onChange={(time) => set({ time })} placeholder="20:00" keyboardType="numbers-and-punctuation" /> : null}
        </>,
      )}

      {card(
        'Cost and players',
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <MoneyInput value={m.totalCost} onChange={(totalCost) => set({ totalCost })} label="Turf cost" />
            </View>
            <PillStepper value={expected} onChange={(expectedPlayers) => set({ expectedPlayers })} label="Expected players" min={1} max={30} />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text variant="caption" color="tertiary">
              Turf cost
            </Text>
            <Text variant="caption" color="tertiary">
              Expected players
            </Text>
          </View>
          {divider}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Text variant="label">Format</Text>
              <Text variant="caption" color="tertiary">
                {m.sideSize ? `${m.sideSize}-a-side` : 'Any size'}
              </Text>
            </View>
            <PillStepper value={m.sideSize ?? 0} onChange={(v) => set({ sideSize: v || undefined })} label="Players a side" min={0} max={11} />
          </View>
        </>,
      )}

      {card(
        'Payment terms',
        <>
          {wrap(
            PAYMENT_TERMS.map((x) => <FilterChip key={x.value} label={termWord(x.value as MatchInput['paymentTerms'])} selected={m.paymentTerms === x.value} onPress={() => set({ paymentTerms: x.value as MatchInput['paymentTerms'] })} />),
          )}
          <View style={{ gap: 8 }}>
            <Text variant="caption" color="secondary">
              {needsFronter(m.paymentTerms) ? 'Who fronted the money?' : 'Who fronted the money? Counts as paid'}
            </Text>
            {picked.length ? (
              wrap(
                <>
                  {!needsFronter(m.paymentTerms) ? <FilterChip label="Nobody" selected={!m.frontedById} onPress={() => set({ frontedById: undefined })} /> : null}
                  {frontChips.map((p) => {
                    const on = m.frontedById === p.id;
                    return (
                      <Pressable key={p.id} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={p.data.name} onPress={() => set({ frontedById: p.id })} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingLeft: 6, paddingRight: 12, borderRadius: 999, backgroundColor: on ? WHITE : CHARCOAL }}>
                        <Face id={p.data.personId} name={p.data.name} size={24} />
                        <Text variant="caption" color={on ? INK : WHITE} style={{ fontWeight: on ? '700' : '600' }}>
                          {label(p)}
                        </Text>
                      </Pressable>
                    );
                  })}
                  {!everyone && picked.length > frontChips.length ? <FilterChip label="Someone else…" onPress={() => setEveryone(true)} /> : null}
                </>,
              )
            ) : (
              <Text variant="caption" color="tertiary">
                Pick the players first.
              </Text>
            )}
            {m.paymentTerms === 'advance_paid' ? <MoneyInput value={m.advance ?? 0} onChange={(advance) => set({ advance })} label="Advance" hint="advance paid" /> : null}
            {m.paymentTerms === 'prepaid' && m.totalCost ? <MoneyInput value={m.totalCost} label="Paid up front" hint="paid up front" /> : null}
          </View>
        </>,
      )}

      {card(
        'Add players',
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingHorizontal: 18, borderRadius: 14, backgroundColor: t.c.bg.tile, borderWidth: 1, borderColor: HAIR }}>
            <Icon name="search" size={18} color={t.c.fg.tertiary} />
            <TextInput value={search} onChangeText={setSearch} placeholder="Name or position" placeholderTextColor={t.c.fg.tertiary} accessibilityLabel="Search the squad" style={{ flex: 1, height: 48, color: t.c.fg.primary, fontFamily: fonts[500], fontSize: 15 }} />
          </View>
          {wrap(
            (
              [
                ['all', 'All'],
                ['available', 'Available'],
                ['regulars', 'Regulars'],
                ['guests', 'Guests'],
              ] as const
            ).map(([k, l]) => <FilterChip key={k} label={l} selected={filter === k} onPress={() => setFilter(k)} />),
          )}
          {list.map((p) => {
            const on = m.playerIds.includes(p.id);
            const away = p.data.availability === 'INJ' ? 'injured' : p.data.availability === 'OOS' ? 'out' : null;
            return (
              <React.Fragment key={p.id}>
                {divider}
                <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={p.data.name} onPress={() => togglePlayer(p.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                  <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: on ? LIME : 'transparent', borderWidth: on ? 0 : 1.5, borderColor: 'rgba(245,245,247,0.22)', alignItems: 'center', justifyContent: 'center' }}>
                    {on ? <Icon name="check" size={15} color={INK} /> : null}
                  </View>
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <Text variant="rowTitle" numberOfLines={1}>
                      {p.id === meProfile ? `${p.data.name} (you)` : p.data.name}
                    </Text>
                    <Text variant="caption" color="secondary" numberOfLines={1}>
                      {[p.data.position, away, p.data.guest ? 'guest' : null].filter(Boolean).join(' · ') || ' '}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: p.data.availability === 'INJ' ? '#FF5C47' : p.data.availability === 'OOS' ? 'rgba(245,245,247,0.42)' : LIME }} />
                    <Face id={p.data.personId} name={p.data.name} size={30} />
                  </View>
                </Pressable>
              </React.Fragment>
            );
          })}
          {list.length ? null : (
            <Text variant="caption" color="tertiary">
              Nobody matches.
            </Text>
          )}
          {divider}
          <Pressable accessibilityRole="button" onPress={() => router.push('/board/turf/player-edit' as never)} style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: DIM, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="plus" size={16} />
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Text variant="rowTitle">Add someone new</Text>
              <Text variant="caption" color="secondary">
                Not in the squad yet · joins as a guest
              </Text>
            </View>
            <Icon name="chevron-right" size={18} color={t.c.fg.tertiary} />
          </Pressable>
        </>,
        <View style={{ height: 28, paddingHorizontal: 11, borderRadius: 999, justifyContent: 'center', backgroundColor: WHITE }}>
          <Text variant="labelMicro" color={INK}>{`${m.playerIds.length} of ${expected}`}</Text>
        </View>,
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

      <Button title={editing ? 'Save match' : 'Create match'} icon="check" block disabled={!m.venueId || !m.playerIds.length} onPress={save} />
      <Text variant="caption" color="tertiary">
        {editing ? 'Everyone kept keeps their team, stats and payments; shares are split again. Someone who has paid needs a refund before they can be taken off.' : 'Saved to Turf web when you tap Create; offline it waits in order.'}
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
