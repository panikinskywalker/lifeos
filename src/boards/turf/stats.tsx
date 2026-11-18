import React, { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import type { ObjectRecord } from '@core/domain/types';
import { followGoals, followedScore, kitsOf, mePersonId, setMotm, setScore, setStats, toggleCaptain, type AppearanceData, type GameData, type Kit, type PlayerProfileData } from '@modules/games';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { displayFont } from '@ui/theme/tokens';
import { Button, EmptyState, FilterChip, Icon, Screen, Text, useToast } from '@ui/kit';
import { usePull } from './useTurfSync';
import { Crest, Display, Face, Mono, SyncPill } from './teams';
import { type Props, useBack } from './common';
import { SearchBox, found } from './search';
import { BellButton } from './bell-button';

/**
 * Log stats, 1:1 with Turf web's LogStats sheet (app/ui/match-sheets.tsx):
 * the score (follows the goals, or set by hand), then each side's players with
 * goals, assists, saves, own goals, kept goal, captain and player of the match.
 * On the phone nothing is sent until Done, then each change goes to Turf web in
 * order (and waits on the phone while offline). Who turned up is set from the
 * match (tap a player in Team view), as on Turf web's checklist.
 */

const INK = '#0B0B0D';
const WHITE = '#F5F5F7';
const LIME = '#D7F55C';
const CHARCOAL = '#26262B';
const HAIR = 'rgba(255,255,255,0.08)';

type Line = { goals: number; assists: number; saves: number; ownGoals: number; inGoal: boolean; attendance: AppearanceData['attendance'] };
const lineOf = (a: AppearanceData): Line => ({ goals: a.goals ?? 0, assists: a.assists ?? 0, saves: a.saves ?? 0, ownGoals: a.ownGoals ?? 0, inGoal: !!a.inGoal, attendance: a.attendance });
const sameStats = (x: Line, y: Line) => x.goals === y.goals && x.assists === y.assists && x.saves === y.saves && x.ownGoals === y.ownGoals && x.inGoal === y.inGoal;
const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

export function TurfLogStats({ params }: Props) {
  const os = useOS();
  const t = useTheme();
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
    return { g, apps: apps.sort((a, b) => names.get(a.data.personId)!.localeCompare(names.get(b.data.personId)!)), names, me: mePersonId(o) };
  }, [gameId]);
  const [lines, setLines] = useState<Record<string, Line>>({});
  const [captains, setCaptains] = useState<{ A?: string | null; B?: string | null }>({});
  const [motm, setMotmDraft] = useState<string | null | undefined>(undefined);
  const [open, setOpen] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [override, setOverride] = useState(false);
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  if (!d) {
    return (
      <Screen title="Log stats" onBack={back}>
        <EmptyState icon="target" line="That match isn’t here any more." />
      </Screen>
    );
  }
  const g = d.g.data;
  const kits = kitsOf(g);
  const line = (x: ObjectRecord<AppearanceData>) => lines[x.id] ?? lineOf(x.data);
  const edit = (x: ObjectRecord<AppearanceData>, patch: Partial<Line>) => setLines((m) => ({ ...m, [x.id]: { ...line(x), ...patch } }));
  const captainOf = (side: 'A' | 'B') => (captains[side] !== undefined ? captains[side] : (side === 'A' ? g.captainAId : g.captainBId) ?? null);
  const motmPerson = motm !== undefined ? (motm ? d.apps.find((x) => x.id === motm)?.data.personId ?? null : null) : g.motmId ?? null;
  const drafted = d.apps.map((x) => ({ ...x.data, ...line(x), ownGoals: line(x).ownGoals || undefined }));
  const statChanges = d.apps.filter((x) => !sameStats(line(x), lineOf(x.data)));
  // Like Turf web, the score follows the goals only once a goal changes; until then it is the saved one.
  const followed = g.scoreLocked || !statChanges.length ? null : followedScore(drafted);
  const score = followed ?? (g.scoreA != null && g.scoreB != null ? { scoreA: g.scoreA, scoreB: g.scoreB } : null);
  const captainChanges = (['A', 'B'] as const).filter((side) => captainOf(side) !== ((side === 'A' ? g.captainAId : g.captainBId) ?? null));
  const motmChanged = motmPerson !== (g.motmId ?? null);
  const changes = statChanges.length + captainChanges.length + (motmChanged ? 1 : 0);

  // Done: each change goes to Turf web in order (offline, it waits on this phone).
  const done = () => {
    let sent = 0;
    try {
      for (const x of statChanges) {
        const l = line(x);
        setStats(os, x.id, { goals: l.goals, assists: l.assists, saves: l.saves, ownGoals: l.ownGoals, inGoal: l.inGoal });
        sent++;
      }
      for (const side of captainChanges) {
        const want = captainOf(side);
        const was = (side === 'A' ? g.captainAId : g.captainBId) ?? null;
        // toggleCaptain makes someone captain of their side, or takes it off the one who has it.
        const who = d.apps.find((x) => x.data.team === side && x.data.personId === (want ?? was));
        if (who) {
          toggleCaptain(os, who.id);
          sent++;
        }
      }
      if (motmChanged && setMotm(os, d.g.id, motmPerson ? d.apps.find((x) => x.data.personId === motmPerson)?.id ?? null : null)) sent++;
      if (sent) {
        toast.show({ message: `Saved · ${sent} change${sent === 1 ? '' : 's'} sending to Turf web`, icon: 'check' });
        void pull(true);
      }
      back();
    } catch (e) {
      toast.show({ message: (e as Error).message, icon: 'info' });
      if (sent) void pull(true);
    }
  };
  const scoreBy = (run: () => unknown, message: string) => {
    try {
      run();
      toast.show({ message, icon: 'check' });
      void pull(true);
      setOverride(false);
    } catch (e) {
      toast.show({ message: (e as Error).message, icon: 'info' });
    }
  };
  const scoreBox = (value: string, onChange: (v: string) => void, kit: Kit, label: string) => (
    <TextInput value={value} onChangeText={(v) => onChange(v.replace(/\D/g, '').slice(0, 2))} keyboardType="number-pad" accessibilityLabel={label} style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: CHARCOAL, textAlign: 'center', fontFamily: displayFont, fontSize: 40, color: kit.text }} />
  );

  const team = (side: 'A' | 'B') => {
    const kit = kits[side];
    const list = d.apps.filter((x) => x.data.team === side && x.data.attendance !== 'no_show');
    const ownGoals = d.apps.filter((x) => x.data.team && x.data.team !== side).reduce((s, x) => s + line(x).ownGoals, 0);
    const goals = list.reduce((s, x) => s + line(x).goals, 0) + ownGoals;
    const captain = captainOf(side);
    return (
      <View key={side} style={{ padding: 14, gap: 8, borderRadius: 24, backgroundColor: t.c.bg.tile }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: kit.hex, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.25)' }} />
          <Display size={16} style={{ lineHeight: 16 }}>
            {kit.name}
          </Display>
          <Text variant="caption" color="tertiary" numberOfLines={1} style={{ flexShrink: 1 }}>
            {captain && d.names.get(captain) ? `C · ${firstName(d.names.get(captain)!)}` : 'no captain'}
          </Text>
          <Mono color="secondary" style={{ marginLeft: 'auto' }}>{`${goals} goals`}</Mono>
        </View>
        {!list.length ? <Text variant="caption" color="secondary">Nobody on this side yet – pick teams first.</Text> : null}
        {list.filter((x) => found(q, d.names.get(x.data.personId))).map((x, i) => (
          <React.Fragment key={x.id}>
            {i ? <View style={{ height: 1, backgroundColor: HAIR }} /> : null}
            <PlayerLine
              a={x}
              l={line(x)}
              kit={kit}
              name={d.names.get(x.data.personId) ?? 'Player'}
              you={x.data.personId === d.me}
              captain={captain === x.data.personId}
              star={motmPerson === x.data.personId}
              open={open === x.id}
              onToggle={() => setOpen((o) => (o === x.id ? null : x.id))}
              onEdit={(patch) => edit(x, patch)}
              onCaptain={() => setCaptains((c) => ({ ...c, [side]: captain === x.data.personId ? null : x.data.personId }))}
              onStar={() => setMotmDraft(motmPerson === x.data.personId ? null : x.id)}
            />
          </React.Fragment>
        ))}
      </View>
    );
  };

  return (
    <Screen title="Log stats" subtitle={changes ? `${changes} to save when you tap Done` : 'saved to Turf web'} onBack={back} right={<><SyncPill /><BellButton /></>}>
      <View style={{ padding: 16, gap: 10, borderRadius: 28, backgroundColor: t.c.bg.tile }}>
        <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 16 }}>
          <Crest kit={kits.A} size={40} />
          {override ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {scoreBox(a, setA, kits.A, `${kits.A.name} score`)}
              <Display size={36} color="rgba(245,245,247,0.22)">–</Display>
              {scoreBox(b, setB, kits.B, `${kits.B.name} score`)}
            </View>
          ) : (
            <Pressable accessibilityRole="button" accessibilityLabel="Set the score by hand" onPress={() => (setA(score ? String(score.scoreA) : ''), setB(score ? String(score.scoreB) : ''), setOverride(true))} style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
              <Display size={64} color={kits.A.text} style={{ lineHeight: 58 }}>{score ? String(score.scoreA) : '–'}</Display>
              <Display size={36} color="rgba(245,245,247,0.22)">–</Display>
              <Display size={64} color={kits.B.text} style={{ lineHeight: 58 }}>{score ? String(score.scoreB) : '–'}</Display>
            </Pressable>
          )}
          <Crest kit={kits.B} size={40} />
        </View>
        {override ? (
          <View style={{ flexDirection: 'row', gap: 6, justifyContent: 'center' }}>
            <Button title="Set score" size="sm" style={{ height: 36 }} onPress={() => scoreBy(() => setScore(os, d.g.id, Number(a || 0), Number(b || 0)), 'Score set')} />
            <Button title="Follow goals" variant="secondary" size="sm" style={{ height: 36 }} onPress={() => scoreBy(() => followGoals(os, d.g.id), 'Score follows the goals')} />
          </View>
        ) : (
          <Text variant="caption" color="tertiary" style={{ textAlign: 'center' }}>
            {g.scoreLocked ? 'Set by hand · tap the score to change it' : 'Follows the goals you log · tap the score to override'}
          </Text>
        )}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Text variant="caption" color="tertiary">Tap a player to log</Text>
        <Mono style={{ marginLeft: 'auto' }}>G goals · A assists · S saves</Mono>
      </View>
      {d.apps.length > 8 ? <SearchBox value={q} onChange={setQ} placeholder="Search players" /> : null}
      {team('A')}
      {team('B')}
      <Button title={changes ? `Done · save ${changes}` : 'Done'} icon="check" block onPress={done} />
      <Text variant="caption" color="tertiary" style={{ textAlign: 'center' }}>
        Scorers, captain and the player of the match show on the scorecard, the pitch and the leaderboards.
      </Text>
    </Screen>
  );
}

