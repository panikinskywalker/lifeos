import React, { useMemo, useState } from 'react';
import { Linking, Pressable, TextInput, View, type KeyboardTypeOptions } from 'react-native';
import { useRouter } from 'expo-router';
import { saveVenue, venueInputOf, type VenueData, type VenueInput } from '@modules/games';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { fontForWeight } from '@ui/theme/tokens';
import { Button, EmptyState, Icon, Screen, Text, useToast } from '@ui/kit';
import { usePull } from './useTurfSync';
import { TurfSyncPill } from './states';
import { TERMS, VenuePhoto, kickOff, lookOf } from './venues';
import type { Props } from './common';

/**
 * Turf · Noir 7b Edit venue (TF-VenueEdit): name, where (the Maps link),
 * format, usual cost and kick-off, payment terms (with the advance), notes;
 * Save sends it to Turf web. A new venue when there's no `id`. No photo
 * picker (photos aren't in the sync yet) and no delete (Turf web has none).
 */

/** The format chips: 8+ covers Turf web's 8, 9 and 11 (a 9 or 11 from Turf web stays as it is). */
const FORMATS: Array<{ size: number; label: string }> = [
  { size: 5, label: '5-a-side' },
  { size: 6, label: '6-a-side' },
  { size: 7, label: '7-a-side' },
  { size: 8, label: '8+' },
];

/** "8:00 pm", "8pm", "20:00", "2030" → "20:00"; null if it isn't a time. */
function parseKickOff(raw: string): string | null {
  const m = /^(\d{1,2})(?:[:.]?(\d{2}))?\s*(am|pm)?$/i.exec(raw.trim().replace(/\s+/g, ' '));
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? '0');
  const half = m[3]?.toLowerCase();
  if (half) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (half === 'pm' ? 12 : 0);
  }
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

const digits = (s: string) => {
  const n = Number(s.replace(/[^\d.]/g, ''));
  return s.trim() && Number.isFinite(n) ? n : undefined;
};

export function TurfVenueEdit({ params }: Props) {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { pull } = usePull();
  const id = params.venue || null;
  const back = () => (router.canGoBack() ? router.back() : router.replace('/board/turf/venues' as never));
  const exists = useLive((o) => (id ? o.records.get<VenueData>(id)?.object === 'venue' : true), [id]);
  const start = useMemo<VenueInput>(() => (id ? venueInputOf(os, id) : null) ?? { name: '', paymentTerms: 'postpaid' }, [os, id]);
  const [v, setV] = useState<VenueInput>(start);
  const [cost, setCost] = useState(start.defaultCost ? String(start.defaultCost) : '');
  const [advance, setAdvance] = useState(start.advance ? String(start.advance) : '');
  const [time, setTime] = useState(kickOff(start.defaultTime) ?? '');
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<VenueInput>) => setV((cur) => ({ ...cur, ...patch }));
  const title = id ? 'Edit venue' : 'New venue';

  if (id && !exists) {
    return (
      <Screen title={title} subtitle="Turf › Venues" onBack={back}>
        <EmptyState icon="location" line="That venue isn’t here any more." />
      </Screen>
    );
  }

  const maps = v.mapsLink?.trim() && /^https?:\/\//i.test(v.mapsLink.trim()) ? v.mapsLink.trim() : null;
  const save = () => {
    const defaultTime = time.trim() ? parseKickOff(time) : undefined;
    if (defaultTime === null) return toast.show({ message: 'Write the kick-off as 8:00 pm or 20:00', icon: 'info' });
    setSaving(true);
    try {
      const input: VenueInput = { ...v, name: v.name, mapsLink: v.mapsLink?.trim() || undefined, notes: v.notes?.trim() || undefined, defaultTime, defaultCost: digits(cost), advance: v.paymentTerms === 'advance_paid' ? digits(advance) : undefined };
      const { item } = saveVenue(os, id, input);
      toast.show({ message: item ? `${input.name.trim()} · sending to Turf web` : 'Venue saved', icon: 'check' });
      void pull(true);
      back();
    } catch (e) {
      toast.show({ message: (e as Error).message, icon: 'info' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen title={title} subtitle="Turf › Venues" onBack={back} right={<TurfSyncPill />} contentStyle={{ gap: 14 }}>
      <View style={{ height: 150, borderRadius: 24, overflow: 'hidden' }}>
        <VenuePhoto id={id ?? 'new'} look={lookOf(id)} w={350} h={150} />
      </View>

      <Field label="Name">
        <Box>
          <Input value={v.name} onChange={(name) => set({ name })} placeholder="What the venue is called" weight={500} label="Name" autoCapitalize="words" />
        </Box>
      </Field>

      <Field label="Where">
        <Box>
          <Icon name="location" size={18} color={t.c.fg.tertiary} />
          <Input value={v.mapsLink ?? ''} onChange={(mapsLink) => set({ mapsLink })} placeholder="Google Maps link" weight={500} label="Where (Google Maps link)" keyboardType="url" autoCapitalize="none" />
          {maps ? (
            <Pressable accessibilityRole="link" accessibilityLabel="Open in Maps" hitSlop={10} onPress={() => void Linking.openURL(maps).catch(() => toast.show({ message: 'Couldn’t open that link', icon: 'info' }))}>
              <Text variant="labelMicro" color={t.c.accent.mustard}>
                Maps
              </Text>
            </Pressable>
          ) : null}
        </Box>
      </Field>

      <Field label="Format">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {FORMATS.map((f) => (
            <Chip key={f.size} label={f.label} on={f.size === 8 ? (v.sideSize ?? 0) >= 8 : v.sideSize === f.size} onPress={() => set({ sideSize: f.size === 8 && (v.sideSize ?? 0) >= 8 ? v.sideSize : f.size })} />
          ))}
        </View>
      </Field>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Field label="Usual cost">
            <Box>
              <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: t.c.bg.dim, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="rupee" size={14} color={t.c.fg.primary} />
              </View>
              <Input value={cost} onChange={setCost} placeholder="0" weight={600} label="Usual cost" keyboardType="number-pad" />
            </Box>
          </Field>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Field label="Usual kick-off">
            <Box>
              <Icon name="clock" size={18} color={t.c.fg.tertiary} />
              <Input value={time} onChange={setTime} placeholder="8:00 pm" weight={600} label="Usual kick-off" keyboardType="numbers-and-punctuation" autoCapitalize="none" />
            </Box>
          </Field>
        </View>
      </View>

      <Field label="Payment terms">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {TERMS.map((x) => (
            <Chip key={x.value} label={x.label} on={v.paymentTerms === x.value} onPress={() => set({ paymentTerms: x.value })} />
          ))}
        </View>
      </Field>

      {v.paymentTerms === 'advance_paid' ? (
        <Field label="Advance">
          <Box>
            <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: t.c.bg.dim, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="rupee" size={14} color={t.c.fg.primary} />
            </View>
            <Input value={advance} onChange={setAdvance} placeholder="Paid ahead to book" weight={600} label="Advance" keyboardType="number-pad" />
          </Box>
        </Field>
      ) : null}

      <Field label="Notes">
        <Box multiline>
          <Input value={v.notes ?? ''} onChange={(notes) => set({ notes })} placeholder="Gate, parking, which pitch to ask for…" weight={500} size={15} label="Notes" multiline />
        </Box>
      </Field>

      <Button title={saving ? 'Saving…' : 'Save venue'} icon="check" block disabled={saving} onPress={save} />
    </Screen>
  );
}

/* ------------------------------------------------------------------ */
/* Pieces (TF-VenueEdit: 15/600 labels, 20 boxes with a hairline, 40 chips) */
/* ------------------------------------------------------------------ */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <Text variant="tileTitle" style={{ lineHeight: 20 }}>
        {label}
      </Text>
      {children}
    </View>
  );
}

