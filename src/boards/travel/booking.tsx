import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { LifeOSContext } from '@core/registry/context';
import { useLive } from '@ui/hooks';
import { EmptyState, Screen, useToast } from '@ui/kit';
import { moneyOf, STATUS_LABEL, statusOf, stayNights, tripBills, type BookingStatus, type StopData, type TravelEvent, type TripData } from '@modules/travel';
import { datesLabel, firstName, shortIso, timeOf } from './parts';
import { Btn, CardHead, Chip, Ico, Line, Lines, openUrl, P, PayChip, StopMark, T, Tile, useAmt } from './jp/bookparts';
import { JourneyBody, JourneyStats, StationCards } from './day';
import { C, FACE, isJapan, RoundButton, TripScreen, tripRoutes } from './jp/shell';
import { Anim, MONO, MONO_MED } from './jp/kit';

/**
 * A booking's page (the trip template; JP-Booking): a stay, a ticket, a
 * journey or an activity with everything it keeps. Its status, the total
 * with paid and still to pay, who it covers and who paid, how the rest is
 * paid, the card's date, free cancellation, check-in and out, getting there,
 * the hidden reference (tap to show), its links and papers, the copilot's
 * questions; a journey's plan, its long leg, links to book and steps.
 */

const STATUSES: BookingStatus[] = ['confirmed', 'pending', 'planned', 'cancelled'];
const PLANS: Array<[string, string]> = [['booked', 'Booked'], ['decided', 'Decided'], ['suggested', 'Suggested'], ['undecided', 'To decide']];
const KIND_WORD: Record<string, string> = { stay: 'Stay', ticket: 'Ticket', flight: 'Flight', journey: 'Journey', activity: 'Activity', other: 'Booking' };
const nameOf = (e: { title: string }) => e.title.replace(/^(Stay|Ticket) · /, '');
const WAYS = ['', '', 'two ways', 'three ways', 'four ways', 'five ways', 'six ways'];

