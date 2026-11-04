import React, { useId, type ReactNode } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { format } from 'date-fns';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';
import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import type { RecordControls } from '@core/registry/types';
import { daysUntil } from '@core/dashboard/overview';
import { messageItem } from '@core/filing/queue';
import { linkGroups } from '@core/graph/read';
import { useLive } from '@ui/hooks';
import { ThemeProvider, useTheme } from '@ui/theme/ThemeProvider';
import { blocks, gradients } from '@ui/theme/tokens';
import { Icon, Text, useToast } from '@ui/kit';
import { isQuick, onTheWay, otpOf, STAGE, STATUS_WORD, STEPS, type DeliveryData } from '@modules/deliveries';
import { dayLabel, DeliveryActions, Divided, Footnote, Hair, lateDays, OtpBlock, Pill, ShopDisc, stepTimes, type Delivery } from './parts';

/**
 * The Delivery page (NR-Deliveries-Record), the whole record page: the blue
 * hero with its status, title and the four steps; the code large with Track;
 * its Fields; Links; the Timeline with each message word for word. Noir in
 * both themes, as it sits on a gradient.
 */

const HERO = 420;
const STEP_WORD: Record<string, string> = { ordered: 'Ordered', shipped: 'Shipped', out_for_delivery: 'Out for delivery', delivered: 'Delivered' };
/** Filing's bookkeeping on a record: the messages on the Timeline already say it. */
const QUIET_KINDS = ['updated', 'status', 'relation'];
const MESSAGE_ICON: Record<string, string> = { sms: 'comment', notification: 'bell', email: 'inbox', created: 'plus' };

function Backdrop({ id }: { id: string }) {
  const t = useTheme();
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, height: HERO, overflow: 'hidden' }}>
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id={`${id}a`} x1="0.33" y1="0" x2="0.67" y2="1">
            <Stop offset="0" stopColor={gradients.upkeep[0]} />
            <Stop offset="0.6" stopColor={gradients.upkeep[1]} />
            <Stop offset="1" stopColor={t.c.bg.ground} />
          </LinearGradient>
          <RadialGradient id={`${id}b`} cx="80%" cy="16%" r="32%">
            <Stop offset="0" stopColor={blocks.sky} stopOpacity={0.55} />
            <Stop offset="1" stopColor={blocks.sky} stopOpacity={0} />
          </RadialGradient>
          <LinearGradient id={`${id}c`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0.52" stopColor={t.c.bg.ground} stopOpacity={0} />
            <Stop offset="1" stopColor={t.c.bg.ground} stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${id}a)`} />
        <Rect width="100%" height="100%" fill={`url(#${id}b)`} />
        <Rect width="100%" height="100%" fill={`url(#${id}c)`} />
      </Svg>
    </View>
  );
}

/** "From Amazon · arrives today, Tue 3 Nov". */
function heroLine(e: Delivery, now: number): string {
  const d = e.data;
  const left = d.expectedDate ? daysUntil(d.expectedDate, now) : null;
  const when =
    d.status === 'delivered' ? (d.deliveredOn ? `delivered ${dayLabel(d.deliveredOn)}` : 'delivered')
    : STAGE[d.status] > 3 ? STATUS_WORD[d.status].toLowerCase()
    : !onTheWay(e, now) ? 'probably came'
    : lateDays(e, now) ? `was due ${dayLabel(d.expectedDate!)}`
    : isQuick(d) && d.status === 'out_for_delivery' ? 'on its way'
    : left === 0 ? `arrives today, ${dayLabel(d.expectedDate!)}`
    : left === 1 ? `arrives tomorrow, ${dayLabel(d.expectedDate!)}`
    : left !== null ? `arrives ${dayLabel(d.expectedDate!)}`
    : STATUS_WORD[d.status].toLowerCase();
  return [d.shop ? `From ${d.shop}` : null, when].filter(Boolean).join(' · ');
}

