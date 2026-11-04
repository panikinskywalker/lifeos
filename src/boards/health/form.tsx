import React, { useState } from 'react';
import { Keyboard, Pressable, TextInput, View, type TextStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { ZodError } from 'zod';
import type { ObjectRecord } from '@core/domain/types';
import type { RecordFormProps } from '@core/registry/types';
import { isoDay } from '@core/dashboard/metrics';
import { MEASUREMENT_METRICS, WORKOUT_KINDS, unitFor, type MeasurementData, type WorkoutData } from '@modules/health';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { ActionSheet, Button, DateField, FilterChip, Icon, Screen, Text, useToast } from '@ui/kit';
import { EntityPicker } from '@ui/components/fields';
import { tintForModule } from '@ui/theme/moduleTint';
import { fontForWeight } from '@ui/theme/tokens';
import { Box, Disc, Group, Head, Labelled, Note, PillAction, Row, Seg, WideButton } from './parts';

/**
 * New and edit for a Workout and a Measurement (NR-Health-Form): one form
 * with a switch between the two when new. Required on top (type, duration,
 * date), details below, Links, Save in the top bar and at the bottom.
 */

const INTENSITIES = [{ value: 'easy', label: 'Easy' }, { value: 'moderate', label: 'Moderate' }, { value: 'hard', label: 'Hard' }] as const;
const MODES = [{ value: 'workout', label: 'Workout' }, { value: 'measurement', label: 'Measurement' }] as const;
const num = (s: string) => {
  const n = Number(s.replace(',', '.'));
  return s.trim() && Number.isFinite(n) ? n : undefined;
};

interface PendingLink {
  key: string;
  otherId: string;
  type: string;
  title: string;
  kind: string;
  linkId?: string;
}

export const WorkoutForm = (p: RecordFormProps) => <HealthForm {...p} start="workout" />;
export const MeasurementForm = (p: RecordFormProps) => <HealthForm {...p} start="measurement" />;

function HealthForm({ id, initial, onSaved, linkTo, start }: RecordFormProps & { start: 'workout' | 'measurement' }) {
  const [mode, setMode] = useState<'workout' | 'measurement'>(start);
  const toggle = id ? null : <Seg label="What to add" options={[...MODES]} value={mode} onChange={(m) => m && setMode(m)} />;
  return mode === 'workout' ? <WorkoutFields id={id} initial={initial} onSaved={onSaved} linkTo={linkTo} toggle={toggle} /> : <MeasurementFields id={id} initial={initial} onSaved={onSaved} linkTo={linkTo} toggle={toggle} />;
}

type FieldsProps = RecordFormProps & { toggle: React.ReactNode };

function useClose(object: string) {
  const router = useRouter();
  return () => (router.canGoBack() ? router.back() : router.replace((object === 'workout' ? '/module/health/workouts' : '/module/health') as never));
}

function Problem({ text }: { text: string | null }) {
  const t = useTheme();
  return text ? <Text variant="caption" color={t.c.alert.coralText} accessibilityLiveRegion="polite">{text}</Text> : null;
}

/* ------------------------------------------------------------------ */
/* Workout                                                              */
/* ------------------------------------------------------------------ */

function WorkoutFields({ id, initial, onSaved, linkTo, toggle }: FieldsProps) {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const close = useClose('workout');
  const existing = useLive((o) => (id ? o.records.get<WorkoutData>(id) : undefined), [id]);
  const seed = { ...(existing?.data ?? {}), ...(initial ?? {}) } as Partial<WorkoutData>;
  const [kind, setKind] = useState<string | undefined>(seed.kind);
  const [minutes, setMinutes] = useState(seed.durationMin ? String(seed.durationMin) : '30');
  const [date, setDate] = useState<string | undefined>(seed.date ?? isoDay(Date.now()));
  const [km, setKm] = useState(seed.distanceKm ? String(seed.distanceKm) : '');
  const [cal, setCal] = useState(seed.calories ? String(seed.calories) : '');
  const [intensity, setIntensity] = useState<string | undefined>(seed.intensity);
  const [notes, setNotes] = useState(seed.notes ?? '');
  const [links, setLinks] = useState<PendingLink[]>(() =>
    id
      ? os.links.forEntity(id).filter((l) => l.relation.kind !== 'mention').map((l) => ({ key: l.relation.id, linkId: l.relation.id, otherId: l.other.id, type: l.other.object, title: l.other.title, kind: l.relation.kind }))
      : [],
  );
  const [removed, setRemoved] = useState<string[]>([]);
  const [picking, setPicking] = useState(false);
  const [held, setHeld] = useState<PendingLink | null>(null);
  const [error, setError] = useState<string | null>(null);

  const step = (d: number) => setMinutes((m) => String(Math.max(5, (Number(m) || 0) + d)));

  const save = () => {
    Keyboard.dismiss();
    const duration = num(minutes);
    if (!kind) return setError('Pick a type.');
    if (!duration || duration <= 0) return setError('How long was it? Add the minutes.');
    if (!date) return setError('Pick a date.');
    const data: WorkoutData = { ...(existing?.data ?? {}), kind, durationMin: duration, date, distanceKm: num(km), calories: num(cal), intensity, notes: notes.trim() || undefined };
    try {
      const saved = id ? os.records.update<WorkoutData>(id, { data }) : os.records.create<WorkoutData>({ object: 'workout', data });
      for (const linkId of removed) os.links.remove(linkId);
      for (const l of links) if (!l.linkId) os.links.link(saved.id, l.otherId, l.kind);
      if (linkTo && !id) os.links.link(saved.id, linkTo.id, linkTo.kind);
      if (onSaved) onSaved(saved as unknown as ObjectRecord);
      else if (id) close();
      else router.replace(`/entity/workout/${saved.id}` as never);
      toast.show({ message: id ? 'Workout saved' : `${saved.title} added`, icon: 'check' });
    } catch (e) {
      setError(e instanceof ZodError ? (e.issues[0]?.message ?? 'Check the fields.') : (e as Error).message);
    }
  };

  const dropLink = (l: PendingLink) => {
    setLinks((xs) => xs.filter((x) => x.key !== l.key));
    if (l.linkId) setRemoved((r) => [...r, l.linkId!]);
  };

  return (
    <Screen contentStyle={{ gap: 24 }}>
      <Head sub="Health & Fitness" title={id ? 'Edit workout' : 'New workout'} close onBack={close} right={<PillAction lime label="Save" onPress={save} />} />
      {toggle}

      <Labelled label="TYPE · REQUIRED">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {WORKOUT_KINDS.map((k) => <FilterChip key={k.value} label={k.label} selected={kind === k.value} onPress={() => setKind(k.value)} />)}
        </View>
      </Labelled>

      <Labelled label="DURATION · REQUIRED">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, padding: 4, borderRadius: 999, backgroundColor: t.c.bg.tileRaised }}>
            <StepButton icon="minus" label="5 minutes less" onPress={() => step(-5)} />
            <TextInput
              accessibilityLabel="Duration in minutes"
              keyboardType="number-pad"
              value={minutes}
              onChangeText={setMinutes}
              selectionColor={t.c.accent.mustard}
              style={[t.type.metric as TextStyle, { width: 64, padding: 0, textAlign: 'center', lineHeight: 29, color: t.c.fg.primary, fontFamily: fontForWeight(700) }]}
            />
            <StepButton icon="plus" label="5 minutes more" onPress={() => step(5)} />
          </View>
          <Text color="secondary" style={{ fontSize: 14, lineHeight: 18, fontWeight: '500' }}>min</Text>
        </View>
      </Labelled>

      <Labelled label="DATE · REQUIRED">
        <DateField quick={false} value={date} onChange={(v) => setDate(typeof v === 'string' ? v : undefined)} />
      </Labelled>

      <View style={{ gap: 14 }}>
        <View style={{ paddingTop: 6, paddingHorizontal: 4 }}>
          <Text variant="heading">Details</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Labelled label="DISTANCE">
              <Box label="Distance in kilometres" value={km} onChange={setKm} numeric unit="km" placeholder="0" />
            </Labelled>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Labelled label="CALORIES">
              <Box label="Calories" value={cal} onChange={setCal} numeric unit="kcal" placeholder="e.g. 300" />
            </Labelled>
          </View>
        </View>
        <Labelled label="INTENSITY">
          <Seg label="Intensity" optional options={[...INTENSITIES]} value={intensity as 'easy' | 'moderate' | 'hard' | undefined} onChange={setIntensity} />
        </Labelled>
        <Labelled label="NOTES">
          <Box label="Notes" multiline value={notes} onChange={setNotes} placeholder="How it went, who came along" />
        </Labelled>
      </View>

      <View style={{ gap: 10 }}>
        <View style={{ paddingTop: 6, paddingHorizontal: 4 }}>
          <Text variant="heading">Links</Text>
        </View>
        <View style={{ padding: 14, borderRadius: t.radius.card, backgroundColor: t.c.bg.tile, gap: 8 }}>
          {links.length ? (
            <Group padding={0}>
              {links.map((l) => {
                const def = os.registry.objects.get(l.type);
                return (
                  <Row
                    key={l.key}
                    minHeight={52}
                    lead={<Disc icon={def?.icon ?? 'link'} color={t.tints[tintForModule(def?.module)].ink} />}
                    title={l.title}
                    sub={l.kind === 'at' ? 'At' : l.kind === 'with' ? 'With' : def?.label ?? 'Linked'}
                    right={<Icon name="chevron-right" size={18} color={t.c.fg.tertiary} />}
                    onPress={() => setHeld(l)}
                  />
                );
              })}
            </Group>
          ) : null}
          <WideButton title="Link a place, person or trip" icon="plus" onPress={() => setPicking(true)} />
        </View>
      </View>

      <Note icon="refresh">Workouts from your watch arrive through Health Connect on their own. Add one here when it didn’t, or say it in Dump: “ran 5 k at Cubbon Park”.</Note>

      <Problem text={error} />
      <Button title={id ? 'Save changes' : 'Save workout'} icon="check" block onPress={save} />

      <EntityPicker
        visible={picking}
        onClose={() => setPicking(false)}
        types={['place', 'person', 'trip'].filter((x) => os.registry.objects.has(x))}
        title="Link a place, person or trip"
        exclude={[...(id ? [id] : []), ...links.map((l) => l.otherId)]}
        onSelect={(otherId, type) => {
          const other = os.records.get(otherId);
          setPicking(false);
          if (other) setLinks((xs) => [...xs, { key: otherId, otherId, type, title: other.title, kind: type === 'place' ? 'at' : type === 'person' ? 'with' : 'related' }]);
        }}
      />
      <ActionSheet
        visible={!!held}
        onClose={() => setHeld(null)}
        title={held?.title}
        actions={held ? [{ label: 'Remove link', icon: 'trash', destructive: true, onPress: () => dropLink(held) }] : []}
      />
    </Screen>
  );
}

