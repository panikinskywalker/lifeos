import React, { useState } from 'react';
import { Modal, Pressable, Text as RNText, View } from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { LifeOSContext } from '@core/registry/context';
import { useLive } from '@ui/hooks';
import { useToast } from '@ui/kit';
import { moneyOf, rateFor, setThingStatus, statusOf, stopsOf, thingsAt, thingStatus, type StopData, type TravelEvent, type TripData } from '@modules/travel';
import { C, RoundButton, TripScreen, isJapan, money, tripRoutes, useMoneyUnit, useShow } from './shell';
import { Anim, JP_SANS, JP_SERIF, MONO } from './kit';
import { openLink, stopHex } from './planparts';
import { Glyph, N, PillButton, type GlyphName } from '../things';
import { StationBoard } from '../plan';

/**
 * A stay's page (the trip template; JP-Stay): the station board of its stop,
 * what is left to pay with free cancellation and how to pay, Take me there,
 * Google Maps, the booking page and Show the driver, the check-in window,
 * check-out, money taken, getting there, a dinner or extra to switch on, the
 * hidden reference, the inn and its papers, and the card to show a driver.
 */

const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const dayCaps = (at: number) => {
  const d = new Date(at);
  return `${DOW[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}`;
};
const dayTitle = (at: number) => {
  const d = new Date(at);
  return `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()]} ${d.getDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()]}`;
};
const dayShort = (iso: string) => `${Number(iso.slice(8, 10))} ${MON[Number(iso.slice(5, 7)) - 1]!.charAt(0)}${MON[Number(iso.slice(5, 7)) - 1]!.slice(1).toLowerCase()}`;