export function BookingScreen({ ctx, params }: { ctx: LifeOSContext; params: Record<string, string> }) {
  const router = useRouter();
  const toast = useToast();
  const [showRef, setShowRef] = useState(false);
  const d = useLive(
    (os) => {
      const e = os.records.get<TravelEvent>(params.event ?? '');
      if (e?.object !== 'event') return null;
      const own = (e.data as { tripId?: string }).tripId;
      const tripId = own ?? os.links.forEntity(e.id, 'part_of').find((r) => r.other.object === 'trip')?.other.id ?? os.links.forEntity(e.id, 'trip').find((r) => r.other.object === 'trip')?.other.id;
      const trip = tripId ? os.records.get<TripData>(tripId) : null;
      const stop = (id?: string) => (id ? os.records.get<StopData>(id) ?? null : null);
      const papers = new Map<string, { id: string; title: string; meta: string | null }>();
      if (os.registry.objects.has('document')) {
        const docs = [
          ...os.links.forEntity(e.id, 'for').filter((r) => r.other.object === 'document' && r.direction === 'in').map((r) => os.records.get<{ kind?: string; issuedOn?: string; file?: { name?: string; mime?: string } }>(r.other.id)),
          ...os.records.query<{ kind?: string; issuedOn?: string; file?: { name?: string; mime?: string } }>('document', { filter: { and: [{ field: 'data.eventId', op: 'eq', value: e.id }] } }, { limit: 20 }),
        ];
        for (const doc of docs) {
          if (!doc || doc.archived || papers.has(doc.id)) continue;
          const mime = doc.data.file?.mime ?? '';
          papers.set(doc.id, { id: doc.id, title: doc.title, meta: [mime.includes('pdf') ? 'PDF' : mime.startsWith('image/') ? 'Photo' : doc.data.file ? 'File' : null, doc.data.issuedOn ? shortIso(doc.data.issuedOn) : null].filter(Boolean).join(' · ') || null });
        }
      }
      const people = (e.data.personIds ?? []).map((id) => os.records.get(id)?.title).filter((x): x is string => !!x);
      const payer = !e.data.paidBy ? null : e.data.paidBy === 'me' ? 'You' : os.records.get(e.data.paidBy)?.title ?? null;
      const s = stop(e.data.stopId);
      const line = trip ? os.records.query<StopData>('stop', { filter: { and: [{ field: 'data.tripId', op: 'eq', value: trip.id }] } }, { limit: 500 }).filter((x) => !x.archived && x.data.kind === 'stop').sort((a, b) => (a.data.order ?? 999) - (b.data.order ?? 999)) : [];
      const inSettle = trip ? tripBills(os, trip.id).some((b) => b.data.eventId === e.id) : false;
      return { e, trip, stop: s, stopNo: s ? line.findIndex((x) => x.id === s.id) + 1 : 0, from: stop(e.data.fromStopId), to: stop(e.data.toStopId), papers: [...papers.values()], people, payer, inSettle };
    },
    [params.event],
  );
  const amt = useAmt(d?.trip);
  const back = () => (router.canGoBack() ? router.back() : router.replace(tripRoutes.travel));
  if (!d) {
    return (
      <Screen title="Booking" onBack={back}>
        <EmptyState icon="file" tint="travel" line="That booking isn’t here any more." />
      </Screen>
    );
  }
  const { e, trip } = d;
  const kind = e.data.kind ?? 'stay';
  const status = statusOf(e);
  const m = moneyOf(e);
  const japan = trip ? isJapan(trip) : false;
  const look = japan ? 'japan' : trip?.data.look;
  const local = trip?.data.localCurrency ?? 'INR';
  const covers = d.people.length + 1;
  const names = (d.payer === 'You' || !d.payer ? ['You', ...d.people] : [...new Set([d.payer, ...d.people])]).map(firstName);
  const daysLeft = (iso?: string) => (iso ? Math.round((new Date(`${iso.slice(0, 10)}T12:00:00`).getTime() - Date.now()) / 86_400_000) : null);
  const cancelIn = daysLeft(e.data.cancelBy);
  const chargeIn = daysLeft(e.data.chargeOn);
  const nights = kind === 'stay' && e.data.endAt ? stayNights(e) : null;
  const dates = e.data.startAt ? datesLabel({ startDate: isoDay(e.data.startAt), endDate: e.data.endAt ? isoDay(e.data.endAt) : undefined }) : null;
  const ask = (q: string) => router.push(trip ? tripRoutes.copilot(trip.id, q) : (`/talk` as never));
  const details = (e.data.notes ?? '').split('\n').filter((l) => l.trim() && !l.startsWith('Paid: ')).join(' ');
  const paidNote = (e.data.notes ?? '').match(/^Paid: (.*)$/m)?.[1] ?? null;

  const setStatus = (s: BookingStatus) => {
    const prev = e.data.booking;
    ctx.records.update<TravelEvent>(e.id, { data: { booking: s } }, 'user');
    toast.show({ message: `${nameOf(e)}: ${STATUS_LABEL[s].toLowerCase()}`, icon: 'check', undo: () => void ctx.records.update<TravelEvent>(e.id, { data: { booking: prev } }, 'user') });
  };
  const setPlan = (p: string) => {
    const prev = e.data.plan;
    ctx.records.update<TravelEvent>(e.id, { data: { plan: p } }, 'user');
    toast.show({ message: `${e.title}: ${PLANS.find(([k]) => k === p)?.[1].toLowerCase()}`, icon: 'check', undo: () => void ctx.records.update<TravelEvent>(e.id, { data: { plan: prev } }, 'user') });
  };
  const asks = [
    kind !== 'journey' && !e.data.chargeOn && m.toPay > 0.5 ? 'When will the card be charged?' : null,
    kind === 'stay' ? 'Is the city tax extra?' : null,
    kind === 'stay' && !e.data.checkIn ? 'Find the check-in time in my mail' : null,
    kind === 'journey' ? 'Is there an earlier connection?' : null,
    e.data.cancelBy ? 'What happens if I cancel?' : null,
  ].filter((x): x is string => !!x);
  const stamp = kind === 'journey' ? (japan ? '移動 · A JOURNEY' : 'A JOURNEY') : japan ? '予約 · A BOOKING' : 'A BOOKING';

  const segmented = (opts: Array<[string, string]>, value: string, set: (v: string) => void) => (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', padding: 4, backgroundColor: C.raised, borderRadius: 999 }}>
      {opts.map(([k, label]) => (
        <Pressable key={k} accessibilityRole="tab" accessibilityState={{ selected: k === value }} onPress={() => k !== value && set(k)} style={{ justifyContent: 'center', alignItems: 'center', flexGrow: 1, flexShrink: 1, flexBasis: 0, height: 34, backgroundColor: k === value ? C.white : 'transparent', borderRadius: 999 }}>
          <Text style={{ color: k === value ? C.ink : C.mid, fontSize: 13, fontFamily: 'PlusJakartaSans_600SemiBold' }} numberOfLines={1}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );

  return (
    <TripScreen tripId={trip?.id ?? ''} active="bookings" bar={!!trip}>
      <Anim k="jr" delay={110} style={{ minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 12, paddingBottom: 4 }}>
          <RoundButton label="Back" onPress={back}>
            <Ico p={P.back!} size={18} />
          </RoundButton>
          <View style={{ flexGrow: 1, flexShrink: 1, minWidth: 0 }}>
            <Text style={{ color: C.mid, fontSize: 10, letterSpacing: 2, fontFamily: MONO }} numberOfLines={1}>{stamp}</Text>
            <Text style={{ color: C.white, fontSize: 20, lineHeight: 24, fontFamily: 'PlusJakartaSans_700Bold' }} numberOfLines={1}>{nameOf(e)}</Text>
          </View>
          {d.stop ? (
            <Pressable accessibilityRole="button" accessibilityLabel={d.stop.title} onPress={() => router.push(tripRoutes.stop(d.stop!.id))}>
              <StopMark stop={d.stop} look={look} ring />
            </Pressable>
          ) : null}
        </View>
      </Anim>

      {kind === 'journey' ? (
        <>
          {d.from || d.to ? (
            <Anim k="jr" delay={150} style={{ minWidth: 0 }}>
              <StationCards from={d.from && d.to ? d.from : null} to={(d.to ?? d.from)!} look={look} mode={e.data.mode} onOpen={(s) => router.push(tripRoutes.stop(s.id))} />
            </Anim>
          ) : null}
          <Anim k="jr" delay={170} style={{ minWidth: 0 }}>
            <Tile>
              <Text style={T.caps}>PLAN</Text>
              {segmented(PLANS, e.data.plan ?? 'undecided', setPlan)}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {[e.data.mode ? e.data.mode.replace(/^\w/, (c) => c.toUpperCase()) : 'Journey', e.data.startAt ? `${shortIso(isoDay(e.data.startAt))}${e.data.allDay ? '' : ` · ${timeOf(e.data.startAt)}`}` : null, e.data.takes ? `≈ ${e.data.takes}` : null].filter((x): x is string => !!x).map((x) => <Chip key={x} label={x} h={26} />)}
              </View>
              <JourneyStats e={e} raised amt={amt} local={local} fareLabel="FARE EACH" />
            </Tile>
          </Anim>
          {trip ? <JourneyBody e={e} trip={trip} from={d.from} to={d.to} checkOut={null} checkIn={null} amt={amt} showStats={false} /> : null}
        </>
      ) : (
        <>
          <Anim k="jr" delay={170} style={{ minWidth: 0 }}>
            <Tile>
              <Text style={T.caps}>STATUS</Text>
              {segmented(STATUSES.map((s) => [s, STATUS_LABEL[s]]), status, (s) => setStatus(s as BookingStatus))}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {[KIND_WORD[kind] ?? 'Booking', [nights ? `${nights} ${nights === 1 ? 'night' : 'nights'}` : null, dates].filter(Boolean).join(' · ') || null, d.stop ? `${d.stop.title}${d.stopNo ? ` · stop ${d.stopNo}` : ''}` : e.data.location ?? null].filter((x): x is string => !!x).map((x) => <Chip key={x} label={x} h={26} />)}
              </View>
              <Text style={{ color: C.mid, fontSize: 12, lineHeight: 16, fontFamily: 'PlusJakartaSans_400Regular' }}>Planned is not booked yet: it counts as an estimate. Cancelled leaves the money and the line.</Text>
            </Tile>
          </Anim>

          {m.total != null ? (
            <Anim k="jr" delay={230} style={{ minWidth: 0 }}>
              <Tile>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={T.caps}>{`TOTAL · ${amt.fmt(m.total, m.currency)}`}</Text>
                  <View style={{ flexGrow: 1 }} />
                  <PayChip e={e} h={26} />
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
                  <Text style={{ color: C.white, fontSize: 34, letterSpacing: -1, fontVariant: ['tabular-nums'], fontFamily: 'PlusJakartaSans_700Bold' }} numberOfLines={1} adjustsFontSizeToFit>{amt.fmt(m.toPay > 0.5 ? m.toPay : m.total, m.currency)}</Text>
                  <Text style={{ color: C.mid, fontSize: 13, fontFamily: 'PlusJakartaSans_600SemiBold' }}>{m.toPay > 0.5 ? 'still to pay' : 'paid'}</Text>
                </View>
                {(() => {
                  const base = m.toPay > 0.5 ? m.toPay : m.total;
                  const line = [amt.alt(base, m.currency), covers > 1 ? `${amt.fmt(base / covers, m.currency)} each` : null, m.currency === amt.local && amt.rate ? `at ${amount1(m.currency)} = ₹${amt.rate.toFixed(4).replace(/0+$/, '')}` : null].filter(Boolean).join(' · ');
                  return line ? <Text style={{ color: C.mid, fontSize: 13, fontVariant: ['tabular-nums'], fontFamily: 'PlusJakartaSans_600SemiBold' }}>{line}</Text> : null;
                })()}
                <View style={{ flexDirection: 'row', gap: 3 }}>
                  <Anim k="jbar" style={{ flexGrow: Math.max(0.02, m.total ? m.paid / m.total : 0), flexShrink: 1, flexBasis: 0, height: 8, backgroundColor: C.lime, borderRadius: 8 }} />
                  {m.toPay > 0.5 ? <View style={{ flexGrow: m.total ? m.toPay / m.total : 1, flexShrink: 1, flexBasis: 0, height: 8, backgroundColor: '#303036', borderRadius: 8 }} /> : null}
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ color: C.mid, fontSize: 12, fontVariant: ['tabular-nums'], fontFamily: 'PlusJakartaSans_600SemiBold' }}>{`PAID ${amt.fmt(m.paid, m.currency)}`}</Text>
                  <Text style={{ color: C.mid, fontSize: 12, fontVariant: ['tabular-nums'], fontFamily: 'PlusJakartaSans_600SemiBold' }}>{`TO PAY ${amt.fmt(m.toPay, m.currency)}`}</Text>
                </View>
              </Tile>
            </Anim>
          ) : null}

          <Anim k="jr" delay={290} style={{ minWidth: 0 }}>
            <Tile pad={14} gap={0}>
              <Lines>
                <Line icon={P.user} color={C.lime} title="Covers" lines={2} sub={`${names.join(', ')}${covers > 1 ? ` · split ${WAYS[covers] ?? `${covers} ways`}` : ''}`} right={<FacePile names={names} />} />
                {d.payer || paidNote ? (
                  <Line icon={P.card} color="#8C9DFF" title="Paid by" lines={2} sub={[d.payer ? firstName(d.payer) : null, paidNote].filter(Boolean).join(' · ')} right={m.paid > 0.5 && trip ? <Chip label={d.inSettle ? 'In Settle up' : 'Add to Settle up'} tone={d.inSettle ? 'lime' : 'yellow'} h={26} onPress={() => router.push(tripRoutes.money(trip.id, 'settle'))} /> : undefined} />
                ) : null}
                {e.data.payHow ? <Line icon={P.bank} color="#F26B2B" title="How the rest is paid" sub={e.data.payHow} lines={3} /> : null}
                {m.toPay > 0.5 || e.data.chargeOn ? (
                  <Line icon={P.calendar} color="#F6E27F" title="Card charged on" lines={2} sub={e.data.chargeOn ? datesLabel({ startDate: e.data.chargeOn.slice(0, 10) }) : 'not known yet'} right={e.data.chargeOn && chargeIn != null && chargeIn >= 0 ? <Chip label={`in ${chargeIn} d`} tone="yellow" h={26} /> : !e.data.chargeOn ? <Chip label="Ask" h={26} onPress={() => ask(`When will the card be charged for ${nameOf(e)}?`)} /> : undefined} />
                ) : null}
                {e.data.cancelBy ? <Line icon={P.xCircle} color="#FF8A95" title="Free to cancel until" sub={`${shortIso(e.data.cancelBy.slice(0, 10))}${e.data.cancelNote ? `, ${e.data.cancelNote}` : ''}`} right={cancelIn != null && cancelIn >= 0 ? <Chip label={`in ${cancelIn} d`} tone="yellow" h={26} /> : <Chip label="passed" tone="outline" h={26} />} /> : null}
              </Lines>
            </Tile>
          </Anim>

          {kind === 'stay' || details ? (
            <Anim k="jr" delay={350} style={{ minWidth: 0 }}>
              <Tile pad={14} gap={0}>
                <Lines>
                  {kind === 'stay' ? <Line icon={P.clock} color="#4CC9D4" title="Check-in" sub={e.data.checkIn ?? 'time missing · ask the copilot to look in your mail'} lines={2} /> : null}
                  {kind === 'stay' ? <Line icon={P.clock} color="#4CC9D4" title="Check-out" sub={e.data.checkOut ?? 'not known'} /> : null}
                  {e.data.access ? <Line icon={P.pin2} color="#5FD08A" title="Getting there" sub={e.data.access} lines={3} /> : null}
                  {details ? <Line icon={P.info} title="Details" sub={details} lines={4} /> : null}
                </Lines>
              </Tile>
            </Anim>
          ) : null}
        </>
      )}

      {e.data.reference || e.data.bookingUrl || kind === 'stay' ? (
        <Anim k="jr" delay={410} style={{ minWidth: 0 }}>
          <Tile pad={14} gap={0}>
            <Lines>
              {e.data.reference ? (
                <Line icon={P.lock} title="Reference" lines={3} sub={showRef ? e.data.reference : 'tap to show · yours only, never trip members'} right={showRef ? undefined : <Text style={{ color: C.mid, fontSize: 14, letterSpacing: 2, fontFamily: MONO_MED }}>••••••</Text>} onPress={() => setShowRef((x) => !x)} />
              ) : null}
              {e.data.bookingUrl ? <Line icon={P.link} color="#6CC6FF" title="Booking page" sub={`${e.data.bookingUrl.replace(/^https?:\/\/(www\.|secure\.)?/, '').split('/')[0]} · opens the reservation`} onPress={() => openUrl(e.data.bookingUrl)} /> : null}
              {kind === 'stay' ? <Line icon={P.pin2} color="#5FD08A" title="Map" sub={e.data.mapUrl ? 'opens the map' : 'blank searches by name'} onPress={() => openUrl(e.data.mapUrl ?? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${nameOf(e)} ${d.stop?.title ?? ''}`.trim())}`)} /> : null}
            </Lines>
          </Tile>
        </Anim>
      ) : null}

      <Anim k="jr" delay={470} style={{ minWidth: 0 }}>
        <Tile>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={T.caps}>{d.papers.length ? `PAPERS · ${d.papers.length}` : 'PAPERS'}</Text>
            <View style={{ flexGrow: 1 }} />
            <Pressable accessibilityRole="button" accessibilityLabel="Add papers" hitSlop={8} onPress={() => router.push({ pathname: '/entity/[type]/new', params: { type: 'document', kind: 'ticket', eventId: e.id, ...(trip ? { tripId: trip.id } : {}) } } as never)}>
              <Text style={{ color: C.lime, fontSize: 13, fontFamily: 'PlusJakartaSans_600SemiBold' }}>Add papers</Text>
            </Pressable>
          </View>
          {d.papers.length ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {d.papers.map((p) => (
                <Pressable key={p.id} accessibilityRole="button" accessibilityLabel={p.title} onPress={() => router.push(`/entity/document/${p.id}` as never)} style={({ pressed }) => ({ flexDirection: 'column', flexGrow: 1, flexShrink: 1, flexBasis: '40%', gap: 6, minWidth: 0, padding: 12, backgroundColor: C.raised, borderRadius: 20, opacity: pressed ? 0.8 : 1 })}>
                  <Ico p={P.file!} size={18} color={C.lime} />
                  <Text style={{ color: C.white, fontSize: 13, lineHeight: 17, fontFamily: 'PlusJakartaSans_600SemiBold' }} numberOfLines={2}>{p.title}</Text>
                  {p.meta ? <Text style={{ color: C.mid, fontSize: 11, fontFamily: 'PlusJakartaSans_400Regular' }} numberOfLines={1}>{p.meta}</Text> : null}
                </Pressable>
              ))}
            </View>
          ) : (
            <Text style={{ color: C.mid, fontSize: 12, lineHeight: 16, fontFamily: 'PlusJakartaSans_400Regular' }}>The confirmation and receipts, linked to this booking, show here.</Text>
          )}
        </Tile>
      </Anim>

      {kind !== 'journey' ? (
        <Anim k="jr" delay={530} style={{ minWidth: 0 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {status === 'cancelled' ? <Btn title="Restore booking" icon={P.check} tone="outline" h={46} size={15} onPress={() => setStatus('confirmed')} /> : <Btn title="Cancel booking" icon={P.xCircle} tone="outline" h={46} size={15} onPress={() => setStatus('cancelled')} />}
            <Btn title="Edit" icon={P.edit} h={46} size={15} onPress={() => router.push(`/entity/event/${e.id}/edit` as never)} />
          </View>
        </Anim>
      ) : null}

      {asks.length ? (
        <Anim k="jr" delay={590} style={{ minWidth: 0 }}>
          <View style={{ flexDirection: 'column', gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ico p={P.burst!} size={14} color={C.lime} />
              <Text style={{ color: C.mid, fontSize: 10, letterSpacing: 1.5, fontFamily: MONO }}>ASK THE COPILOT</Text>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {asks.map((q) => (
                <Pressable key={q} accessibilityRole="button" accessibilityLabel={`Ask: ${q}`} onPress={() => ask(`${q} (${nameOf(e)})`)} style={({ pressed }) => ({ justifyContent: 'center', flexShrink: 0, height: 36, paddingHorizontal: 14, borderWidth: 1, borderColor: 'rgba(215,245,92,0.35)', borderRadius: 999, opacity: pressed ? 0.75 : 1 })}>
                  <Text style={{ color: C.white, fontSize: 13, fontFamily: 'PlusJakartaSans_600SemiBold' }}>{q}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </Anim>
      ) : null}
    </TripScreen>
  );
}

/** "¥1", "US$1": one of a currency, for the rate line. */
const amount1 = (cur: string) => `${({ JPY: '¥', USD: 'US$', EUR: '€', GBP: '£' } as Record<string, string>)[cur] ?? `${cur} `}1`;

const isoDay = (at: number) => {
  const x = new Date(at);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};

/** Who it covers: overlapping coloured initials ringed with the tile. */
function FacePile({ names }: { names: string[] }) {
  if (names.length < 2) return null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 0 }}>
      {names.slice(0, 4).map((n, i) => (
        <View key={`${n}${i}`} style={{ marginLeft: i ? -8 : 0, justifyContent: 'center', alignItems: 'center', width: 32, height: 32, backgroundColor: FACE[i % FACE.length], borderRadius: 16, borderWidth: 2, borderColor: C.tile }}>
          <Text style={{ color: C.ink, fontSize: 13, fontFamily: 'PlusJakartaSans_700Bold' }}>{n.slice(0, 1).toUpperCase()}</Text>
        </View>
      ))}
    </View>
  );
}

