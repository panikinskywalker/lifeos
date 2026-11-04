import React from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { LifeOSContext } from '@core/registry/context';
import type { Filing } from '@core/repo/filingRepo';
import { messageItem, messageList } from '@core/filing/queue';
import { undoFiling } from '@core/filing/dumps';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { blocks } from '@ui/theme/tokens';
import { Icon, Screen, Text, useToast } from '@ui/kit';
import type { DeliveryData } from '@modules/deliveries';
import { deliveryRoute, flaggedFilings, Footnote, GroupLabel, Pill, RowCard, sourcesOn, stamp } from './parts';

/**
 * Filing (NR-Deliveries-Filing): where parcels come from this month, what
 * filing took a guess on (yes it came, or no and it goes back), the last few
 * filed with Undo on each, and what is left out on purpose.
 */

const SOURCE_LOOK: Record<string, { icon: string; color: string }> = {
  sms: { icon: 'comment', color: blocks.sky },
  email: { icon: 'inbox', color: blocks.yellow },
  notification: { icon: 'bell', color: blocks.pink },
};

const JUST_FILED = 5;

function loadFiling(os: LifeOSContext) {
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  const read = (source: string) => messageList(os, { source, status: 'confirmed', limit: 1000 }).filter((m) => m.note === 'delivery' && m.receivedAt >= start.getTime()).length;
  const justFiled = os.filings.ofKind('delivery', { limit: 30 }).filter((f) => !f.undone && !f.flag).slice(0, JUST_FILED);
  return {
    on: sourcesOn(os),
    read: { sms: read('sms'), email: read('email'), notification: read('notification') },
    flagged: flaggedFilings(os),
    justFiled: justFiled.map((f) => ({ f, line: filedLine(os, f) })),
  };
}

/** "Text from AX-AMAZON · 9:12 am · OTP saved", "Amazon notification · Mon 2 Nov", "Shipping mail from Meesho · Mon 2 Nov". */
function filedLine(os: LifeOSContext, f: Filing): string {
  const shop = f.entityId ? os.records.get<DeliveryData>(f.entityId)?.data.shop : undefined;
  const from = f.source === 'sms' ? `Text from ${(f.sourceRef && messageItem(os, f.sourceRef)?.from) || 'a sender'}` : f.source === 'notification' ? `${shop ?? 'App'} notification` : `Shipping mail${shop ? ` from ${shop}` : ''}`;
  const code = f.before && 'otp' in f.before ? (f.label.includes('Delivered') ? 'code cleared' : 'OTP saved') : null;
  return [from, stamp(f.createdAt), code].filter(Boolean).join(' · ');
}

