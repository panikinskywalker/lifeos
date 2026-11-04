import { useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { LifeOSContext } from '@core/registry/context';
import { useLive } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { fonts } from '@ui/theme/tokens';
import { Icon, IconButton, ProgressBar, Screen, Text } from '@ui/kit';
import { nextTrip, tripBookings, tripDays, tripPhase, trips, tripSpend } from '@modules/travel';
import { AddTrip, bookingCount, Caps, Chip28, companions, datesLabel, dayLabel, Disc, FaceStack, GlassPill, monthOf, Note, plural, purposeLabel, Row, RowCard, routes, SerifName, statusLabel, THUMB_GLOWS, TripPhoto, whenShort, withLine, type Companion } from './parts';

/**
 * All trips (NR-Travel-Upcoming): search, a pill per status, the dated ones
 * by month on their photos, ideas with no dates, and the ones done by year
 * with what each cost.
 */

type Filter = 'all' | 'booked' | 'planning' | 'ideas' | 'done';

export function UpcomingScreen({ ctx }: { ctx: LifeOSContext; params: Record<string, string> }) {
  const router = useRouter();
  const t = useTheme();
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const rows = useLive((os) => {
    const now = Date.now();
    const next = nextTrip(os, now);
    return trips(os).map((trip) => {
      const phase = tripPhase(trip.data, now);
      const people = companions(os, trip);
      return {
        trip,
        people,
        phase,
        isNext: trip.id === next?.id,
        done: phase === 'back' || trip.status === 'done',
        idea: phase === 'undated' || trip.status === 'idea',
        cover: os.attachments.cover(trip.id)?.uri ?? null,
        spend: tripSpend(os, trip, now),
        booked: bookingCount(tripBookings(os, trip.id)),
        when: whenShort(trip.data, now),
        days: tripDays(trip.data),
        haystack: [trip.title, trip.data.destination, trip.data.notes, ...people.map((p) => p.name)].filter(Boolean).join(' ').toLowerCase(),
      };
    });
  }, []);
  const money = (n: number) => ctx.format.currency(Math.round(n));
  const open = (id: string) => router.push(routes.trip(id) as never);
  const back = () => (router.canGoBack() ? router.back() : router.replace(routes.home as never));

  const q = query.trim().toLowerCase();
  const notDone = rows.filter((r) => !r.done).length;
  const shown = rows.filter((r) => {
    if (q && !r.haystack.includes(q)) return false;
    if (filter === 'booked') return !r.done && r.trip.status === 'booked';
    if (filter === 'planning') return !r.done && r.trip.status === 'planning';
    if (filter === 'ideas') return !r.done && r.idea;
    if (filter === 'done') return r.done;
    return true;
  });
  const dated = shown.filter((r) => !r.done && !r.idea);
  const months: Array<{ key: string; label: string; items: typeof dated }> = [];
  for (const r of dated) {
    const key = r.trip.data.startDate!.slice(0, 7);
    const m = months.find((x) => x.key === key);
    if (m) m.items.push(r);
    else months.push({ key, label: monthOf(r.trip.data.startDate!).toUpperCase(), items: [r] });
  }
  const ideas = shown.filter((r) => !r.done && r.idea);
  const done = shown.filter((r) => r.done).reverse();
  const years: Array<{ year: string; items: typeof done }> = [];
  for (const r of done) {
    const year = r.trip.data.startDate?.slice(0, 4) ?? 'No dates';
    const y = years.find((x) => x.year === year);
    if (y) y.items.push(r);
    else years.push({ year, items: [r] });
  }
  const pills: Array<[Filter, string]> = [['all', `Upcoming · ${notDone}`], ['booked', 'Booked'], ['planning', 'Planning'], ['ideas', 'Ideas'], ['done', 'Done']];

  return (
    <Screen contentStyle={{ gap: 22 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <IconButton icon="chevron-left" accessibilityLabel="Back to Travel" filled onPress={back} />
        <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
          <Text variant="caption" color="secondary" numberOfLines={1}>Trips · {notDone} not done</Text>
          <Text variant="title" accessibilityRole="header">Upcoming</Text>
        </View>
        <AddTrip onPress={() => router.push(routes.newTrip as never)} />
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingHorizontal: 18, borderRadius: 16, backgroundColor: t.c.bg.tileRaised, borderWidth: 1, borderColor: t.c.line }}>
        <Icon name="search" size={18} color={t.c.fg.secondary} />
        <TextInput value={query} onChangeText={setQuery} placeholder="Destination, people or notes" placeholderTextColor={t.c.fg.secondary} selectionColor={t.c.accent.mustard} autoCorrect={false} returnKeyType="search" accessibilityLabel="Search trips" style={{ flex: 1, minWidth: 0, minHeight: 46, color: t.c.fg.primary, fontFamily: fonts[500], fontSize: 16, paddingVertical: 0 }} />
        {query ? <IconButton icon="x" accessibilityLabel="Clear search" size={28} onPress={() => setQuery('')} /> : null}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginHorizontal: -t.layout.gutter }} contentContainerStyle={{ gap: 8, paddingHorizontal: t.layout.gutter }}>
        {pills.map(([key, label]) => {
          const on = filter === key;
          return (
            <Pressable key={key} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => setFilter(key)} hitSlop={2} style={{ height: 40, paddingHorizontal: 16, borderRadius: 999, backgroundColor: on ? t.c.fg.primary : t.c.bg.tileRaised, justifyContent: 'center' }}>
              <Text style={{ fontSize: 14, lineHeight: 18, fontWeight: '600', color: on ? t.c.bg.ground : t.c.fg.primary }}>{label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {months.map((m) => (
        <View key={m.key} style={{ gap: 10 }}>
          <Caps style={{ paddingHorizontal: 4 }}>{m.label}</Caps>
          {m.items.map((r) => (
            <TripCard key={r.trip.id} title={r.trip.data.destination} start={r.trip.data.startDate!} status={r.trip.status ?? null} cover={r.cover} lime={r.isNext} dates={`${datesLabel(r.trip.data)}${r.days ? ` · ${plural(r.days, 'day')}` : ''}`} line={[purposeLabel(r.trip.data.purpose), r.booked].filter(Boolean).join(' · ') || null} people={r.people} when={r.when} spent={r.spend.spent} budget={r.spend.budget} over={r.spend.over} money={money} onPress={() => open(r.trip.id)} />
          ))}
        </View>
      ))}

      {ideas.length ? (
        <View style={{ gap: 10 }}>
          <Caps style={{ paddingHorizontal: 4 }}>IDEAS · NO DATES YET</Caps>
          <RowCard>
            {ideas.map((r) => (
              <Row key={r.trip.id} lead={<Disc icon="sparkle" color={t.tints.travel.ink} />} title={r.trip.title} sub={[withLine(r.people), r.spend.budget ? money(r.spend.budget) : null, r.trip.data.localCurrency].filter(Boolean).join(' · ') || null} trailing={<Chip28 label={statusLabel(r.trip.status) ?? 'Idea'} />} onPress={() => open(r.trip.id)} />
            ))}
          </RowCard>
        </View>
      ) : null}

      {years.map((y) => (
        <View key={y.year} style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', paddingHorizontal: 4 }}>
            <Caps style={{ flex: 1 }}>DONE IN {y.year} · {y.items.length}</Caps>
            <Text style={{ fontSize: 13, lineHeight: 17, fontWeight: '600', color: t.c.fg.secondary, fontVariant: ['tabular-nums'] }}>{money(y.items.reduce((n, r) => n + r.spend.spent, 0))}</Text>
          </View>
          <RowCard>
            {y.items.map((r) => (
              <Row key={r.trip.id} minHeight={48} title={r.trip.title} sub={[datesLabel(r.trip.data), r.trip.data.purpose && r.trip.data.purpose !== 'leisure' ? r.trip.data.purpose : null, withLine(r.people)].filter(Boolean).join(' · ')} trailing={<Text style={{ fontSize: 15, lineHeight: 20, fontWeight: '700', color: r.spend.over ? t.c.alert.coralText : t.c.fg.primary, fontVariant: ['tabular-nums'] }}>{money(r.spend.spent)}</Text>} onPress={() => open(r.trip.id)} />
            ))}
          </RowCard>
        </View>
      ))}

      {!shown.length ? <Text variant="caption" color="secondary" style={{ paddingHorizontal: 4 }}>{q ? `Nothing matches “${query.trim()}”.` : 'No trips here.'}</Text> : null}

      <Note icon="inbox" iconColor={t.c.accent.gold}>A ticket in Gmail for days no trip covers starts one: “Trip to Mumbai”, with the flight filed in it. The mail is read on this phone.</Note>
      <View style={{ height: 8 }} />
    </Screen>
  );
}

/** A trip on its photo: date and status over it, then dates, who's going and the budget. */
function TripCard({ title, start, status, cover, lime, dates, line, people, when, spent, budget, over, money, onPress }: { title: string; start: string; status: string | null; cover: string | null; lime: boolean; dates: string; line: string | null; people: Companion[]; when: string | null; spent: number; budget: number | null; over: boolean; money: (n: number) => string; onPress: () => void }) {
  const t = useTheme();
  const label = statusLabel(status);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${title}, ${dates}${when ? `, ${when}` : ''}`} onPress={onPress} style={({ pressed }) => ({ padding: 10, borderRadius: 24, backgroundColor: t.c.bg.tile, gap: 12, opacity: pressed ? 0.9 : 1 })}>
      <View style={{ height: 132, borderRadius: 18, overflow: 'hidden', padding: 10 }}>
        <TripPhoto uri={cover} glows={THUMB_GLOWS} shadeFrom={0.4} shade={0.45} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          {lime ? <Chip28 tone="lime" label={dayLabel(start)} /> : <GlassPill label={dayLabel(start)} />}
          {label ? <GlassPill label={label} color={status === 'planning' ? '#FFB27A' : undefined} /> : null}
        </View>
        <View style={{ marginTop: 'auto' }}>
          <SerifName size={34}>{title}</SerifName>
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 6 }}>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text variant="rowTitle" numberOfLines={1} accessibilityRole="header">{dates}</Text>
          {line ? <Text variant="caption" color="secondary" numberOfLines={1}>{line}</Text> : null}
        </View>
        {people.length ? <FaceStack people={people} max={4} /> : null}
        {when ? <Chip28 tone={lime ? 'soft' : 'quiet'} label={when} /> : null}
      </View>
      {budget ? (
        <View style={{ gap: 6, paddingHorizontal: 6, paddingBottom: 6 }}>
          <ProgressBar value={spent / budget} height={8} color={over ? t.c.alert.coralText : t.c.accent.mustard} />
          <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: '500', color: t.c.fg.secondary, fontVariant: ['tabular-nums'] }}>{money(spent)} of {money(budget)} budget</Text>
        </View>
      ) : (
        <View style={{ height: 2 }} />
      )}
    </Pressable>
  );
}
