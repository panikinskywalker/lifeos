import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { format } from 'date-fns';
import type { LifeOSContext } from '@core/registry/context';
import { daysUntil } from '@core/dashboard/overview';
import { useLive } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Icon, Screen, Segmented, Text } from '@ui/kit';
import { arrivesToday, isoDay, onTheWay, otpOf, STATUS_WORD, type DeliveryData } from '@modules/deliveries';
import { dayLabel, deliveryRoute, DeliveryActions, DeliveryRow, Footnote, GroupLabel, lateDays, OtpBlock, Pill, RowCard, ShopDisc, soonest, stepTimes, type Delivery } from './parts';

/**
 * Arriving (NR-Deliveries-Arriving): today or the week ahead. A strip of
 * seven days with a dot per parcel, then what is late, today's parcels with
 * their codes large, and the rest by day. The days with nothing yet end it.
 */

type Tab = 'today' | 'week';

function loadArriving(os: LifeOSContext) {
  const now = Date.now();
  const base = new Date(now);
  const onWay = os.records.query<DeliveryData>('delivery', {}, { limit: 2000 }).filter((e) => onTheWay(e, now)).sort(soonest);
  const today = onWay.filter((e) => arrivesToday(e, now)).sort((a, b) => Number(!!otpOf(b, now)) - Number(!!otpOf(a, now)));
  const late = onWay.filter((e) => lateDays(e, now));
  const days = Array.from({ length: 7 }, (_, i) => new Date(base.getFullYear(), base.getMonth(), base.getDate() + i)).map((date, i) => {
    const iso = isoDay(date.getTime());
    return { iso, date, items: i === 0 ? today : onWay.filter((e) => e.data.expectedDate === iso && !today.includes(e) && !late.includes(e)) };
  });
  const last = days.at(-1)!.iso;
  return {
    now,
    onWay,
    today,
    late,
    days,
    later: onWay.filter((e) => e.data.expectedDate && e.data.expectedDate > last && !today.includes(e)),
    undated: onWay.filter((e) => !e.data.expectedDate && !today.includes(e)),
    // When it last heard, and when it shipped, for what is late.
    heard: Object.fromEntries(late.map((e) => [e.id, { last: os.records.timeline.forEntity(e.id, 20).find((x) => ['sms', 'notification', 'email'].includes(x.kind))?.occurredAt ?? e.createdAt, steps: stepTimes(os, e.id) }])),
  };
}

function WeekStrip({ days }: { days: Array<{ iso: string; date: Date; items: unknown[] }> }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      {days.map((d, i) => {
        const today = i === 0;
        return (
          <View key={d.iso} accessible accessibilityLabel={`${format(d.date, 'EEEE d MMMM')}, ${d.items.length} ${d.items.length === 1 ? 'parcel' : 'parcels'}`} style={{ flex: 1, alignItems: 'center', gap: 6, paddingVertical: 10, borderRadius: 18, backgroundColor: today ? t.c.accent.mustard : t.c.bg.tile }}>
            <Text style={{ fontSize: 11, lineHeight: 14, fontWeight: today ? '700' : '600', letterSpacing: 0.9, color: today ? t.c.accent.mustardInk : t.c.fg.secondary }}>{format(d.date, 'EEE').toUpperCase()}</Text>
            <Text style={{ fontSize: 17, lineHeight: 20, fontWeight: '700', color: today ? t.c.accent.mustardInk : t.c.fg.primary, fontVariant: ['tabular-nums'] }}>{d.date.getDate()}</Text>
            <View style={{ flexDirection: 'row', gap: 3, height: 6 }}>
              {d.items.slice(0, 3).map((_, n) => <View key={n} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: today ? t.c.accent.mustardInk : t.c.fg.primary }} />)}
            </View>
          </View>
        );
      })}
    </View>
  );
}

