import React, { useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Circle, Path, Text as SvgText } from 'react-native-svg';
import { format } from 'date-fns';
import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import type { RecordControls } from '@core/registry/types';
import { logDone, undoLoggedDone } from '@core/cycles/upkeep';
import { useLive } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { fonts } from '@ui/theme/tokens';
import { Icon, Text, Toggle, useToast } from '@ui/kit';
import { categoryOf, type AccountData, type SubscriptionData } from '@modules/finance/types';
import { perMonth } from '@modules/finance/reports';
import { ActionPill, Caps, Disc, FieldRow, FieldValue, Hairline, IconDisc, RecordBar, RecordExtras, Rows, SectionHead, StatusPill, accountName, catColor, day } from './parts';

const UNIT: Record<string, string> = { day: 'day', week: 'week', month: 'month', year: 'year' };
const every = (n: number | null | undefined, unit: string | null | undefined) => (n && n > 1 ? `Every ${n} ${UNIT[unit ?? 'month']}s` : `Every ${UNIT[unit ?? 'month']}`);

/** One of the three numbers under the header: a caps label, 22/700, a 12 line. */
function Metric({ label, value, unit, line, color }: { label: string; value: string; unit?: string; line?: string; color?: string }) {
  return (
    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
      <Caps>{label}</Caps>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ fontSize: 22, lineHeight: 26, fontWeight: '700', letterSpacing: -0.5, fontVariant: ['tabular-nums'], color }}>
        {value}
        {unit ? <Text style={{ fontSize: 13, fontWeight: '600', color }}>{` ${unit}`}</Text> : null}
      </Text>
      {line ? <Text numberOfLines={1} color="secondary" style={{ fontSize: 12, lineHeight: 15 }}>{line}</Text> : null}
    </View>
  );
}