function StatusBadge({ status }: { status: DeliveryData['status'] }) {
  const t = useTheme();
  const closed = STAGE[status] > 3;
  const icon = status === 'out_for_delivery' ? 'car' : status === 'delivered' ? 'check' : closed ? 'x' : status === 'shipped' ? 'box' : 'clock';
  const ink = closed ? t.c.alert.coralText : t.c.accent.mustardInk;
  return (
    <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, height: 28, paddingHorizontal: 11, borderRadius: 999, backgroundColor: closed ? t.c.alert.coralFill : t.c.accent.mustard }}>
      <Icon name={icon} size={13} color={ink} />
      <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: '700', color: ink }}>{STATUS_WORD[status]}</Text>
    </View>
  );
}

/** The four steps on a rail: ticks behind, a ring on the current, dashed ahead; the day of each under it. */
function Steps({ e, times, now }: { e: Delivery; times: Partial<Record<DeliveryData['status'], number>>; now: number }) {
  const t = useTheme();
  const at = STAGE[e.data.status];
  const dated = (s: (typeof STEPS)[number], i: number) => {
    if (s === 'delivered' && e.data.deliveredOn) return dayLabel(e.data.deliveredOn);
    if (s === 'delivered' && e.data.expectedDate) return daysUntil(e.data.expectedDate, now) === 0 ? 'expected today' : `expected ${dayLabel(e.data.expectedDate)}`;
    const when = times[s] ?? (i === 0 ? e.createdAt : undefined);
    if (!when || i > at) return '';
    return new Date(when).toDateString() === new Date(now).toDateString() ? `today ${format(when, 'h:mm aaa')}` : format(when, 'EEE d MMM');
  };
  return (
    <View accessibilityLabel={`Status: ${STATUS_WORD[e.data.status]}`} style={{ flexDirection: 'row' }}>
      <View style={{ position: 'absolute', left: '12.5%', right: '12.5%', top: 13, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.12)' }} />
      <View style={{ position: 'absolute', left: '12.5%', width: `${at * 25}%`, top: 13, height: 3, borderRadius: 2, backgroundColor: t.c.accent.mustard }} />
      {STEPS.map((s, i) => {
        const done = i < at || at === 3;
        const current = i === at && at < 3;
        return (
          <View key={s} style={{ flex: 1, alignItems: 'center', gap: 8 }}>
            {done ? (
              <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: t.c.accent.mustard, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="check" size={14} color={t.c.accent.mustardInk} />
              </View>
            ) : current ? (
              <View style={{ width: 34, height: 34, margin: -3, borderRadius: 17, borderWidth: 3, borderColor: t.c.accent.mustard, backgroundColor: t.c.bg.ground, alignItems: 'center', justifyContent: 'center' }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: t.c.accent.mustard }} />
              </View>
            ) : (
              <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: t.c.bg.tileRaised, borderWidth: 1.5, borderStyle: 'dashed', borderColor: 'rgba(245,245,247,0.32)' }} />
            )}
            <View style={{ alignItems: 'center', gap: 1, paddingHorizontal: 2 }}>
              <Text style={{ fontSize: 12, lineHeight: 15, fontWeight: current ? '700' : '600', textAlign: 'center', color: current ? t.c.accent.mustard : i > at ? t.c.fg.secondary : t.c.fg.primary }}>{isQuick(e.data) && s === 'out_for_delivery' ? 'On its way' : STEP_WORD[s]}</Text>
              <Text style={{ fontSize: 11, lineHeight: 14, fontWeight: '500', textAlign: 'center', color: t.c.fg.secondary, fontVariant: ['tabular-nums'] }}>{dated(s, i)}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function FieldRow({ label, children }: { label: string; children: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52 }}>
      <Text style={{ width: 110, fontSize: 14, lineHeight: 18, fontWeight: '500', color: t.c.fg.secondary }}>{label}</Text>
      {children}
    </View>
  );
}

function Value({ text, none = 'Not in the texts' }: { text?: string | null; none?: string }) {
  const t = useTheme();
  return <Text numberOfLines={1} style={{ flex: 1, fontSize: 15, lineHeight: 20, fontWeight: text ? '600' : '500', color: text ? t.c.fg.primary : t.c.fg.secondary, fontVariant: ['tabular-nums'] }}>{text || none}</Text>;
}

function Fields({ e, now }: { e: Delivery; now: number }) {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const d = e.data;
  const closed = STAGE[d.status] > 3;
  const left = d.expectedDate ? daysUntil(d.expectedDate, now) : null;
  const copy = () => void Clipboard.setStringAsync(d.orderId!).then(() => toast.show({ message: 'Order ID copied', icon: 'check' }));
  return (
    <>
      <View style={{ paddingHorizontal: 16, paddingVertical: 4, borderRadius: 24, backgroundColor: t.c.bg.tile }}>
        <Divided>
          <FieldRow label="Status"><Pill label={STATUS_WORD[d.status]} tone={closed ? 'coral' : 'lime'} /></FieldRow>
          <FieldRow label="Item"><Value text={d.item} /></FieldRow>
          <FieldRow label="From">
            {d.shop ? (
              <Pressable accessibilityRole="button" accessibilityLabel={`From ${d.shop}`} disabled={!d.shopId} hitSlop={6} onPress={() => router.push(`/entity/org/${d.shopId}` as never)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingLeft: 4, paddingRight: 12, borderRadius: 999, backgroundColor: t.c.bg.tileRaised, opacity: pressed ? 0.8 : 1 })}>
                <ShopDisc shop={d.shop} size={24} />
                <Text numberOfLines={1} style={{ fontSize: 14, lineHeight: 18, fontWeight: '600', color: t.c.fg.primary }}>{d.shop}</Text>
              </Pressable>
            ) : <Value />}
          </FieldRow>
          <FieldRow label="Expected">
            {d.expectedDate ? (
              <>
                <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: '600', color: t.c.fg.primary }}>{left === 0 ? 'Today' : left === 1 ? 'Tomorrow' : left! < 0 ? `${-left!} d ago` : `In ${left} d`}</Text>
                <Text style={{ fontSize: 13, lineHeight: 17, color: t.c.fg.secondary, fontVariant: ['tabular-nums'] }}>{dayLabel(d.expectedDate)}</Text>
              </>
            ) : <Value />}
          </FieldRow>
          {d.notes ? <FieldRow label="Notes"><Text style={{ flex: 1, paddingVertical: 14, fontSize: 15, lineHeight: 20, fontWeight: '500', color: t.c.fg.primary }}>{d.notes}</Text></FieldRow> : null}
        </Divided>
      </View>

      <View style={{ gap: 10 }}>
        <Text style={{ fontSize: 11, lineHeight: 14, fontWeight: '600', letterSpacing: 0.9, color: t.c.fg.tertiary, paddingHorizontal: 4 }}>TRACKING</Text>
        <View style={{ paddingHorizontal: 16, paddingVertical: 4, borderRadius: 24, backgroundColor: t.c.bg.tile }}>
          <Divided>
            <FieldRow label="Tracking link">
              {d.trackingUrl ? (
                <Pressable accessibilityRole="link" accessibilityLabel={`Open ${d.trackingUrl}`} onPress={() => void Linking.openURL(d.trackingUrl!).catch(() => {})} style={({ pressed }) => ({ flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, opacity: pressed ? 0.7 : 1 })}>
                  <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 15, lineHeight: 20, fontWeight: '600', color: t.c.accent.mustard }}>{d.trackingUrl.replace(/^https?:\/\/(www\.)?/, '')}</Text>
                  <Icon name="link" size={14} color={t.c.accent.mustard} />
                </Pressable>
              ) : <Value />}
            </FieldRow>
            <FieldRow label="Carrier"><Value text={d.carrier} /></FieldRow>
            <FieldRow label="Tracking number"><Value text={d.tracking} /></FieldRow>
            <FieldRow label="Order ID">
              <Value text={d.orderId} />
              {d.orderId ? (
                <Pressable accessibilityRole="button" accessibilityLabel="Copy order ID" onPress={copy} style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, backgroundColor: t.c.bg.tileRaised, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}>
                  <Icon name="file" size={16} color={t.c.fg.primary} />
                </Pressable>
              ) : null}
            </FieldRow>
            <FieldRow label="Delivered on"><Value text={d.deliveredOn ? dayLabel(d.deliveredOn) : null} none={closed ? STATUS_WORD[d.status] : 'Not yet'} /></FieldRow>
          </Divided>
        </View>
      </View>
    </>
  );
}

