import React, { useState, type ReactNode } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Rect } from 'react-native-svg';
import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import type { RecordControls } from '@core/registry/types';
import { useLive } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { blocks, monoFonts } from '@ui/theme/tokens';
import { Icon, ProgressBar, Text, useToast, type IconName } from '@ui/kit';
import { categoryOf } from '@modules/finance/types';
import { addToTrip, backHome, daysToStart, hasPacked, linkedTo, spentWhileAway, stillPacked, tripBookings, tripDays, tripPhase, tripSpend, tripsTo, type Booking, type TripData } from '@modules/travel';
import { airlineBadge, Chip28, companions, Dash, datesLabel, dayOf, Disc, Face, firstName, GlassPill, HERO_GLOWS, longDates, plural, purposeLabel, Row, RowCard, routes, SectionHead, SerifName, shortDay, shortIso, statusLabel, timeOf, TripPhoto, weekdayShort, WHITE, whenShort } from './parts';

/**
 * The Trip page (NR-Travel-Trip, the whole record page): the photo with the
 * name and when, then spend against the budget, who's going, the tickets, the
 * days, bookings and documents, expenses, details and the timeline. All read
 * through Links. Plus *Trips here* on a Place's page.
 */

type Props = { entity: ObjectRecord<any>; ctx: LifeOSContext; controls?: RecordControls; say?: ReactNode }; // eslint-disable-line @typescript-eslint/no-explicit-any

const CATEGORY_COLORS = [blocks.lilac, blocks.pink, blocks.sky, blocks.yellow, blocks.mint];
const ROUTE = /^(?:Flight )?(.+?) → (.+)$/;
const nights = (b: Booking) => (b.endAt ? Math.max(1, Math.round((b.endAt - b.startAt) / 86_400_000)) : null);

interface EventLine {
  id: string;
  at: number;
  day: string;
  icon: IconName;
  color: string;
  title: string;
  sub: string | null;
  timed: boolean;
}

