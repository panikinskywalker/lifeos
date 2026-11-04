import React, { useState } from 'react';
import { Platform, Pressable, ScrollView, TextInput, View, type TextInputProps } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { format } from 'date-fns';
import { ZodError } from 'zod';
import type { ObjectRecord } from '@core/domain/types';
import type { RecordFormProps } from '@core/registry/types';
import { daysUntil } from '@core/dashboard/overview';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { fonts } from '@ui/theme/tokens';
import { Button, FilterChip, Icon, IconButton, PickerSheet, Sheet, Text, TextField } from '@ui/kit';
import { DELIVERY_STATUSES, isoDay, type DeliveryData } from '@modules/deliveries';
import { shopOrg } from '@modules/deliveries/filing/links';
import { dayLabel, ShopDisc } from './parts';

/**
 * The delivery form (NR-Deliveries-Form): status pills, item, the shop, the
 * expected day, the code, Tracking and Details. The board's form override
 * for Delivery, used by New and Edit. A shop you pick or type gets its
 * Organisation on save, as a filed one does.
 */

const COMMON_SHOPS = ['Amazon', 'Flipkart', 'Myntra', 'Meesho'];

function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ fontSize: 13, lineHeight: 17, fontWeight: '600', color: t.c.fg.secondary, paddingHorizontal: 4 }}>{label}</Text>
      {children}
    </View>
  );
}

function Input({ label, multiline, ...rest }: { label: string } & TextInputProps) {
  const t = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <Labelled label={label}>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={t.c.fg.tertiary}
        selectionColor={t.c.accent.mustard}
        multiline={multiline}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[{ paddingHorizontal: 18, borderRadius: 20, backgroundColor: t.c.bg.tile, borderWidth: focused ? 1.5 : 1, borderColor: focused ? t.c.fg.primary : t.c.line, color: t.c.fg.primary, fontFamily: fonts[500], fontSize: 16, lineHeight: 22 }, multiline ? { minHeight: 98, paddingVertical: 16, textAlignVertical: 'top' } : { height: 56, paddingVertical: 0 }]}
        {...rest}
      />
    </Labelled>
  );
}

