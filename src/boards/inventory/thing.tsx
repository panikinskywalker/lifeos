import React, { useState, type ReactNode } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import type { RecordControls } from '@core/registry/types';
import { useLive } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { fonts } from '@ui/theme/tokens';
import { Icon, IconButton, Sheet, Text, useToast } from '@ui/kit';
import { estimatedLife, halfLeft, purchases, runningLow, setLife, setOnList, setQuantity, shopLabel, spanWords, stockState, undoStock, useUp, type SpaceData, type StockData, type StockUndo } from '@modules/inventory';
import { dayWords, useByWords } from '@modules/inventory';
import { usePillActions } from './actions';
import { Card, Eyebrow, GuessChip, PillButton, RowButton, SourceChip, StateChip, Why } from './parts';

/**
 * A thing (the Stock record's whole page; NR-Home-Thing): name, size, space,
 * state and running low; quantity − / +; Life (bought on · keeps ~N, LifeOS's
 * guess or yours, which you can correct); Rate (how often you rebuy, the
 * purchases as dots on a line up to today); where it came from; Used up · Half
 * left · Add to list · Move.
 */

const DAY = 86_400_000;
const shortDay = (at: number) => {
  const d = new Date(at);
  return `${d.getDate()} ${d.toLocaleString('en-GB', { month: 'short' })}`;
};

/** The purchases as dots on a line (oldest left, the last one lime), a tick at today. */
function Dots({ at, now }: { at: number[]; now: number }) {
  const t = useTheme();
  const [w, setW] = useState(0);
  if (!at.length) return null;
  const from = Math.min(at[0]!, now - 30 * DAY);
  const span = Math.max(1, now - from);
  return (
    <View style={{ gap: 10, marginTop: 6 }}>
      <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ height: 18, justifyContent: 'center' }} accessibilityRole="image" accessibilityLabel={`${at.length} ${at.length === 1 ? 'purchase' : 'purchases'}: ${at.map(shortDay).join(', ')}`}>
        <View style={{ height: 2, borderRadius: 1, backgroundColor: t.c.bg.tileRaised }} />
        <View style={{ position: 'absolute', right: 0, top: 2, width: 2, height: 14, borderRadius: 1, backgroundColor: t.c.fg.tertiary }} />
        {w
          ? at.map((x, i) => (
              <View key={i} style={{ position: 'absolute', top: 4, left: Math.max(0, Math.min(w - 12, ((x - from) / span) * (w - 12))), width: 10, height: 10, borderRadius: 5, backgroundColor: i === at.length - 1 ? t.c.accent.mustard : t.c.fg.secondary }} />
            ))
          : null}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        {[shortDay(from), ...(at.length > 1 ? [shortDay(at[at.length - 1]!)] : []), 'today'].map((label, i) => (
          <Text key={i} style={{ fontSize: 11, lineHeight: 14, fontWeight: '600', color: t.c.fg.secondary, fontVariant: ['tabular-nums'] }}>{label}</Text>
        ))}
      </View>
    </View>
  );
}

