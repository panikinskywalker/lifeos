import React, { useState } from 'react';
import { Pressable, TextInput, View, type TextStyle } from 'react-native';
import { useRouter } from 'expo-router';
import type { ObjectRecord } from '@core/domain/types';
import type { RecordFormProps } from '@core/registry/types';
import type { HabitData } from '@modules/habits';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { fontForWeight } from '@ui/theme/tokens';
import { Button, FilterChip, Icon, IconButton, Screen, Segmented, Text, useToast } from '@ui/kit';
import { NoteCard, Slab } from './parts';

type Frequency = HabitData['frequency'];
const OFTEN: Array<{ value: Frequency; label: string }> = [{ value: 'daily', label: 'Every day' }, { value: 'weekdays', label: 'Weekdays' }, { value: 'weekly', label: 'Times a week' }];
const STATUS = [{ value: 'active', label: 'Active' }, { value: 'paused', label: 'Paused' }];
const INPUT: TextStyle = { fontSize: 16, lineHeight: 21, fontFamily: fontForWeight(500) };

/** The habit form (NR-Habits-Form): name, how often, why, status. The board's form override, used by New and Edit. */
export function HabitForm({ id, initial, onSaved, linkTo }: RecordFormProps) {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const existing = useLive((o) => (id ? o.records.get<HabitData>(id) : undefined), [id]);
  const start = { ...(initial as Partial<HabitData> | undefined), ...existing?.data };
  const [name, setName] = useState(existing?.title ?? (initial?.title as string) ?? '');
  const [often, setOften] = useState<Frequency>(start.frequency ?? 'daily');
  const [target, setTarget] = useState(start.targetPerWeek ?? 3);
  const [why, setWhy] = useState(start.why ?? '');
  const [status, setStatus] = useState(existing?.status ?? 'active');
  const [focus, setFocus] = useState<'name' | 'why' | null>(null);
  const [missing, setMissing] = useState(false);
  const close = () => (router.canGoBack() ? router.back() : router.replace('/module/habits' as never));

  const save = () => {
    const title = name.trim();
    if (!title) return setMissing(true);
    const data = { frequency: often, targetPerWeek: often === 'weekly' ? target : undefined, why: why.trim() || undefined };
    try {
      const saved = (id ? os.records.update<HabitData>(id, { title, data, status }, 'user') : os.records.create<HabitData>({ object: 'habit', title, data, status }, 'user')) as unknown as ObjectRecord;
      if (linkTo && !id) os.links.link(saved.id, linkTo.id, linkTo.kind);
      if (onSaved) onSaved(saved);
      else if (id) close();
      else router.replace(`/entity/habit/${saved.id}` as never);
    } catch (e) {
      toast.show({ message: (e as Error).message, icon: 'info' });
    }
  };

  const box = (on: boolean, error?: boolean) => ({ borderRadius: 20, backgroundColor: t.c.bg.tile, borderWidth: on || error ? 1.5 : 1, borderColor: error ? t.c.alert.coral : on ? t.c.fg.primary : t.c.line });
  return (
    <Screen contentStyle={{ gap: 24 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <IconButton icon="x" accessibilityLabel="Close" filled onPress={close} />
        <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
          <Text variant="caption" color="secondary" numberOfLines={1}>Habits</Text>
          <Text variant="title" numberOfLines={1} accessibilityRole="header">{id ? 'Edit habit' : 'New habit'}</Text>
        </View>
      </View>

      <Field label="Name" hint={`Name it the way you’d say it, so “did ${name.trim().toLowerCase() || 'yoga'}” in a Dump finds it.`} error={missing && !name.trim() ? 'Give it a name.' : null}>
        <View style={[box(focus === 'name', missing && !name.trim()), { minHeight: 56, paddingHorizontal: 18, justifyContent: 'center' }]}>
          <TextInput accessibilityLabel="Name" value={name} onChangeText={setName} autoFocus={!id && !name} onFocus={() => setFocus('name')} onBlur={() => setFocus(null)} selectionColor={t.c.accent.mustard} cursorColor={t.c.accent.mustard} style={[INPUT, { color: t.c.fg.primary, paddingVertical: 14 }]} />
        </View>
      </Field>

      <Field label="How often" hint={often === 'weekly' ? 'The streak counts weeks that met the target.' : undefined}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {OFTEN.map((o) => <FilterChip key={o.value} label={o.label} selected={often === o.value} onPress={() => setOften(o.value)} />)}
        </View>
        {often === 'weekly' ? (
          <Slab style={{ marginTop: 2, paddingVertical: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
              <Text variant="tileTitle" style={{ lineHeight: 20 }}>Target per week</Text>
              <Text variant="caption" color="secondary">Any days you like</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, padding: 4, borderRadius: 999, backgroundColor: t.c.bg.tileRaised }}>
              <Step icon="minus" label="One fewer" disabled={target <= 1} onPress={() => setTarget(target - 1)} />
              <Text variant="metric" accessibilityLiveRegion="polite" style={{ minWidth: 36, textAlign: 'center', lineHeight: 29, letterSpacing: 0 }}>{target}</Text>
              <Step icon="plus" label="One more" disabled={target >= 7} onPress={() => setTarget(target + 1)} />
            </View>
          </Slab>
        ) : null}
      </Field>

      <Field label="Why">
        <TextInput accessibilityLabel="Why" value={why} onChangeText={setWhy} multiline placeholder="What it’s for, in a line" placeholderTextColor={t.c.fg.tertiary} onFocus={() => setFocus('why')} onBlur={() => setFocus(null)} selectionColor={t.c.accent.mustard} cursorColor={t.c.accent.mustard} textAlignVertical="top" style={[box(focus === 'why'), INPUT, { minHeight: 104, paddingVertical: 16, paddingHorizontal: 18, lineHeight: 22, color: t.c.fg.primary }]} />
      </Field>

      <Field label="Status" hint="A paused habit keeps its check-ins and leaves Today.">
        <Segmented options={STATUS} value={status} onChange={setStatus} />
      </Field>

      <NoteCard icon="lock">Saved on this phone, like every check-in. Nothing here is sent anywhere.</NoteCard>

      <View style={{ gap: 10 }}>
        <Button title="Save habit" icon="check" block onPress={save} />
        <Button title="Cancel" variant="secondary" block onPress={close} />
      </View>
    </Screen>
  );
}

function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string | null; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ gap: 8 }}>
      <Text color="secondary" style={{ fontSize: 13, lineHeight: 17, fontWeight: '600', paddingHorizontal: 4 }}>{label}</Text>
      {children}
      {error ? <Text variant="caption" color={t.c.alert.coralText} style={{ paddingHorizontal: 4 }}>{error}</Text> : hint ? <Text variant="caption" color="tertiary" style={{ paddingHorizontal: 4 }}>{hint}</Text> : null}
    </View>
  );
}

function Step({ icon, label, disabled, onPress }: { icon: string; label: string; disabled: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} hitSlop={4} onPress={onPress} style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 20, backgroundColor: t.c.bg.dim, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.4 : pressed ? 0.7 : 1 })}>
      <Icon name={icon} size={16} color={t.c.fg.primary} />
    </Pressable>
  );
}