export function StayScreen({ ctx, params }: { ctx: LifeOSContext; params: Record<string, string> }) {
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const [showRef, setShowRef] = useState(false);
  const [driver, setDriver] = useState(false);
  const d = useLive(
    (os) => {
      const e = os.records.get<TravelEvent>(params.event ?? '');
      if (e?.object !== 'event') return null;
      const tripId = os.links.forEntity(e.id, 'part_of').find((r) => r.other.object === 'trip')?.other.id ?? os.links.forEntity(e.id, 'trip').find((r) => r.other.object === 'trip')?.other.id;
      const trip = tripId ? os.records.get<TripData>(tripId) ?? null : null;
      const stop = e.data.stopId ? os.records.get<StopData>(e.data.stopId) ?? null : null;
      const line = trip ? stopsOf(os, trip.id) : [];
      const papers = os.registry.objects.has('document') ? os.links.forEntity(e.id, 'for').filter((r) => r.other.object === 'document' && r.direction === 'in').map((r) => ({ id: r.other.id, title: r.other.title })) : [];
      const place = stop?.data.placeId ? os.records.get<{ address?: string; coordinates?: { lat: number; lng: number } }>(stop.data.placeId) ?? null : null;
      const name = e.title.replace(/^Stay · /, '').toLowerCase();
      const extras = stop ? thingsAt(os, stop).filter((t) => name && t.title.toLowerCase().includes(name)) : [];
      return { e, trip, stop, line, papers, place, extras };
    },
    [params.event],
  );
  const show = useShow(d?.trip);
  const unit = useMoneyUnit();
  if (!d) {
    return (
      <View style={{ flex: 1, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24 }}>
        <RNText style={{ color: C.mid, fontSize: 15, fontFamily: 'PlusJakartaSans_500Medium' }}>That stay isn’t here any more.</RNText>
        <PillButton label="Back" grow={false} onPress={() => (router.canGoBack() ? router.back() : router.replace(tripRoutes.travel))} />
      </View>
    );
  }
  const { e, trip, stop, line } = d;
  const japan = trip ? isJapan(trip) : false;
  const name = e.title.replace(/^Stay · /, '');
  const c = stop ? stopHex(stop) : C.lime;
  const i = stop ? line.findIndex((s) => s.id === stop.id) : -1;
  const prev = i > 0 ? line[i - 1] : null;
  const next = i >= 0 && i < line.length - 1 ? line[i + 1] : null;
  const m = moneyOf(e);
  const rate = trip ? rateFor(trip, m.currency) : m.currency === 'INR' ? 1 : null;
  const inUnit = (n: number) => (rate ? show(n * rate) : money(n, m.currency));
  const other = (n: number) => (!rate || m.currency === 'INR' ? null : unit === 'local' ? money(n * rate, 'INR') : money(n, m.currency));
  const covers = (e.data.personIds?.length ?? 0) + 1;
  const toPay = m.toPay > 0.5;
  const today = new Date().toISOString().slice(0, 10);
  const cancelBy = e.data.cancelBy?.slice(0, 10);
  const freeCancel = cancelBy && cancelBy >= today && statusOf(e) !== 'cancelled' ? `free to cancel till ${dayShort(cancelBy)}` : null;
  const query = [name, stop?.title, trip?.data.destination].filter(Boolean).join(' ');
  const mapUrl = e.data.mapUrl ?? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  const dirUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(d.place?.data.coordinates ? `${d.place.data.coordinates.lat},${d.place.data.coordinates.lng}` : query)}`;
  const phone = /(\+?\d[\d\s-]{7,}\d)/.exec(e.data.notes ?? '')?.[1];
  const mail = /[\w.+-]+@[\w-]+\.[\w.]+/.exec(e.data.notes ?? '')?.[0];
  const driverLines = { big: name, place: [japan ? stop?.data.localName : null, d.place?.data.address].filter(Boolean).join(' '), line: [name, stop?.title, e.data.location && e.data.location !== stop?.title ? e.data.location : null, trip?.data.destination].filter(Boolean).join(' · ') };
  const copy = async () => {
    await Clipboard.setStringAsync([driverLines.big, driverLines.place, driverLines.line].filter(Boolean).join('\n'));
    toast.show({ message: 'Copied for the driver', icon: 'check' });
  };
  const back = () => (router.canGoBack() ? router.back() : router.replace(trip ? tripRoutes.bookings(trip.id) : tripRoutes.travel));

  // The check-in window: its times, and how far into it now is.
  const win = /(\d{1,2}:\d{2})\s*(?:[–-]|to)\s*(\d{1,2}:\d{2})/.exec(e.data.checkIn ?? '');
  const from = win?.[1] ?? /\d{1,2}:\d{2}/.exec(e.data.checkIn ?? '')?.[0] ?? null;
  const mins = (t: string) => Number(t.split(':')[0]) * 60 + Number(t.split(':')[1]);
  const startAt = e.data.startAt ?? Date.now();
  const sameDay = new Date(startAt).toDateString() === new Date().toDateString();
  const nowM = new Date().getHours() * 60 + new Date().getMinutes();
  const progress = !from ? 0 : Date.now() > startAt + 86_400_000 ? 1 : sameDay && win ? Math.max(0, Math.min(1, (nowM - mins(win[1]!)) / Math.max(1, mins(win[2]!) - mins(win[1]!)))) : 0;
  const ARC = 387.5;
  const bez = (t: number) => ({ x: (1 - t) * (1 - t) * 6 + 2 * (1 - t) * t * 155 + t * t * 304, y: (1 - t) * (1 - t) * 62 + 2 * (1 - t) * t * -38.5 + t * t * 62 });
  const sun = bez(progress);
  const extraNote = (e.data.checkIn ?? '').replace(win?.[0] ?? from ?? '', '').replace(/^[\s·,;-]+/, '').trim();

  const rows: Array<{ icon: GlyphName; tint?: string; title: string; sub?: string | null; right?: React.ReactNode; onPress?: () => void; key: string }> = [];
  const outTime = /\d{1,2}:\d{2}/.exec(e.data.checkOut ?? '')?.[0];
  const outRest = (e.data.checkOut ?? '').replace(/\d{1,2}:\d{2}/, '').replace(/^[\s·,;:-]*(by|until|before)?[\s·,;:-]*/i, '').trim();
  if (e.data.checkOut || e.data.endAt) rows.push({ key: 'out', icon: 'clock', title: outTime ? `Check out by ${outTime}` : e.data.checkOut ? `Check out ${e.data.checkOut}` : 'Check out', sub: [e.data.endAt ? dayTitle(e.data.endAt) : null, outTime && outRest.length > 2 ? outRest : null].filter(Boolean).join(' · ') || null });
  if (e.data.payHow) rows.push({ key: 'pay', icon: 'yen', tint: '#F26B2B', title: 'How to pay', sub: e.data.payHow });
  rows.push({ key: 'taken', icon: 'wallet', title: 'Money taken', sub: m.total == null ? 'not known yet' : m.paid > 0.5 ? `${inUnit(m.paid)} paid${toPay ? ` · ${inUnit(m.toPay)} still to pay` : ''}` : e.data.chargeOn ? `nothing yet · the card is charged ${dayShort(e.data.chargeOn.slice(0, 10))}` : `nothing yet${toPay ? ' · all on arrival' : ''}` });
  if (e.data.access) rows.push({ key: 'there', icon: 'route', tint: '#5FD08A', title: 'Getting there', sub: e.data.access });
  for (const x of d.extras) {
    const on = thingStatus(x) === 'planned';
    rows.push({ key: x.id, icon: 'eat', tint: '#F26B2B', title: `${x.title.replace(new RegExp(`\\s*(at|@)\\s*${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i'), '').replace(/^optional\s+/i, '').replace(/^\w/, (q) => q.toUpperCase())}${x.data.cost ? ` ${inUnit(x.data.cost)} each` : ''}`, sub: x.data.notes?.split('\n')[0] ?? null, right: <Toggle on={on} label={x.title} onPress={() => toast.show({ message: `${x.title}: ${on ? 'not planned' : 'planned'}`, icon: 'check', undo: setThingStatus(ctx, x.id, on ? 'idea' : 'planned') })} /> });
  }
  if (e.data.reference) rows.push({ key: 'ref', icon: 'ticket', title: 'Reference', sub: showRef ? 'tap to hide' : 'tap to show · contributors only', onPress: () => setShowRef((s) => !s), right: <RNText style={{ color: showRef ? C.white : N.low, fontSize: 14, letterSpacing: showRef ? 0.5 : 3, fontFamily: MONO }}>{showRef ? e.data.reference : '••••••'}</RNText> });

  return (
    <TripScreen tripId={trip?.id ?? ''} active="bookings" bar={!!trip}>
      <Anim k="jr" delay={50} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 12, paddingBottom: 4 }}>
        <RoundButton label="Back" onPress={back}>
          <Glyph name="back" size={18} />
        </RoundButton>
        <View style={{ flexGrow: 1, flexShrink: 1, minWidth: 0 }}>
          <RNText style={{ color: N.mid, fontSize: 10, letterSpacing: 2, fontFamily: MONO }}>{japan ? '宿 · THE STAY' : 'THE STAY'}</RNText>
          <RNText numberOfLines={1} style={{ color: C.white, fontSize: 20, lineHeight: 24, fontFamily: 'PlusJakartaSans_700Bold' }}>{name}</RNText>
        </View>
        {stop ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`The stop, ${stop.title}`} onPress={() => router.push(tripRoutes.stop(stop.id))} style={{ width: 44, height: 44, flexShrink: 0 }}>
            <Anim k="jpulse2" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderWidth: 2, borderColor: c, borderRadius: 999 }} />
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderWidth: 2, borderColor: c, borderRadius: 999, alignItems: 'center', justifyContent: 'center' }}>
              <RNText style={{ color: c, fontSize: 18, lineHeight: 20, fontFamily: japan && stop.data.localName ? JP_SERIF : 'PlusJakartaSans_800ExtraBold', fontWeight: '800' }}>{japan && stop.data.localName ? [...stop.data.localName][0] : stop.title.charAt(0)}</RNText>
            </View>
          </Pressable>
        ) : null}
      </Anim>

      {stop ? (
        <Anim k="jr" delay={110}>
          <StationBoard stop={stop} index={i >= 0 ? i : null} japan={japan} prev={prev} next={next} onPress={() => router.push(tripRoutes.stop(stop.id))} onPrev={() => prev && router.push(tripRoutes.stop(prev.id))} onNext={() => next && router.push(tripRoutes.stop(next.id))} />
        </Anim>
      ) : null}

      {m.total != null ? (
        <Anim k="jr" delay={170} style={{ gap: 10, padding: 16, backgroundColor: N.tile, borderRadius: 28 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <RNText numberOfLines={1} style={{ flexShrink: 1, color: N.low, fontSize: 11, lineHeight: 14, letterSpacing: 0.9, fontFamily: 'PlusJakartaSans_600SemiBold' }}>{toPay ? `TO PAY${e.data.chargeOn ? ' · CARD CHARGED' : ' · AT THE STAY'}` : 'PAID IN FULL'}</RNText>
            <View style={{ flexGrow: 1 }} />
            {freeCancel ? <View style={{ height: 26, paddingHorizontal: 11, borderRadius: 999, backgroundColor: N.limeSoft, justifyContent: 'center' }}><RNText numberOfLines={1} style={{ color: N.lime, fontSize: 12, lineHeight: 16, fontFamily: 'PlusJakartaSans_600SemiBold' }}>{freeCancel}</RNText></View> : null}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 12 }}>
            <Anim k="jroll">
              <RNText style={{ color: C.white, fontSize: 34, letterSpacing: -1, fontVariant: ['tabular-nums'], fontFamily: 'PlusJakartaSans_700Bold' }}>{inUnit(toPay ? m.toPay : m.total)}</RNText>
            </Anim>
            <View style={{ flexGrow: 1 }} />
            <RNText numberOfLines={1} style={{ flexShrink: 1, color: N.mid, fontSize: 13, lineHeight: 17, fontVariant: ['tabular-nums'], fontFamily: 'PlusJakartaSans_600SemiBold' }}>{[other(toPay ? m.toPay : m.total) ? `≈ ${other(toPay ? m.toPay : m.total)}` : null, covers > 1 ? `${inUnit((toPay ? m.toPay : m.total) / covers)} each` : null].filter(Boolean).join(' · ')}</RNText>
          </View>
          <View style={{ flexDirection: 'row', gap: 3 }}>
            <View style={{ flexGrow: Math.max(0.012, m.total ? m.paid / m.total : 0), flexBasis: 0, height: 8, borderRadius: 8, backgroundColor: N.lime }} />
            <View style={{ flexGrow: Math.max(0, m.total ? m.toPay / m.total : 1), flexBasis: 0, height: 8, borderRadius: 8, backgroundColor: N.bar }} />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
            <RNText numberOfLines={1} style={{ flexShrink: 0, color: N.mid, fontSize: 10, letterSpacing: 0.9, fontVariant: ['tabular-nums'], fontFamily: MONO }}>{`PAID ${inUnit(m.paid)}`}</RNText>
            {e.data.payHow ? <RNText numberOfLines={1} style={{ flexShrink: 1, color: '#FFB547', fontSize: 10, letterSpacing: 0.9, fontFamily: MONO }}>{e.data.payHow.toUpperCase()}</RNText> : null}
          </View>
        </Anim>
      ) : null}

      <Anim k="jr" delay={230} style={{ flexDirection: 'row', gap: 8 }}>
        <Action icon="nav" label="Take me there" lime onPress={() => openLink(dirUrl)} />
        <Action icon="map" label="Google Maps" onPress={() => openLink(mapUrl)} />
        <Action icon="external" label="Booking page" onPress={e.data.bookingUrl ? () => openLink(e.data.bookingUrl) : undefined} />
        <Action icon="car" label="Show driver" onPress={() => setDriver(true)} />
      </Anim>

      <Anim k="jr" delay={290} style={{ gap: 6, padding: 16, backgroundColor: '#16200E', borderRadius: 26 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <RNText style={{ flexShrink: 1, color: C.white, fontSize: 24, letterSpacing: -0.5, fontVariant: ['tabular-nums'], fontFamily: 'PlusJakartaSans_700Bold' }}>{win ? `${win[1]}–${win[2]}` : from ? `from ${from}` : 'Time not set'}</RNText>
          <RNText style={{ color: N.lime, fontSize: 13, lineHeight: 15, letterSpacing: 0.5, textAlign: 'right', fontFamily: 'PlusJakartaSans_800ExtraBold' }}>{win ? 'CHECK-IN\nWINDOW' : 'CHECK-IN'}</RNText>
        </View>
        <View style={{ paddingTop: 8, paddingHorizontal: 4 }}>
          <Svg width="100%" height={70} viewBox="0 0 310 70" style={{ overflow: 'visible' }}>
            <Defs>
              <LinearGradient id="stayarc" x1="0" x2="1">
                <Stop offset="0" stopColor="#D7F55C" stopOpacity={0.15} />
                <Stop offset="1" stopColor="#D7F55C" />
              </LinearGradient>
            </Defs>
            <Path d="M 6 62 Q 155.0 -38.5 304 62" fill="none" stroke="rgba(245,245,247,0.14)" strokeWidth={10} strokeLinecap="round" />
            <Path d="M 6 62 Q 155.0 -38.5 304 62" fill="none" stroke="url(#stayarc)" strokeWidth={10} strokeLinecap="round" strokeDasharray={`${progress * ARC} ${ARC}`} />
            <Circle cx={sun.x} cy={sun.y} r={9} fill="#FFF8E0" />
          </Svg>
        </View>
        <RNText style={{ color: N.lime, fontSize: 13, letterSpacing: 0.5, fontFamily: 'PlusJakartaSans_800ExtraBold' }}>{[dayCaps(startAt), extraNote ? extraNote.toUpperCase() : null].filter(Boolean).join(' · ')}</RNText>
      </Anim>

      <Anim k="jr" delay={350} style={{ padding: 14, backgroundColor: N.tile, borderRadius: 24, overflow: 'hidden', gap: 8 }}>
        {rows.map((r, k) => (
          <React.Fragment key={r.key}>
            {k ? <View style={{ height: 1, backgroundColor: N.line }} /> : null}
            <Pressable accessibilityRole={r.onPress ? 'button' : undefined} accessibilityLabel={r.title} disabled={!r.onPress} onPress={r.onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 48 }}>
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: N.raised, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Glyph name={r.icon} size={16} color={r.tint ?? N.mid} />
              </View>
              <View style={{ flexGrow: 1, flexShrink: 1, gap: 1, minWidth: 0 }}>
                <RNText numberOfLines={1} style={{ color: C.white, fontSize: 16, lineHeight: 21, letterSpacing: -0.2, fontVariant: ['tabular-nums'], fontFamily: 'PlusJakartaSans_600SemiBold' }}>{r.title}</RNText>
                {r.sub ? <RNText numberOfLines={2} style={{ color: N.mid, fontSize: 13, lineHeight: 17, fontVariant: ['tabular-nums'], fontFamily: 'PlusJakartaSans_500Medium' }}>{r.sub}</RNText> : null}
              </View>
              {r.right}
            </Pressable>
          </React.Fragment>
        ))}
      </Anim>

      <Anim k="jr" delay={410} style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0, alignItems: 'center', gap: 8, paddingVertical: 16, paddingHorizontal: 12, backgroundColor: N.raised, borderRadius: 26 }}>
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: c, alignItems: 'center', justifyContent: 'center' }}>
            {japan ? <RNText style={{ color: C.ink, fontSize: 28, fontFamily: JP_SERIF, fontWeight: '800' }}>宿</RNText> : <Glyph name="bed" size={26} color={C.ink} />}
          </View>
          <View>
            <RNText numberOfLines={2} style={{ color: C.white, fontSize: 16, textAlign: 'center', fontFamily: 'PlusJakartaSans_800ExtraBold' }}>{name}</RNText>
            <RNText numberOfLines={2} style={{ color: N.mid, fontSize: 12, textAlign: 'center', fontFamily: 'PlusJakartaSans_600SemiBold' }}>{['the stay', stop?.title].filter(Boolean).join(' · ')}</RNText>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {phone ? <Round icon="phone" label="Call" onPress={() => openLink(`tel:${phone.replace(/[\s-]/g, '')}`)} /> : null}
            {mail ? <Round icon="message" label="Message" onPress={() => openLink(`mailto:${mail}`)} /> : null}
            {!phone && !mail && e.data.bookingUrl ? <Round icon="external" label="Booking page" onPress={() => openLink(e.data.bookingUrl)} /> : null}
            <Round icon="nav" label="Directions" onPress={() => openLink(dirUrl)} />
          </View>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Booking papers" onPress={() => (d.papers[0] ? router.push(`/entity/document/${d.papers[0].id}` as never) : trip ? router.push(tripRoutes.prep(trip.id, 'docs')) : undefined)} style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0, gap: 10, padding: 14, backgroundColor: N.tile, borderRadius: 26 }}>
          <View style={{ height: 58 }}>
            {[{ left: 12, rot: '-10deg', top: '#FF5C47' }, { left: 40, rot: '8deg', top: '#6CC6FF' }].map((p) => (
              <View key={p.left} style={{ position: 'absolute', top: 6, left: p.left, width: 36, height: 46, borderRadius: 5, backgroundColor: '#F3F1EC', boxShadow: '0 4px 10px rgba(0,0,0,0.4)', overflow: 'hidden', transform: [{ rotate: p.rot }], opacity: d.papers.length ? 1 : 0.35 }}>
                <View style={{ height: 10, backgroundColor: p.top }} />
                {['80%', '60%', '70%'].map((w) => <View key={w} style={{ width: w as `${number}%`, height: 3, marginTop: 4, marginHorizontal: 5, borderRadius: 2, backgroundColor: 'rgba(11,11,13,0.2)' }} />)}
              </View>
            ))}
            {d.papers.length ? (
              <View style={{ position: 'absolute', top: 0, right: 0, height: 26, minWidth: 26, paddingHorizontal: 7, borderRadius: 13, backgroundColor: N.lime, alignItems: 'center', justifyContent: 'center' }}>
                <RNText style={{ color: C.ink, fontSize: 12, fontVariant: ['tabular-nums'], fontFamily: 'PlusJakartaSans_800ExtraBold' }}>{d.papers.length}</RNText>
              </View>
            ) : null}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: N.raised, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Glyph name="file" size={14} color={N.mid} />
            </View>
            <View style={{ flexShrink: 1, minWidth: 0 }}>
              <RNText numberOfLines={1} style={{ color: C.white, fontSize: 14, fontFamily: 'PlusJakartaSans_700Bold' }}>Booking papers</RNText>
              <RNText numberOfLines={1} style={{ color: N.mid, fontSize: 11, fontFamily: 'PlusJakartaSans_400Regular' }}>{d.papers.length ? (d.papers.length === 1 ? d.papers[0]!.title : `${d.papers.length} saved`) : 'none yet · add in Prep'}</RNText>
            </View>
          </View>
        </Pressable>
      </Anim>

      <Anim k="jr" delay={470}>
        <DriverCard japan={japan} lines={driverLines} onExpand={() => setDriver(true)} onMaps={() => openLink(mapUrl)} onCopy={copy} />
      </Anim>

      <Modal visible={driver} animationType="fade" onRequestClose={() => setDriver(false)} statusBarTranslucent>
        <Pressable accessibilityLabel="Close" onPress={() => setDriver(false)} style={{ flex: 1, backgroundColor: C.white, justifyContent: 'center', paddingHorizontal: 24, paddingTop: insets.top, gap: 16 }}>
          <RNText style={{ color: 'rgba(11,11,13,0.62)', fontSize: 12, letterSpacing: 1, fontFamily: MONO }}>{japan ? 'SHOW THE DRIVER · 運転手さんへ' : 'SHOW THE DRIVER'}</RNText>
          <RNText adjustsFontSizeToFit numberOfLines={3} style={{ color: C.ink, fontSize: 56, lineHeight: 64, letterSpacing: 1, fontFamily: JP_SANS, fontWeight: '900' }}>{driverLines.big}</RNText>
          {driverLines.place ? <RNText style={{ color: C.ink, fontSize: 30, lineHeight: 38, fontFamily: JP_SANS, fontWeight: '700' }}>{driverLines.place}</RNText> : null}
          <RNText style={{ color: 'rgba(11,11,13,0.62)', fontSize: 16, fontFamily: 'PlusJakartaSans_600SemiBold' }}>{driverLines.line}</RNText>
          <RNText style={{ color: 'rgba(11,11,13,0.42)', fontSize: 13, fontFamily: 'PlusJakartaSans_500Medium' }}>Tap to close</RNText>
        </Pressable>
      </Modal>
    </TripScreen>
  );
}