function StepButton({ icon, label, onPress }: { icon: 'minus' | 'plus'; label: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, backgroundColor: t.c.bg.dim, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
      <Icon name={icon} size={16} color={t.c.fg.primary} />
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/* Measurement                                                          */
/* ------------------------------------------------------------------ */

function MeasurementFields({ id, initial, onSaved, linkTo, toggle }: FieldsProps) {
  const os = useOS();
  const toast = useToast();
  const close = useClose('measurement');
  const existing = useLive((o) => (id ? o.records.get<MeasurementData>(id) : undefined), [id]);
  const seed = { ...(existing?.data ?? {}), ...(initial ?? {}) } as Partial<MeasurementData>;
  const [metric, setMetric] = useState<string | undefined>(seed.metric);
  const [value, setValue] = useState(seed.value != null ? String(seed.value) : '');
  const [unit, setUnit] = useState(seed.unit ?? '');
  const [date, setDate] = useState<string | undefined>(seed.date ?? isoDay(Date.now()));
  const [asleep, setAsleep] = useState<number | undefined>(seed.startAt);
  const [awake, setAwake] = useState<number | undefined>(seed.endAt);
  const [notes, setNotes] = useState(seed.notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const known = metric ? unitFor(metric) : undefined;

  const save = () => {
    Keyboard.dismiss();
    const v = num(value);
    if (!metric) return setError('Pick what it measures.');
    if (v == null) return setError('Add the value.');
    if (!date) return setError('Pick a date.');
    const data: MeasurementData = { ...(existing?.data ?? {}), metric, value: v, unit: known ?? (unit.trim() || undefined), date, startAt: asleep, endAt: awake, notes: notes.trim() || undefined };
    try {
      const saved = id ? os.records.update<MeasurementData>(id, { data }) : os.records.create<MeasurementData>({ object: 'measurement', data });
      if (linkTo && !id) os.links.link(saved.id, linkTo.id, linkTo.kind);
      if (onSaved) onSaved(saved as unknown as ObjectRecord);
      else close();
      toast.show({ message: id ? 'Reading saved' : `${saved.title} added`, icon: 'check' });
    } catch (e) {
      setError(e instanceof ZodError ? (e.issues[0]?.message ?? 'Check the fields.') : (e as Error).message);
    }
  };

  return (
    <Screen contentStyle={{ gap: 24 }}>
      <Head sub="Health & Fitness" title={id ? 'Edit measurement' : 'New measurement'} close onBack={close} right={<PillAction lime label="Save" onPress={save} />} />
      {toggle}

      <Labelled label="METRIC · REQUIRED">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {MEASUREMENT_METRICS.map((m) => <FilterChip key={m.value} label={m.label} selected={metric === m.value} onPress={() => setMetric(m.value)} />)}
        </View>
      </Labelled>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Labelled label="VALUE · REQUIRED">
            <Box label="Value" value={value} onChange={setValue} numeric unit={known} placeholder="0" />
          </Labelled>
        </View>
        {metric && !known ? (
          <View style={{ flex: 1, minWidth: 0 }}>
            <Labelled label="UNIT">
              <Box label="Unit" value={unit} onChange={setUnit} placeholder="e.g. mg/dL" />
            </Labelled>
          </View>
        ) : null}
      </View>

      <Labelled label="DATE · REQUIRED">
        <DateField quick={false} value={date} onChange={(v) => setDate(typeof v === 'string' ? v : undefined)} />
      </Labelled>

      {metric === 'sleep' ? (
        <View style={{ gap: 14 }}>
          <Labelled label="ASLEEP">
            <DateField quick={false} withTime value={asleep} onChange={(v) => setAsleep(typeof v === 'number' ? v : undefined)} />
          </Labelled>
          <Labelled label="AWAKE">
            <DateField quick={false} withTime value={awake} onChange={(v) => setAwake(typeof v === 'number' ? v : undefined)} />
          </Labelled>
        </View>
      ) : null}

      <Labelled label="NOTES">
        <Box label="Notes" multiline value={notes} onChange={setNotes} placeholder="Where, on what, anything odd" />
      </Labelled>

      <Note icon="refresh">Readings from your watch or scale arrive through Health Connect on their own. Add one here when it didn’t, or say it in Dump: “72.6 on the scale today”.</Note>

      <Problem text={error} />
      <Button title={id ? 'Save changes' : 'Save measurement'} icon="check" block onPress={save} />
    </Screen>
  );
}