export function StockPage({ entity, ctx, controls, say }: { entity: ObjectRecord<any>; ctx: LifeOSContext; controls?: RecordControls; say?: ReactNode }) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const pills = usePillActions(ctx);
  const [lifeOpen, setLifeOpen] = useState(false);
  const [lifeText, setLifeText] = useState('');
  const id = entity.id as string;

  const d = useLive((os) => {
    const s = os.records.get<StockData>(id);
    if (!s) return null;
    const now = Date.now();
    const space = s.data.spaceId ? os.records.get<SpaceData>(s.data.spaceId) : null;
    const order = s.data.orderId ? os.records.get<{ amount?: number }>(s.data.orderId) : null;
    return { s, now, space, order, st: stockState(s.data, now), low: runningLow(s.data, now), buys: purchases(os, id) };
  }, [id]);
  if (!d) return null;
  const { s, st, low, buys, now } = d;

  const done = (u: StockUndo | null, message: string) => u && toast.show({ message, icon: 'check', undo: () => undoStock(ctx, u) });
  const guess = estimatedLife(s.title);
  const yours = s.data.lifeBy === 'yours';
  const saveLife = () => {
    const n = Number(lifeText.trim());
    done(setLife(ctx, id, lifeText.trim() && n > 0 ? n : null), lifeText.trim() ? `Keeps ${Math.round(n)} days` : 'Doesn’t go off');
    setLifeOpen(false);
  };

  return (
    <View style={{ paddingTop: insets.top + 12, paddingHorizontal: t.layout.gutter, gap: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <IconButton icon="chevron-left" accessibilityLabel="Back" filled onPress={controls?.back} />
        <View style={{ flex: 1 }} />
        <IconButton icon="edit" accessibilityLabel="Edit" filled onPress={controls?.edit} />
        <IconButton icon="more" accessibilityLabel="More" filled onPress={controls?.more} />
      </View>

      <View style={{ gap: 8 }}>
        <Text accessibilityRole="header" style={{ fontSize: 30, lineHeight: 34, fontWeight: '700', letterSpacing: -0.6, color: t.c.fg.primary }}>{s.title}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {s.data.size ? <Text style={{ fontSize: 15, lineHeight: 20, color: t.c.fg.secondary }}>{s.data.size}</Text> : null}
          {d.space ? (
            <Pressable accessibilityRole="button" accessibilityLabel={`In the ${d.space.title}; move`} hitSlop={8} onPress={() => pills.move(s)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 28, paddingHorizontal: 10, borderRadius: 999, backgroundColor: t.c.bg.tileRaised }}>
              <Icon name={d.space.data.icon ?? 'box'} size={14} color={t.c.fg.secondary} />
              <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: '600', color: t.c.fg.secondary }}>{d.space.title}</Text>
            </Pressable>
          ) : null}
          <StateChip label={st.estimated && (st.state === 'use soon' || st.state === 'probably gone') ? `${st.state} ~` : st.state} tone={st.state === 'fresh' ? 'fresh' : st.state === 'use soon' ? 'soon' : 'gone'} />
          {low.low ? <StateChip label="running low" tone="low" /> : null}
        </View>
      </View>

      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Text style={{ flex: 1, fontSize: 15, lineHeight: 20, fontWeight: '600', color: t.c.fg.primary }}>Quantity</Text>
          <IconButton icon="minus" accessibilityLabel="One less" filled disabled={!(s.data.quantity > 0)} onPress={() => done(setQuantity(ctx, id, Math.max(0, (Number.isInteger(s.data.quantity) ? s.data.quantity - 1 : Math.floor(s.data.quantity)))), 'Quantity changed')} />
          <Text style={{ minWidth: 44, textAlign: 'center', fontSize: 22, lineHeight: 26, fontWeight: '700', color: t.c.fg.primary, fontVariant: ['tabular-nums'] }}>{s.data.quantity > 0 ? String(s.data.quantity).replace('.5', '½') : '0'}</Text>
          <IconButton icon="plus" accessibilityLabel="One more" filled onPress={() => done(setQuantity(ctx, id, Math.floor(s.data.quantity) + 1), 'Quantity changed')} />
        </View>
      </Card>

      <Card gap={8}>
        <Eyebrow>Life</Eyebrow>
        <Text style={{ fontSize: 15, lineHeight: 21, color: t.c.fg.primary }}>
          {[s.data.boughtOn ? `Bought ${dayWords(s.data.boughtOn, now)}` : null, s.data.lifeDays ? `keeps ${yours ? '' : '~'}${spanWords(s.data.lifeDays)}` : 'doesn’t go off'].filter(Boolean).join(' · ')}
        </Text>
        {st.daysLeft != null && st.state !== 'fresh' ? <Why urgent>{useByWords(st.daysLeft, now)}</Why> : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {yours ? <GuessChip label={s.data.lifeDays ? `You said · ${s.data.lifeDays} d` : 'You said'} /> : s.data.lifeDays ? <GuessChip label={`~ LifeOS’s guess · ${s.data.lifeDays} d`} /> : null}
          <View style={{ flex: 1 }} />
          <RowButton title="Correct it" kind="text" onPress={() => { setLifeText(s.data.lifeDays ? String(s.data.lifeDays) : ''); setLifeOpen(true); }} />
        </View>
        {yours ? null : <Text style={{ fontSize: 12, lineHeight: 16, color: t.c.fg.secondary }}>Yours is kept for every time you buy it again, and LifeOS stops guessing.</Text>}
      </Card>

      <Card gap={10}>
        <Eyebrow>Rate</Eyebrow>
        <Text style={{ fontSize: 15, lineHeight: 21, color: t.c.fg.primary }}>{s.data.rateDays ? `You rebuy every ~${spanWords(s.data.rateDays)}` : buys.length > 1 ? 'Learning how fast you get through it' : 'Learned once you’ve bought it twice or used it up'}</Text>
        {low.low && low.why ? <Why urgent>{`Running low · ${low.why}`}</Why> : null}
        <Dots at={buys.map((b) => b.at)} now={now} />
        {buys.length ? <Text style={{ fontSize: 12, lineHeight: 16, color: t.c.fg.secondary }}>{`${buys.length} ${buys.length === 1 ? 'purchase' : 'purchases'} · last ${dayWords(s.data.boughtOn, now)} · learned from when you buy it and use it up`}</Text> : null}
      </Card>

      <Card gap={10}>
        <Eyebrow>Where it came from</Eyebrow>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <SourceChip source={s.data.source} shop={s.data.shop} />
          {s.data.price != null ? <Text style={{ fontSize: 15, lineHeight: 20, color: t.c.fg.primary, fontVariant: ['tabular-nums'] }}>{ctx.format.currency(s.data.price)}</Text> : null}
        </View>
        {d.order ? (
          <Pressable accessibilityRole="button" onPress={() => router.push(`/entity/transaction/${d.order!.id}` as never)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 }}>
            <Text style={{ fontSize: 13, lineHeight: 17, fontWeight: '600', color: t.c.accent.gold }}>{[`The ${s.data.shop ? shopLabel(s.data.shop) : ''} order`.replace('  ', ' '), d.order.data.amount != null ? ctx.format.currency(d.order.data.amount) : null].filter(Boolean).join(' · ')}</Text>
            <Icon name="chevron-right" size={14} color={t.c.accent.gold} />
          </Pressable>
        ) : null}
      </Card>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <PillButton title="Used up" icon="check" style={{ flexBasis: '48%', flexGrow: 1 }} disabled={!(s.data.quantity > 0)} onPress={() => done(useUp(ctx, id), `${s.title} used up`)} />
        <PillButton title="Half left" icon="minus" raised style={{ flexBasis: '48%', flexGrow: 1 }} onPress={() => done(halfLeft(ctx, id), `${s.title}: half left`)} />
        <PillButton title={s.data.onList ? 'On the list' : 'Add to list'} icon="cart" raised style={{ flexBasis: '48%', flexGrow: 1 }} onPress={() => done(setOnList(ctx, id, !s.data.onList), s.data.onList ? 'Off the list' : 'On the list')} />
        <PillButton title="Move" icon="arrow-right" raised style={{ flexBasis: '48%', flexGrow: 1 }} onPress={() => pills.move(s)} />
      </View>
      {say}
      {pills.sheets}

      <Sheet visible={lifeOpen} onClose={() => setLifeOpen(false)} title="How long it keeps" footer={<PillButton title="Save" height={52} onPress={saveLife} />}>
        <View style={{ gap: 12 }}>
          <TextInput value={lifeText} onChangeText={setLifeText} keyboardType="number-pad" placeholder="Days (empty: it doesn’t go off)" placeholderTextColor={t.c.fg.tertiary} selectionColor={t.c.accent.mustard} autoFocus accessibilityLabel="Days it keeps" style={{ minHeight: 52, paddingHorizontal: 18, borderRadius: 16, backgroundColor: t.c.bg.tileRaised, color: t.c.fg.primary, fontFamily: fonts[500], fontSize: 17 }} />
          <Text style={{ fontSize: 13, lineHeight: 17, color: t.c.fg.secondary }}>{guess ? `LifeOS guessed ${guess} days. ` : ''}Yours is kept for every time you buy it again.</Text>
        </View>
      </Sheet>
    </View>
  );
}
