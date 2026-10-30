import React, { useState } from 'react';
import { Pressable, RefreshControl, View, type StyleProp, type ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { LEADER_CATEGORIES, allPlayers, isDone, leaderTables, leaderboardTextOf, mePersonId, metric, rankLeaders, shown, squadData, type LeaderCategory, type LeaderPosition, type LeaderRow } from '@modules/games';
import { useLive } from '@ui/hooks';
import { OnBlock, useTheme } from '@ui/theme/ThemeProvider';
import { blocks, displayFont } from '@ui/theme/tokens';
import { ActionSheet, Button, ChipRow, EmptyState, FilterChip, Icon, IconButton, Screen, Segmented, Text } from '@ui/kit';
import { usePull } from './useTurfSync';
import { Face, SyncPill } from './teams';
import { Switcher, useCopyShare } from './switcher';
import { NotConnected, type Props, useBack } from './common';

/**
 * Turf · Noir 5b Players · Leaders (TF-Leaders): Turf web's thirteen tables
 * (rules in @modules/games leaders.ts), a position filter, the lime #1 card,
 * sky #2 and pink #3, the table with ▲▼ since the last match day, who isn't
 * ranked yet, and the leaderboard text to share.
 */

type Period = 'season' | 'quarter' | 'all';
const PERIODS: Array<{ key: Period; label: string; note: string }> = [
  { key: 'season', label: 'Season', note: 'this season' },
  { key: 'quarter', label: 'Last 3 months', note: 'last 3 months' },
  { key: 'all', label: 'All time', note: 'all time' },
];
const iso = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
/** A season is the calendar year (the stats card says "Season 2026"). */
function periodFrom(p: Period): string | undefined {
  const now = new Date();
  if (p === 'season') return `${now.getFullYear()}-01-01`;
  if (p === 'quarter') return iso(new Date(now.getFullYear(), now.getMonth() - 3, now.getDate()));
  return undefined;
}

const POSITIONS: Array<{ key: LeaderPosition; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'GK', label: 'GK' },
  { key: 'DEF', label: 'DEF' },
  { key: 'MID', label: 'MID' },
  { key: 'FWD', label: 'FWD' },
];

/** The #1 card's pill. */
const BADGE: Record<LeaderCategory, string> = {
  overall: 'Best overall',
  goals: 'Top scorer',
  assists: 'Most assists',
  ga: 'Most G+A',
  apps: 'Most apps',
  wins: 'Most wins',
  winRate: 'Best win rate',
  form: 'In form',
  improved: 'Most improved',
  motm: 'Most POTM',
  saves: 'Most saves',
  savesPerGame: 'Best saves / game',
  cleanSheets: 'Most clean sheets',
};
const keeperTable = (c: LeaderCategory) => c === 'saves' || c === 'savesPerGame' || c === 'cleanSheets';
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const INK_60 = '#0B0B0D99';

/** The line under a name: matches, and the rate where a total is ranked. */
function lineOf(r: LeaderRow, c: LeaderCategory, perGame: string) {
  const apps = plural(r.apps, 'app');
  if (c === 'overall') return `${apps} · ${r.matches ? plural(r.matches, 'rated match', 'rated matches') : 'profile only'}`;
  if (c === 'winRate') return `${apps} · ${r.wins}W ${r.draws}D ${r.losses}L`;
  if (c === 'improved') return `${apps} · ${r.overall} OVR now`;
  if (c === 'savesPerGame') return `${plural(r.keeperApps, 'game')} in goal`;
  if (c === 'form' || c === 'apps') return apps;
  const games = keeperTable(c) ? r.keeperApps : r.apps;
  const count = keeperTable(c) ? `${plural(games, 'game')} in goal` : apps;
  return games ? `${count} · ${(metric(r, c) / games).toFixed(2)} ${perGame}` : count;
}

/** Bebas Neue, as `Display` in teams.tsx, with a line limit for names. */
function Bebas({ children, size, lh, color, style, lines }: { children: React.ReactNode; size: number; lh: number; color?: string; style?: object; lines?: number }) {
  return (
    <Text variant="body" color={color} numberOfLines={lines} style={[{ fontFamily: displayFont, fontSize: size, lineHeight: lh, letterSpacing: +(size * 0.02).toFixed(1), textTransform: 'uppercase' }, style]}>
      {children}
    </Text>
  );
}