function Box({ children, multiline }: { children: React.ReactNode; multiline?: boolean }) {
  const t = useTheme();
  return <View style={{ flexDirection: 'row', alignItems: multiline ? 'flex-start' : 'center', gap: 10, minHeight: multiline ? 80 : 52, paddingHorizontal: 18, borderRadius: 20, backgroundColor: t.c.bg.tile, borderWidth: 1, borderColor: t.c.line }}>{children}</View>;
}

function Input({ value, onChange, placeholder, weight, size = 16, label, multiline, keyboardType, autoCapitalize }: { value: string; onChange: (v: string) => void; placeholder?: string; weight: 500 | 600; size?: number; label: string; multiline?: boolean; keyboardType?: KeyboardTypeOptions; autoCapitalize?: 'none' | 'words' | 'sentences' }) {
  const t = useTheme();
  return (
    <TextInput
      accessibilityLabel={label}
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={t.c.fg.tertiary}
      selectionColor={t.c.accent.mustard}
      cursorColor={t.c.fg.primary}
      keyboardType={keyboardType}
      autoCapitalize={autoCapitalize}
      autoCorrect={!keyboardType && autoCapitalize !== 'none'}
      multiline={multiline}
      style={{ flex: 1, minWidth: 0, color: t.c.fg.primary, fontFamily: fontForWeight(weight), fontSize: size, lineHeight: 21, paddingVertical: multiline ? 12 : 14, minHeight: multiline ? 80 : undefined, textAlignVertical: multiline ? 'top' : 'center', fontVariant: ['tabular-nums'] }}
    />
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: on }} onPress={onPress} style={({ pressed }) => ({ height: 40, paddingHorizontal: 16, borderRadius: 999, justifyContent: 'center', backgroundColor: on ? t.c.fg.primary : t.c.bg.tileRaised, opacity: pressed ? 0.8 : 1 })}>
      <Text variant="label" color={on ? t.c.bg.ground : 'primary'}>
        {label}
      </Text>
    </Pressable>
  );
}
