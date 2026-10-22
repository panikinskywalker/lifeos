import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import type { LifeOSContext } from '@core/registry/context';
import {
  allPlayers,
  allVenues,
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
import { Button, ChipRow, DateField, EmptyState, FilterChip, NumberField, RowItem, RowList, Screen, Section, Segmented, Sheet, StatTrio, SwitchField, Text, TextField, useToast } from '@ui/kit';
import { usePull } from './useTurfSync';

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

/** New match (no `game`) or Edit match: the venue fills format, cost and kick-off; pick players; the shares split. */
export function TurfMatchForm({ ctx, params }: Props) {
  const os = useOS();
  const router = useRouter();
  const toast = useToast();
  const back = useBack();
  const { pull } = usePull();
  const editing = params.game ?? null;
  const venues = useLive((o) => allVenues(o), []);
  const squad = useLive((o) => allPlayers(o), []);
  const [m, setM] = useState<MatchInput>(() => (editing ? matchInputOf(os, editing) : null) ?? { date: today(), venueId: '', totalCost: 0, paymentTerms: 'postpaid', playerIds: [] });
  const [search, setSearch] = useState('');
  const set = (patch: Partial<MatchInput>) => setM((x) => ({ ...x, ...patch }));

  const pickVenue = (venueId: string) => set(editing ? { venueId } : { ...matchDefaults(os, venueId), venueId });
  const togglePlayer = (id: string) =>
    setM((x) => {
      const on = x.playerIds.includes(id);
      const playerIds = on ? x.playerIds.filter((p) => p !== id) : [...x.playerIds, id];
      return { ...x, playerIds, frontedById: on && x.frontedById === id ? undefined : x.frontedById };
    });

  const picked = useMemo(() => m.playerIds.map((id) => squad.find((p) => p.id === id)).filter((p): p is (typeof squad)[number] => !!p), [m.playerIds, squad]);
  const rest = useMemo(() => {
    const q = search.trim().toLowerCase();
    return squad.filter((p) => !m.playerIds.includes(p.id) && (!q || p.data.name.toLowerCase().includes(q)));
  }, [squad, m.playerIds, search]);
  const each = splitShare(m.totalCost || 0, m.playerIds.length);
  const f = ctx.format.currency;

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
      <Screen title={editing ? 'Edit match' : 'New match'} onBack={back}>
        <EmptyState icon="target" line="Your venues and players come from Turf web: connect it first." />
      </Screen>
    );
  }
  return (
    <Screen title={editing ? 'Edit match' : 'New match'} subtitle={m.playerIds.length ? `${m.playerIds.length} players · ${f(each)} each` : 'Pick a venue, then the players'} onBack={back}>
      <Section title="Venue">
        <ChipRow>
          {venues.map((v) => (
            <FilterChip key={v.id} label={v.data.name} selected={m.venueId === v.id} onPress={() => pickVenue(v.id)} />
          ))}
        </ChipRow>
      </Section>
      <Section title="When and how much">
        <View style={{ gap: 12 }}>
          <DateField label="Day" value={m.date} onChange={(v) => set({ date: typeof v === 'string' ? v : today() })} />
          <TextField label="Kick-off" value={m.time ?? ''} onChange={(time) => set({ time })} placeholder="20:00" keyboardType="numbers-and-punctuation" />
          <NumberField label="Turf cost ₹" value={m.totalCost || undefined} onChange={(v) => set({ totalCost: v ?? 0 })} placeholder="1800" />
          <NumberField label="A side" value={m.sideSize} onChange={(sideSize) => set({ sideSize })} placeholder="6" />
          <Text variant="label" color="secondary">
            Booking
          </Text>
          <ChipRow>
            {PAYMENT_TERMS.map((t) => (
              <FilterChip key={t.value} label={t.label} selected={m.paymentTerms === t.value} onPress={() => set({ paymentTerms: t.value as MatchInput['paymentTerms'] })} />
            ))}
          </ChipRow>
          {m.paymentTerms === 'advance_paid' ? <NumberField label="Advance ₹" value={m.advance} onChange={(advance) => set({ advance })} placeholder="500" /> : null}
        </View>
      </Section>
      <Section title={`Players · ${m.playerIds.length}`} meta={m.playerIds.length ? `${f(m.totalCost || 0)} ÷ ${m.playerIds.length} = ${f(each)}` : undefined}>
        {picked.length ? (
          <RowList>
            {picked.map((p) => (
              <RowItem key={p.id} icon="check-circle" iconTone="accent" tint={TINT} title={p.data.name} subtitle={p.data.position} value={f(each)} onPress={() => togglePlayer(p.id)} />
            ))}
          </RowList>
        ) : null}
        <TextField label="Add players" value={search} onChange={setSearch} placeholder="Search the squad" leading="search" />
        <RowList>
          {rest.slice(0, 40).map((p) => (
            <RowItem key={p.id} icon="circle" tint={TINT} title={p.data.name} subtitle={p.data.position} onPress={() => togglePlayer(p.id)} />
          ))}
        </RowList>
      </Section>
      {picked.length ? (
        <Section title="Who fronted the cost" meta={needsFronter(m.paymentTerms) ? 'Needed for this booking' : 'Counts as paid'}>
          <ChipRow>
            {!needsFronter(m.paymentTerms) ? <FilterChip label="Nobody" selected={!m.frontedById} onPress={() => set({ frontedById: undefined })} /> : null}
            {picked.map((p) => (
              <FilterChip key={p.id} label={p.data.name} selected={m.frontedById === p.id} onPress={() => set({ frontedById: p.id })} />
            ))}
          </ChipRow>
        </Section>
      ) : null}
      <Button title={editing ? 'Save match' : 'Make match'} icon="check" block disabled={!m.venueId || !m.playerIds.length} onPress={save} />
      <Text variant="caption" color="tertiary">
        {editing ? 'Everyone kept keeps their team, stats and payments; shares are split again. Someone who has paid needs a refund before they can be taken off.' : 'Shown here at once and sent to Turf web; it waits on this phone while you’re offline.'}
      </Text>
    </Screen>
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