const dayKey = (at: number) => {
  const d = new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function TripPage({ entity, ctx, controls, say }: Props) {
  const router = useRouter();
  const toast = useToast();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [allTimeline, setAllTimeline] = useState(false);
  const d = useLive(
    (os) => {
      const trip = os.records.get<TripData>(entity.id);
      if (!trip) return null;
      const now = Date.now();
      const bookings = tripBookings(os, trip.id);
      const events = os.registry.objects.has('event') ? linkedTo<{ kind?: string; startAt?: number; endAt?: number; allDay?: boolean; location?: string; flightNo?: string }>(os, trip.id, 'event') : [];
      const timed = new Map(events.map((e) => [e.id, !e.data.allDay]));
      const place = trip.data.placeId ? os.records.get(trip.data.placeId) : null;
      const parent = place ? (place.data as { parentId?: string }).parentId : undefined;
      const eventIds = new Set(events.map((e) => e.id));
      const accountOf = (id: string | undefined) => (id ? os.records.get(id)?.title ?? null : null);
      const spend = tripSpend(os, trip, now);
      const docs = [...(os.registry.objects.has('document') ? linkedTo(os, trip.id, 'document') : []), ...(os.registry.objects.has('note') ? linkedTo(os, trip.id, 'note') : [])];
      return {
        trip,
        now,
        bookings,
        spend,
        timed,
        other: events.filter((e) => e.data.kind !== 'flight' && e.data.kind !== 'stay' && e.data.startAt).map((e) => ({ id: e.id, at: e.data.startAt!, title: e.title, sub: e.data.location ?? null, timed: !e.data.allDay })),
        people: companions(os, trip),
        packed: hasPacked(os, trip),
        still: stillPacked(os, trip.id),
        cover: os.attachments.cover(trip.id)?.uri ?? null,
        files: os.attachments.forEntity(trip.id).filter((a) => a.kind !== 'cover'),
        place: place ? { id: place.id, title: place.title, parent: parent ? os.records.get(parent)?.title ?? null : null } : null,
        here: trip.data.placeId ? tripsTo(os, trip.data.placeId).length : 0,
        loose: spentWhileAway(os, trip),
        docs,
        toCheck: os.filings.toCheck(200).filter((f) => f.entityId === trip.id || (f.entityId != null && eventIds.has(f.entityId))),
        expenses: spend.items.map((x) => ({ id: x.id, title: x.title, amount: x.data.amount ?? 0, date: x.data.date ?? null, category: x.data.category, account: accountOf((x.data as { accountId?: string }).accountId) })),
        tags: os.tags.forEntity(trip.id).map((x) => x.name),
        timeline: os.records.timeline.forEntity(trip.id, 60),
      };
    },
    [entity.id, entity.version],
  );
  if (!d) return null;
  const { trip, spend } = d;
  const money = (n: number) => ctx.format.currency(Math.round(n));
  const phase = tripPhase(trip.data, d.now);
  const when = whenShort(trip.data, d.now);
  const days = tripDays(trip.data);
  const going = d.people.length + 1;
  const stay = d.bookings.find((b) => b.kind === 'stay');
  const flights = d.bookings.filter((b) => b.kind === 'flight');
  const status = statusLabel(trip.status);
  const open = (id: string, object: string) => router.push(`/entity/${object}/${id}` as never);
  const openPack = () => router.push(routes.pack(trip.id) as never);
  const unpack = () => {
    const r = backHome(ctx, trip.id);
    toast.show({ message: `${r.count} in the wash`, icon: 'drop', undo: r.undo });
  };
  const addLoose = (id: string, title: string) => toast.show({ message: `${title} added to ${trip.title}`, icon: 'check', undo: addToTrip(ctx, trip.id, id) });
  const newExpense = () => router.push({ pathname: '/entity/[type]/new', params: { type: 'transaction', tripId: trip.id, currency: trip.data.localCurrency ?? '' } } as never);

  const until = phase === 'upcoming' ? daysToStart(trip.data, d.now) : days;
  const untilLabel = phase === 'upcoming' ? 'Until departure' : phase === 'away' ? (when ? when.replace(/^\w/, (c) => c.toUpperCase()) : 'Away now') : phase === 'back' ? 'Away' : 'No dates yet';
  const lead = flights.find((f) => f.startAt > d.now) ?? flights[0];

  /* The days: every Event, a stay as its check-in and check-out. */
  const lines: EventLine[] = [];
  for (const b of d.bookings) {
    if (b.kind === 'flight') {
      lines.push({ id: b.id, at: b.startAt, day: dayKey(b.startAt), icon: 'plane', color: t.tints.travel.ink, title: b.title, sub: [b.flightNo ?? b.airline, b.location].filter(Boolean).join(' · ') || null, timed: d.timed.get(b.id) ?? true });
      continue;
    }
    const name = b.title.replace(/^Stay · /, '');
    const n = nights(b);
    lines.push({ id: b.id, at: b.startAt, day: dayKey(b.startAt), icon: 'moon', color: blocks.sky, title: `Check in · ${name}`, sub: [b.location, n ? plural(n, 'night') : null].filter(Boolean).join(' · ') || null, timed: d.timed.get(b.id) ?? true });
    if (b.endAt) lines.push({ id: `${b.id}:out`, at: b.endAt, day: dayKey(b.endAt), icon: 'moon', color: blocks.sky, title: `Check out · ${name}`, sub: 'Stay ends', timed: d.timed.get(b.id) ?? true });
  }
  for (const e of d.other) lines.push({ id: e.id, at: e.at, day: dayKey(e.at), icon: 'calendar', color: blocks.pink, title: e.title, sub: e.sub, timed: e.timed });
  lines.sort((a, b) => a.at - b.at);
  const byDay: Array<{ day: string; items: EventLine[] }> = [];
  for (const l of lines) {
    const g = byDay[byDay.length - 1];
    if (g?.day === l.day) g.items.push(l);
    else byDay.push({ day: l.day, items: [l] });
  }
  const dayNumber = (day: string) => (trip.data.startDate ? Math.round((new Date(`${day}T12:00:00`).getTime() - new Date(`${trip.data.startDate}T12:00:00`).getTime()) / 86_400_000) + 1 : 0);

  const steps = stepsOf(trip.status ?? null, d.bookings, d.packed, phase, d.now);
  const shownTimeline = allTimeline ? d.timeline : d.timeline.slice(0, 3);

  return (
    <View>
      <View style={{ minHeight: 540 }}>
        <TripPhoto uri={d.cover} glows={HERO_GLOWS} fade={300} />
        <View style={{ paddingTop: insets.top + 12, paddingHorizontal: t.layout.gutter }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <RoundOnPhoto icon="chevron-left" label="Back to trips" onPress={() => controls?.back()} />
            <Text style={{ fontSize: 11, lineHeight: 14, fontWeight: '600', letterSpacing: 4, color: 'rgba(255,255,255,0.8)' }}>YOUR TRIP</Text>
            <RoundOnPhoto icon="more" label="More" onPress={() => controls?.more()} />
          </View>
          <View style={{ alignItems: 'center', gap: 10, paddingTop: 44 }}>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {status ? (trip.status === 'booked' ? <Chip28 tone="lime" label={status} /> : <GlassPill label={status} color={trip.status === 'planning' ? '#FFB27A' : undefined} />) : null}
              {when ? <GlassPill label={when} /> : null}
            </View>
            <SerifName size={84} center>{trip.data.destination}</SerifName>
            <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: '600', letterSpacing: 4, textTransform: 'uppercase', color: 'rgba(255,255,255,0.85)', textAlign: 'center', fontVariant: ['tabular-nums'] }}>{longDates(trip.data)}</Text>
            <Text numberOfLines={2} style={{ fontSize: 13, lineHeight: 17, fontWeight: '500', color: 'rgba(255,255,255,0.8)', textAlign: 'center' }}>{[purposeLabel(trip.data.purpose), stay ? `stay at ${stay.title.replace(/^Stay · /, '')}` : null, d.people.length ? `${going} going` : null].filter(Boolean).join(' · ')}</Text>
            <View style={{ flexDirection: 'row', gap: 8, paddingTop: 8 }}>
              <Pressable accessibilityRole="button" onPress={() => controls?.edit()} style={({ pressed }) => ({ height: 44, paddingHorizontal: 22, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.45)', backgroundColor: 'rgba(255,255,255,0.06)', justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}>
                <Text style={{ fontSize: 14, lineHeight: 18, fontWeight: '600', color: WHITE }}>Edit</Text>
              </Pressable>
              {phase === 'back' ? (
                d.still ? <HeroButton icon="drop" title={`Back home: ${d.still} to the wash`} onPress={unpack} /> : null
              ) : (
                <HeroButton icon="bag" title={d.packed ? 'Packed' : 'Pack'} onPress={openPack} />
              )}
            </View>
          </View>
        </View>
      </View>

      <View style={{ paddingHorizontal: t.layout.gutter, gap: 24 }}>
        {say}

        <View style={{ padding: 18, borderRadius: 24, backgroundColor: t.c.bg.tile, gap: 14 }}>
          <View style={{ flexDirection: 'row', gap: 16 }}>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ fontSize: 26, lineHeight: 30, fontWeight: '700', letterSpacing: -0.5, color: spend.over ? t.c.alert.coralText : t.c.fg.primary, fontVariant: ['tabular-nums'] }}>{money(spend.spent)}</Text>
              <Text numberOfLines={1} style={{ fontSize: 13, lineHeight: 17, fontWeight: '500', color: t.c.fg.secondary, fontVariant: ['tabular-nums'] }}>{spend.budget != null ? `of ${money(spend.budget)} budget` : 'spent · no budget'}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Text numberOfLines={1} style={{ fontSize: 26, lineHeight: 30, fontWeight: '700', letterSpacing: -0.5, fontVariant: ['tabular-nums'] }}>
                {until ?? '·'}{until != null ? <Text style={{ fontSize: 15, fontWeight: '600', color: t.c.fg.secondary }}> {until === 1 ? 'day' : 'days'}</Text> : null}
              </Text>
              <Text numberOfLines={1} style={{ fontSize: 13, lineHeight: 17, fontWeight: '500', color: t.c.fg.secondary }}>{untilLabel}</Text>
            </View>
          </View>
          {spend.budget ? <ProgressBar value={spend.spent / spend.budget} height={14} color={spend.over ? t.c.alert.coralText : t.c.accent.mustard} accessibilityLabel={`${money(spend.spent)} of ${money(spend.budget)} spent`} /> : null}
          {spend.byCategory.length ? (
            <>
              <View style={{ flexDirection: 'row', gap: 3 }}>
                {spend.byCategory.map((c, i) => (
                  <View key={c.category} style={{ flexGrow: Math.max(1, Math.round(c.amount)), flexBasis: 0, minWidth: 5, height: 8, borderRadius: 4, backgroundColor: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }} />
                ))}
              </View>
              <View style={{ gap: 2 }}>
                {spend.byCategory.map((c, i) => (
                  <View key={c.category} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, height: 26 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }} />
                    <Text numberOfLines={1} style={{ flex: 1, fontSize: 14, lineHeight: 18, fontWeight: '600' }}>{categoryOf(c.category)?.label ?? c.category}</Text>
                    <Text style={{ fontSize: 14, lineHeight: 18, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{money(c.amount)}</Text>
                  </View>
                ))}
              </View>
            </>
          ) : null}
          {spend.left != null ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 26 }}>
              <Text numberOfLines={1} style={{ flex: 1, fontSize: 13, lineHeight: 17, fontWeight: '500', color: t.c.fg.secondary }}>{spend.over ? 'Over budget' : spend.leftPerDay != null ? `Left · ${money(spend.leftPerDay)} a day` : spend.perDay != null ? `Left · spent ${money(spend.perDay)} a day` : 'Left'}</Text>
              <Text style={{ fontSize: 14, lineHeight: 18, fontWeight: '700', color: spend.over ? t.c.alert.coralText : t.c.fg.primary, fontVariant: ['tabular-nums'] }}>{money(Math.abs(spend.left))}</Text>
            </View>
          ) : null}
        </View>

        <View style={{ gap: 10 }}>
          <SectionHead title="Who’s going" action="Add" onAction={() => controls?.edit()} />
          <RowCard>
            <Row minHeight={52} lead={<Face id="you" name="You" color={t.c.accent.mustard} />} title="You" />
            {d.people.map((p) => (
              <Row key={p.id} minHeight={52} lead={<Face id={p.id} name={p.name} photo={p.photo} />} title={p.name} sub={[p.data.relationship?.replace(/^\w/, (c) => c.toUpperCase()), p.data.city].filter(Boolean).join(' · ') || null} trailing={<Icon name="chevron-right" size={18} color={t.c.fg.secondary} />} onPress={() => open(p.id, 'person')} />
            ))}
          </RowCard>
        </View>

        {flights.length || !d.bookings.length ? (
          <View style={{ gap: 10 }}>
            <SectionHead title="Tickets" sub={flights.length ? plural(flights.length, 'flight') : null} />
            {lead ? (
              <>
                <View style={{ paddingTop: flights.length > 1 ? 14 : 0 }}>
                  {flights.length > 1 ? <View style={{ position: 'absolute', left: 14, right: 14, top: 0, height: 60, borderRadius: 24, backgroundColor: t.c.line }} /> : null}
                  <Pass b={lead} index={flights.indexOf(lead)} total={flights.length} destination={trip.data.destination} dates={longDates(trip.data)} now={d.now} timed={d.timed} onPress={(id) => open(id, 'event')} />
                </View>
                {flights
                  .filter((f) => f !== lead)
                  .map((f) => {
                    const badge = airlineBadge(f.flightNo);
                    return (
                      <View key={f.id} style={{ padding: 14, borderRadius: 24, backgroundColor: t.c.bg.tile }}>
                        <Row lead={badge ? <Disc letters={badge.code} fill={badge.color} /> : <Disc icon="plane" color={t.tints.travel.ink} />} title={[f.location, f.flightNo].filter(Boolean).join(' · ') || f.title} sub={[f.airline, dayOf(f.startAt), f === flights[flights.length - 1] ? 'coming back' : null].filter(Boolean).join(' · ')} trailing={d.timed.get(f.id) ? <Mono bold size={15}>{timeOf(f.startAt)}</Mono> : null} onPress={() => open(f.id, 'event')} />
                      </View>
                    );
                  })}
              </>
            ) : (
              <Text variant="caption" color="secondary" style={{ paddingHorizontal: 4 }}>Booking mails from IndiGo, Air India, MakeMyTrip, Booking.com and Airbnb land here on their own.</Text>
            )}
          </View>
        ) : null}

        {steps.length && (byDay.length || trip.data.startDate) ? (
          <View style={{ gap: 10 }}>
            <SectionHead title="Days" sub="Events in this trip, by day" />
            <View style={{ padding: 18, borderRadius: 24, backgroundColor: t.c.bg.tile, gap: 20 }}>
              <Stepper steps={steps} />
              {byDay.map((g) => {
                const n = dayNumber(g.day);
                return (
                  <View key={g.day} style={{ gap: 12 }}>
                    <Text variant="labelCaps" color="secondary" style={{ paddingLeft: 50 }}>{dayOf(new Date(`${g.day}T12:00:00`).getTime()).toUpperCase()}{n > 0 ? ` · DAY ${n}` : ''}</Text>
                    <Rail>
                      {g.items.map((l) => (
                        <RailRow key={l.id} ground={t.c.bg.tile} icon={l.icon} color={l.color} title={l.title} sub={l.sub} right={l.timed ? timeOf(l.at) : null} onPress={() => open(l.id.split(':')[0]!, 'event')} />
                      ))}
                    </Rail>
                  </View>
                );
              })}
            </View>
          </View>
        ) : null}

        {d.bookings.some((b) => b.kind === 'stay') || d.docs.length || d.files.length || d.toCheck.length ? (
          <View style={{ gap: 10 }}>
            <SectionHead title="Bookings & documents" sub="Linked to this trip" />
            <RowCard>
              {d.bookings.filter((b) => b.kind === 'stay').map((b) => (
                <Row key={b.id} minHeight={52} lead={<Disc icon="moon" color={blocks.sky} />} title={b.title} sub={`Event · stay · ${datesLabel({ startDate: dayKey(b.startAt), endDate: b.endAt ? dayKey(b.endAt) : undefined })}`} onPress={() => open(b.id, 'event')} />
              ))}
              {d.docs.map((x) => (
                <Row key={x.id} minHeight={52} lead={<Disc icon="file" color={blocks.yellow} />} title={x.title} sub={x.object === 'note' ? 'Note' : 'Document'} onPress={() => open(x.id, x.object)} />
              ))}
              {d.files.map((a) => (
                <Row key={a.id} minHeight={52} lead={<Disc icon={a.kind === 'image' ? 'image' : 'paperclip'} color={blocks.yellow} />} title={a.name} sub="Attached · on this phone" onPress={() => void Linking.openURL(a.uri)} />
              ))}
              {d.toCheck.map((f) => (
                <View key={f.id} style={{ gap: 10, paddingTop: 6, paddingBottom: 2 }}>
                  <Row lead={<Disc icon="plane" color={t.tints.travel.ink} />} title={f.label} sub={f.flag ?? `From ${f.source}`} trailing={<Chip28 tone="yellow" label="To check" />} />
                  <View style={{ marginLeft: 54, flexDirection: 'row', gap: 8 }}>
                    <CheckButton title="That’s right" tone="white" onPress={() => ctx.filings.setChecked(f.id)} />
                    <CheckButton title="Fix" tone="raised" onPress={() => router.push((f.entityId === trip.id ? `/entity/trip/${trip.id}/edit` : `/entity/event/${f.entityId}/edit`) as never)} />
                  </View>
                </View>
              ))}
            </RowCard>
          </View>
        ) : null}

        <View style={{ gap: 10 }}>
          <SectionHead title="Expenses" sub="Payments linked to this trip" action="Add" onAction={newExpense} />
          {d.expenses.length ? (
            <RowCard>
              {d.expenses.map((x) => {
                const cat = categoryOf(x.category);
                const i = spend.byCategory.findIndex((c) => c.category === x.category);
                const air = /indigo/i.test(x.title) ? airlineBadge('6E') : /air india express/i.test(x.title) ? airlineBadge('IX') : null;
                return (
                  <Row key={x.id} minHeight={52} lead={air ? <Disc letters={air.code} fill={air.color} /> : <Disc letters={x.title.trim().charAt(0).toUpperCase()} color={CATEGORY_COLORS[Math.max(0, i) % CATEGORY_COLORS.length]} />} title={x.title} sub={[cat?.label, x.date ? shortIso(x.date) : null, x.account].filter(Boolean).join(' · ')} trailing={<Text style={{ fontSize: 16, lineHeight: 21, fontWeight: '700', fontVariant: ['tabular-nums'] }}>−{money(x.amount)}</Text>} onPress={() => open(x.id, 'transaction')} />
                );
              })}
            </RowCard>
          ) : (
            <Text variant="caption" color="secondary" style={{ paddingHorizontal: 4 }}>Nothing on this trip yet. A fare from a booking mail counts on its own; add the rest here.</Text>
          )}
        </View>

        {d.loose.length ? (
          <View style={{ gap: 10 }}>
            <SectionHead title="Spent on those days" sub="On no trip yet. Add the ones that were this trip." />
            <RowCard>
              {d.loose.slice(0, 10).map((x) => (
                <Row key={x.id} minHeight={52} lead={<Disc letters={x.title.trim().charAt(0).toUpperCase()} color={t.c.fg.secondary} />} title={x.title} sub={[x.data.date ? shortIso(x.data.date) : null, money(x.data.amount ?? 0)].filter(Boolean).join(' · ')} trailing={<CheckButton title="Add" tone="raised" onPress={() => addLoose(x.id, x.title)} />} />
              ))}
            </RowCard>
          </View>
        ) : null}

        <View style={{ gap: 10 }}>
          <SectionHead title="Details" />
          <View style={{ paddingVertical: 14, paddingHorizontal: 18, borderRadius: 24, backgroundColor: t.c.bg.tile, gap: 8 }}>
            {d.place ? (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52 }}>
                  <View style={{ flex: 1, minWidth: 0, gap: 2, alignItems: 'flex-start' }}>
                    <DetailLabel>Destination</DetailLabel>
                    <Pressable accessibilityRole="button" onPress={() => open(d.place!.id, 'place')} hitSlop={7} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 30, paddingLeft: 9, paddingRight: 12, borderRadius: 999, backgroundColor: t.c.bg.tileRaised, maxWidth: '100%' }}>
                      <Icon name="location" size={13} color={blocks.mint} />
                      <Text numberOfLines={1} style={{ fontSize: 13, lineHeight: 17, fontWeight: '600', flexShrink: 1 }}>{d.place.title}{d.place.parent ? ` · Place in ${d.place.parent}` : ''}</Text>
                    </Pressable>
                  </View>
                  {d.here > 1 ? <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: '600', color: t.c.fg.secondary }}>{d.here} trips here</Text> : null}
                </View>
                <View style={{ height: 1, backgroundColor: t.c.line }} />
              </>
            ) : null}
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1, gap: 2, minHeight: 52, justifyContent: 'center' }}>
                <DetailLabel>Purpose</DetailLabel>
                <Text variant="rowTitle" numberOfLines={1}>{purposeLabel(trip.data.purpose) ?? 'Not set'}</Text>
              </View>
              <View style={{ flex: 1, gap: 2, minHeight: 52, justifyContent: 'center' }}>
                <DetailLabel>Local currency</DetailLabel>
                <Text variant="rowTitle" numberOfLines={1}>{trip.data.localCurrency ?? 'Not set'}</Text>
              </View>
            </View>
            {trip.data.notes ? (
              <>
                <View style={{ height: 1, backgroundColor: t.c.line }} />
                <View style={{ gap: 4, paddingTop: 8, paddingBottom: 6 }}>
                  <DetailLabel>Notes</DetailLabel>
                  <Text style={{ fontSize: 15, lineHeight: 22, fontWeight: '500' }}>{trip.data.notes}</Text>
                </View>
              </>
            ) : null}
            {d.tags.length ? (
              <>
                <View style={{ height: 1, backgroundColor: t.c.line }} />
                <Pressable accessibilityRole="button" accessibilityLabel={`Tags: ${d.tags.join(', ')}`} onPress={() => controls?.tags()} style={{ gap: 2, minHeight: 52, justifyContent: 'center' }}>
                  <DetailLabel>Tags</DetailLabel>
                  <Text variant="rowTitle" numberOfLines={1}>{d.tags.join(', ')}</Text>
                </Pressable>
              </>
            ) : null}
          </View>
        </View>

        {d.timeline.length ? (
          <View style={{ gap: 12 }}>
            <SectionHead title="Timeline" action={d.timeline.length > 3 ? (allTimeline ? 'Less' : `All ${d.timeline.length}`) : undefined} onAction={() => setAllTimeline((a) => !a)} />
            <Rail>
              {shownTimeline.map((e) => {
                const mail = e.kind === 'email';
                return <RailRow key={e.id} ground={t.c.bg.ground} icon={mail ? 'inbox' : e.actor === 'assistant' ? 'brain' : 'edit'} color={mail ? t.c.accent.gold : t.c.fg.primary} title={e.title} sub={e.body} right={shortDay(e.occurredAt)} />;
              })}
            </Rail>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function RoundOnPhoto({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)', backgroundColor: 'rgba(22,22,26,0.5)', alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}>
      <Icon name={icon} size={18} color={WHITE} />
    </Pressable>
  );
}

function HeroButton({ icon, title, onPress }: { icon: IconName; title: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, paddingHorizontal: 22, borderRadius: 999, backgroundColor: t.c.accent.mustard, flexShrink: 1, opacity: pressed ? 0.85 : 1 })}>
      <Icon name={icon} size={16} color={t.c.fg.onAccent} />
      <Text numberOfLines={1} style={{ fontSize: 15, lineHeight: 20, fontWeight: '700', color: t.c.fg.onAccent, flexShrink: 1 }}>{title}</Text>
    </Pressable>
  );
}