/** A day: lime calendar, the day and how far off; tap to pick. `chips` adds Today, Tomorrow and Pick a day. */
function DayField({ label, value, onChange, placeholder, chips }: { label: string; value?: string; onChange: (v: string | undefined) => void; placeholder: string; chips?: boolean }) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const left = value ? daysUntil(value) : null;
  const far = left === null ? null : left === 0 ? 'today' : left === 1 ? 'tomorrow' : left === -1 ? 'yesterday' : left > 0 ? `in ${left} d` : `${-left} d ago`;
  const shift = (days: number) => onChange(isoDay(Date.now() + days * 86_400_000));
  const chip = (title: string, onPress: () => void) => (
    <Pressable key={title} accessibilityRole="button" hitSlop={4} onPress={onPress} style={({ pressed }) => ({ height: 36, paddingHorizontal: 14, borderRadius: 999, backgroundColor: t.c.bg.tileRaised, justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}>
      <Text style={{ fontSize: 13, lineHeight: 17, fontWeight: '600', color: t.c.fg.primary }}>{title}</Text>
    </Pressable>
  );
  return (
    <Labelled label={label}>
      <View style={{ flexDirection: 'row', alignItems: 'center', height: 56, borderRadius: 20, backgroundColor: t.c.bg.tile, borderWidth: 1, borderColor: t.c.line }}>
        <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${value ? dayLabel(value) : placeholder}`} onPress={() => setOpen(true)} style={{ flex: 1, alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 18, paddingRight: value ? 4 : 18 }}>
          <Icon name="calendar" size={18} color={t.c.accent.mustard} />
          <Text numberOfLines={1} style={{ flex: 1, fontSize: 16, lineHeight: 22, fontWeight: '500', color: value ? t.c.fg.primary : t.c.fg.tertiary }}>{value ? dayLabel(value) : placeholder}</Text>
          {far ? <Text style={{ fontSize: 13, lineHeight: 17, fontWeight: '600', color: t.c.fg.secondary }}>{far}</Text> : null}
        </Pressable>
        {value ? <IconButton icon="x" size={44} color={t.c.fg.tertiary} accessibilityLabel={`Clear ${label}`} onPress={() => onChange(undefined)} /> : null}
      </View>
      {chips ? <View style={{ flexDirection: 'row', gap: 8 }}>{[chip('Today', () => shift(0)), chip('Tomorrow', () => shift(1)), chip('Pick a day', () => setOpen(true))]}</View> : null}
      {open && Platform.OS === 'web' ? (
        <Sheet visible onClose={() => setOpen(false)} title={label}>
          <TextField value={value ?? ''} placeholder="YYYY-MM-DD" onChange={(s) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? onChange(s) : undefined)} />
        </Sheet>
      ) : open ? (
        <DateTimePicker
          value={value ? new Date(`${value}T12:00:00`) : new Date()}
          mode="date"
          themeVariant={t.dark ? 'dark' : 'light'}
          accentColor={t.c.accent.mustard}
          onChange={(ev, d) => {
            setOpen(false);
            if (ev.type === 'set' && d) onChange(format(d, 'yyyy-MM-dd'));
          }}
        />
      ) : null}
    </Labelled>
  );
}

const TrackingHead = ({ text }: { text: string }) => {
  const t = useTheme();
  return <Text style={{ fontSize: 11, lineHeight: 14, fontWeight: '600', letterSpacing: 0.9, color: t.c.fg.secondary, paddingHorizontal: 4 }}>{text}</Text>;
};

export function DeliveryForm({ id, initial, onSaved, linkTo }: RecordFormProps) {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const existing = useLive((o) => (id ? o.records.get<DeliveryData>(id) : null), [id]);
  const known = useLive((o) => {
    const counts = new Map<string, number>();
    for (const e of o.records.query<DeliveryData>('delivery', {}, { limit: 2000 })) if (e.data.shop) counts.set(e.data.shop, (counts.get(e.data.shop) ?? 0) + 1);
    const used = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s);
    return { chips: [...new Set([...used, ...COMMON_SHOPS])].slice(0, 6), orgs: o.registry.objects.has('org') ? o.records.query('org', { sort: [{ field: 'title', dir: 'asc' }] }, { limit: 500 }).map((x) => ({ id: x.id, title: x.title, subtitle: x.subtitle })) : [] };
  }, []);
  const [d, setD] = useState<Partial<DeliveryData>>(() => ({ status: 'ordered', ...(existing?.data ?? {}), ...((initial ?? {}) as Partial<DeliveryData>) }));
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof DeliveryData>(k: K, v: DeliveryData[K] | undefined) => setD((x) => ({ ...x, [k]: v }));
  const close = () => (router.canGoBack() ? router.back() : router.replace('/module/deliveries/index' as never));

  const save = () => {
    const clean = Object.fromEntries(Object.entries(d).map(([k, v]) => [k, typeof v === 'string' ? v.trim() || undefined : v])) as Partial<DeliveryData>;
    const delivered = clean.status === 'delivered';
    const data: Partial<DeliveryData> = {
      ...clean,
      shopId: clean.shop ? clean.shopId ?? shopOrg(os, clean.shop) : undefined,
      // A code you typed: when it came. Once delivered the code is no use.
      otp: delivered ? undefined : clean.otp,
      otpAt: delivered || !clean.otp ? undefined : clean.otp !== existing?.data.otp ? Date.now() : clean.otpAt,
      deliveredOn: delivered ? clean.deliveredOn ?? isoDay(Date.now()) : clean.deliveredOn,
    };
    try {
      const saved = (id ? os.records.update<DeliveryData>(id, { data }, 'user') : os.records.create<DeliveryData>({ object: 'delivery', data: data as DeliveryData }, 'user')) as unknown as ObjectRecord;
      if (linkTo && !id) os.links.link(saved.id, linkTo.id, linkTo.kind);
      if (onSaved) onSaved(saved);
      else if (id) close();
      else router.replace(`/entity/delivery/${saved.id}` as never);
    } catch (e) {
      setError(e instanceof ZodError ? 'Check the details and try again.' : (e as Error).message);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg.ground }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: insets.top + 4, paddingHorizontal: t.layout.gutter, paddingBottom: insets.bottom + 32, gap: 22 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 }}>
          <IconButton icon="x" accessibilityLabel="Close" filled onPress={close} />
          <Text accessibilityRole="header" style={{ flex: 1, fontSize: 22, lineHeight: 25, fontWeight: '700', letterSpacing: -0.5, color: t.c.fg.primary }}>{id ? 'Edit delivery' : 'New delivery'}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Save" hitSlop={4} onPress={save} style={({ pressed }) => ({ height: 40, paddingHorizontal: 16, borderRadius: 999, backgroundColor: t.c.accent.mustard, justifyContent: 'center', opacity: pressed ? 0.85 : 1 })}>
            <Text style={{ fontSize: 13, lineHeight: 17, fontWeight: '700', color: t.c.accent.mustardInk }}>Save</Text>
          </Pressable>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 20, backgroundColor: t.c.bg.tile }}>
          <Icon name="comment" size={18} color={t.c.accent.mustard} />
          <Text style={{ flex: 1, fontSize: 13, lineHeight: 18, color: t.c.fg.secondary }}>Shipping texts and mail fill this in on their own. Type only what they miss.</Text>
        </View>

        <Labelled label="Status">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {DELIVERY_STATUSES.map((s) => <FilterChip key={s.value} label={s.label} selected={d.status === s.value} onPress={() => set('status', s.value as DeliveryData['status'])} />)}
          </View>
        </Labelled>

        <Input label="Item" value={d.item ?? ''} onChangeText={(v) => set('item', v)} autoFocus={!id} placeholder="What is in it" />

        <Labelled label="From">
          <Pressable accessibilityRole="button" accessibilityLabel={d.shop ? `From ${d.shop}. Change the shop` : 'Pick a shop'} onPress={() => setPicking(true)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, height: 56, paddingHorizontal: 18, borderRadius: 20, backgroundColor: t.c.bg.tile, borderWidth: 1, borderColor: t.c.line, opacity: pressed ? 0.8 : 1 })}>
            {d.shop ? <ShopDisc shop={d.shop} size={28} /> : <Icon name="briefcase" size={18} color={t.tints.travel.ink} />}
            <Text numberOfLines={1} style={{ flex: 1, fontSize: 16, lineHeight: 22, fontWeight: '500', color: d.shop ? t.c.fg.primary : t.c.fg.secondary }}>{d.shop ?? 'Pick a shop'}</Text>
            <Icon name="chevron-right" size={18} color={t.c.fg.secondary} />
          </Pressable>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ marginHorizontal: -t.layout.gutter, flexGrow: 0 }} contentContainerStyle={{ gap: 8, paddingHorizontal: t.layout.gutter }}>
            {known.chips.map((s) => {
              const on = d.shop === s;
              return (
                <Pressable key={s} accessibilityRole="button" accessibilityState={{ selected: on }} hitSlop={4} onPress={() => setD((x) => ({ ...x, shop: on ? undefined : s, shopId: undefined }))} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingLeft: 4, paddingRight: 12, borderRadius: 999, backgroundColor: on ? t.c.fg.primary : t.c.bg.tileRaised, opacity: pressed ? 0.8 : 1 })}>
                  <ShopDisc shop={s} size={28} />
                  <Text style={{ fontSize: 13, lineHeight: 17, fontWeight: '600', color: on ? t.c.bg.ground : t.c.fg.primary }}>{s}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </Labelled>
        <PickerSheet
          visible={picking}
          onClose={() => setPicking(false)}
          title="Pick a shop"
          items={known.orgs}
          selected={d.shopId ? [d.shopId] : []}
          onSelect={(orgId) => {
            setD((x) => ({ ...x, shopId: orgId, shop: known.orgs.find((o) => o.id === orgId)?.title }));
            setPicking(false);
          }}
          onCreate={(name) => {
            setD((x) => ({ ...x, shop: name, shopId: undefined }));
            setPicking(false);
          }}
        />

        <DayField label="Expected" value={d.expectedDate} onChange={(v) => set('expectedDate', v)} placeholder="Not set" chips />
        <Input label="Delivery OTP" value={d.otp ?? ''} onChangeText={(v) => set('otp', v)} keyboardType="number-pad" placeholder="The code the agent will ask for" />

        <View style={{ gap: 14, paddingTop: 6 }}>
          <TrackingHead text="TRACKING" />
          <Input label="Tracking link" value={d.trackingUrl ?? ''} onChangeText={(v) => set('trackingUrl', v)} keyboardType="url" autoCapitalize="none" autoCorrect={false} placeholder="Paste the link from the text" />
          <Input label="Carrier" value={d.carrier ?? ''} onChangeText={(v) => set('carrier', v)} placeholder="Delhivery, Blue Dart, India Post" />
          <Input label="Tracking number" value={d.tracking ?? ''} onChangeText={(v) => set('tracking', v)} autoCapitalize="characters" autoCorrect={false} placeholder="AWB, waybill or consignment" />
          <Input label="Order ID" value={d.orderId ?? ''} onChangeText={(v) => set('orderId', v)} autoCapitalize="none" autoCorrect={false} placeholder="None for a parcel from family" />
          <DayField label="Delivered on" value={d.deliveredOn} onChange={(v) => set('deliveredOn', v)} placeholder="Set when it arrives" />
        </View>

        <View style={{ gap: 14, paddingTop: 6 }}>
          <TrackingHead text="DETAILS" />
          <Input label="Notes" value={d.notes ?? ''} onChangeText={(v) => set('notes', v)} multiline />
        </View>

        {error ? <Text accessibilityLiveRegion="polite" style={{ fontSize: 13, lineHeight: 18, color: t.c.alert.coralText }}>{error}</Text> : null}
        <Button title="Save delivery" size="lg" block onPress={save} style={{ marginTop: 6 }} />
      </ScrollView>
    </View>
  );
}
