import React, { useState } from 'react';
import { Pressable, RefreshControl, Text as RNText, View } from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { LEADER_CATEGORIES, allPlayers, currentSeason, leaderTables, leaderboardTextOf, mePersonId, metric, posCode, rankLeaders, shown, startedSeasons, type LeaderCategory, type LeaderPosition, type LeaderRow, type Result } from '@modules/games';
import { useLive } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { displayFont, monoFonts } from '@ui/theme/tokens';
import { Button, ChipRow, FilterChip, Screen, Segmented, Text } from '@ui/kit';
import { usePull } from './useTurfSync';
import { Face, SyncPill } from './teams';
import { useCopyShare } from './switcher';
import { NotConnected, type Props, useBack } from './common';
import { SearchBox, found } from './search';
import { BellButton } from './bell-button';

/**
 * Leaders, 1:1 with Turf web's (app/ui/leaders.tsx): a season picker (the
 * current season first, each past one, All time), the thirteen tables, a
 * position filter, a search, the table's title and how it's ranked, a podium
 * (crown, medal rings, steps), the table from 4th with ▲▼ since the last match
 * and form, who isn't ranked yet, and the leaderboard to share. Rules are
 * Turf web's, in @modules/games leaders.ts.
 */

const LIME = '#D7F55C';
const CORAL = '#FF5C47';
const INK = '#F5F5F7';
const MEDAL = [LIME, '#E4E6EB', '#E7B97A'];
const POSITIONS: Array<{ value: LeaderPosition; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'GK', label: 'GK' },
  { value: 'DEF', label: 'DEF' },
  { value: 'MID', label: 'MID' },
  { value: 'FWD', label: 'FWD' },
];
const keeperTable = (c: LeaderCategory) => c === 'saves' || c === 'savesPerGame' || c === 'cleanSheets';
const averaged = (c: LeaderCategory) => c === 'overall' || c === 'winRate' || c === 'form' || c === 'improved' || c === 'savesPerGame';
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

/** Turf web's T.display: Bebas, upper case. */
function Bebas({ children, size, lh, color = INK }: { children: React.ReactNode; size: number; lh: number; color?: string }) {
  return (
    <RNText numberOfLines={1} style={{ fontFamily: displayFont, fontSize: size, lineHeight: lh, color, textTransform: 'uppercase', letterSpacing: +(size * 0.02).toFixed(1) }}>
      {children}
    </RNText>
  );
}
const Mono = ({ children, color = 'rgba(245,245,247,0.42)', size = 9, weight = 600 }: { children: React.ReactNode; color?: string; size?: number; weight?: 600 | 700 }) => (
  <RNText style={{ fontFamily: monoFonts[weight === 700 ? 700 : 500], fontSize: size, lineHeight: size + 3, color, textTransform: 'uppercase', letterSpacing: 0.4 }}>{children}</RNText>
);

/** A player's last five scored matches: W lime, D white, L coral; empty slots faint. */
function Form({ form }: { form: Result[] }) {
  return (
    <View style={{ flexDirection: 'row', gap: 3 }} accessibilityLabel={`Form ${form.join(' ') || 'none'}`}>
      {Array.from({ length: 5 }, (_, i) => {
        const x = form[i];
        return <View key={i} style={{ width: 8, height: 8, borderRadius: 2.5, backgroundColor: x === 'W' ? LIME : x === 'D' ? 'rgba(245,245,247,0.7)' : x === 'L' ? CORAL : 'rgba(255,255,255,0.08)' }} />;
      })}
    </View>
  );
}