function Action({ icon, label, onPress, lime }: { icon: GlyphName; label: string; onPress?: () => void; lime?: boolean }) {
  return (
    <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0, alignItems: 'center', gap: 6, opacity: onPress ? 1 : 0.4 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={!onPress} onPress={onPress} style={({ pressed }) => ({ width: 52, height: 52, borderRadius: 26, backgroundColor: lime ? N.lime : N.raised, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.95 : 1 }] })}>
        <Glyph name={icon} size={21} color={lime ? C.ink : N.lime} />
      </Pressable>
      <RNText numberOfLines={1} style={{ color: N.mid, fontSize: 12, lineHeight: 15, fontFamily: 'PlusJakartaSans_600SemiBold' }}>{label}</RNText>
    </View>
  );
}

function Round({ icon, label, onPress }: { icon: GlyphName; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' }}>
      <Glyph name={icon} size={18} color={N.lime} />
    </Pressable>
  );
}

function Toggle({ on, label, onPress }: { on: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="switch" accessibilityLabel={label} accessibilityState={{ checked: on }} onPress={onPress} style={{ width: 50, height: 30, padding: 3, borderRadius: 999, backgroundColor: on ? N.lime : N.bar, flexDirection: 'row', justifyContent: on ? 'flex-end' : 'flex-start', flexShrink: 0 }}>
      <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: on ? C.ink : N.mid }} />
    </Pressable>
  );
}

