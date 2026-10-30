import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { format } from 'date-fns';
import type { ObjectRecord } from '@core/domain/types';
import { followedScore, kitsOf, mePersonId, setAttendance, setMotm, setStats, toggleCaptain, type AppearanceData, type GameData, type Kit, type PlayerProfileData } from '@modules/games';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { monoFonts } from '@ui/theme/tokens';
import { Button, EmptyState, FilterChip, Icon, Screen, Text, useToast } from '@ui/kit';
import { usePull } from './useTurfSync';
import { ScoreSheet } from './match';
import { Crest, Display, Face, Mono, SyncPill } from './teams';
import { type Props, useBack } from './common';

/**
 * Turf · Noir, 4c Log stats (TF-MatchStats): every player's goals, assists,
 * saves, own goals and time in goal, who turned up, the captains and the
 * player of the match, by side; the score follows the goals unless it was
 * set by hand. Nothing is sent until Save, then each change goes to Turf web
 * in order (and waits on the phone while offline).
 */

const INK = '#0B0B0D';
const WHITE = '#F5F5F7';
const LIME = '#D7F55C';
const CORAL = '#FF8A7A';
const CHARCOAL = '#26262B';
const DIM = 'rgba(255,255,255,0.07)';
const HAIR = 'rgba(255,255,255,0.08)';

type Line = { goals: number; assists: number; saves: number; ownGoals: number; inGoal: boolean; attendance: AppearanceData['attendance'] };
const lineOf = (a: AppearanceData): Line => ({ goals: a.goals ?? 0, assists: a.assists ?? 0, saves: a.saves ?? 0, ownGoals: a.ownGoals ?? 0, inGoal: !!a.inGoal, attendance: a.attendance });
const sameStats = (x: Line, y: Line) => x.goals === y.goals && x.assists === y.assists && x.saves === y.saves && x.ownGoals === y.ownGoals && x.inGoal === y.inGoal;
const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