function CheckButton({ title, tone, onPress }: { title: string; tone: 'white' | 'raised'; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={2} style={({ pressed }) => ({ height: 40, paddingHorizontal: 16, borderRadius: 999, backgroundColor: tone === 'white' ? t.c.fg.primary : t.c.bg.tileRaised, justifyContent: 'center', flexShrink: 0, opacity: pressed ? 0.8 : 1 })}>
      <Text style={{ fontSize: 14, lineHeight: 18, fontWeight: '600', color: tone === 'white' ? t.c.bg.ground : t.c.fg.primary }}>{title}</Text>
    </Pressable>
  );
}

function DetailLabel({ children }: { children: string }) {
  const t = useTheme();
  return <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: '500', color: t.c.fg.secondary }}>{children}</Text>;
}

function Mono({ children, size = 11, bold, color }: { children: ReactNode; size?: number; bold?: boolean; color?: string }) {
  const t = useTheme();
  return <Text style={{ fontFamily: monoFonts[bold ? 700 : 500], fontSize: size, lineHeight: Math.round(size * 1.35), color: color ?? t.c.fg.primary, fontVariant: ['tabular-nums'] }}>{children}</Text>;
}

/** The rail behind a day's or the timeline's rows. */
function Rail({ children }: { children: ReactNode }) {
  const t = useTheme();
  const n = React.Children.count(children);
  return (
    <View style={{ gap: 18 }}>
      {n > 1 ? <View style={{ position: 'absolute', left: 17, top: 18, bottom: 18, width: 2, borderRadius: 1, backgroundColor: t.c.rail }} /> : null}
      {children}
    </View>
  );
}

