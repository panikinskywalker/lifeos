import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { allPlayers, mePersonId, squadRatings, statsFor, whoOwes, type PlayerProfileData } from '@modules/games';
import { useLive } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { fonts } from '@ui/theme/tokens';
import { ChipRow, EmptyState, FilterChip, Icon, IconButton, Screen, Segmented, Text } from '@ui/kit';
import { usePull } from './useTurfSync';
import { Face, SyncPill } from './teams';
import { Switcher } from './switcher';
import { NotConnected, type Props, useBack } from './common';

/**
 * Turf · Noir 5a Players · Squad (TF-Squad): the section switcher, Squad /
 * Leaders, a search, filters by dues and by availability, then everyone in
 * one card — face, name, position, what they owe, an availability dot.
 */

type Pay = 'all' | 'unpaid' | 'clear';
type Avail = PlayerProfileData['availability'];

const AVAIL: Array<{ value: Avail; label: string }> = [
  { value: 'AVL', label: 'Available' },
  { value: 'INJ', label: 'Injured' },
  { value: 'OOS', label: 'Out of station' },
];

/** The availability dot: lime available, coral injured, grey away. */
export function availabilityColour(a: Avail, t: ReturnType<typeof useTheme>) {
  return a === 'INJ' ? t.c.alert.coral : a === 'OOS' ? t.c.fg.tertiary : t.c.accent.mustard;
}

export function TurfPlayers({ ctx }: Props) {
  const t = useTheme();
  const router = useRouter();
  const back = useBack();
  const { busy, pull } = usePull();
  const [q, setQ] = useState('');
  const [pay, setPay] = useState<Pay>('all');
  const [avail, setAvail] = useState<Avail | null>(null);
  const squad = useLive((o) => {
    const owes = new Map(whoOwes(o).map((w) => [w.personId, w.amount]));
    const ratings = squadRatings(o).players;
    const me = mePersonId(o);
    const rows = allPlayers(o).map((p) => ({ p, owed: owes.get(p.data.personId) ?? 0, games: statsFor(o, p.data.personId).games, overall: ratings.get(p.data.personId)?.overall ?? null, me: p.data.personId === me }));
    return rows.sort((a, b) => Number(b.me) - Number(a.me) || a.p.data.name.localeCompare(b.p.data.name));
  }, []);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return squad.filter(({ p, owed }) => {
      if (pay === 'unpaid' && !(owed > 0)) return false;
      if (pay === 'clear' && owed > 0) return false;
      if (avail && p.data.availability !== avail) return false;
      if (!needle) return true;
      const d = p.data;
      return [d.name, d.position, d.secondaryPosition, d.comfortable, d.speciality, d.playingStyle].some((v) => v?.toLowerCase().includes(needle));
    });
  }, [squad, q, pay, avail]);
  const withDues = squad.filter((s) => s.owed > 0).length;
  const f = ctx.format.currency;

  return (
    <Screen
      title="Turf"
      subtitle="Browse › Boards"
      onBack={back}
      right={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <SyncPill />
          <IconButton icon="plus" accessibilityLabel="Add player" filled onPress={() => router.push('/board/turf/player-edit' as never)} />
        </View>
      }
      refreshControl={<RefreshControl refreshing={busy} onRefresh={() => void pull()} />}
    >
      <Switcher active="players" />
      <Segmented options={[{ value: 'squad', label: 'Squad' }, { value: 'leaders', label: 'Leaders' }]} value="squad" onChange={(v) => v === 'leaders' && router.replace('/board/turf/leaders' as never)} />
      {!squad.length ? (
        <NotConnected />
      ) : (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingHorizontal: 18, borderRadius: 16, backgroundColor: t.c.bg.tile, borderWidth: 1, borderColor: t.c.line }}>
            <Icon name="search" size={18} color={t.c.fg.tertiary} />
            <TextInput
              value={q}
              onChangeText={setQ}
              placeholder="Name, role or skill"
              placeholderTextColor={t.c.fg.tertiary}
              autoCorrect={false}
              returnKeyType="search"
              accessibilityLabel="Search the squad"
              style={{ flex: 1, minHeight: 48, color: t.c.fg.primary, fontFamily: fonts[500], fontSize: 15, lineHeight: 20 }}
            />
            {q ? <IconButton icon="x" accessibilityLabel="Clear search" size={28} onPress={() => setQ('')} /> : null}
          </View>
          <ChipRow>
            {(['all', 'unpaid', 'clear'] as const).map((k) => (
              <FilterChip key={k} label={k === 'all' ? 'All' : k === 'unpaid' ? 'Unpaid' : 'Clear'} selected={pay === k} onPress={() => setPay(k)} />
            ))}
          </ChipRow>
          <ChipRow>
            {AVAIL.map((a) => (
              <FilterChip key={a.value} label={a.label} icon={avail === a.value ? 'check' : undefined} selected={avail === a.value} onPress={() => setAvail(avail === a.value ? null : a.value)} />
            ))}
          </ChipRow>
          {shown.length ? (
            <View style={{ padding: 14, borderRadius: 24, backgroundColor: t.c.bg.tile, gap: 8 }}>
              {shown.map(({ p, owed, games, overall, me }, i) => {
                const d = p.data;
                const sub = [d.position, d.availability === 'INJ' ? 'injured' : d.availability === 'OOS' ? 'out' : null, d.guest ? 'guest' : null, overall !== null && games ? `${overall} OVR` : null, games ? `${games} app${games === 1 ? '' : 's'}` : null].filter(Boolean).join(' · ');
                return (
                  <View key={p.id} style={{ gap: 8 }}>
                    {i > 0 ? <View style={{ height: 1, backgroundColor: t.c.line }} /> : null}
                    <Pressable accessibilityRole="button" accessibilityLabel={`${d.name}${owed > 0 ? `, owes ${f(owed)}` : ''}`} onPress={() => router.push(`/board/turf/player?player=${p.id}` as never)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 52, opacity: pressed ? 0.75 : 1 })}>
                      <Face id={d.personId} name={d.name} size={40} />
                      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                        <Text variant="rowTitle" numberOfLines={1}>
                          {me ? `${d.name} (you)` : d.name}
                        </Text>
                        {sub ? (
                          <Text variant="caption" color="secondary" numberOfLines={1}>
                            {sub}
                          </Text>
                        ) : null}
                      </View>
                      {owed > 0 ? (
                        <View style={{ height: 28, paddingHorizontal: 11, borderRadius: 999, justifyContent: 'center', backgroundColor: t.c.alert.coralFill }}>
                          <Text variant="labelMicro" color={t.c.alert.coralText} numberOfLines={1}>
                            owes {f(owed)}
                          </Text>
                        </View>
                      ) : null}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <View accessibilityLabel={AVAIL.find((a) => a.value === d.availability)?.label} style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: availabilityColour(d.availability, t) }} />
                        <Icon name="chevron-right" size={18} color={t.c.fg.tertiary} />
                      </View>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          ) : (
            <EmptyState icon="search" line="Nobody in the squad matches." />
          )}
          <Text variant="caption" color="tertiary">
            {shown.length === squad.length ? `${squad.length} player${squad.length === 1 ? '' : 's'}` : `${shown.length} of ${squad.length} players`} · {withDues ? `${withDues} with dues` : 'no dues'}
          </Text>
        </>
      )}
    </Screen>
  );
}