export function TurfLogStats({ params }: Props) {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const back = useBack();
  const { pull } = usePull();
  const gameId = params.game ?? '';
  const d = useLive((o) => {
    const g = o.records.get<GameData>(gameId);
    if (!g || g.object !== 'game') return null;
    const apps = o.records.query<AppearanceData>('appearance', { filter: { and: [{ field: 'data.gameId', op: 'eq', value: gameId }] } }, { limit: 500 }).filter((a) => !a.archived);
    const profiles = new Map(o.records.query<PlayerProfileData>('player', {}, { limit: 100_000 }).map((p) => [p.data.personId, p.data]));
    const names = new Map(apps.map((a) => [a.data.personId, profiles.get(a.data.personId)?.name ?? o.records.get(a.data.personId)?.title ?? 'Player']));
    const positions = new Map(apps.map((a) => [a.id, a.data.position ?? profiles.get(a.data.personId)?.position ?? null]));
    return { g, apps: apps.sort((a, b) => names.get(a.data.personId)!.localeCompare(names.get(b.data.personId)!)), names, positions, me: mePersonId(o) };
  }, [gameId]);
  const [lines, setLines] = useState<Record<string, Line>>({});
  const [captains, setCaptains] = useState<{ A?: string | null; B?: string | null }>({});
  const [motm, setMotmDraft] = useState<string | null | undefined>(undefined);
  const [open, setOpen] = useState<string | null>(null);
  const [scoring, setScoring] = useState(false);
  if (!d) {
    return (
      <Screen title="Log stats" onBack={back}>
        <EmptyState icon="target" line="That match isn’t here any more." />
      </Screen>
    );
  }
  const g = d.g.data;
  const kits = kitsOf(g);
  const line = (a: ObjectRecord<AppearanceData>) => lines[a.id] ?? lineOf(a.data);
  const edit = (a: ObjectRecord<AppearanceData>, patch: Partial<Line>) => setLines((x) => ({ ...x, [a.id]: { ...line(a), ...patch } }));
  const captainOf = (side: 'A' | 'B') => (captains[side] !== undefined ? captains[side] : (side === 'A' ? g.captainAId : g.captainBId) ?? null);
  const motmPerson = motm !== undefined ? (motm ? d.apps.find((a) => a.id === motm)?.data.personId ?? null : null) : g.motmId ?? null;
  const drafted = d.apps.map((a) => ({ ...a.data, ...line(a), ownGoals: line(a).ownGoals || undefined }));
  const statChanges = d.apps.filter((a) => !sameStats(line(a), lineOf(a.data)));
  // Like Turf web, the score follows the goals only once a goal changes; until then it is the saved one.
  const followed = g.scoreLocked || !statChanges.length ? null : followedScore(drafted);
  const score = followed ?? (g.scoreA != null && g.scoreB != null ? { scoreA: g.scoreA, scoreB: g.scoreB } : null);

  const attendanceChanges = d.apps.filter((a) => line(a).attendance !== a.data.attendance);
  const captainChanges = (['A', 'B'] as const).filter((side) => captainOf(side) !== ((side === 'A' ? g.captainAId : g.captainBId) ?? null));
  const motmChanged = motmPerson !== (g.motmId ?? null);
  const changes = statChanges.length + attendanceChanges.length + captainChanges.length + (motmChanged ? 1 : 0);

  const save = () => {
    let sent = 0;
    try {
      for (const a of attendanceChanges) if (setAttendance(os, a.id, line(a).attendance)) sent++;
      for (const a of statChanges) {
        const l = line(a);
        setStats(os, a.id, { goals: l.goals, assists: l.assists, saves: l.saves, ownGoals: l.ownGoals, inGoal: l.inGoal });
        sent++;
      }
      for (const side of captainChanges) {
        const want = captainOf(side);
        const was = (side === 'A' ? g.captainAId : g.captainBId) ?? null;
        // toggleCaptain makes someone captain of their side, or takes it off the one who has it.
        const who = d.apps.find((a) => a.data.team === side && a.data.personId === (want ?? was));
        if (who) {
          toggleCaptain(os, who.id);
          sent++;
        }
      }
      if (motmChanged && setMotm(os, d.g.id, motmPerson ? d.apps.find((a) => a.data.personId === motmPerson)?.id ?? null : null)) sent++;
      toast.show({ message: sent ? `Saved · ${sent} change${sent === 1 ? '' : 's'} sending to Turf web` : 'Nothing changed', icon: 'check' });
      if (sent) void pull(true);
      back();
    } catch (e) {
      toast.show({ message: (e as Error).message, icon: 'info' });
      if (sent) void pull(true);
    }
  };

  const played = score != null;
  const sides: Array<{ key: 'A' | 'B' | null; kit: Kit | null }> = [
    { key: 'A', kit: kits.A },
    { key: 'B', kit: kits.B },
    ...(d.apps.some((a) => !a.data.team) ? [{ key: null, kit: null }] : []),
  ];
  return (
    <Screen title="Log stats" subtitle={`Match · ${format(new Date(`${g.date}T12:00:00`), 'EEE d MMM')}`} onBack={back} right={<SyncPill />}>
      <View style={{ padding: 16, gap: 10, borderRadius: 28, backgroundColor: t.c.bg.tile }}>
        <View style={{ alignSelf: 'flex-start', height: 28, paddingHorizontal: 11, borderRadius: 999, justifyContent: 'center', backgroundColor: played ? LIME : DIM }}>
          <Text variant="labelMicro" color={played ? INK : 'secondary'}>
            {played ? 'Full time' : 'No score yet'}
          </Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={score ? `Score ${score.scoreA} to ${score.scoreB}. Set it by hand` : 'Set the score'} onPress={() => setScoring(true)} onLongPress={() => setScoring(true)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          <Crest kit={kits.A} size={48} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Display size={64} color={kits.A.text}>
              {score ? String(score.scoreA) : '–'}
            </Display>
            <Display size={36} color="rgba(245,245,247,0.22)">
              –
            </Display>
            <Display size={64} color={kits.B.text}>
              {score ? String(score.scoreB) : '–'}
            </Display>
          </View>
          <Crest kit={kits.B} size={48} />
        </Pressable>
        <Text variant="caption" color="tertiary" style={{ textAlign: 'center' }}>
          {g.scoreLocked ? 'Set by hand · tap the score to change it or follow the goals again' : 'Follows the goals you log · tap the score to set it by hand'}
        </Text>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Text variant="caption" color="tertiary" style={{ flex: 1 }}>
          {d.apps.length ? 'Tap a player to log' : 'Nobody in this match yet'}
        </Text>
        <Mono>G goals · A assists · S saves</Mono>
      </View>

      {sides.map(({ key, kit }) => {
        const list = d.apps.filter((a) => (a.data.team ?? null) === key);
        if (!list.length) return null;
        const captain = key ? captainOf(key) : null;
        const goals = key && score ? (key === 'A' ? score.scoreA : score.scoreB) : list.reduce((s, a) => s + line(a).goals, 0);
        return (
          <View key={key ?? 'none'} style={{ padding: 14, gap: 8, borderRadius: 24, backgroundColor: t.c.bg.tile }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: kit?.hex ?? DIM, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.25)' }} />
              <Display size={16} style={{ lineHeight: 16 }}>
                {kit ? kit.name : 'No side yet'}
              </Display>
              {captain ? (
                <Text variant="caption" color="tertiary" numberOfLines={1} style={{ flexShrink: 1 }}>
                  {`C · ${firstName(d.names.get(captain) ?? '')}`}
                </Text>
              ) : null}
              <Mono color="secondary" style={{ fontFamily: monoFonts[700], marginLeft: 'auto' }}>
                {key ? `${goals} goal${goals === 1 ? '' : 's'}` : 'pick teams first'}
              </Mono>
            </View>
            {list.map((a, i) => (
              <React.Fragment key={a.id}>
                {i ? <View style={{ height: 1, backgroundColor: HAIR }} /> : null}
                <PlayerLine
                  a={a}
                  l={line(a)}
                  name={d.names.get(a.data.personId) ?? 'Player'}
                  position={d.positions.get(a.id) ?? null}
                  you={a.data.personId === d.me}
                  captain={!!key && captain === a.data.personId}
                  star={motmPerson === a.data.personId}
                  open={open === a.id}
                  onToggle={() => setOpen((x) => (x === a.id ? null : a.id))}
                  onEdit={(patch) => edit(a, patch)}
                  onCaptain={key ? () => setCaptains((x) => ({ ...x, [key]: captain === a.data.personId ? null : a.data.personId })) : undefined}
                  onStar={() => setMotmDraft(motmPerson === a.data.personId ? null : a.id)}
                />
              </React.Fragment>
            ))}
          </View>
        );
      })}

      <View style={{ gap: 10 }}>
        <Button title={changes ? `Save to Turf web · ${changes}` : 'Save to Turf web'} icon="check" block disabled={!changes} onPress={save} />
        <Text variant="caption" color="tertiary">
          Scorers, captains and the player of the match show on the scorecard, the pitch and the leaders. Each change is sent in order; offline they wait on this phone.
        </Text>
        {d.apps.some((a) => !a.data.team) ? <Button title="Pick teams" icon="people" variant="secondary" block onPress={() => router.push(`/board/turf/teams?game=${d.g.id}` as never)} /> : null}
      </View>
      <ScoreSheet gameId={scoring ? d.g.id : null} onClose={() => setScoring(false)} onChanged={() => void pull(true)} />
    </Screen>
  );
}

/** One player's line: face, name, badges, the stat chips; open, the steppers and the toggles. */
function PlayerLine({ a, l, name, position, you, captain, star, open, onToggle, onEdit, onCaptain, onStar }: { a: ObjectRecord<AppearanceData>; l: Line; name: string; position: string | null; you: boolean; captain: boolean; star: boolean; open: boolean; onToggle: () => void; onEdit: (patch: Partial<Line>) => void; onCaptain?: () => void; onStar: () => void }) {
  const chips = [
    { n: l.goals, k: 'G', lime: true },
    { n: l.assists, k: 'A' },
    { n: l.saves, k: 'S' },
    { n: l.ownGoals, k: 'OG' },
  ].filter((c) => c.n > 0);
  const sub = [l.inGoal ? 'GK' : position, l.attendance === 'late' ? 'late' : l.attendance === 'no_show' ? 'no-show' : null].filter(Boolean).join(' · ');
  return (
    <View style={{ gap: 8 }}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={`${name}${chips.length ? `, ${chips.map((c) => `${c.n} ${c.k}`).join(', ')}` : ''}`} onPress={onToggle} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, opacity: l.attendance === 'no_show' ? 0.6 : 1 }}>
        <Face id={a.data.personId} name={name} size={32} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text variant="tileTitle" numberOfLines={1} style={{ fontWeight: '700', lineHeight: 20, flexShrink: 1 }}>
              {you ? `${name} (you)` : name}
            </Text>
            {captain ? (
              <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: LIME, alignItems: 'center', justifyContent: 'center' }}>
                <Text variant="labelMicro" color={INK} style={{ fontSize: 9, lineHeight: 12, fontWeight: '800' }}>
                  C
                </Text>
              </View>
            ) : null}
            {star ? (
              <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: WHITE, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="star" size={9} color={INK} />
              </View>
            ) : null}
          </View>
          {sub ? (
            <Text variant="caption" color={l.attendance === 'no_show' ? CORAL : 'tertiary'} numberOfLines={1}>
              {sub}
            </Text>
          ) : null}
        </View>
        <View style={{ flexDirection: 'row', gap: 4 }}>
          {chips.map((c) => (
            <View key={c.k} style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2, height: 22, paddingHorizontal: 7, borderRadius: 7, backgroundColor: c.lime ? 'rgba(215,245,92,0.16)' : DIM }}>
              <Text variant="labelMicro" color={c.lime ? LIME : 'secondary'} style={{ fontWeight: '800', lineHeight: 22 }}>
                {String(c.n)}
              </Text>
              <Text variant="labelMicro" color={c.lime ? LIME : 'tertiary'} style={{ fontSize: 9, lineHeight: 12, fontWeight: '700' }}>
                {c.k}
              </Text>
            </View>
          ))}
        </View>
        <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: open ? DIM : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={open ? 'chevron-up' : 'chevron-down'} size={16} color={WHITE} />
        </View>
      </Pressable>
      {open ? (
        <View style={{ borderRadius: 16, backgroundColor: DIM, padding: 12, gap: 12 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Counter label="Goals" value={l.goals} max={20} lime onChange={(goals) => onEdit({ goals })} />
            <Counter label="Assists" value={l.assists} max={20} onChange={(assists) => onEdit({ assists })} />
            <Counter label="Saves" value={l.saves} max={50} onChange={(saves) => onEdit({ saves })} />
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            <FilterChip label="Captain" icon="shield" selected={captain} onPress={onCaptain} />
            <FilterChip label="POTM" icon="star" selected={star} onPress={onStar} />
            <FilterChip label={l.ownGoals > 1 ? `Own goals · ${l.ownGoals}` : 'Own goal'} selected={l.ownGoals > 0} onPress={() => onEdit({ ownGoals: l.ownGoals ? 0 : 1 })} />
            <FilterChip label="In goal" selected={l.inGoal} onPress={() => onEdit({ inGoal: !l.inGoal })} />
          </View>
          {!onCaptain ? (
            <Text variant="caption" color="tertiary">
              Put them on a side to make them captain.
            </Text>
          ) : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {(
              [
                ['confirmed', 'On time'],
                ['late', 'Late'],
                ['no_show', 'No-show'],
              ] as const
            ).map(([v, label]) => (
              <FilterChip key={v} label={label} selected={l.attendance === v} onPress={() => onEdit({ attendance: v })} />
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

/** A stat stepper (TF-MatchStats): an 11/600 caps label over a charcoal pill of 28 discs and the number. */
function Counter({ label, value, max, lime, onChange }: { label: string; value: number; max: number; lime?: boolean; onChange: (v: number) => void }) {
  const disc = (icon: string, by: number) => (
    <Pressable accessibilityRole="button" accessibilityLabel={`${by < 0 ? 'One fewer' : 'One more'} ${label.toLowerCase()}`} disabled={value + by < 0 || value + by > max} onPress={() => onChange(value + by)} hitSlop={4} style={({ pressed }) => ({ width: 28, height: 28, borderRadius: 14, backgroundColor: DIM, alignItems: 'center', justifyContent: 'center', opacity: value + by < 0 || value + by > max ? 0.4 : pressed ? 0.7 : 1 })}>
      <Icon name={icon} size={13} color={WHITE} />
    </Pressable>
  );
  return (
    <View style={{ flex: 1, gap: 6 }}>
      <Text variant="labelCaps" color="tertiary">
        {label.toUpperCase()}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 2, padding: 3, borderRadius: 999, backgroundColor: CHARCOAL }}>
        {disc('minus', -1)}
        <Text variant="heading" color={lime && value ? LIME : WHITE} style={{ fontWeight: '800', minWidth: 24, textAlign: 'center' }} accessibilityLabel={`${label}: ${value}`}>
          {String(value)}
        </Text>
        {disc('plus', 1)}
      </View>
    </View>
  );
}