/** The head of a card: disc, what, where from, then a chevron or a pill. */
function CardHead({ e, sub, right }: { e: Delivery; sub: string; right: React.ReactNode }) {
  const t = useTheme();
  const router = useRouter();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${e.title}, ${sub}`} onPress={() => router.push(deliveryRoute(e.id))} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 44, opacity: pressed ? 0.7 : 1 })}>
      <ShopDisc shop={e.data.shop} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text numberOfLines={1} style={{ fontSize: 16, lineHeight: 21, fontWeight: '600', color: t.c.fg.primary }}>{e.title}</Text>
        <Text numberOfLines={1} style={{ fontSize: 13, lineHeight: 17, color: t.c.fg.secondary }}>{sub}</Text>
      </View>
      {right}
    </Pressable>
  );
}

function LateCard({ e, ctx, heard, now }: { e: Delivery; ctx: LifeOSContext; heard: { last: number; steps: Partial<Record<DeliveryData['status'], number>> }; now: number }) {
  const t = useTheme();
  const shipped = heard.steps.shipped;
  const sub = [e.data.shop, e.data.carrier, shipped ? `shipped ${format(shipped, 'EEE d MMM')}` : null].filter(Boolean).join(' · ') || STATUS_WORD[e.data.status];
  return (
    <View style={{ padding: 16, borderRadius: 24, backgroundColor: t.c.bg.tile, gap: 12 }}>
      <CardHead e={e} sub={sub} right={<Pill label={`${lateDays(e, now)} d late`} tone="coral" />} />
      <Text style={{ fontSize: 13, lineHeight: 18, color: t.c.fg.secondary }}>{`No text since ${format(heard.last, 'EEE d MMM')}.${e.data.trackingUrl ? " The courier's page may know more." : ''}`}</Text>
      <DeliveryActions ctx={ctx} entity={e} />
    </View>
  );
}

function TodayCard({ e, ctx, now }: { e: Delivery; ctx: LifeOSContext; now: number }) {
  const t = useTheme();
  const otp = otpOf(e, now);
  const chevron = <Icon name="chevron-right" size={18} color={t.c.fg.tertiary} />;
  return (
    <View style={{ padding: 16, borderRadius: 24, backgroundColor: t.c.bg.tile, gap: 14 }}>
      <CardHead e={e} sub={[e.data.shop, e.data.carrier].filter(Boolean).join(' · ') || STATUS_WORD[e.data.status]} right={chevron} />
      {otp ? <OtpBlock otp={otp} at={e.data.otpAt} /> : null}
      <DeliveryActions ctx={ctx} entity={e} />
    </View>
  );
}

/** A parcel further off: the shop and courier, or that it has not shipped yet, and its status. */
function DayRow({ e }: { e: Delivery }) {
  const sub = [e.data.shop ?? e.data.carrier, e.data.status === 'ordered' ? 'not shipped yet' : e.data.shop ? e.data.carrier : e.data.tracking].filter(Boolean).join(' · ') || STATUS_WORD[e.data.status];
  return <DeliveryRow entity={e} sub={sub} minHeight={48} right={<Pill label={e.data.status === 'out_for_delivery' ? 'Out' : STATUS_WORD[e.data.status]} tone={e.data.status === 'out_for_delivery' ? 'lime' : 'quiet'} />} />;
}

function Dashed({ text }: { text: string }) {
  const t = useTheme();
  return (
    <View style={{ padding: 16, borderRadius: 24, borderWidth: 1.5, borderStyle: 'dashed', borderColor: t.c.fg.tertiary }}>
      <Text style={{ fontSize: 13, lineHeight: 18, color: t.c.fg.secondary, textAlign: 'center' }}>{text}</Text>
    </View>
  );
}

export function DeliveriesArriving({ ctx }: { ctx: LifeOSContext; params: Record<string, string> }) {
  const router = useRouter();
  const t = useTheme();
  const [tab, setTab] = useState<Tab>('week');
  const d = useLive(loadArriving, []);

  const span = `${format(d.days[0]!.date, 'EEE d')} to ${format(d.days.at(-1)!.date, 'EEE d MMM')}`;
  const lateDues = [...new Set(d.late.map((e) => e.data.expectedDate!))];
  const future = d.days.slice(1);
  const lastBusy = future.reduce((n, x, i) => (x.items.length ? i : n), -1);
  const quiet = future.slice(lastBusy + 1);
  const quietLabel = quiet.length === 1 ? format(quiet[0]!.date, 'EEE d MMM') : quiet.length === 2 ? `${format(quiet[0]!.date, 'EEE d')} and ${format(quiet[1]!.date, 'EEE d MMM')}` : quiet.length ? `${format(quiet[0]!.date, 'EEE d')} to ${format(quiet.at(-1)!.date, 'EEE d MMM')}` : '';
  const allOut = d.today.length > 0 && d.today.every((e) => e.data.status === 'out_for_delivery');

  return (
    <Screen title="Arriving" subtitle={`${span} · ${d.onWay.length} ${d.onWay.length === 1 ? 'parcel' : 'parcels'}`} onBack={() => (router.canGoBack() ? router.back() : router.replace('/module/deliveries/index' as never))} contentStyle={{ gap: 22 }}>
      <Segmented<Tab> value={tab} onChange={setTab} options={[{ value: 'today', label: `Today · ${d.today.length}` }, { value: 'week', label: `This week · ${d.onWay.length}` }]} />
      <WeekStrip days={d.days} />

      {lateDues.map((day) => (
        <View key={day} style={{ gap: 10 }}>
          <GroupLabel dot text={`LATE · WAS DUE ${dayLabel(day).toUpperCase()}`} color={t.c.alert.coralText} />
          {d.late.filter((e) => e.data.expectedDate === day).map((e) => <LateCard key={e.id} e={e} ctx={ctx} heard={d.heard[e.id]!} now={d.now} />)}
        </View>
      ))}

      {d.today.length ? (
        <View style={{ gap: 10 }}>
          <GroupLabel dot text={`TODAY · ${format(d.now, 'EEE d MMM').toUpperCase()}${allOut ? ' · OUT FOR DELIVERY' : ''}`} color={t.c.accent.mustard} />
          {d.today.map((e) => <TodayCard key={e.id} e={e} ctx={ctx} now={d.now} />)}
          {d.today.some((e) => otpOf(e, d.now)) ? <Text style={{ fontSize: 13, lineHeight: 18, color: t.c.fg.secondary, paddingHorizontal: 4 }}>Give a code to the agent only when you have the package. A code older than 3 days is hidden.</Text> : null}
        </View>
      ) : tab === 'today' && !d.late.length ? (
        <Dashed text="Nothing arriving today" />
      ) : null}

      {tab === 'week' ? (
        <>
          {future.filter((x) => x.items.length).map((x) => {
            const left = daysUntil(x.iso, d.now);
            return (
              <View key={x.iso} style={{ gap: 10 }}>
                <GroupLabel text={`${format(x.date, 'EEE d MMM').toUpperCase()} · ${left === 1 ? 'TOMORROW' : `IN ${left} D`}`} />
                <RowCard style={{ padding: 14, gap: 8 }}>
                  {(x.items as Delivery[]).map((e) => <DayRow key={e.id} e={e} />)}
                </RowCard>
              </View>
            );
          })}
          {d.later.length ? (
            <View style={{ gap: 10 }}>
              <GroupLabel text="LATER" />
              <RowCard style={{ padding: 14, gap: 8 }}>{d.later.map((e) => <DayRow key={e.id} e={e} />)}</RowCard>
            </View>
          ) : null}
          {d.undated.length ? (
            <View style={{ gap: 10 }}>
              <GroupLabel text="NO DAY YET" />
              <RowCard style={{ padding: 14, gap: 8 }}>{d.undated.map((e) => <DayRow key={e.id} e={e} />)}</RowCard>
            </View>
          ) : null}
          {quiet.length ? (
            <View style={{ gap: 10 }}>
              <GroupLabel text={quietLabel.toUpperCase()} />
              <Dashed text="Nothing expected yet" />
            </View>
          ) : null}
        </>
      ) : null}

      <Footnote icon="calendar" text="Days come from the shop's and courier's texts and mail. Each new one moves the day; a status only moves forward." />
    </Screen>
  );
}