function RailRow({ ground, icon, color, title, sub, right, onPress }: { ground: string; icon: IconName; color: string; title: string; sub?: string | null; right?: string | null; onPress?: () => void }) {
  const t = useTheme();
  const body = (
    <>
      <View style={{ width: 44, height: 44, margin: -4, borderRadius: 22, backgroundColor: ground, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: t.c.bg.tileRaised, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon} size={16} color={color} />
        </View>
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2, paddingTop: 7 }}>
        <Text variant="rowTitle" numberOfLines={1}>{title}</Text>
        {sub ? <Text variant="caption" color="secondary" numberOfLines={1}>{sub}</Text> : null}
      </View>
      {right ? (
        <View style={{ paddingTop: 10 }}>
          <Mono size={12} color={t.c.fg.secondary}>{right}</Mono>
        </View>
      ) : null}
    </>
  );
  const style = { flexDirection: 'row', alignItems: 'flex-start', gap: 14 } as const;
  if (!onPress) return <View style={style}>{body}</View>;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={[title, sub, right].filter(Boolean).join(', ')} onPress={onPress} style={({ pressed }) => [style, { minHeight: 44, opacity: pressed ? 0.75 : 1 }]}>
      {body}
    </Pressable>
  );
}

type StepState = 'done' | 'now' | 'later';

