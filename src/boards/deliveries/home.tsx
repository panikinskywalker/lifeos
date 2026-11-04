import React from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { format } from 'date-fns';
import type { LifeOSContext } from '@core/registry/context';
import { lastMonths } from '@core/dashboard/overview';
import { useLive } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { blocks } from '@ui/theme/tokens';
import { Icon, Screen, Text } from '@ui/kit';
import { arrivesToday, onTheWay, otpOf, STAGE, STATUS_WORD, type DeliveryData } from '@modules/deliveries';
import { AddButton, DeliveryRow, FilingBell, Footnote, Hair, INK, lateDays, Pill, RowCard, shopColor, soonest, sourcesOn, stamp, whereLine, type Delivery } from './parts';

/**
 * Deliveries home (NR-Deliveries-Home, the board's index): the lime block of
 * what is coming today with its codes, three numbers, everything on the way,
 * delivered by month, by shop, and the way to every delivery. With none yet,
 * NR-Deliveries-Empty.
 */

const INK_SOFT = 'rgba(11,11,13,0.72)';

const TOP_SHOPS = 6;

function loadHome(os: LifeOSContext) {
  const now = Date.now();
  const all = os.records.query<DeliveryData>('delivery', {}, { limit: 2000 });
  const onWay = all.filter((e) => onTheWay(e, now)).sort(soonest);
  const today = onWay.filter((e) => arrivesToday(e, now)).sort((a, b) => STAGE[b.data.status] - STAGE[a.data.status] || Number(!!otpOf(b, now)) - Number(!!otpOf(a, now)));
  const months = lastMonths(6, now).map((m) => ({ label: m.label, value: all.filter((e) => e.data.status === 'delivered' && (e.data.deliveredOn ?? '') >= m.start && (e.data.deliveredOn ?? '') <= m.end).length }));
  const byShop = new Map<string, number>();
  for (const e of all) if (e.data.shop) byShop.set(e.data.shop, (byShop.get(e.data.shop) ?? 0) + 1);
  return { all, onWay, today, months, shops: [...byShop.entries()].sort((a, b) => b[1] - a[1]), late: onWay.filter((e) => lateDays(e, now)).length, out: onWay.filter((e) => e.data.status === 'out_for_delivery').length, sources: sourcesOn(os), now };
}

/** Today, on lime: each parcel with its code at the right. */
function TodayBlock({ items, now }: { items: Delivery[]; now: number }) {
  const router = useRouter();
  const out = items.some((e) => e.data.status === 'out_for_delivery');
  return (
    <View style={{ padding: 18, borderRadius: 28, backgroundColor: blocks.lime, gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name={out ? 'car' : 'box'} size={16} color={INK} />
        <Text style={{ flex: 1, fontSize: 11, lineHeight: 14, fontWeight: '700', letterSpacing: 0.9, color: INK }}>{out ? 'OUT FOR DELIVERY · TODAY' : 'ARRIVING TODAY'}</Text>
        <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: '600', color: INK_SOFT }}>{format(now, 'EEE d MMM')}</Text>
      </View>
      {items.map((e, i) => {
        const otp = otpOf(e, now);
        const line = [e.data.shop, e.data.carrier, otp && e.data.otpAt ? `OTP came ${stamp(e.data.otpAt, now)}` : null].filter(Boolean).join(' · ');
        return (
          <React.Fragment key={e.id}>
            {i ? <Hair color="rgba(11,11,13,0.16)" /> : null}
            <Pressable accessibilityRole="button" accessibilityLabel={`${e.title}, ${line}${otp ? `, OTP ${otp.split('').join(' ')}` : ''}`} onPress={() => router.push(`/entity/delivery/${e.id}` as never)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44, opacity: pressed ? 0.7 : 1 })}>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text numberOfLines={1} style={{ fontSize: 17, lineHeight: 22, fontWeight: '700', letterSpacing: -0.2, color: INK }}>{e.title}</Text>
                <Text numberOfLines={1} style={{ fontSize: 13, lineHeight: 17, fontWeight: '500', color: INK_SOFT }}>{line}</Text>
              </View>
              {otp ? (
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 10, lineHeight: 13, fontWeight: '700', letterSpacing: 0.9, color: INK_SOFT }}>OTP</Text>
                  <Text style={{ fontSize: 30, lineHeight: 34, fontWeight: '700', letterSpacing: otp.length > 4 ? 3 : 5, color: INK, fontVariant: ['tabular-nums'] }}>{otp}</Text>
                </View>
              ) : null}
            </Pressable>
          </React.Fragment>
        );
      })}
      {items.some((e) => otpOf(e, now)) ? <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: '500', color: INK_SOFT }}>Give the code to the agent only when you have the package.</Text> : null}
    </View>
  );
}

