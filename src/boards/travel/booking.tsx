import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { LifeOSContext } from '@core/registry/context';
import { useLive } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Button, EmptyState, Icon, IconButton, ProgressBar, Screen, Text, useToast } from '@ui/kit';
import { moneyOf, STATUS_LABEL, statusOf, stepsOf, type BookingStatus, type StopData, type TravelEvent, type TripData } from '@modules/travel';
import { datesLabel, dayOf, Note, Row, RowCard, SectionHead, timeOf } from './parts';
import { amount, approxInr, dayOfAt, openUrl, PayChip } from './bookings';
import { StopDisc } from './plan';

/**
 * A booking's page (the trip template, R7g slice 2; JP-Booking): a stay, a
 * ticket, a journey or an activity with everything it keeps. Its status, the
 * total with paid and still to pay, who it covers and who paid, how the rest
 * is paid, the card's date, free cancellation, check-in and out, getting
 * there, the hidden reference, its links and papers; a journey's links to
 * book, last connection and steps.
 */

const STATUSES: BookingStatus[] = ['confirmed', 'pending', 'planned', 'cancelled'];

export function BookingScreen({ ctx, params }: { ctx: LifeOSContext; params: Record<string, string> }) {
  const router = useRouter();
  const toast = useToast();
  const t = useTheme();
  const [showRef, setShowRef] = useState(false);
  const d = useLive(
    (os) => {
      const e = os.records.get<TravelEvent>(params.event ?? '');
      if (e?.object !== 'event') return null;
      const tripId = os.links.forEntity(e.id, 'part_of').find((r) => r.other.object === 'trip')?.other.id ?? os.links.forEntity(e.id, 'trip').find((r) => r.other.object === 'trip')?.other.id;
      const trip = tripId ? os.records.get<TripData>(tripId) : null;
      const stop = (id?: string) => (id ? os.records.get<StopData>(id) ?? null : null);
      const papers = os.registry.objects.has('document') ? os.links.forEntity(e.id, 'for').filter((r) => r.other.object === 'document' && r.direction === 'in').map((r) => ({ id: r.other.id, title: r.other.title })) : [];
      const people = (e.data.personIds ?? []).map((id) => os.records.get(id)?.title).filter((x): x is string => !!x);
      const payer = !e.data.paidBy ? null : e.data.paidBy === 'me' ? 'You' : os.records.get(e.data.paidBy)?.title ?? null;
      return { e, trip, stop: stop(e.data.stopId), from: stop(e.data.fromStopId), to: stop(e.data.toStopId), papers, people, payer };
    },
    [params.event],
  );
  const back = () => (router.canGoBack() ? router.back() : router.replace('/module/travel/index' as never));
  if (!d) {
    return (
      <Screen title="Booking" onBack={back}>
        <EmptyState icon="file" tint="travel" line="That booking isn’t here any more." />
      </Screen>
    );
  }
  const { e } = d;
  const kind = e.data.kind ?? 'stay';
  const status = statusOf(e);
  const m = moneyOf(e);
  const look = d.trip?.data.look;
  const rate = d.trip?.data.fxRate;
  const covers = d.people.length + 1;
  const setStatus = (s: BookingStatus) => {
    const prev = e.data.booking;
    ctx.records.update<TravelEvent>(e.id, { data: { booking: s } }, 'user');
    toast.show({ message: `${e.title.replace(/^(Stay|Ticket) · /, '')}: ${STATUS_LABEL[s].toLowerCase()}`, icon: 'check', undo: () => void ctx.records.update<TravelEvent>(e.id, { data: { booking: prev } }, 'user') });
  };
  const eyebrow = kind === 'stay' ? 'THE STAY' : kind === 'ticket' ? 'A TICKET' : kind === 'journey' ? 'A JOURNEY' : 'A BOOKING';
  const nights = kind === 'stay' && e.data.endAt ? Math.max(1, Math.round((e.data.endAt - e.data.startAt!) / 86_400_000)) : null;
  const when = kind === 'journey' ? `${dayOf(e.data.startAt!)}${e.data.allDay ? '' : ` · ${timeOf(e.data.startAt!)}${e.data.endAt ? ` → ${timeOf(e.data.endAt)}` : ''}`}` : datesLabel({ startDate: dayOfAt(e.data.startAt), endDate: dayOfAt(e.data.endAt) });
  const daysLeft = (iso?: string) => (iso ? Math.round((new Date(`${iso.slice(0, 10)}T12:00:00`).getTime() - Date.now()) / 86_400_000) : null);
  const cancelIn = daysLeft(e.data.cancelBy);

  return (
    <Screen title={e.title.replace(/^(Stay|Ticket) · /, '')} subtitle={eyebrow} onBack={back} right={<IconButton icon="edit" accessibilityLabel="Edit the booking" onPress={() => router.push(`/entity/event/${e.id}/edit` as never)} />} contentStyle={{ gap: 12 }}>
      {kind !== 'journey' ? (
        <View style={{ padding: 16, borderRadius: 28, backgroundColor: t.c.bg.tile, gap: 10 }}>
          <Text variant="labelCaps" color="secondary">STATUS</Text>
          <View style={{ flexDirection: 'row', padding: 4, borderRadius: 999, backgroundColor: t.c.bg.tileRaised }}>
            {STATUSES.map((s) => (
              <Pressable key={s} accessibilityRole="button" accessibilityState={{ selected: s === status }} onPress={() => s !== status && setStatus(s)} style={{ flex: 1, height: 34, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: s === status ? '#F5F5F7' : 'transparent' }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: s === status ? '#0B0B0D' : t.c.fg.secondary }}>{STATUS_LABEL[s]}</Text>
              </Pressable>
            ))}
          </View>
          <Text variant="caption" color="secondary">{[when, nights ? `${nights} ${nights === 1 ? 'night' : 'nights'}` : null, d.stop?.title].filter(Boolean).join(' · ')}</Text>
          {status === 'planned' ? <Text variant="caption" color="secondary">Planned is not booked yet: it counts as an estimate. Cancelled leaves the money and the line.</Text> : null}
        </View>
      ) : null}

      {kind === 'journey' ? (
        <View style={{ padding: 16, borderRadius: 28, backgroundColor: t.c.bg.tile, gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {d.from ? <StopDisc stop={d.from} look={look} /> : null}
            <Icon name="arrow-right" size={18} color={t.c.fg.secondary} />
            {d.to ? <StopDisc stop={d.to} look={look} /> : null}
            <View style={{ flex: 1 }} />
            <Text variant="caption" color="secondary">{[e.data.mode, e.data.takes].filter(Boolean).join(' · ')}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Stat label="LEAVE BY" value={e.data.allDay ? '–' : timeOf(e.data.startAt!)} />
            <Stat label="ARRIVE" value={e.data.endAt ? `≈${timeOf(e.data.endAt)}` : '–'} />
            <Stat label={e.data.estimate ? 'EACH · EST.' : 'EACH'} value={e.data.fare != null ? amount(e.data.fare, e.data.currency ?? 'JPY') : '–'} />
          </View>
          <Text variant="caption" color="secondary">{when}{e.data.plan ? ` · ${({ booked: 'booked', suggested: 'suggested', decided: 'decided, not booked', undecided: 'to decide' } as Record<string, string>)[e.data.plan] ?? e.data.plan}` : ''}</Text>
        </View>
      ) : m.total != null ? (
        <View style={{ padding: 16, borderRadius: 28, backgroundColor: t.c.bg.tile, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text variant="labelCaps" color="secondary">TOTAL · {amount(m.total, m.currency)}</Text>
            <View style={{ flex: 1 }} />
            <PayChip e={e} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
            <Text style={{ fontSize: 34, fontWeight: '700', letterSpacing: -1, fontVariant: ['tabular-nums'] }}>{amount(m.toPay > 0.5 ? m.toPay : m.total, m.currency)}</Text>
            <Text style={{ fontSize: 13, fontWeight: '600', color: t.c.fg.secondary }}>{m.toPay > 0.5 ? 'still to pay' : 'paid'}</Text>
          </View>
          {m.toPay > 0.5 ? <Text variant="caption" color="secondary">{[approxInr(m.toPay, m.currency, rate), covers > 1 ? `${eachOf(m.toPay, m.currency, covers, rate)} each` : null].filter(Boolean).join(' · ')}</Text> : null}
          <ProgressBar value={m.total ? m.paid / m.total : 0} color="#D7F55C" accessibilityLabel={`${amount(m.paid, m.currency)} paid of ${amount(m.total, m.currency)}`} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text variant="caption" color="secondary">PAID {amount(m.paid, m.currency)}</Text>
            <Text variant="caption" color="secondary">TO PAY {amount(m.toPay, m.currency)}</Text>
          </View>
        </View>
      ) : null}

      {kind === 'journey' ? (
        <>
          {e.data.book?.length || e.data.bookNote ? (
            <View style={{ padding: 16, borderRadius: 24, backgroundColor: t.c.bg.tile, gap: 10 }}>
              <Text variant="labelCaps" color="secondary">BOOK AHEAD</Text>
              {e.data.bookNote ? <Text style={{ fontSize: 15, lineHeight: 21 }}>{e.data.bookNote}</Text> : null}
              {(e.data.book ?? []).map((b) => <Button key={b.url} title={b.label} icon="link" onPress={() => openUrl(b.url)} />)}
            </View>
          ) : null}
          {e.data.lastConnection ? <Note icon="alert" iconColor="#FF6B7A">{`Last connection: ${e.data.lastConnection}`}</Note> : null}
          {e.data.steps ? (
            <View style={{ gap: 10 }}>
              <SectionHead title="Step by step" sub="Times estimated · check the night before" />
              <RowCard>
                {stepsOf(e).map((s, i) => <Row key={i} minHeight={48} lines={2} lead={<Text style={{ width: 52, fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{s.time ?? ''}</Text>} title={s.what} sub={s.note} />)}
              </RowCard>
            </View>
          ) : null}
        </>
      ) : (
        <RowCard>
          <Row lead={<Icon name="people" size={18} color="#D7F55C" />} title="Covers" sub={['You', ...d.people].join(', ')} />
          {d.payer ? <Row lead={<Icon name="card" size={18} color="#8C9DFF" />} title="Paid by" sub={[d.payer, (e.data.notes ?? '').match(/^Paid: (.*)$/m)?.[1]].filter(Boolean).join(' · ')} /> : null}
          {e.data.payHow ? <Row lines={3} lead={<Icon name="bank" size={18} color="#FF9A4D" />} title="How the rest is paid" sub={e.data.payHow} /> : null}
          <Row lead={<Icon name="calendar" size={18} color="#F6E27F" />} title="Card charged on" sub={e.data.chargeOn ? datesLabel({ startDate: e.data.chargeOn.slice(0, 10) }) : 'not known yet'} />
          {e.data.cancelBy ? <Row lead={<Icon name="x-circle" size={18} color="#FF6B7A" />} title="Free to cancel until" sub={`${datesLabel({ startDate: e.data.cancelBy.slice(0, 10) })}${e.data.cancelNote ? `, ${e.data.cancelNote}` : ''}${cancelIn != null && cancelIn >= 0 ? ` · in ${cancelIn} d` : cancelIn != null ? ' · passed' : ''}`} /> : null}
        </RowCard>
      )}

      {kind === 'stay' ? (
        <RowCard>
          <Row lead={<Icon name="clock" size={18} color="#4CC9D4" />} title="Check-in" sub={e.data.checkIn ?? 'time missing · ask the copilot to look in your mail'} />
          <Row lead={<Icon name="clock" size={18} color="#4CC9D4" />} title="Check-out" sub={e.data.checkOut ?? 'not known'} />
          {e.data.access ? <Row lines={3} lead={<Icon name="location" size={18} color="#5FD08A" />} title="Getting there" sub={e.data.access} /> : null}
        </RowCard>
      ) : null}

      <RowCard>
        {e.data.reference ? <Row lead={<Icon name="lock" size={18} color={t.c.fg.secondary} />} title="Reference" sub={showRef ? e.data.reference : 'tap to show · yours only, never trip members'} trailing={<Text style={{ fontSize: 14, letterSpacing: 2, color: t.c.fg.secondary }}>{showRef ? '' : '••••••'}</Text>} onPress={() => setShowRef((x) => !x)} /> : null}
        {e.data.bookingUrl ? <Row lead={<Icon name="link" size={18} color="#6CC6FF" />} title="Booking page" sub="Opens the reservation" onPress={() => openUrl(e.data.bookingUrl)} /> : null}
        {kind === 'stay' ? <Row lead={<Icon name="map" size={18} color="#5FD08A" />} title="Map" sub={e.data.mapUrl ? 'Opens the map' : 'Searches the map by name'} onPress={() => openUrl(e.data.mapUrl ?? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${e.title.replace(/^Stay · /, '')} ${d.stop?.title ?? ''}`)}`)} /> : null}
        <Row lead={<Icon name="file" size={18} color="#D7F55C" />} title={d.papers.length ? `Papers · ${d.papers.length}` : 'Papers'} sub={d.papers.length ? d.papers.map((p) => p.title).join(', ') : 'Link a Document to this booking to keep its papers here'} onPress={d.papers[0] ? () => router.push(`/entity/document/${d.papers[0]!.id}` as never) : undefined} />
      </RowCard>
      {e.data.notes ? <Text variant="caption" color="secondary" style={{ paddingHorizontal: 4, lineHeight: 18 }}>{e.data.notes.split('\n').filter((l) => !l.startsWith('Paid: ')).join('\n')}</Text> : null}
      {status !== 'cancelled' && kind !== 'journey' ? <Button title="Mark cancelled" icon="x" variant="secondary" onPress={() => setStatus('cancelled')} /> : null}
      {d.trip ? <Button title={`Back to ${d.trip.title}`} variant="ghost" onPress={() => router.push(`/entity/trip/${d.trip!.id}` as never)} /> : null}
    </Screen>
  );
}

/** Each person's part, in ₹ when the trip has a rate for the booking's currency. */
const eachOf = (n: number, cur: string, people: number, rate?: number) => (cur !== 'INR' && rate ? amount((n * rate) / people, 'INR') : amount(n / people, cur));

function Stat({ label, value }: { label: string; value: string }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 1, color: t.c.fg.tertiary }}>{label}</Text>
      <Text style={{ fontSize: 22, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{value}</Text>
    </View>
  );
}