/** Booked, Pack, Flight, Stay, Home, as far as this trip has them. */
function stepsOf(status: string | null, bookings: Booking[], packed: boolean, phase: string, now: number): Array<{ label: string; state: StepState }> {
  const flight = bookings.find((b) => b.kind === 'flight');
  const stay = bookings.find((b) => b.kind === 'stay');
  const raw: Array<{ label: string; done: boolean }> = [
    { label: 'BOOKED', done: status === 'booked' || status === 'ongoing' || status === 'done' || bookings.length > 0 },
    { label: 'PACK', done: packed || phase === 'back' },
    ...(flight ? [{ label: 'FLIGHT', done: flight.startAt <= now }] : []),
    ...(stay ? [{ label: 'STAY', done: stay.startAt <= now }] : []),
    { label: 'HOME', done: phase === 'back' },
  ];
  let found = false;
  return raw.map((s) => {
    if (s.done) return { label: s.label, state: 'done' as const };
    if (found) return { label: s.label, state: 'later' as const };
    found = true;
    return { label: s.label, state: 'now' as const };
  });
}

function Stepper({ steps }: { steps: Array<{ label: string; state: StepState }> }) {
  const t = useTheme();
  const lime = t.c.accent.mustard;
  const dim = 'rgba(245,245,247,0.32)';
  return (
    <View style={{ flexDirection: 'row' }} accessibilityRole="image" accessibilityLabel={steps.map((s) => `${s.label.toLowerCase()} ${s.state === 'done' ? 'done' : s.state === 'now' ? 'next' : ''}`.trim()).join(', ')}>
      {steps.map((s, i) => (
        <View key={s.label} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
          <View style={{ height: 24, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' }}>
            {i ? <View style={{ position: 'absolute', left: 0, right: '50%', marginRight: 12, top: 11, height: 1.5, backgroundColor: s.state === 'later' ? t.c.rail : lime }} /> : null}
            {i < steps.length - 1 ? <View style={{ position: 'absolute', left: '50%', right: 0, marginLeft: 12, top: 11, height: 1.5, backgroundColor: steps[i + 1]!.state === 'later' ? t.c.rail : lime }} /> : null}
            {s.state === 'done' ? (
              <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: lime, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="check" size={14} color={t.c.fg.onAccent} />
              </View>
            ) : s.state === 'now' ? (
              <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: lime, alignItems: 'center', justifyContent: 'center' }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: lime }} />
              </View>
            ) : (
              <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: dim }} />
            )}
          </View>
          <Mono size={9} color={s.state === 'now' ? t.c.fg.primary : t.c.fg.secondary}>{s.label}</Mono>
        </View>
      ))}
    </View>
  );
}