/** The podium: 2nd · 1st · 3rd, faces ringed in their medal, a crown on 1st, steps 74 · 98 · 56 high. */
function Podium({ top, places, c, unit, me, open }: { top: LeaderRow[]; places: number[]; c: LeaderCategory; unit: string; me: string | null; open: (r: LeaderRow) => void }) {
  const t = useTheme();
  const order = [top[1], top[0], top[2]];
  const heights = [74, 98, 56];
  const faces = [56, 72, 52];
  return (
    <View style={{ paddingTop: 30, paddingHorizontal: 14, borderRadius: 28, backgroundColor: t.c.bg.tile, overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
        {order.map((r, i) => {
          const place = i === 1 ? 0 : i === 0 ? 1 : 2;
          const medal = MEDAL[place]!;
          if (!r) return <View key={i} style={{ flex: 1 }} />;
          return (
            <Pressable key={r.player.id} accessibilityRole="link" accessibilityLabel={`${places[place] ?? place + 1}. ${r.player.name}, ${shown(r, c)} ${unit}`} onPress={() => open(r)} style={{ flex: 1, minWidth: 0, alignItems: 'center', gap: 8 }}>
              <View>
                <View style={{ padding: 3, borderRadius: 999, borderWidth: 2, borderColor: medal, backgroundColor: t.c.bg.tile }}>
                  <Face id={r.player.id} name={r.player.name} size={faces[i]!} />
                </View>
                {place === 0 ? (
                  <RNText aria-hidden style={{ position: 'absolute', top: -24, left: 0, right: 0, textAlign: 'center', fontSize: 18, lineHeight: 20 }}>
                    👑
                  </RNText>
                ) : null}
              </View>
              <View style={{ alignItems: 'center', width: '100%' }}>
                <Text variant="rowTitle" numberOfLines={1} style={{ fontSize: 14, lineHeight: 18, fontWeight: '700' }}>
                  {`${firstName(r.player.name)}${r.player.id === me ? ' (you)' : ''}`}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                  <Bebas size={place === 0 ? 38 : 28} lh={place === 0 ? 36 : 28} color={place === 0 ? LIME : INK}>
                    {shown(r, c)}
                  </Bebas>
                  <Mono>{c === 'winRate' ? '%' : unit}</Mono>
                </View>
              </View>
              <View style={{ width: '100%', height: heights[i], borderTopLeftRadius: 14, borderTopRightRadius: 14, borderTopWidth: 2, borderColor: medal, overflow: 'hidden', alignItems: 'center', paddingTop: 8 }}>
                <Svg style={{ position: 'absolute', left: 0, top: 0 }} width="100%" height="100%">
                  <Defs>
                    <LinearGradient id={`step${place}`} x1="0" y1="0" x2="0" y2="1">
                      <Stop offset="0" stopColor={medal} stopOpacity={0.22} />
                      <Stop offset="1" stopColor={medal} stopOpacity={0.03} />
                    </LinearGradient>
                  </Defs>
                  <Rect x="0" y="0" width="100%" height="100%" fill={`url(#step${place})`} />
                </Svg>
                <Bebas size={30} lh={28} color={medal}>
                  {String(places[place] ?? place + 1)}
                </Bebas>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function TurfLeaders(_props: Props) {
  const t = useTheme();
  const router = useRouter();
  const back = useBack();
  const { busy, pull } = usePull();
  const { share } = useCopyShare();
  const seasons = useLive((o) => startedSeasons(o), []);
  const current = currentSeason(seasons);
  const [seasonId, setSeasonId] = useState<string | null>(null);
  const picked = seasonId ?? current?.id ?? 'all';
  const season = seasons.find((s) => s.id === picked) ?? null;
  const [c, setC] = useState<LeaderCategory>('overall');
  const [position, setPosition] = useState<LeaderPosition>('all');
  const [showAll, setShowAll] = useState(false);
  const [query, setQuery] = useState('');
  const meta = LEADER_CATEGORIES.find((x) => x.key === c)!;

  const d = useLive(
    (o) => {
      const lt = leaderTables(o, season?.startsOn, season?.endsOn);
      const profiles = new Map(allPlayers(o).map((p) => [p.data.personId, p.id]));
      return { any: lt.rows.length > 0, matches: lt.matches, ...rankLeaders(lt.rows, c, position), before: lt.before(c, position), profiles, me: mePersonId(o) };
    },
    [c, position, season?.id],
  );
  const open = (r: LeaderRow) => {
    const id = d.profiles.get(r.player.id);
    router.push((id ? `/board/turf/player?player=${id}` : `/entity/person/${r.player.id}`) as never);
  };

  const { sorted, places, developing, needed } = d;
  const hasData = sorted.some((r) => (c === 'winRate' ? r.winRate !== null : c === 'form' ? r.formScore !== null : c === 'overall' || c === 'improved' || metric(r, c) > 0));
  // A search lists everyone who matches, in their places; otherwise the podium, then 4th on.
  const hits = query.trim() ? sorted.map((r, i) => ({ r, place: places[i]! })).filter(({ r }) => found(query, r.player.name)) : null;
  const entries = hits ?? sorted.slice(3, showAll ? undefined : 15).map((r, i) => ({ r, place: places[i + 3]! }));
  const seasonName = season ? season.name : seasons.length ? 'All time' : null;
  const shareText = leaderboardTextOf(`${meta.title}${position === 'all' ? '' : ` · ${position}`}${seasonName ? ` · ${seasonName}` : ''}`, `${plural(d.matches, 'match', 'matches')} · top ${Math.min(10, sorted.length)}`, sorted.slice(0, 10).map((r) => ({ name: r.player.name, value: `${shown(r, c)}${c === 'winRate' ? '%' : ` ${meta.unit}`}` })));
  const card = { padding: 14, gap: 10, borderRadius: 24, backgroundColor: t.c.bg.tile } as const;
  const divider = <View style={{ height: 1, backgroundColor: 'rgba(245,245,247,0.08)' }} />;

  return (
    <Screen title="Turf" subtitle="Browse" onBack={back} right={<><SyncPill /><BellButton /></>} refreshControl={<RefreshControl refreshing={busy} onRefresh={() => void pull()} />}>
      <Segmented options={[{ value: 'squad', label: 'Squad' }, { value: 'leaders', label: 'Leaders' }]} value="leaders" onChange={(v) => v === 'squad' && router.replace('/board/turf/players' as never)} />
      {!d.any ? (
        <NotConnected />
      ) : (
        <>
          {seasons.length ? (
            <ChipRow>
              {[...seasons.map((s) => ({ value: s.id, label: s.id === current?.id ? `${s.name} · now` : s.name })), { value: 'all', label: 'All time' }].map((x) => (
                <FilterChip key={x.value} label={x.label} selected={picked === x.value} onPress={() => setSeasonId(x.value)} />
              ))}
            </ChipRow>
          ) : null}
          <ChipRow>
            {LEADER_CATEGORIES.map((x) => (
              <FilterChip key={x.key} label={x.short} selected={c === x.key} onPress={() => (setC(x.key), setShowAll(false))} />
            ))}
          </ChipRow>
          <Segmented options={POSITIONS} value={position} onChange={setPosition} />
          <SearchBox value={query} onChange={setQuery} placeholder="Search players" />
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingTop: 4, paddingHorizontal: 4 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Bebas size={30} lh={28}>
                {meta.title}
              </Bebas>
              <Text variant="caption" color="tertiary" style={{ marginTop: 2 }}>
                {meta.help}
              </Text>
            </View>
            <View style={{ height: 28, paddingHorizontal: 11, borderRadius: 999, justifyContent: 'center', backgroundColor: t.c.bg.tileRaised }}>
              <Text variant="labelMicro" color="secondary">
                {plural(d.matches, 'match', 'matches')}
              </Text>
            </View>
          </View>

          {hasData ? (
            <>
              {!hits ? <Podium top={sorted.slice(0, 3)} places={places.slice(0, 3)} c={c} unit={meta.unit} me={d.me} open={open} /> : null}
              {entries.length ? (
                <View style={{ paddingVertical: 6, paddingHorizontal: 14, borderRadius: 24, backgroundColor: t.c.bg.tile }}>
                  {entries.map(({ r, place }, i) => {
                    const was = d.before.get(r.player.id);
                    const delta = was === undefined ? null : was - place;
                    const isYou = r.player.id === d.me;
                    const extra = c === 'goals' || c === 'assists' || c === 'ga' ? `${(metric(r, c) / Math.max(1, r.apps)).toFixed(2)} / game` : c === 'overall' ? `${r.matches} rated` : c === 'form' ? r.form.join('') || null : c === 'winRate' ? `${r.wins}W ${r.draws}D ${r.losses}L` : keeperTable(c) ? `${r.keeperApps} in goal` : null;
                    return (
                      <React.Fragment key={r.player.id}>
                        {i > 0 ? divider : null}
                        <Pressable accessibilityRole="link" accessibilityLabel={`${place}. ${r.player.name}, ${shown(r, c)} ${meta.unit}`} onPress={() => open(r)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 58, marginHorizontal: isYou ? -8 : 0, marginVertical: isYou ? 4 : 0, paddingHorizontal: isYou ? 8 : 0, borderRadius: 14, backgroundColor: isYou ? 'rgba(215,245,92,0.08)' : 'transparent' }}>
                          <View style={{ width: 26, alignItems: 'center' }}>
                            <Bebas size={20} lh={20} color={isYou ? LIME : 'rgba(245,245,247,0.62)'}>
                              {String(place)}
                            </Bebas>
                            <RNText style={{ fontSize: 9, fontWeight: '800', lineHeight: 11, color: delta && delta > 0 ? LIME : delta && delta < 0 ? CORAL : 'rgba(245,245,247,0.22)' }}>{delta ? `${delta > 0 ? '▲' : '▼'}${Math.abs(delta)}` : was === undefined ? 'new' : '–'}</RNText>
                          </View>
                          <Face id={r.player.id} name={r.player.name} size={36} />
                          <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                            <Text variant="rowTitle" numberOfLines={1} color={isYou ? LIME : undefined} style={{ fontSize: 15, lineHeight: 19, fontWeight: '700' }}>
                              {`${r.player.name}${isYou ? ' (you)' : ''}`}
                            </Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 }}>
                              <Mono>{posCode(r.player.position) || '–'}</Mono>
                              <Text variant="caption" color="tertiary" numberOfLines={1} style={{ fontSize: 12, flexShrink: 1 }}>
                                {`${r.apps} apps${extra ? ` · ${extra}` : ''}`}
                              </Text>
                            </View>
                          </View>
                          <View style={{ alignItems: 'flex-end', gap: 5 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
                              <Bebas size={24} lh={22}>
                                {shown(r, c)}
                              </Bebas>
                              {c === 'winRate' && r.winRate !== null ? <Mono>%</Mono> : null}
                            </View>
                            <Form form={r.form} />
                          </View>
                        </Pressable>
                      </React.Fragment>
                    );
                  })}
                  {!hits && sorted.length > 15 ? (
                    <>
                      {divider}
                      <Pressable accessibilityRole="button" onPress={() => setShowAll((v) => !v)} style={{ height: 44, alignItems: 'center', justifyContent: 'center' }}>
                        <Text variant="label" color={LIME} style={{ fontSize: 14, fontWeight: '700' }}>
                          {showAll ? 'Show the top 15' : `Show all ${sorted.length}`}
                        </Text>
                      </Pressable>
                    </>
                  ) : null}
                </View>
              ) : null}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', paddingHorizontal: 4 }}>
                <Text variant="caption" color="tertiary">Form</Text>
                {([['W', LIME, 'win'], ['D', 'rgba(245,245,247,0.7)', 'draw'], ['L', CORAL, 'loss']] as const).map(([k, colour, word]) => (
                  <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 2.5, backgroundColor: colour }} />
                    <Text variant="caption" color="tertiary">{word}</Text>
                  </View>
                ))}
                <Text variant="caption" color="tertiary" style={{ marginLeft: 'auto' }}>▲▼ since the last match</Text>
              </View>
            </>
          ) : (
            <View style={{ ...card, gap: 6 }}>
              <Text variant="tileTitle">{`No ${meta.short.toLowerCase()} recorded yet`}</Text>
              <Text variant="caption" color="secondary">{averaged(c) ? `Averages rank players with ${needed} matches or more in this period.` : 'Nothing logged yet in this period.'}</Text>
            </View>
          )}

          {developing.length && averaged(c) ? (
            <View style={card}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
                <Text variant="tileTitle">Not ranked yet</Text>
                <Text variant="caption" color="tertiary" style={{ marginLeft: 'auto' }}>{`${needed} ${keeperTable(c) ? 'in goal' : 'matches'} needed`}</Text>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {developing.filter((r) => found(query, r.player.name)).slice(0, 18).map((r) => (
                  <Pressable key={r.player.id} accessibilityRole="link" accessibilityLabel={`${r.player.name}, ${keeperTable(c) ? r.keeperApps : r.apps} of ${needed}`} onPress={() => open(r)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingLeft: 4, paddingRight: 10, borderRadius: 999, backgroundColor: t.c.bg.tileRaised }}>
                    <Face id={r.player.id} name={r.player.name} size={24} />
                    <Text variant="label" style={{ fontSize: 13, fontWeight: '600' }}>{firstName(r.player.name)}</Text>
                    <Mono weight={700}>{`${keeperTable(c) ? r.keeperApps : r.apps}/${needed}`}</Mono>
                  </Pressable>
                ))}
                {developing.length > 18 ? <Text variant="caption" color="tertiary" style={{ alignSelf: 'center' }}>{`+${developing.length - 18} more`}</Text> : null}
              </View>
            </View>
          ) : null}
          <Button title={`Share ${meta.title.toLowerCase()}`} icon="send" variant="secondary" block style={{ height: 44 }} onPress={() => share(shareText)} />
        </>
      )}
    </Screen>
  );
}