/** The card to show a driver: the stay's name large, where it is, Open in Maps and Copy. */
function DriverCard({ japan, lines, onExpand, onMaps, onCopy }: { japan: boolean; lines: { big: string; place: string; line: string }; onExpand: () => void; onMaps: () => void; onCopy: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Show the driver, full screen" onPress={onExpand} style={{ gap: 8, padding: 16, backgroundColor: C.white, borderRadius: 24 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <RNText style={{ color: 'rgba(11,11,13,0.62)', fontSize: 10, letterSpacing: 1, fontFamily: MONO }}>{japan ? 'SHOW THE DRIVER · 運転手さんへ' : 'SHOW THE DRIVER'}</RNText>
        <View style={{ flexGrow: 1 }} />
        <Glyph name="expand" size={16} color="rgba(11,11,13,0.62)" />
      </View>
      <RNText numberOfLines={2} style={{ color: C.ink, fontSize: 34, lineHeight: 40, letterSpacing: 1, fontFamily: JP_SANS, fontWeight: '900' }}>{lines.big}</RNText>
      {lines.place ? <RNText style={{ color: C.ink, fontSize: 18, lineHeight: 24, fontFamily: JP_SANS, fontWeight: '700' }}>{lines.place}</RNText> : null}
      <RNText style={{ color: 'rgba(11,11,13,0.62)', fontSize: 12, fontFamily: 'PlusJakartaSans_600SemiBold' }}>{lines.line}</RNText>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
        <PillButton label="Open in Maps" icon="nav" kind="ink" height={40} onPress={onMaps} />
        <PillButton label="Copy" icon="copy" kind="paper" height={40} onPress={onCopy} />
      </View>
    </Pressable>
  );
}