/** A stable scatter of bars from the flight, as on the artboard; it scans as nothing. */
function Barcode({ seed }: { seed: string }) {
  const t = useTheme();
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619) >>> 0;
  const rnd = () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0), (h % 1000) / 1000);
  const bars: Array<{ x: number; w: number; o: number }> = [];
  let x = 0;
  while (x < 228) {
    const w = [1.5, 2.2, 3][Math.floor(rnd() * 3)]!;
    bars.push({ x, w, o: rnd() > 0.7 ? 1 : 0.8 });
    x += w + 1.5 + rnd() * 1.5;
  }
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ alignSelf: 'stretch', height: 34 }}>
      <Svg width="100%" height={34} viewBox="0 0 230 34" preserveAspectRatio="none">
        {bars.map((b, i) => <Rect key={i} x={b.x} y={0} width={b.w} height={34} fill={t.c.fg.primary} opacity={b.o} />)}
      </Svg>
    </View>
  );
}

/** Text standing on its side, in a box as narrow as a line. */
function SideText({ children, dir }: { children: string; dir: 'up' | 'down' }) {
  const t = useTheme();
  return (
    <View style={{ width: 14, height: 84, alignItems: 'center', justifyContent: 'center' }}>
      <Text numberOfLines={1} style={{ width: 84, textAlign: 'center', fontFamily: monoFonts[500], fontSize: 10, lineHeight: 13, letterSpacing: 0.6, color: t.c.fg.secondary, transform: [{ rotate: dir === 'up' ? '-90deg' : '90deg' }] }}>{children}</Text>
    </View>
  );
}