type Mark = 'scored' | 'played' | 'missed';

/** The last five matches: scored in it (lime), played (outlined), missed (dim). Inside OnBlock they turn black. */
function FormSquares({ form, size }: { form: Mark[]; size: number }) {
  const t = useTheme();
  if (!form.length) return null;
  return (
    <View style={{ flexDirection: 'row', gap: 3 }} accessibilityLabel={`Last ${form.length}: ${form.join(', ')}`}>
      {form.map((m, i) => (
        <View key={i} style={{ width: size, height: size, borderRadius: 2, backgroundColor: m === 'scored' ? t.c.accent.mustard : m === 'missed' ? t.c.bg.dim : 'transparent', borderWidth: m === 'played' ? 1.5 : 0, borderColor: t.c.fg.tertiary }} />
      ))}
    </View>
  );
}

/** ▲2 lime, ▼1 coral, — when the place hasn't moved since the last match day. */
function Delta({ place, was }: { place: number; was: number | undefined }) {
  const t = useTheme();
  const d = was === undefined ? 0 : was - place;
  return (
    <Text variant="labelMicro" color={!d ? '#F5F5F738' : d > 0 ? t.c.accent.mustard : t.c.alert.coral} style={{ fontSize: 10, lineHeight: 13, fontWeight: d ? '800' : '700' }}>
      {!d ? '—' : d > 0 ? `▲${d}` : `▼${-d}`}
    </Text>
  );
}

function Tap({ label, onPress, style, children }: { label: string; onPress: () => void; style: StyleProp<ViewStyle>; children: React.ReactNode }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [style, { opacity: pressed ? 0.8 : 1 }]}>
      {children}
    </Pressable>
  );
}