function Stats({ items }: { items: Array<{ value: number; label: string; lime?: boolean }> }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', padding: 16, borderRadius: 24, backgroundColor: t.c.bg.tile, gap: 12 }}>
      {items.map((s, i) => (
        <View key={s.label} style={[{ flex: 1, gap: 2 }, i ? { paddingLeft: 12, borderLeftWidth: 1, borderLeftColor: t.c.line } : null]}>
          <Text style={{ fontSize: 26, lineHeight: 30, fontWeight: '700', letterSpacing: -0.5, color: s.lime ? t.c.accent.mustard : t.c.fg.primary, fontVariant: ['tabular-nums'] }}>{s.value}</Text>
          <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: '500', color: t.c.fg.secondary }}>{s.label}</Text>
        </View>
      ))}
    </View>
  );
}

/** The pill at a row's right: its code, how late, else its status. */
function RowPill({ e, now }: { e: Delivery; now: number }) {
  const otp = otpOf(e, now);
  const late = lateDays(e, now);
  if (otp) return <Pill label={`OTP ${otp}`} tone="lime" />;
  if (late) return <Pill label={`${late} d late`} tone="coral" />;
  return e.data.status === 'out_for_delivery' ? <Pill label="Out" tone="lime" /> : <Pill label={STATUS_WORD[e.data.status]} />;
}

function CardHead({ title, sub, pill }: { title: string; sub: string; pill: string }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 15, lineHeight: 19, fontWeight: '600', color: t.c.fg.primary }}>{title}</Text>
        <Text numberOfLines={1} style={{ fontSize: 13, lineHeight: 17, fontWeight: '500', color: t.c.fg.secondary, fontVariant: ['tabular-nums'] }}>{sub}</Text>
      </View>
      <Pill label={pill} tone="white" />
    </View>
  );
}

/** Six months: past ones grey with the busiest white, this month lime. */
function MonthsCard({ months }: { months: Array<{ label: string; value: number }> }) {
  const t = useTheme();
  const past = months.slice(0, -1);
  const peak = Math.max(...past.map((m) => m.value));
  const top = Math.max(1, ...months.map((m) => m.value));
  const shown = peak > 0 ? past.find((m) => m.value === peak)! : months.at(-1)!;
  return (
    <View style={{ padding: 18, borderRadius: 28, backgroundColor: t.c.bg.tile, gap: 12 }}>
      <CardHead title="Delivered by month" sub={`Last 6 months · ${months.reduce((n, m) => n + m.value, 0)} parcels`} pill={`${shown.label} · ${shown.value}`} />
      <View accessibilityRole="image" accessibilityLabel={`Delivered by month: ${months.map((m) => `${m.label} ${m.value}`).join(', ')}`} style={{ flexDirection: 'row', gap: 10, height: 146 }}>
        {months.map((m, i) => {
          const now = i === months.length - 1;
          const isPeak = !now && peak > 0 && m === shown;
          const color = now ? t.c.accent.mustard : isPeak ? t.c.fg.primary : t.c.fg.secondary;
          const h = Math.max(4, (m.value / top) * 106);
          return (
            <View key={m.label} style={{ flex: 1, justifyContent: 'flex-end', alignItems: 'center' }}>
              <Text style={{ fontSize: 11, lineHeight: 14, fontWeight: now || isPeak ? '700' : '600', color, fontVariant: ['tabular-nums'], marginBottom: 2 }}>{m.value}</Text>
              <View style={{ alignSelf: 'stretch', height: h, borderRadius: Math.min(10, h / 2), backgroundColor: now ? t.c.accent.mustard : isPeak ? t.c.fg.primary : t.c.bg.pressed }} />
              <Text style={{ marginTop: 6, fontSize: 11, lineHeight: 14, fontWeight: now ? '700' : '600', color: now ? t.c.accent.mustard : t.c.fg.secondary }}>{m.label}</Text>
            </View>
          );
        })}
      </View>
      <Text style={{ fontSize: 13, lineHeight: 17, color: t.c.fg.tertiary }}>Lime is this month so far.</Text>
    </View>
  );
}