/** The boarding pass: the airline, the route in big letters, the times, then the stub. */
function Pass({ b, index, total, destination, dates, now, timed, onPress }: { b: Booking; index: number; total: number; destination: string; dates: string; now: number; timed: Map<string, boolean>; onPress: (id: string) => void }) {
  const t = useTheme();
  const badge = airlineBadge(b.flightNo);
  const route = ROUTE.exec(b.title);
  const codes = b.location ? ROUTE.exec(b.location) : null;
  const known = timed.get(b.id) ?? true;
  const direction = index === 0 ? 'going' : index === total - 1 ? 'coming back' : null;
  const opens = b.startAt - 48 * 3_600_000;
  const checkIn = b.startAt < now ? null : opens > now ? `CHECK-IN OPENS ${weekdayShort(opens).toUpperCase()}` : 'CHECK-IN OPEN';
  const mins = b.endAt ? Math.round((b.endAt - b.startAt) / 60_000) : null;
  const length = mins && mins > 0 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : null;
  const city = { fontSize: 34, lineHeight: 38, fontWeight: '700', letterSpacing: -0.5 } as const;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Flight ticket, ${[b.airline, b.flightNo].filter(Boolean).join(' ')}, ${route ? `${route[1]} to ${route[2]}` : b.title}`} onPress={() => onPress(b.id)} style={({ pressed }) => ({ padding: 18, borderRadius: 24, backgroundColor: t.c.bg.tile, gap: 14, overflow: 'hidden', opacity: pressed ? 0.92 : 1 })}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {badge ? <Disc letters={badge.code} fill={badge.color} /> : <Disc icon="plane" color={t.tints.travel.ink} />}
        <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
          <Text variant="tileTitle" numberOfLines={1}>{[b.airline, b.flightNo].filter(Boolean).join(' ') || 'Flight'}</Text>
          <Text variant="caption" color="secondary" numberOfLines={1}>{[dayOf(b.startAt), direction].filter(Boolean).join(' · ')}</Text>
        </View>
        {b.pnr ? <Chip28 tone="soft" label="Confirmed" /> : null}
      </View>
      {route || codes ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ gap: 2, flexShrink: 1 }}>
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} style={city}>{codes?.[1] ?? firstName(route?.[1] ?? '').slice(0, 3).toUpperCase()}</Text>
          {route ? <Text variant="caption" color="secondary" numberOfLines={1}>{route[1]}</Text> : null}
        </View>
        <View style={{ flex: 1, alignItems: 'center', gap: 4, minWidth: 40 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'stretch' }}>
            <View style={{ flex: 1 }}><Dash color="rgba(245,245,247,0.32)" /></View>
            <Icon name="plane" size={18} color={t.c.accent.gold} style={{ transform: [{ rotate: '45deg' }] }} />
            <View style={{ flex: 1 }}><Dash color="rgba(245,245,247,0.32)" /></View>
          </View>
          {length ? <Mono color={t.c.fg.secondary}>{length}</Mono> : null}
        </View>
        <View style={{ gap: 2, alignItems: 'flex-end', flexShrink: 1 }}>
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} style={city}>{codes?.[2] ?? firstName(route?.[2] ?? '').slice(0, 3).toUpperCase()}</Text>
          {route ? <Text variant="caption" color="secondary" numberOfLines={1}>{route[2]}</Text> : null}
        </View>
      </View> : null}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <Mono bold size={15}>{known ? timeOf(b.startAt) : ''}</Mono>
        {checkIn ? <Mono color={t.c.fg.secondary}>{checkIn}</Mono> : null}
        <Mono bold size={15}>{known && b.endAt ? timeOf(b.endAt) : ''}</Mono>
      </View>
      <View style={{ marginHorizontal: -18, marginVertical: 4, height: 2 }}>
        <Dash color="rgba(245,245,247,0.22)" />
        <View style={{ position: 'absolute', left: -8, top: -7, width: 16, height: 16, borderRadius: 8, backgroundColor: t.c.bg.ground }} />
        <View style={{ position: 'absolute', right: -8, top: -7, width: 16, height: 16, borderRadius: 8, backgroundColor: t.c.bg.ground }} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 4 }}>
        {b.pnr ? <SideText dir="up">{`PNR ${b.pnr}`}</SideText> : null}
        <View style={{ flex: 1, minWidth: 0, alignItems: 'center', gap: 8 }}>
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ fontFamily: monoFonts[700], fontSize: 11, lineHeight: 15, letterSpacing: 0.7, textTransform: 'uppercase' }}>* * *  {destination} · {dates}  * * *</Text>
          <Barcode seed={b.id} />
        </View>
        {b.pnr ? <SideText dir="down">{`PNR ${b.pnr}`}</SideText> : null}
      </View>
    </Pressable>
  );
}

/** Trips here, on a Place's page (the Trip's *to* Link). */
export function TripsHere({ entity }: Props) {
  const router = useRouter();
  const t = useTheme();
  const list = useLive((os) => tripsTo(os, entity.id), [entity.id]);
  if (!list.length) return null;
  return (
    <View style={{ gap: 10 }}>
      <SectionHead title="Trips here" sub={plural(list.length, 'trip')} />
      <RowCard>
        {list.map((x) => {
          const when = whenShort(x.data);
          return <Row key={x.id} lead={<Disc icon="plane" color={t.tints.travel.ink} />} title={x.title} sub={datesLabel(x.data)} trailing={when ? <Chip28 label={when} /> : null} onPress={() => router.push(routes.trip(x.id) as never)} />;
        })}
      </RowCard>
    </View>
  );
}