/** Links: its shop under From, its payment under Order, any other under its word. */
function LinksSection({ e, controls }: { e: Delivery; controls?: RecordControls }) {
  const t = useTheme();
  const router = useRouter();
  const groups = useLive((os) => {
    const line = (type: string, id: string) => {
      const label = os.registry.objects.get(type)?.label ?? type;
      if (type === 'org') {
        const n = os.records.query<DeliveryData>('delivery', {}, { limit: 2000 }).filter((x) => x.data.shopId === id).length;
        return `${label} · ${n} ${n === 1 ? 'delivery' : 'deliveries'}`;
      }
      if (type === 'transaction') {
        const rec = os.records.get<{ accountId?: string }>(id);
        const account = rec?.data.accountId ? os.records.get(rec.data.accountId)?.title : null;
        return [label, rec?.occurredAt ? format(rec.occurredAt, 'EEE d MMM') : null, account].filter(Boolean).join(' · ');
      }
      return label;
    };
    const money = (id: string) => {
      const x = os.records.get<{ amount?: number; currency?: string }>(id)?.data;
      return x?.amount != null ? os.format.currency(x.amount, x.currency) : null;
    };
    const rows = linkGroups(os, e.id).flatMap((g) => g.items.map((i) => ({ word: i.id === e.data.shopId ? 'FROM' : i.id === e.data.paymentId ? 'ORDER' : g.word.toUpperCase(), id: i.id, type: i.type, title: i.title, line: line(i.type, i.id), amount: i.type === 'transaction' ? money(i.id) : null })));
    const words = [...new Set(rows.map((r) => r.word))].sort((a, b) => Number(b === 'FROM') - Number(a === 'FROM') || Number(b === 'ORDER') - Number(a === 'ORDER'));
    return words.map((word) => ({ word, rows: rows.filter((r) => r.word === word) }));
  }, [e.id, e.data.shopId, e.data.paymentId]);
  return (
    <View style={{ padding: 16, borderRadius: 24, backgroundColor: t.c.bg.tile, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
        <Text style={{ flex: 1, fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: -0.2, color: t.c.fg.primary }}>Links</Text>
        <Pressable accessibilityRole="link" hitSlop={12} onPress={() => router.push(`/links/${e.id}` as never)}>
          <Text style={{ fontSize: 13, lineHeight: 17, fontWeight: '600', color: t.c.fg.secondary }}>Open Links</Text>
        </Pressable>
      </View>
      {groups.map((g, gi) => (
        <React.Fragment key={g.word}>
          {gi ? <Hair /> : null}
          <Text style={{ fontSize: 11, lineHeight: 14, fontWeight: '600', letterSpacing: 0.9, color: t.c.fg.tertiary }}>{g.word}</Text>
          {g.rows.map((r) => (
            <Pressable key={r.id} accessibilityRole="button" accessibilityLabel={`${r.title}, ${r.line}`} onPress={() => router.push(`/entity/${r.type}/${r.id}` as never)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 48, opacity: pressed ? 0.7 : 1 })}>
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: t.c.bg.tileRaised, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={r.type === 'org' ? 'briefcase' : r.type === 'transaction' ? 'receipt' : 'link'} size={18} color={r.type === 'org' ? t.tints.travel.ink : r.type === 'transaction' ? blocks.orange : t.c.fg.primary} />
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text numberOfLines={1} style={{ fontSize: 16, lineHeight: 21, fontWeight: '600', color: t.c.fg.primary }}>{r.title}</Text>
                <Text numberOfLines={1} style={{ fontSize: 13, lineHeight: 17, color: t.c.fg.secondary, fontVariant: ['tabular-nums'] }}>{r.line}</Text>
              </View>
              {r.amount ? <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: '700', color: t.c.fg.primary, fontVariant: ['tabular-nums'] }}>{r.amount}</Text> : <Icon name="chevron-right" size={18} color={t.c.fg.tertiary} />}
            </Pressable>
          ))}
        </React.Fragment>
      ))}
      {controls ? (
        <Pressable accessibilityRole="button" onPress={controls.link} style={({ pressed }) => ({ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, height: 44, paddingHorizontal: 16, borderRadius: 999, backgroundColor: t.c.bg.tileRaised, opacity: pressed ? 0.8 : 1 })}>
          <Icon name="plus" size={14} color={t.c.fg.primary} />
          <Text style={{ fontSize: 14, lineHeight: 18, fontWeight: '600', color: t.c.fg.primary }}>Add a link</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** The record's life, newest first, each message word for word; how it began is last. */
function TimelineSection({ e }: { e: Delivery }) {
  const t = useTheme();
  const events = useLive((os) => {
    const all = os.records.timeline.forEntity(e.id, 100).filter((x) => x.actor === 'user' || !QUIET_KINDS.includes(x.kind));
    const rows = all.map((x) => {
      const ingestId = (x.meta as { ingestId?: string }).ingestId;
      const filed = ingestId ? os.filings.forSource(ingestId).find((f) => f.entityId === e.id) : undefined;
      const set = filed?.action === 'created' ? 'opened this record' : filed?.before && 'expectedDate' in filed.before ? ('trackingUrl' in filed.before ? 'set the day and the tracking link' : 'set the day') : filed?.before && 'trackingUrl' in filed.before ? 'set the tracking link' : null;
      const from = x.kind === 'sms' ? `Text from ${(ingestId && messageItem(os, ingestId)?.from) || 'a sender'}` : x.kind === 'email' ? 'Shipping mail' : x.kind === 'notification' ? `${e.data.shop ?? 'App'} notification` : null;
      return { ...x, line: [from, set].filter(Boolean).join(' · ') };
    });
    return [...rows.filter((x) => x.kind !== 'created'), ...rows.filter((x) => x.kind === 'created')];
  }, [e.id, e.data.shop]);
  if (!events.length) return null;
  return (
    <View style={{ gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 4 }}>
        <Text style={{ fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: -0.2, color: t.c.fg.primary }}>Timeline</Text>
        <Text style={{ fontSize: 13, lineHeight: 17, fontWeight: '600', color: t.c.fg.secondary }}>{`${events.length} ${events.length === 1 ? 'event' : 'events'}`}</Text>
      </View>
      <View style={{ gap: 20 }}>
        <View style={{ position: 'absolute', left: 17, top: 18, bottom: 18, width: 2, borderRadius: 1, backgroundColor: t.c.bg.pressed }} />
        {events.map((x, i) => {
          const created = x.kind === 'created';
          const day = new Date(x.occurredAt).toDateString() === new Date().toDateString() ? `Today ${format(x.occurredAt, 'h:mm aaa')}` : format(x.occurredAt, created ? 'EEE d MMM' : 'EEE d MMM h:mm aaa');
          const title = created ? (x.actor === 'user' ? 'Added by you' : 'Created by filing') : x.title;
          return (
            <View key={x.id} style={{ flexDirection: 'row', gap: 14, alignItems: created ? 'center' : 'flex-start' }}>
              <View style={{ width: 44, height: 44, margin: -4, marginRight: -4, borderRadius: 22, borderWidth: 4, borderColor: t.c.bg.ground, backgroundColor: t.c.bg.tileRaised, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={MESSAGE_ICON[x.kind] ?? 'clock'} size={16} color={created ? t.c.fg.secondary : i === 0 ? t.c.accent.mustard : t.c.fg.primary} />
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                  <Text numberOfLines={2} style={created ? { flex: 1, fontSize: 14, lineHeight: 19, fontWeight: '500', color: t.c.fg.secondary } : { flex: 1, fontSize: 16, lineHeight: 21, fontWeight: '600', color: t.c.fg.primary }}>{title}</Text>
                  <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: '600', color: t.c.fg.secondary, fontVariant: ['tabular-nums'] }}>{day}</Text>
                </View>
                {x.line ? <Text style={{ fontSize: 12, lineHeight: 15, fontWeight: '600', color: t.c.fg.secondary }}>{x.line}</Text> : null}
                {x.body ? (
                  <View style={{ paddingVertical: 12, paddingHorizontal: 14, borderRadius: 16, backgroundColor: t.c.bg.tile }}>
                    <Text selectable style={{ fontSize: 13, lineHeight: 18, color: t.c.fg.secondary }}>{x.body}</Text>
                  </View>
                ) : null}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function Page({ entity, ctx, controls, say }: { entity: Delivery; ctx: LifeOSContext; controls?: RecordControls; say?: ReactNode }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const id = `dh${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const now = Date.now();
  const times = useLive((os) => stepTimes(os, entity.id), [entity.id]);
  const otp = otpOf(entity, now);
  const open = STAGE[entity.data.status] < 3;
  const pad = insets.bottom + 32;
  return (
    <View style={{ backgroundColor: t.c.bg.ground, marginBottom: -pad, paddingBottom: pad }}>
      <Backdrop id={id} />
      <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to Deliveries" hitSlop={4} onPress={controls?.back} style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)', backgroundColor: 'rgba(22,22,26,0.5)', alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}>
          <Icon name="chevron-left" size={18} color={t.c.fg.primary} />
        </Pressable>
        <Text style={{ position: 'absolute', left: 0, right: 0, bottom: 11, textAlign: 'center', fontSize: 14, lineHeight: 18, fontWeight: '600', color: t.c.fg.primary }} pointerEvents="none">Delivery</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Pressable accessibilityRole="button" accessibilityLabel="More" hitSlop={4} onPress={controls?.more} style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)', backgroundColor: 'rgba(22,22,26,0.5)', alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}>
            <Icon name="more" size={18} color={t.c.fg.primary} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Edit delivery" hitSlop={6} onPress={controls?.edit} style={({ pressed }) => ({ height: 36, paddingHorizontal: 14, borderRadius: 999, backgroundColor: t.c.fg.primary, justifyContent: 'center', opacity: pressed ? 0.85 : 1 })}>
            <Text style={{ fontSize: 13, lineHeight: 17, fontWeight: '700', color: t.c.bg.ground }}>Edit</Text>
          </Pressable>
        </View>
      </View>

      <View style={{ marginTop: 96, paddingTop: 22, paddingHorizontal: 20, paddingBottom: 24, gap: 18, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.12)', backgroundColor: 'rgba(22,22,26,0.62)' }}>
        <View style={{ gap: 8 }}>
          <StatusBadge status={entity.data.status} />
          <Text accessibilityRole="header" style={{ fontSize: 36, lineHeight: 40, fontWeight: '600', letterSpacing: -1, color: t.c.fg.primary }}>{entity.title}</Text>
          <Text style={{ fontSize: 14, lineHeight: 19, fontWeight: '500', color: t.c.fg.secondary }}>{heroLine(entity, now)}</Text>
        </View>
        {STAGE[entity.data.status] <= 3 ? <Steps e={entity} times={times} now={now} /> : null}
      </View>

      <View style={{ paddingTop: 4, paddingHorizontal: 20, paddingBottom: 8, gap: 22 }}>
        {otp || open ? (
          <View style={{ padding: 16, borderRadius: 24, backgroundColor: t.c.bg.tile, gap: 12 }}>
            {otp ? <OtpBlock bare otp={otp} at={entity.data.otpAt} note="Give this to the delivery agent only when you have the package." /> : null}
            <DeliveryActions ctx={ctx} entity={entity} height={48} />
          </View>
        ) : null}
        <Fields e={entity} now={now} />
        <LinksSection e={entity} controls={controls} />
        <TimelineSection e={entity} />
        {say}
        <Footnote text="The texts stay on this phone so a misread can be fixed, and are cleared 60 days after filing. The record stays. The code is cleared once it is delivered." />
      </View>
    </View>
  );
}

export function DeliveryPage(props: { entity: ObjectRecord<any>; ctx: LifeOSContext; controls?: RecordControls; say?: ReactNode }) { // eslint-disable-line @typescript-eslint/no-explicit-any
  return (
    <ThemeProvider override="dark">
      <Page {...props} />
    </ThemeProvider>
  );
}