/** By shop: the bar, then the top six and the rest. */
function FromCard({ shops, total }: { shops: Array<[string, number]>; total: number }) {
  const t = useTheme();
  const top = shops.slice(0, TOP_SHOPS);
  const others = shops.length > TOP_SHOPS;
  const rest = total - top.reduce((n, [, v]) => n + v, 0);
  const parts = [...top.map(([label, value]) => ({ label, value, color: shopColor(label), quiet: false })), ...(rest ? [{ label: others ? 'Others' : 'No shop named', value: rest, color: t.c.fg.tertiary, quiet: true }] : [])];
  return (
    <View style={{ padding: 18, borderRadius: 28, backgroundColor: t.c.bg.tile, gap: 12 }}>
      <CardHead title="From" sub={shops.length >= TOP_SHOPS ? `Every delivery · top ${TOP_SHOPS} shops` : 'Every delivery'} pill={String(total)} />
      <View style={{ flexDirection: 'row', gap: 3 }}>
        {parts.map((p) => <View key={p.label} style={{ flexGrow: p.value, flexBasis: 5, height: 10, borderRadius: 5, backgroundColor: p.color }} />)}
      </View>
      <View style={{ gap: 2 }}>
        {parts.map((p) => (
          <View key={p.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 34 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: p.color }} />
            <Text numberOfLines={1} style={{ flex: 1, fontSize: 14, lineHeight: 18, fontWeight: '600', color: p.quiet ? t.c.fg.secondary : t.c.fg.primary }}>{p.label}</Text>
            <Text style={{ fontSize: 14, lineHeight: 18, fontWeight: '700', color: p.quiet ? t.c.fg.secondary : t.c.fg.primary, fontVariant: ['tabular-nums'] }}>{p.value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** NR-Deliveries-Empty: nothing yet, what fills it, and the sources it needs. */
function HomeEmpty({ sources }: { sources: { sms: boolean; mail: boolean } }) {
  const t = useTheme();
  const router = useRouter();
  const openSources = () => router.push('/settings/sources' as never);
  const openMail = () => router.push('/settings/email' as never);
  return (
    <>
      <View style={{ padding: 18, borderRadius: 28, backgroundColor: t.c.bg.tile, alignItems: 'center', gap: 10 }}>
        <View style={{ width: 56, height: 56, marginTop: 10, borderRadius: 28, backgroundColor: t.c.bg.tileRaised, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="box" size={26} color={t.c.accent.mustard} />
        </View>
        <Text style={{ fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: -0.2, color: t.c.fg.primary, textAlign: 'center' }}>Nothing on the way.</Text>
        <Text style={{ fontSize: 13, lineHeight: 18, color: t.c.fg.secondary, textAlign: 'center', maxWidth: 280 }}>Shipping texts and mail from shops and couriers land here on their own, with the code for the agent.</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 6, marginBottom: 4 }}>
          {sources.sms ? null : (
            <Pressable accessibilityRole="button" onPress={openSources} style={({ pressed }) => ({ height: 44, paddingHorizontal: 20, borderRadius: 999, backgroundColor: t.c.accent.mustard, justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}>
              <Text style={{ fontSize: 15, lineHeight: 19, fontWeight: '700', color: t.c.accent.mustardInk }}>Allow texts</Text>
            </Pressable>
          )}
          <Pressable accessibilityRole="button" onPress={() => router.push('/entity/delivery/new' as never)} style={({ pressed }) => ({ height: 44, paddingHorizontal: 20, borderRadius: 999, backgroundColor: t.c.bg.tileRaised, justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}>
            <Text style={{ fontSize: 15, lineHeight: 19, fontWeight: '600', color: t.c.fg.primary }}>Add one</Text>
          </Pressable>
        </View>
      </View>
      <RowCard>
        <Pressable accessibilityRole="button" onPress={openSources} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 60, opacity: pressed ? 0.7 : 1 })}>
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: t.c.bg.tileRaised, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="comment" size={18} color={blocks.sky} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontSize: 16, lineHeight: 21, fontWeight: '600', color: t.c.fg.primary }}>Texts</Text>
            <Text style={{ fontSize: 13, lineHeight: 17, color: t.c.fg.secondary }}>{sources.sms ? 'Shops and couriers' : 'Needs SMS access'}</Text>
          </View>
          <Pill label={sources.sms ? 'On' : 'Off'} tone={sources.sms ? 'lime' : 'quiet'} />
        </Pressable>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 60 }}>
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: t.c.bg.tileRaised, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="inbox" size={18} color={blocks.yellow} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontSize: 16, lineHeight: 21, fontWeight: '600', color: t.c.fg.primary }}>Mail</Text>
            <Text style={{ fontSize: 13, lineHeight: 17, color: t.c.fg.secondary }}>{sources.mail ? 'Shipping mails only' : 'Gmail not connected'}</Text>
          </View>
          {sources.mail ? <Pill label="On" tone="lime" /> : (
            <Pressable accessibilityRole="button" accessibilityLabel="Connect Gmail" hitSlop={4} onPress={openMail} style={({ pressed }) => ({ height: 36, paddingHorizontal: 14, borderRadius: 999, backgroundColor: t.c.bg.tileRaised, justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}>
              <Text style={{ fontSize: 13, lineHeight: 17, fontWeight: '600', color: t.c.fg.primary }}>Connect</Text>
            </Pressable>
          )}
        </View>
      </RowCard>
      <Footnote text="Texts are read on this phone and never leave it. Bank texts go to Money, food orders are left out." />
    </>
  );
}

export function DeliveriesHome() {
  const router = useRouter();
  const t = useTheme();
  const d = useLive(loadHome, []);

  const header = {
    title: 'Deliveries',
    subtitle: d.onWay.length ? [`${d.onWay.length} on the way`, d.out ? `${d.out} out for delivery` : null].filter(Boolean).join(' · ') : 'Nothing on the way',
    right: (
      <>
        <FilingBell />
        <AddButton />
      </>
    ),
    onBack: () => (router.canGoBack() ? router.back() : router.replace('/browse' as never)),
  };

  if (!d.all.length) {
    return (
      <Screen {...header} contentStyle={{ gap: 22 }}>
        <HomeEmpty sources={d.sources} />
      </Screen>
    );
  }

  const thisMonth = d.months.at(-1)!.value;
  const lateWord = d.late === 1 ? 'one late' : d.late ? `${d.late} late` : null;
  return (
    <Screen {...header} contentStyle={{ gap: 24 }}>
      {d.today.length ? <TodayBlock items={d.today} now={d.now} /> : null}
      <Stats items={[{ value: d.onWay.length, label: 'On the way' }, { value: d.out, label: 'Out for delivery', lime: d.out > 0 }, { value: thisMonth, label: 'Delivered this month' }]} />

      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingTop: 6, paddingHorizontal: 4 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: -0.2, color: t.c.fg.primary }}>On the way</Text>
            {d.onWay.length ? <Text style={{ fontSize: 13, lineHeight: 17, color: t.c.fg.secondary }}>{['Soonest first', lateWord].filter(Boolean).join(' · ')}</Text> : null}
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="This week, every parcel by day" hitSlop={12} onPress={() => router.push('/module/deliveries/arriving' as never)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 2, opacity: pressed ? 0.7 : 1 })}>
            <Text style={{ fontSize: 13, lineHeight: 17, fontWeight: '600', color: t.c.fg.secondary }}>This week</Text>
            <Icon name="chevron-right" size={14} color={t.c.fg.secondary} />
          </Pressable>
        </View>
        {d.onWay.length ? (
          <RowCard style={{ padding: 14, gap: 8 }}>
            {d.onWay.map((e) => <DeliveryRow key={e.id} entity={e} sub={whereLine(e, d.now)} subColor={lateDays(e, d.now) ? t.c.alert.coralText : undefined} right={<RowPill e={e} now={d.now} />} />)}
          </RowCard>
        ) : (
          <View style={{ padding: 16, borderRadius: 24, borderWidth: 1.5, borderStyle: 'dashed', borderColor: t.c.fg.tertiary }}>
            <Text style={{ fontSize: 13, lineHeight: 18, color: t.c.fg.secondary, textAlign: 'center' }}>Nothing on the way.</Text>
          </View>
        )}
      </View>

      {d.months.some((m) => m.value > 0) ? <MonthsCard months={d.months} /> : null}
      {d.shops.length ? <FromCard shops={d.shops} total={d.all.length} /> : null}

      <Pressable accessibilityRole="button" onPress={() => router.push('/module/deliveries/list' as never)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 56, paddingHorizontal: 16, borderRadius: 24, backgroundColor: t.c.bg.tile, opacity: pressed ? 0.8 : 1 })}>
        <Icon name="list" size={18} color={t.c.accent.mustard} />
        <Text style={{ flex: 1, fontSize: 16, lineHeight: 21, fontWeight: '600', color: t.c.fg.primary }}>All deliveries</Text>
        <Text style={{ fontSize: 13, lineHeight: 17, fontWeight: '600', color: t.c.fg.secondary, fontVariant: ['tabular-nums'] }}>{d.all.length}</Text>
        <Icon name="chevron-right" size={18} color={t.c.fg.tertiary} />
      </Pressable>

      <Footnote text="Filed from shipping texts and mail, read on this phone. Nothing is sent anywhere." />
    </Screen>
  );
}