function SourceRow({ icon, color, title, line, on, route }: { icon: string; color: string; title: string; line: string; on: boolean; route: string }) {
  const t = useTheme();
  const router = useRouter();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${title}, ${line}, ${on ? 'on' : 'off'}`} onPress={() => router.push(route as never)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 60, opacity: pressed ? 0.7 : 1 })}>
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: t.c.bg.tileRaised, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={18} color={color} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text style={{ fontSize: 16, lineHeight: 21, fontWeight: '600', color: t.c.fg.primary }}>{title}</Text>
        <Text numberOfLines={1} style={{ fontSize: 13, lineHeight: 17, color: t.c.fg.secondary }}>{line}</Text>
      </View>
      <Pill label={on ? 'On' : 'Off'} tone={on ? 'lime' : 'quiet'} />
    </Pressable>
  );
}

function ToCheckRow({ f }: { f: Filing }) {
  const os = useOS();
  const t = useTheme();
  const toast = useToast();
  const router = useRouter();
  const yes = () => os.filings.setChecked(f.id);
  const no = () => {
    if (!undoFiling(os, f.id)) return;
    // The assumed day goes with the assumption.
    if (f.entityId && f.before && 'status' in f.before) os.records.update(f.entityId, { data: { deliveredOn: undefined } }, 'user');
    toast.show({ message: 'Back on the way', icon: 'undo' });
  };
  const title = f.label.endsWith('Delivered') ? `${f.label}?` : f.label;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 56 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={title} disabled={!f.entityId} onPress={() => router.push(deliveryRoute(f.entityId!))} style={({ pressed }) => ({ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 14, opacity: pressed ? 0.7 : 1 })}>
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: t.c.bg.tileRaised, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="box" size={17} color={blocks.lilac} />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text numberOfLines={1} style={{ fontSize: 16, lineHeight: 21, fontWeight: '600', color: t.c.fg.primary }}>{title}</Text>
          <Text numberOfLines={2} style={{ fontSize: 13, lineHeight: 17, color: t.c.fg.secondary }}>{f.flag}</Text>
        </View>
      </Pressable>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Yes, it came" onPress={yes} style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, backgroundColor: t.c.accent.mustard, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}>
          <Icon name="check" size={16} color={t.c.accent.mustardInk} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="No, it did not come" onPress={no} style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, backgroundColor: t.c.bg.tileRaised, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}>
          <Icon name="x" size={16} color={t.c.fg.primary} />
        </Pressable>
      </View>
    </View>
  );
}

function FiledRow({ f, line }: { f: Filing; line: string }) {
  const os = useOS();
  const t = useTheme();
  const toast = useToast();
  const router = useRouter();
  const look = SOURCE_LOOK[f.source] ?? SOURCE_LOOK.sms!;
  const undo = () => {
    if (undoFiling(os, f.id)) toast.show({ message: `Undone · ${f.label}`, icon: 'undo' });
    else toast.show({ message: 'This one can’t be undone from here. Open it to change it.', icon: 'info' });
  };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={f.label} disabled={!f.entityId} onPress={() => router.push(deliveryRoute(f.entityId!))} style={({ pressed }) => ({ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12, opacity: pressed ? 0.7 : 1 })}>
        <Icon name={look.icon} size={18} color={look.color} />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text numberOfLines={1} style={{ fontSize: 15, lineHeight: 20, fontWeight: '600', color: t.c.fg.primary }}>{f.label}</Text>
          <Text numberOfLines={1} style={{ fontSize: 12, lineHeight: 16, color: t.c.fg.secondary, fontVariant: ['tabular-nums'] }}>{line}</Text>
        </View>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`Undo ${f.label}`} hitSlop={4} onPress={undo} style={({ pressed }) => ({ height: 36, paddingHorizontal: 12, borderRadius: 999, backgroundColor: t.c.bg.tileRaised, justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}>
        <Text style={{ fontSize: 13, lineHeight: 17, fontWeight: '600', color: t.c.fg.primary }}>Undo</Text>
      </Pressable>
    </View>
  );
}

function LeftOut({ icon, text }: { icon: string; text: string }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
      <Icon name={icon} size={16} color={t.c.fg.secondary} />
      <Text style={{ flex: 1, fontSize: 13, lineHeight: 18, color: t.c.fg.secondary }}>{text}</Text>
    </View>
  );
}

export function DeliveriesFiling() {
  const router = useRouter();
  const t = useTheme();
  const d = useLive(loadFiling, []);
  return (
    <Screen title="Filing" subtitle="Deliveries · where parcels come from" onBack={() => (router.canGoBack() ? router.back() : router.replace('/module/deliveries/index' as never))} contentStyle={{ gap: 22 }}>
      <View style={{ gap: 10 }}>
        <GroupLabel text="SOURCES · THIS MONTH" color={t.c.fg.secondary} />
        <RowCard>
          <SourceRow icon="comment" color={blocks.sky} title="Texts" line={`Shops and couriers · ${d.read.sms} read`} on={d.on.sms || d.read.sms > 0} route="/settings/sources" />
          <SourceRow icon="inbox" color={blocks.yellow} title="Mail · Gmail" line={`Shipping mails only · ${d.read.email} read`} on={d.on.mail} route="/settings/email" />
          <SourceRow icon="bell" color={blocks.pink} title="App notifications" line={`Amazon, Flipkart, Myntra · ${d.read.notification} read`} on={d.on.notifications || d.read.notification > 0} route="/settings/sources" />
        </RowCard>
      </View>

      {d.flagged.length ? (
        <View style={{ padding: 18, borderRadius: 28, backgroundColor: t.c.bg.tile, gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <Text style={{ fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: -0.2, color: t.c.fg.primary }}>To check</Text>
            <Pill label={String(d.flagged.length)} tone="white" />
          </View>
          {d.flagged.map((f) => <ToCheckRow key={f.id} f={f} />)}
          <Text style={{ fontSize: 13, lineHeight: 18, color: t.c.fg.secondary }}>When Deliveries started it read back 45 days of texts. An order with no word for 10 days was taken as delivered.</Text>
        </View>
      ) : null}

      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, paddingHorizontal: 4 }}>
          <Text style={{ flex: 1, fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: -0.2, color: t.c.fg.primary }}>Just filed</Text>
          {d.justFiled.length ? <Text style={{ fontSize: 13, lineHeight: 17, color: t.c.fg.secondary }}>Undo any of them</Text> : null}
        </View>
        {d.justFiled.length ? (
          <RowCard>{d.justFiled.map(({ f, line }) => <FiledRow key={f.id} f={f} line={line} />)}</RowCard>
        ) : (
          <Text style={{ fontSize: 13, lineHeight: 18, color: t.c.fg.secondary, paddingHorizontal: 4 }}>Nothing filed yet.</Text>
        )}
      </View>

      <View style={{ padding: 16, borderRadius: 24, backgroundColor: t.c.bg.tile, gap: 12 }}>
        <Text style={{ fontSize: 15, lineHeight: 19, fontWeight: '600', color: t.c.fg.primary }}>Left out on purpose</Text>
        <LeftOut icon="clock" text="Swiggy and Zomato: food orders are not parcels." />
        <LeftOut icon="receipt" text="Shipping texts are read before Money, so a parcel is never counted as spend. The bank's text for the order goes to Money." />
        <LeftOut icon="lock" text="Login codes from shops are skipped. Only a code for the delivery agent is kept." />
      </View>

      <Footnote text="Read on this phone by rules: no model, no server. Message text is cleared 60 days after filing; the deliveries stay." />
    </Screen>
  );
}
