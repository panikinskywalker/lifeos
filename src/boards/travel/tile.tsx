import { Pressable, View, type TextStyle } from 'react-native';
import { useRouter } from 'expo-router';
import type { TileDef } from '@core/registry/types';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { gradients } from '@ui/theme/tokens';
import { Icon, ProgressBar, Text } from '@ui/kit';
import { hasPacked, nextTrip, tripBookings, trips, tripSpend } from '@modules/travel';
import { companions, datesLabel, FaceStack, plural, routes, timeOf, weekdayShort, whenShort } from './parts';

/**
 * Travel on Today (NR-Travel-Tile): small (2 × 2) or wide (4 × 2). The next
 * trip and how soon, its next flight, and in the wide one who's going, the
 * budget and whether you've packed. Both open Travel; the red-orange dot is
 * Travel's colour from Browse.
 */

export function TravelTodayTile({ wide }: { wide?: boolean } = {}) {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const d = useLive((o) => {
    if (!o.registry.objects.has('trip')) return null;
    const now = Date.now();
    const year = String(new Date(now).getFullYear());
    const count = trips(o).filter((x) => x.data.startDate?.startsWith(year)).length;
    const next = nextTrip(o, now);
    if (!next) return { count, next: null };
    const flight = tripBookings(o, next.id).find((b) => b.kind === 'flight' && b.startAt > now) ?? null;
    return { count, next: { trip: next, when: whenShort(next.data, now), flight, spend: tripSpend(o, next, now), packed: hasPacked(o, next), people: companions(o, next) } };
  }, []);
  if (!d) return null;
  const n = d.next;
  const money = (v: number) => os.format.currency(Math.round(v));
  const big: TextStyle = { fontSize: 30, lineHeight: 32, fontWeight: '700', letterSpacing: -0.5, fontVariant: ['tabular-nums'] };
  const lime = t.c.accent.gold;
  const line = n ? (n.flight ? `${weekdayShort(n.flight.startAt)} ${timeOf(n.flight.startAt)}${n.flight.flightNo ? ` · ${n.flight.flightNo}` : ''}` : datesLabel(n.trip.data)) : 'Tickets and dumps add them';
  const label = n ? `Travel, ${n.trip.data.destination} ${n.when ?? ''}, ${line}` : 'Travel, no trip planned';

  const head = (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Text variant="labelCaps" color="secondary" numberOfLines={1}>{wide ? `TRAVEL · ${plural(d.count, 'TRIP').toUpperCase()} THIS YEAR` : 'TRAVEL'}</Text>
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: gradients.travel[0] }} />
    </View>
  );
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => router.push(routes.home as never)} style={({ pressed }) => [{ padding: 16, borderRadius: 24, backgroundColor: t.c.bg.tile, justifyContent: 'space-between', opacity: pressed ? 0.9 : 1 }, wide ? { minHeight: 167 } : { flex: 1, aspectRatio: 1 }]}>
      {head}
      {wide ? (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={[big, { flexShrink: 1 }]}>
              {n ? n.trip.data.destination : 'No trip planned'}
              {n?.when ? <Text style={[big, { color: lime }]}> {n.when}</Text> : null}
            </Text>
            {n?.people.length ? <FaceStack people={n.people} size={32} /> : null}
          </View>
          <View style={{ gap: 8 }}>
            {n?.spend.budget ? <ProgressBar value={n.spend.spent / n.spend.budget} height={6} color={n.spend.over ? t.c.alert.coralText : t.c.accent.mustard} /> : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text numberOfLines={1} style={{ flex: 1, fontSize: 13, lineHeight: 17, fontWeight: '600', color: t.c.fg.secondary, fontVariant: ['tabular-nums'] }}>{n?.spend.budget ? `${money(n.spend.spent)} of ${money(n.spend.budget)}` : line}</Text>
              {n ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Icon name="bag" size={14} color={t.tints.travel.ink} />
                  <Text style={{ fontSize: 12, lineHeight: 15, fontWeight: '600', color: t.c.fg.secondary }}>{n.packed ? 'Packed' : 'Not packed yet'}</Text>
                </View>
              ) : null}
            </View>
          </View>
        </>
      ) : (
        <>
          <View>
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={big}>{n ? n.trip.data.destination : 'No trip'}</Text>
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={[big, { color: lime }]}>{n ? n.when ?? 'no dates' : 'planned'}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Icon name="plane" size={14} color={t.tints.travel.ink} />
            <Text numberOfLines={1} style={{ flex: 1, fontSize: 12, lineHeight: 15, fontWeight: '600', color: t.c.fg.secondary }}>{line}</Text>
          </View>
        </>
      )}
    </Pressable>
  );
}

export const travelTiles: TileDef[] = [{ type: 'travel', board: 'travel', name: 'Travel', description: 'The next trip, how soon, the budget and the bag', icon: 'plane', sizes: ['small', 'medium'], defaultSize: 'small', component: ({ size }) => <TravelTodayTile wide={size !== 'small'} /> }];
