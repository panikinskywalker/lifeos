import React from 'react';
import type { TileDef } from '@core/registry/types';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { allPlayers, currentGame, kitsOf, lineup, turfDues, type GameData } from '@modules/games';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Button, Icon, Text } from '@ui/kit';
import { Face } from './teams';

/**
 * Turf on Today (TF-Pieces · Today tile, full width): the next match — kick-off,
 * ground, format and how soon, who's in, what's still to collect — or, with
 * nothing booked, the last result and Book one. Nothing when Turf isn't
 * connected.
 */

const DAY = 86_400_000;
const soon = (date: string) => {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const d = Math.round((Date.parse(`${date}T12:00:00`) - today.getTime()) / DAY);
  return d <= 0 ? 'today' : d === 1 ? 'tomorrow' : `in ${d} days`;
};
const clock = (time?: string) => {
  if (!time || !/^\d{1,2}:\d{2}/.test(time)) return 'Time not set';
  const [h, m] = time.split(':').map(Number);
  return `${h! % 12 || 12}:${String(m).padStart(2, '0')} ${h! >= 12 ? 'pm' : 'am'}`;
};

export function TurfTodayTile() {
  const t = useTheme();
  const os = useOS();
  const router = useRouter();
  const d = useLive((o) => {
    if (!o.registry.objects.has('game') || !allPlayers(o).length) return null;
    const cur = currentGame(o);
    const people = cur ? lineup(o, cur.game.id) : [];
    const rsvpIn = cur ? Object.values(cur.game.data.rsvps ?? {}).filter((s) => s === 'in').length : 0;
    return { cur, people, rsvpIn, owed: turfDues(o).owedToYou.totalCents / 100 };
  }, []);
  if (!d) return null;
  const f = os.format.currency;
  const g = d.cur?.game.data as GameData | undefined;
  const upcoming = !!d.cur?.upcoming && !!g;
  const pill = (label: string) => (
    <View style={{ height: 28, paddingHorizontal: 11, borderRadius: 999, justifyContent: 'center', backgroundColor: t.c.bg.dim }}>
      <Text variant="labelMicro" color="secondary">
        {label}
      </Text>
    </View>
  );
  const result = () => {
    if (!g || g.scoreA == null || g.scoreB == null) return null;
    const kits = kitsOf(g);
    if (g.scoreA === g.scoreB) return `drew ${g.scoreA}–${g.scoreB}`;
    return `${g.scoreA > g.scoreB ? kits.A.name : kits.B.name} won ${Math.max(g.scoreA, g.scoreB)}–${Math.min(g.scoreA, g.scoreB)}`;
  };
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Turf, next match" onPress={() => router.push(upcoming ? (`/board/turf/game?game=${d.cur!.game.id}` as never) : ('/board/turf' as never))} style={({ pressed }) => ({ padding: 16, gap: 14, borderRadius: 28, backgroundColor: t.c.bg.tile, opacity: pressed ? 0.9 : 1 })}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Text variant="tileTitle">Turf</Text>
          <Text variant="caption" color="secondary" style={{ fontWeight: '500' }}>
            next match
          </Text>
        </View>
        {pill(upcoming ? `${d.rsvpIn || d.people.length} in · ${g!.expectedPlayers || d.people.length}` : 'Nothing booked')}
      </View>
      {upcoming ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Icon name="calendar" size={22} color={t.c.accent.mustard} />
          <View style={{ gap: 2, flex: 1 }}>
            <Text variant="rowTitle" style={{ fontSize: 17, lineHeight: 20, fontWeight: '700' }}>
              {clock(g!.time)}
            </Text>
            <Text variant="caption" color="secondary">
              {g!.venueName}
            </Text>
            <Text variant="labelCaps" color="tertiary" style={{ textTransform: 'uppercase' }}>
              {[g!.sideSize ? `${g!.sideSize}-a-side` : null, soon(g!.date)].filter(Boolean).join(' · ')}
            </Text>
          </View>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Icon name="calendar" size={22} color={t.c.fg.tertiary} />
          <View style={{ flex: 1 }}>
            <Text variant="rowTitle" style={{ fontSize: 17, lineHeight: 22, fontWeight: '700' }}>
              No match booked
            </Text>
            {g ? (
              <Text variant="caption" color="secondary">
                {[`Last one ${new Date(`${g.date}T12:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}`, result()].filter(Boolean).join(' · ')}
              </Text>
            ) : null}
          </View>
        </View>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {upcoming ? (
          <View style={{ flexDirection: 'row' }}>
            {d.people.slice(0, 4).map((p, i) => (
              <View key={p.appearance.id} style={{ marginLeft: i ? -6 : 0, borderRadius: 14, borderWidth: 2, borderColor: t.c.bg.tile }}>
                <Face id={p.appearance.data.personId} name={p.name} size={24} />
              </View>
            ))}
          </View>
        ) : null}
        <Text variant="label" color={d.owed > 0 ? t.c.accent.mustard : 'secondary'} style={{ flex: 1, fontSize: 13, lineHeight: 17, fontWeight: '700' }}>
          {d.owed > 0 ? `${f(d.owed)} still to collect` : 'Everyone has paid'}
        </Text>
        {upcoming ? (
          <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: t.c.bg.dim, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="chevron-right" size={16} />
          </View>
        ) : (
          <Button title="Book one" icon="plus" size="sm" variant="secondary" style={{ height: 36 }} onPress={() => router.push('/board/turf/match' as never)} />
        )}
      </View>
    </Pressable>
  );
}

export const turfTiles: TileDef[] = [{ type: 'turf', board: 'turf', name: 'Turf', description: 'The next match: who’s in and what’s still to collect', icon: 'target', sizes: ['medium'], defaultSize: 'medium', component: () => <TurfTodayTile /> }];