/** One player's line (Turf web's LogStats row): face, name, captain and POTM badges, the stat tags; open, the steppers and the chips. */
function PlayerLine({ a, l, kit, name, you, captain, star, open, onToggle, onEdit, onCaptain, onStar }: { a: ObjectRecord<AppearanceData>; l: Line; kit: Kit; name: string; you: boolean; captain: boolean; star: boolean; open: boolean; onToggle: () => void; onEdit: (patch: Partial<Line>) => void; onCaptain: () => void; onStar: () => void }) {
  const tags = [
    { n: l.goals, k: 'G', lime: true },
    { n: l.assists, k: 'A' },
    { n: l.saves, k: 'S' },
    { n: l.ownGoals, k: 'OG' },
  ].filter((c) => c.n > 0);
  const sub = [a.data.position, l.inGoal ? 'kept goal' : null].filter(Boolean).join(' · ');
  return (
    <View style={{ gap: 8 }}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={`${name}${tags.length ? `, ${tags.map((c) => `${c.n} ${c.k}`).join(', ')}` : ''}`} onPress={onToggle} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 }}>
        <Face id={a.data.personId} name={name} size={32} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text variant="tileTitle" numberOfLines={1} style={{ fontSize: 15, fontWeight: '700', lineHeight: 20, flexShrink: 1 }}>
              {you ? `${name} (you)` : name}
            </Text>
            {captain ? (
              <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: kit.hex, alignItems: 'center', justifyContent: 'center' }}>
                <Text variant="labelMicro" color={kit.ink === 'dark' ? INK : WHITE} style={{ fontSize: 9, lineHeight: 12, fontWeight: '800' }}>
                  C
                </Text>
              </View>
            ) : null}
            {star ? (
              <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: WHITE, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="trophy" size={9} color={INK} />
              </View>
            ) : null}
          </View>
          {sub ? (
            <Text variant="caption" color="tertiary" numberOfLines={1}>
              {sub}
            </Text>
          ) : null}
        </View>
        <View style={{ flexDirection: 'row', gap: 4 }}>
          {tags.map((c) => (
            <View key={c.k} style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2, height: 22, paddingHorizontal: 7, borderRadius: 7, backgroundColor: c.lime ? 'rgba(215,245,92,0.16)' : CHARCOAL }}>
              <Text variant="labelMicro" color={c.lime ? LIME : 'secondary'} style={{ fontSize: 12, fontWeight: '800', lineHeight: 22 }}>
                {String(c.n)}
              </Text>
              <Text variant="labelMicro" color={c.lime ? LIME : 'tertiary'} style={{ fontSize: 9, lineHeight: 12, fontWeight: '700' }}>
                {c.k}
              </Text>
            </View>
          ))}
        </View>
        <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: open ? CHARCOAL : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={open ? 'chevron-up' : 'chevron-down'} size={16} color="rgba(245,245,247,0.42)" />
        </View>
      </Pressable>
      {open ? (
        <View style={{ borderRadius: 16, backgroundColor: CHARCOAL, padding: 12, gap: 12 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Counter label="Goals" value={l.goals} max={50} lime onChange={(goals) => onEdit({ goals })} />
            <Counter label="Assists" value={l.assists} max={50} onChange={(assists) => onEdit({ assists })} />
            <Counter label="Saves" value={l.saves} max={50} onChange={(saves) => onEdit({ saves, inGoal: saves > 0 || l.inGoal })} />
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            <FilterChip label="Captain" icon="flag" selected={captain} onPress={onCaptain} />
            <FilterChip label="POTM" icon="trophy" selected={star} onPress={onStar} />
            <FilterChip label="Kept goal" icon="shield" selected={l.inGoal} onPress={() => onEdit({ inGoal: !l.inGoal })} />
            <View style={{ marginLeft: 'auto' }}>
              <FilterChip label={`Own goal${l.ownGoals > 1 ? ` ×${l.ownGoals}` : ''}`} selected={l.ownGoals > 0} onPress={() => onEdit({ ownGoals: l.ownGoals ? 0 : 1 })} />
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
}

/** A stat stepper (Turf web's Counter): a label over a pill of 28 discs and the number. */
function Counter({ label, value, max, lime, onChange }: { label: string; value: number; max: number; lime?: boolean; onChange: (v: number) => void }) {
  const disc = (icon: string, by: number) => (
    <Pressable accessibilityRole="button" accessibilityLabel={`${by < 0 ? 'Fewer' : 'More'} ${label}`} onPress={() => onChange(Math.max(0, Math.min(max, value + by)))} hitSlop={4} style={({ pressed }) => ({ width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.07)', alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
      <Icon name={icon} size={13} color={WHITE} />
    </Pressable>
  );
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 6 }}>
      <Text variant="labelCaps" color="tertiary">
        {label.toUpperCase()}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, padding: 3, borderRadius: 999, backgroundColor: '#1A1A1E' }}>
        {disc('minus', -1)}
        <Text variant="heading" color={lime && value ? LIME : WHITE} style={{ fontSize: 17, lineHeight: 22, fontWeight: '800', minWidth: 30, textAlign: 'center' }} accessibilityLabel={`${label}: ${value}`}>
          {String(value)}
        </Text>
        {disc('plus', 1)}
      </View>
    </View>
  );
}