export function TurfLeaders(_props: Props) {
  const t = useTheme();
  const router = useRouter();
  const back = useBack();
  const { busy, pull } = usePull();
  const { copy, share } = useCopyShare();
  const [c, setC] = useState<LeaderCategory>('goals');
  const [pos, setPos] = useState<LeaderPosition>('all');
  const [period, setPeriod] = useState<Period>('season');
  const [picking, setPicking] = useState(false);
  const cat = LEADER_CATEGORIES.find((x) => x.key === c)!;
  const per = PERIODS.find((p) => p.key === period)!;

  const d = useLive(
    (o) => {
      const from = periodFrom(period);
      const lt = leaderTables(o, from);
      const ranked = rankLeaders(lt.rows, c, pos);
      const was = lt.before(c, pos);
      // The last five completed matches of the period, oldest first.
      const last = squadData(o)
        .history.filter((g) => isDone(g) && (!from || g.date >= from))
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 5)
        .reverse();
      const form = new Map(
        lt.rows.map((r) => [
          r.player.id,
          last.map((g): Mark => {
            const p = g.participants.find((x) => x.playerId === r.player.id && x.attendanceStatus !== 'no_show');
            return !p ? 'missed' : (p.goals ?? 0) > 0 ? 'scored' : 'played';
          }),
        ]),
      );
      const profiles = new Map(allPlayers(o).map((p) => [p.data.personId, p.id]));
      return { any: lt.rows.length > 0, matches: lt.matches, ...ranked, was, form, profiles, me: mePersonId(o) };
    },
    [c, pos, period],
  );

  const note = `${per.note} · ${plural(d.matches, 'game')}`;
  const text = d.sorted.length ? leaderboardTextOf(`${cat.title}${pos === 'all' ? '' : ` · ${pos}`}`, note, d.sorted.map((r) => ({ name: r.player.name, value: `${shown(r, c)} ${cat.unit}` }))) : null;
  const nameOf = (r: LeaderRow) => (r.player.id === d.me ? `${r.player.name} (you)` : r.player.name);
  const first = (r: LeaderRow) => r.player.name.trim().split(/\s+/)[0] ?? r.player.name;
  const formOf = (r: LeaderRow) => d.form.get(r.player.id) ?? [];
  const label = (r: LeaderRow, i: number) => `${d.places[i]}. ${r.player.name}, ${shown(r, c)} ${cat.unit}`;
  const open = (r: LeaderRow) => {
    const id = d.profiles.get(r.player.id);
    router.push((id ? `/board/turf/player?player=${id}` : `/entity/person/${r.player.id}`) as never);
  };

  const podium = (i: 1 | 2, bg: string) => {
    const r = d.sorted[i];
    if (!r) return <View style={{ flex: 1 }} />;
    return (
      <Tap label={label(r, i)} onPress={() => open(r)} style={{ flex: 1, padding: 14, gap: 8, borderRadius: 24, backgroundColor: bg }}>
        <OnBlock>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Face id={r.player.id} name={r.player.name} size={44} />
            <Bebas size={18} lh={16}>{`#${d.places[i]}`}</Bebas>
          </View>
          <Bebas size={22} lh={20} lines={1}>
            {first(r)}
          </Bebas>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
              <Bebas size={40} lh={38}>
                {shown(r, c)}
              </Bebas>
              <Bebas size={12} lh={11} color={INK_60}>
                {cat.unit}
              </Bebas>
            </View>
            <FormSquares form={formOf(r)} size={8} />
          </View>
        </OnBlock>
      </Tap>
    );
  };

  const top = d.sorted[0];
  return (
    <Screen title="Turf" subtitle="Browse › Boards" onBack={back} right={<SyncPill />} refreshControl={<RefreshControl refreshing={busy} onRefresh={() => void pull()} />}>
      <Switcher active="players" />
      <Segmented options={[{ value: 'squad', label: 'Squad' }, { value: 'leaders', label: 'Leaders' }]} value="leaders" onChange={(v) => v === 'squad' && router.replace('/board/turf/players' as never)} />
      {!d.any ? (
        <NotConnected />
      ) : (
        <>
          <ChipRow>
            {LEADER_CATEGORIES.map((x) => (
              <FilterChip key={x.key} label={x.short} selected={c === x.key} onPress={() => setC(x.key)} />
            ))}
          </ChipRow>
          <ChipRow>
            {POSITIONS.map((p) => (
              <FilterChip key={p.key} label={p.label} selected={pos === p.key} onPress={() => setPos(p.key)} />
            ))}
          </ChipRow>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Bebas size={28} lh={25} lines={1}>
                {cat.title}
              </Bebas>
              <Text variant="caption" color="tertiary" numberOfLines={1}>
                {note}
              </Text>
            </View>
            <FilterChip label={per.label} icon="chevron-down" onPress={() => setPicking(true)} />
          </View>

          {top ? (
            <>
              <Tap label={label(top, 0)} onPress={() => open(top)} style={{ padding: 16, gap: 12, borderRadius: 28, backgroundColor: blocks.lime }}>
                <OnBlock>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Bebas size={18} lh={16}>{`#${d.places[0]}`}</Bebas>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, height: 28, paddingHorizontal: 11, borderRadius: 999, backgroundColor: '#F5F5F7' }}>
                      <Icon name="star" size={13} color="#0B0B0D" />
                      <Text variant="labelMicro" color="#0B0B0D">
                        {BADGE[c]}
                      </Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                    <Face id={top.player.id} name={top.player.name} size={60} />
                    <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                      <Bebas size={30} lh={27} lines={1}>
                        {nameOf(top)}
                      </Bebas>
                      <Text variant="caption" color="#0B0B0DA6" numberOfLines={1}>
                        {lineOf(top, c, 'per game')}
                      </Text>
                      <FormSquares form={formOf(top)} size={10} />
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Bebas size={64} lh={56}>
                        {shown(top, c)}
                      </Bebas>
                      <Bebas size={14} lh={13} color={INK_60}>
                        {cat.unit}
                      </Bebas>
                    </View>
                  </View>
                </OnBlock>
              </Tap>
              {d.sorted.length > 1 ? (
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  {podium(1, blocks.sky)}
                  {podium(2, blocks.pink)}
                </View>
              ) : null}
              <View style={{ padding: 8, gap: 8, borderRadius: 24, backgroundColor: t.c.bg.tile }}>
                {d.sorted.slice(3).map((r, k) => {
                  const i = k + 3;
                  const mine = r.player.id === d.me;
                  return (
                    <Tap key={r.player.id} label={label(r, i)} onPress={() => open(r)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 16, backgroundColor: mine ? '#D7F55C14' : 'transparent' }}>
                      <View style={{ width: 30, gap: 1 }}>
                        <Bebas size={22} lh={20} color={mine ? 'primary' : 'secondary'}>
                          {String(d.places[i])}
                        </Bebas>
                        <Delta place={d.places[i]!} was={d.was.get(r.player.id)} />
                      </View>
                      <Face id={r.player.id} name={r.player.name} size={36} />
                      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                        <Text variant="body" color={mine ? t.c.accent.mustard : 'primary'} numberOfLines={1} style={{ fontWeight: '700', lineHeight: 20 }}>
                          {nameOf(r)}
                        </Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Text variant="caption" color="tertiary" numberOfLines={1} style={{ flexShrink: 1 }}>
                            {lineOf(r, c, '/ game')}
                          </Text>
                          <FormSquares form={formOf(r)} size={7} />
                        </View>
                      </View>
                      <Bebas size={26} lh={23}>
                        {shown(r, c)}
                      </Bebas>
                    </Tap>
                  );
                })}
                {d.sorted.length > 3 ? <View style={{ height: 1, backgroundColor: t.c.line }} /> : null}
                <Legend />
              </View>
            </>
          ) : (
            <EmptyState icon="target" line={pos === 'all' ? 'Nobody is ranked here yet.' : `No ${pos} is ranked here yet.`} />
          )}

          <Text variant="caption" color="tertiary">
            {cat.help}
          </Text>

          {d.developing.length ? (
            <View style={{ padding: 14, gap: 8, borderRadius: 24, backgroundColor: t.c.bg.tile }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 }}>
                <Text variant="heading" style={{ flex: 1 }}>
                  Not ranked yet
                </Text>
                <Text variant="caption" color="secondary" style={{ fontWeight: '600' }}>
                  {keeperTable(c) ? `${plural(d.needed, 'game')} in goal to rank` : `${plural(d.needed, 'match', 'matches')} to rank`}
                </Text>
              </View>
              {d.developing.map((r) => {
                const have = keeperTable(c) ? r.keeperApps : r.apps;
                return (
                  <Tap key={r.player.id} label={`${r.player.name}, ${have} of ${d.needed}`} onPress={() => open(r)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, paddingHorizontal: 4 }}>
                    <Face id={r.player.id} name={r.player.name} size={32} />
                    <Text variant="body" numberOfLines={1} style={{ flex: 1, fontWeight: '600' }}>
                      {nameOf(r)}
                    </Text>
                    <Text variant="caption" color="tertiary">
                      {have} of {d.needed}
                    </Text>
                  </Tap>
                );
              })}
            </View>
          ) : null}

          {text ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Button title="Share leaderboard" icon="send" variant="secondary" size="sm" style={{ flex: 1 }} onPress={() => share(text)} />
              <IconButton icon="file" accessibilityLabel="Copy leaderboard" filled onPress={() => void copy(text, 'Leaderboard copied')} />
            </View>
          ) : null}
        </>
      )}
      <ActionSheet visible={picking} onClose={() => setPicking(false)} title="Which matches" actions={PERIODS.map((p) => ({ label: p.label, icon: p.key === period ? 'check' : 'calendar', onPress: () => setPeriod(p.key) }))} />
    </Screen>
  );
}

/** scored · played · missed, and what the arrows mean. */
function Legend() {
  const item = (m: Mark, label: string) => (
    <React.Fragment key={m}>
      <FormSquares form={[m]} size={8} />
      <Text variant="caption" color="tertiary">
        {label}
      </Text>
    </React.Fragment>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4 }}>
      {item('scored', 'scored')}
      {item('played', 'played')}
      {item('missed', 'missed')}
      <Text variant="caption" color="tertiary" style={{ marginLeft: 'auto' }}>
        ▲▼ since last game
      </Text>
    </View>
  );
}