/** A 56 round action with its word under it. */
function Quick({ label, icon, color, onPress }: { label: string; icon: string; color?: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => ({ flex: 1, alignItems: 'center', gap: 8, opacity: pressed ? 0.7 : 1 })}>
      <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: t.c.bg.tile, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={20} color={color ?? t.c.accent.gold} />
      </View>
      <Text numberOfLines={1} style={{ fontSize: 12, lineHeight: 16, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

/** The price as a step line over time: open dots where it changed, a solid one at now. */
function PriceChart({ history, label }: { history: Array<{ amount: number; from: string }>; label: string }) {
  const t = useTheme();
  const [w, setW] = useState(0);
  const start = day(history[0]!.from).getTime();
  const span = Math.max(Date.now() - start, 1);
  const min = Math.min(...history.map((h) => h.amount));
  const range = Math.max(...history.map((h) => h.amount)) - min || 1;
  const x = (from: string) => ((day(from).getTime() - start) / span) * w;
  const y = (amount: number) => 44 - ((amount - min) / range) * 32;
  const path = history.reduce((p, h, i) => (i === 0 ? `M0 ${y(h.amount)}` : `${p} H${x(h.from).toFixed(1)} V${y(h.amount)}`), '') + ` H${w}`;
  const last = history[history.length - 1]!;
  const lime = t.c.accent.gold;
  const word = (s: string, at: number, anchor: 'start' | 'middle' | 'end') => (
    <SvgText x={at} y={62} fontSize={10} fontFamily={fonts[600]} fill={t.c.fg.tertiary} textAnchor={anchor}>{s}</SvgText>
  );
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} accessibilityRole="image" accessibilityLabel={label} style={{ height: 64 }}>
      {w ? (
        <Svg width={w} height={64} style={{ overflow: 'visible' }}>
          <Path d={path} fill="none" stroke={lime} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
          {history.map((h) => (
            <Circle key={h.from} cx={x(h.from)} cy={y(h.amount)} r={4} fill={t.c.bg.tile} stroke={lime} strokeWidth={2} />
          ))}
          <Circle cx={w} cy={y(last.amount)} r={5} fill={lime} />
          {word(format(day(history[0]!.from), 'MMM yyyy'), 0, 'start')}
          {word(format(day(last.from), 'MMM yyyy'), Math.min(x(last.from), w - 70), 'middle')}
          {word('now', w, 'end')}
        </Svg>
      ) : null}
    </View>
  );
}

/** A Subscription's page (NR-Money-Subscription): what it costs, the renewal when it needs your hand, quick actions, price history, Fields, its Cycle, billing history. */
export function SubscriptionPage({ entity, ctx, controls, say }: { entity: ObjectRecord<any>; ctx: LifeOSContext; controls?: RecordControls; say?: React.ReactNode }) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const s = entity as ObjectRecord<SubscriptionData>;
  const d = s.data;
  const money = (n: number) => ctx.format.currency(n, d.currency);
  const posted = useLive((o) => o.links.forEntity(s.id, 'subscription').map((r) => o.records.get<{ date: string; amount: number; accountId?: string }>(r.other.id)).filter((x): x is ObjectRecord<{ date: string; amount: number; accountId?: string }> => !!x && x.object === 'transaction').sort((a, b) => b.data.date.localeCompare(a.data.date)), [s.id, s.version]);
  const renewal = useLive((o) => o.cycles.forEntity(s.id).find((c) => c.template === 'subscription.renewal') ?? null, [s.id, s.version]);
  const account = useLive((o) => (d.accountId ? o.records.get<AccountData>(d.accountId) : null), [d.accountId]);
  const names = useLive((o) => Object.fromEntries(o.records.query('account', {}, { limit: 500 }).map((a) => [a.id, a.title])), []);

  const year = String(new Date().getFullYear());
  const thisYear = posted.filter((x) => x.data.date?.startsWith(year));
  const paidYtd = thisYear.reduce((a, x) => a + (x.data.amount ?? 0), 0);
  const days = Math.round((day(d.nextBillingAt).getTime() - day(format(new Date(), 'yyyy-MM-dd')).getTime()) / 86_400_000);
  const active = s.status === 'active' || s.status == null;
  const needsHand = active && d.autoPost === false && days <= 3;
  const def = ctx.registry.object('subscription');
  const cycleLabel = def.fields.find((f) => f.key === 'rrule')?.options?.find((o) => o.value === d.rrule)?.label ?? 'Custom';
  const statusLabel = def.statuses?.find((x) => x.value === (s.status ?? 'active'))?.label ?? 'Active';
  const history = d.priceHistory ?? [];
  const firsts = new Set(history.slice(1).map((h) => h.from));
  const change = history.length > 1 ? (history[history.length - 1]!.amount - history[0]!.amount) / (history[0]!.amount || 1) : 0;

  const markPaid = () => {
    if (!renewal) return;
    const done = logDone(ctx, renewal.id, { cost: d.amount, asExpense: true, note: 'Paid' });
    toast.show({ message: `${d.name} paid · ${money(d.amount)}`, icon: 'check', undo: () => undoLoggedDone(ctx, done) });
  };
  const setStatus = (to: string, msg: string) => {
    const prev = s.status;
    ctx.records.setStatus(s.id, to);
    toast.show({ message: msg, icon: to === 'active' ? 'check' : 'clock', undo: () => void ctx.records.setStatus(s.id, prev ?? 'active') });
  };
  const pause = () => setStatus('paused', `${d.name} paused, out of Upkeep`);

  return (
    <View style={{ paddingHorizontal: t.layout.gutter, gap: 24 }}>
      {controls ? <RecordBar label="Subscription" controls={controls} /> : null}

      <View style={{ gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Disc name={d.name} size={56} />
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text numberOfLines={2} accessibilityRole="header" style={{ fontSize: 28, lineHeight: 32, fontWeight: '700', letterSpacing: -0.8 }}>{d.name}</Text>
            <Text variant="caption" color="secondary" numberOfLines={1} style={{ fontVariant: ['tabular-nums'] }}>{[`${money(d.amount)} ${cycleLabel.toLowerCase()}`, account ? `paid from ${account.title}` : null].filter(Boolean).join(' · ')}</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <StatusPill label={statusLabel} lime={active} />
          <StatusPill label={categoryOf(d.category).label} dot={catColor(d.category, t)} />
          <StatusPill label={cycleLabel} />
        </View>
        <View style={{ flexDirection: 'row', gap: 14, paddingVertical: 16, borderTopWidth: 1, borderBottomWidth: 1, borderColor: t.c.line }}>
          <Metric label="PER MONTH" value={money(Math.round(perMonth(d.amount, d.rrule)))} line={`${money(d.amount)} a bill`} />
          <Metric label="NEXT BILL" value={!active ? '-' : days <= 0 ? 'Due' : String(days)} unit={active && days > 0 ? (days === 1 ? 'day' : 'days') : undefined} line={active ? format(day(d.nextBillingAt), 'EEE d MMM') : statusLabel} color={active && days <= 3 ? t.c.alert.coralText : undefined} />
          <Metric label={`PAID ${year}`} value={money(paidYtd)} line={`${thisYear.length} bill${thisYear.length === 1 ? '' : 's'} logged`} />
        </View>
      </View>

      {needsHand ? (
        <View style={{ padding: 18, borderRadius: 28, backgroundColor: t.c.bg.tile, borderWidth: 1, borderColor: 'rgba(255,138,122,0.35)', gap: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Icon name="clock" size={14} color={t.c.alert.coralText} />
            <Caps color={t.c.alert.coralText}>RENEWAL</Caps>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12 }}>
            <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
              <Text style={{ fontSize: 19, lineHeight: 24, fontWeight: '700', letterSpacing: -0.3 }}>{days <= 0 ? `${d.name} is due` : `${d.name} renews in ${days} day${days === 1 ? '' : 's'}`}</Text>
              <Text variant="caption" color="secondary">Auto-post is off, so mark it paid when you pay</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Caps>AMOUNT</Caps>
              <Text style={{ fontSize: 20, lineHeight: 25, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{money(d.amount)}</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <ActionPill title="Mark paid" icon="check" lime onPress={markPaid} />
            <ActionPill title="Pause" icon="clock" onPress={pause} />
          </View>
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', gap: 8 }}>
        {active && renewal ? <Quick label="Mark paid" icon="check" onPress={markPaid} /> : null}
        {active ? <Quick label="Pause" icon="clock" onPress={pause} /> : <Quick label="Resume" icon="repeat" onPress={() => setStatus('active', `${d.name} resumed`)} />}
        {d.url ? <Quick label="Manage" icon="link" onPress={() => void Linking.openURL(d.url!)} /> : null}
        {s.status !== 'cancelled' ? <Quick label="Cancel" icon="x" color={t.c.alert.coralText} onPress={() => setStatus('cancelled', `${d.name} cancelled`)} /> : null}
      </View>

      {history.length > 1 ? (
        <View style={{ gap: 10 }}>
          <SectionHead title="Price history" sub={change ? `${change > 0 ? 'Up' : 'Down'} ${Math.abs(Math.round(change * 100))}% since it started` : 'Same since it started'} />
          <View style={{ padding: 18, borderRadius: 24, backgroundColor: t.c.bg.tile, gap: 14 }}>
            <PriceChart history={history} label={`Price went from ${money(history[0]!.amount)} to ${money(history[history.length - 1]!.amount)}`} />
            <View>
              {[...history].reverse().map((h, i) => (
                <React.Fragment key={h.from}>
                  {i ? <Hairline /> : null}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 40 }}>
                    <Text numberOfLines={1} style={{ flex: 1, fontSize: 14, lineHeight: 18, fontWeight: '600', color: i ? t.c.fg.secondary : t.c.fg.primary }}>From {format(day(h.from), 'EEE d MMM yyyy')}</Text>
                    <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: '700', fontVariant: ['tabular-nums'], color: i ? t.c.fg.secondary : t.c.fg.primary }}>{money(h.amount)}</Text>
                  </View>
                </React.Fragment>
              ))}
            </View>
          </View>
        </View>
      ) : null}

      <View style={{ gap: 10 }}>
        <SectionHead title="Fields" />
        <View style={{ paddingVertical: 6, paddingHorizontal: 16, borderRadius: 24, backgroundColor: t.c.bg.tile }}>
          <FieldRow label="Billing cycle"><FieldValue>{cycleLabel}</FieldValue></FieldRow>
          <Hairline />
          <FieldRow label="Next billing date"><FieldValue>{format(day(d.nextBillingAt), 'EEE d MMM')}</FieldValue></FieldRow>
          {account ? (
            <>
              <Hairline />
              <FieldRow label="Paid from"><FieldValue>{accountName(account)}</FieldValue></FieldRow>
            </>
          ) : null}
          <Hairline />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60 }}>
            <Text color="secondary" style={{ flex: 1, fontSize: 14, lineHeight: 18 }}>Auto-create transaction when billed</Text>
            <Toggle accessibilityLabel="Auto-create transaction when billed" value={d.autoPost !== false} onChange={(on) => ctx.records.update(s.id, { data: { autoPost: on } })} />
          </View>
          {d.url ? (
            <>
              <Hairline />
              <FieldRow label="Manage URL">
                <Pressable accessibilityRole="link" accessibilityLabel={d.url} hitSlop={12} onPress={() => void Linking.openURL(d.url!)}>
                  <Text numberOfLines={1} style={{ fontSize: 15, lineHeight: 20, fontWeight: '600', color: t.c.accent.gold }}>{d.url.replace(/^https?:\/\/(www\.)?/, '')}</Text>
                </Pressable>
              </FieldRow>
            </>
          ) : null}
        </View>
      </View>

      {renewal ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 24, backgroundColor: t.c.bg.tile }}>
          <IconDisc icon="repeat" color={t.c.fg.primary} />
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: '600' }}>Renewal Cycle</Text>
            <Text variant="caption" color="secondary" numberOfLines={1}>{every(renewal.everyN, renewal.everyUnit)} · in Upkeep {renewal.leadDays} day{renewal.leadDays === 1 ? '' : 's'} before</Text>
          </View>
        </View>
      ) : null}

      {posted.length ? (
        <View style={{ gap: 10 }}>
          <SectionHead title="Billing history" sub={`${thisYear.length} this year`} />
          <Rows>
            {posted.slice(0, 8).map((x) => (
              <Pressable key={x.id} accessibilityRole="button" accessibilityLabel={`${d.name}, ${format(day(x.data.date), 'EEE d MMM')}, ${money(x.data.amount)}`} onPress={() => router.push(`/entity/transaction/${x.id}` as never)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 56, opacity: pressed ? 0.7 : 1 })}>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text variant="rowTitle" numberOfLines={1}>{d.name}</Text>
                  <Text variant="caption" color="secondary" numberOfLines={1}>{[format(day(x.data.date), 'EEE d MMM'), firsts.has(x.data.date) ? 'first at the new price' : x.data.accountId ? names[x.data.accountId] : null].filter(Boolean).join(' · ')}</Text>
                </View>
                <Text style={{ fontSize: 16, lineHeight: 21, fontWeight: '700', fontVariant: ['tabular-nums'] }}>−{money(x.data.amount)}</Text>
              </Pressable>
            ))}
          </Rows>
        </View>
      ) : null}

      <RecordExtras entity={s} module="finance" />

      {say}
    </View>
  );
}
