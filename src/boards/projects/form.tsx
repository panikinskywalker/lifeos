import React, { useState, type ReactNode } from 'react';
import { Platform, Pressable, TextInput, View, type TextStyle } from 'react-native';
import { useRouter } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { differenceInCalendarWeeks, format } from 'date-fns';
import { ZodError } from 'zod';
import type { ObjectRecord } from '@core/domain/types';
import type { RecordFormProps } from '@core/registry/types';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { blocks, fontForWeight } from '@ui/theme/tokens';
import { Icon, IconButton, PickerSheet, Screen, Sheet, Text, TextField } from '@ui/kit';
import { PRIORITIES, REPEATS, projectType, taskType, type ProjectData, type TaskData } from '@modules/projects';
import { ACCENT, Face, dayDate, ymd } from './parts';

/**
 * The task and project forms (NR-Projects-Form), the board's form overrides,
 * used by New and Edit: pills for Due, Repeats, Priority and Area, the project
 * and people pickers. The artboard's new-record forms have no Status; Edit
 * shows one, as a page-drawn record has no other way to change it.
 */

const LABEL: TextStyle = { fontSize: 13, lineHeight: 17, fontWeight: '600', paddingHorizontal: 4 };
const HINT: TextStyle = { fontSize: 13, lineHeight: 17, paddingHorizontal: 4 };

/** Header: close, optional caption over the 22 title, Save. */
function FormTop({ caption, title, onClose, onSave }: { caption?: string | null; title: string; onClose: () => void; onSave: () => void }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <IconButton icon="x" accessibilityLabel="Close" filled onPress={onClose} />
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        {caption ? <Text numberOfLines={1} color="secondary" style={{ fontSize: 13, lineHeight: 17 }}>{caption}</Text> : null}
        <Text accessibilityRole="header" numberOfLines={1} style={{ fontSize: 22, lineHeight: 25, fontWeight: '700', letterSpacing: -0.5, color: t.c.fg.primary }}>{title}</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Save" hitSlop={4} onPress={onSave} style={({ pressed }) => ({ height: 40, paddingHorizontal: 16, borderRadius: 999, backgroundColor: t.c.accent.mustard, justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}>
        <Text style={{ fontSize: 13, lineHeight: 20, fontWeight: '700', color: t.c.accent.mustardInk }}>Save</Text>
      </Pressable>
    </View>
  );
}

function Group({ label, hint, gap = 10, children }: { label: string; hint?: string | null; gap?: number; children: ReactNode }) {
  return (
    <View style={{ gap, minWidth: 0 }}>
      <Text color="secondary" style={LABEL}>{label}</Text>
      {children}
      {hint ? <Text color="secondary" style={HINT}>{hint}</Text> : null}
    </View>
  );
}

function Wrap({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{children}</View>;
}

/** An option pill, 40 tall, white when chosen; `dashed` for "No date" and adding. */
function Pill({ label, selected, dashed, icon, onPress }: { label: string; selected?: boolean; dashed?: boolean; icon?: string; onPress: () => void }) {
  const t = useTheme();
  const fg = selected ? t.c.bg.ground : dashed && icon ? t.c.fg.primary : dashed ? t.c.fg.secondary : t.c.fg.primary;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: !!selected }} hitSlop={4} onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: 16, borderRadius: 999, backgroundColor: selected ? t.c.fg.primary : dashed ? 'transparent' : t.c.bg.tileRaised, borderWidth: dashed && !selected ? 1 : 0, borderStyle: 'dashed', borderColor: `${t.c.fg.primary}52`, opacity: pressed ? 0.8 : 1 })}>
      {icon ? <Icon name={icon} size={14} color={fg} /> : null}
      <Text style={{ fontSize: 14, lineHeight: 18, fontWeight: '600', color: fg }}>{label}</Text>
    </Pressable>
  );
}

/** Noir input: 56 tall, radius 20, a white ring on focus. */
function Input({ value, onChange, placeholder, label, multiline, numeric, autoFocus, error }: { value: string; onChange: (s: string) => void; placeholder?: string; label: string; multiline?: boolean; numeric?: boolean; autoFocus?: boolean; error?: string | null }) {
  const t = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={t.c.fg.tertiary}
        selectionColor={t.c.accent.mustard}
        cursorColor={t.c.accent.mustard}
        keyboardType={numeric ? 'number-pad' : 'default'}
        multiline={multiline}
        autoFocus={autoFocus}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{ minHeight: multiline ? 98 : 56, paddingHorizontal: 18, paddingVertical: multiline ? 16 : 0, borderRadius: 20, backgroundColor: t.c.bg.tile, borderWidth: 1.5, borderColor: error ? t.c.alert.coral : focused ? t.c.fg.primary : 'transparent', color: t.c.fg.primary, fontSize: 16, lineHeight: multiline ? 22 : undefined, fontFamily: fontForWeight(500), textAlignVertical: multiline ? 'top' : 'center' }}
      />
      {error ? <Text color={t.c.alert.coral} accessibilityLiveRegion="polite" style={HINT}>{error}</Text> : null}
    </View>
  );
}

/** A 56 row that opens a picker: lilac icon, value, a word on the right. */
function PickRow({ icon, label, value, word, muted, onPress }: { icon: string; label: string; value: string; word: string; muted?: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${value}. ${word}`} onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 16, borderRadius: 20, backgroundColor: t.c.bg.tile, opacity: pressed ? 0.8 : 1 })}>
      <Icon name={icon} size={18} color={ACCENT} />
      <Text numberOfLines={1} style={{ flex: 1, fontSize: 16, lineHeight: 21, fontWeight: '600', fontVariant: ['tabular-nums'], color: muted ? t.c.fg.tertiary : t.c.fg.primary }}>{value}</Text>
      <Text color="secondary" style={{ fontSize: 13, lineHeight: 17 }}>{word}</Text>
    </Pressable>
  );
}

/** The phone's date picker (a typed day on the web). */
function DayPicker({ value, title, onPick, onClose }: { value?: string; title: string; onPick: (day: string) => void; onClose: () => void }) {
  const t = useTheme();
  const [typed, setTyped] = useState(value ?? '');
  if (Platform.OS === 'web') {
    return (
      <Sheet visible onClose={onClose} title={title}>
        <TextField
          value={typed}
          placeholder="YYYY-MM-DD"
          onChange={(s) => {
            setTyped(s);
            if (/^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(s).getTime())) onPick(s);
          }}
        />
      </Sheet>
    );
  }
  return (
    <DateTimePicker
      value={value ? dayDate(value) : new Date()}
      mode="date"
      themeVariant={t.dark ? 'dark' : 'light'}
      accentColor={t.c.accent.mustard}
      onChange={(ev, d) => {
        onClose();
        if (ev.type === 'set' && d) onPick(ymd(d.getTime()));
      }}
    />
  );
}

/** Today + n as yyyy-MM-dd. */
const inDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return ymd(d.getTime());
};
const DUE_WORDS: Array<{ key: string; label: string; day: () => string }> = [
  { key: 'today', label: 'Today', day: () => inDays(0) },
  { key: 'tomorrow', label: 'Tomorrow', day: () => inDays(1) },
  { key: 'weekend', label: 'This weekend', day: () => inDays(new Date().getDay() === 0 ? 0 : 6 - new Date().getDay()) },
  { key: 'next', label: 'Next week', day: () => inDays((8 - new Date().getDay()) % 7 || 7) },
];

/** What saving does in both forms: create or update, link, then open the record (or go back from Edit). */
function useSave(type: string, { id, onSaved, linkTo }: RecordFormProps) {
  const os = useOS();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const close = () => (router.canGoBack() ? router.back() : router.replace(`/entity/${type}` as never));
  const save = (title: string, data: object, status: string | null) => {
    if (!title.trim()) return setError('It needs a name.');
    setError(null);
    try {
      // Edit merges, so an undefined clears a Field; New has nothing to clear.
      const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => id || v !== undefined));
      const saved: ObjectRecord = id ? os.records.update(id, { title: title.trim(), data: clean, status }) : os.records.create({ object: type, title: title.trim(), data: clean, status });
      if (linkTo && !id) os.links.link(saved.id, linkTo.id, linkTo.kind);
      if (onSaved) onSaved(saved);
      else if (id) close();
      else router.replace(`/entity/${type}/${saved.id}` as never);
    } catch (e) {
      setError(e instanceof ZodError ? (e.issues[0]?.message ?? 'Check this form.') : (e as Error).message);
    }
  };
  return { save, close, error };
}

/** The Status pills, on Edit only. */
function StatusPills({ statuses, value, onChange }: { statuses?: Array<{ value: string; label: string }>; value: string | null; onChange: (s: string) => void }) {
  return (
    <Group label="Status">
      <Wrap>{statuses?.map((s) => <Pill key={s.value} label={s.label} selected={value === s.value} onPress={() => onChange(s.value)} />)}</Wrap>
    </Group>
  );
}

export function TaskForm(props: RecordFormProps) {
  const { id, initial } = props;
  const os = useOS();
  const t = useTheme();
  const existing = useLive((o) => (id ? o.records.get<TaskData>(id) : undefined), [id]);
  const seed = { ...(existing?.data ?? {}), ...(initial ?? {}) } as Partial<TaskData>;
  const [title, setTitle] = useState(existing?.title ?? (initial?.title as string) ?? '');
  const [status, setStatus] = useState<string | null>(existing?.status ?? 'todo');
  const [due, setDue] = useState<string | undefined>(seed.dueDate?.slice(0, 10));
  const [dueKey, setDueKey] = useState<string>(() => (seed.dueDate ? (DUE_WORDS.find((w) => w.day() === seed.dueDate?.slice(0, 10))?.key ?? 'pick') : 'none'));
  const [repeat, setRepeat] = useState<string | undefined>(seed.repeat || undefined);
  const [priority, setPriority] = useState<TaskData['priority']>(seed.priority ?? 'medium');
  const [projectId, setProjectId] = useState<string | undefined>(seed.projectId);
  const [personIds, setPersonIds] = useState<string[]>(seed.personIds ?? []);
  const [estimate, setEstimate] = useState(seed.estimateMin ? String(seed.estimateMin) : '');
  const [notes, setNotes] = useState(seed.notes ?? '');
  const [sheet, setSheet] = useState<null | 'day' | 'project' | 'people'>(null);
  const { save, close, error } = useSave('task', props);

  const projects = useLive((o) => o.records.query<ProjectData>('project', { filter: { and: [{ field: 'status', op: 'neq', value: 'done' }] } }, { limit: 200 }).map((p) => ({ id: p.id, title: p.title, icon: 'folder' })), []);
  const people = useLive((o) => o.records.query('person', {}, { limit: 1000 }).map((p) => ({ id: p.id, title: p.title, icon: 'user' })), []);
  const project = useLive((o) => (projectId ? o.records.get(projectId) : null), [projectId]);
  const nameOf = (pid: string) => os.records.get(pid)?.title ?? '';

  const setDay = (key: string, day: string | undefined) => {
    setDueKey(key);
    setDue(day);
  };
  const submit = () => save(title, { dueDate: due, repeat: repeat ?? undefined, priority, projectId, personIds, estimateMin: estimate ? Number(estimate) : undefined, notes: notes.trim() || undefined }, status);
  const dotOf: Record<string, string> = { low: t.c.fg.tertiary, medium: blocks.sky, high: blocks.orange, urgent: t.c.alert.coralText };

  return (
    <Screen contentStyle={{ gap: 22 }}>
      <FormTop caption={project ? `In ${project.title}` : null} title={id ? 'Edit task' : 'New task'} onClose={close} onSave={submit} />
      <Group label="Title" gap={8}>
        <Input label="Title" value={title} onChange={setTitle} autoFocus={!id && !title} error={error} />
      </Group>

      {id ? <StatusPills statuses={taskType.statuses} value={status} onChange={setStatus} /> : null}

      <Group label="Due" hint={`${due ? `${format(dayDate(due), 'EEE d MMM')}. ` : ''}A due date puts it in Upkeep too.`}>
        <Wrap>
          {DUE_WORDS.map((w) => <Pill key={w.key} label={w.label} selected={dueKey === w.key} onPress={() => setDay(w.key, w.day())} />)}
          <Pill label="Pick a day" icon="calendar" selected={dueKey === 'pick'} onPress={() => setSheet('day')} />
          <Pill label="No date" dashed selected={dueKey === 'none'} onPress={() => setDay('none', undefined)} />
        </Wrap>
      </Group>

      <Group label="Repeats" hint="Done moves Due on; the task stays open.">
        <Wrap>
          <Pill label="Never" selected={!repeat} onPress={() => setRepeat(undefined)} />
          {REPEATS.map((r) => (
            <Pill
              key={r.value}
              label={r.label}
              selected={repeat === r.value}
              onPress={() => {
                setRepeat(r.value);
                // A repeat runs from a due date: without one it starts today.
                if (!due) setDay('today', inDays(0));
              }}
            />
          ))}
        </Wrap>
      </Group>

      <Group label="Priority">
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {PRIORITIES.map((p) => {
            const on = priority === p.value;
            return (
              <Pressable key={p.value} accessibilityRole="button" accessibilityLabel={p.label} accessibilityState={{ selected: on }} onPress={() => setPriority(p.value as TaskData['priority'])} style={({ pressed }) => ({ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 44, borderRadius: 999, backgroundColor: on ? t.c.fg.primary : t.c.bg.tileRaised, opacity: pressed ? 0.8 : 1 })}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dotOf[p.value] }} />
                <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 14, lineHeight: 18, fontWeight: '600', color: on ? t.c.bg.ground : t.c.fg.primary }}>{p.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </Group>

      <Group label="Project" gap={8}>
        <PickRow icon="folder" label="Project" value={project?.title ?? 'None'} word={project ? 'Change' : 'Choose'} muted={!project} onPress={() => setSheet('project')} />
        <Wrap>
          <Pill label="New project" icon="plus" dashed onPress={() => setSheet('project')} />
        </Wrap>
      </Group>

      <Group label="People" gap={8}>
        <Wrap>
          {personIds.map((pid) => (
            <View key={pid} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 40, paddingHorizontal: 6, borderRadius: 999, backgroundColor: t.c.bg.tileRaised }}>
              <Face ctx={os} id={pid} name={nameOf(pid)} />
              <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 14, lineHeight: 18, fontWeight: '600', color: t.c.fg.primary }}>{nameOf(pid)}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${nameOf(pid)}`} hitSlop={8} onPress={() => setPersonIds((x) => x.filter((p) => p !== pid))} style={{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="x" size={14} color={t.c.fg.secondary} />
              </Pressable>
            </View>
          ))}
          <Pill label="Add a person" icon="plus" dashed onPress={() => setSheet('people')} />
        </Wrap>
      </Group>

      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Group label="Estimate (minutes)" gap={8}>
            <Input label="Estimate in minutes" value={estimate} onChange={(s) => setEstimate(s.replace(/\D/g, ''))} placeholder="30" numeric />
          </Group>
        </View>
        <View style={{ flex: 1 }} />
      </View>

      <Group label="Notes" gap={8}>
        <Input label="Notes" value={notes} onChange={setNotes} placeholder="Anything to remember" multiline />
      </Group>

      {sheet === 'day' ? <DayPicker value={due} title="Due" onPick={(d) => { setDay('pick', d); if (Platform.OS === 'web') setSheet(null); }} onClose={() => setSheet(null)} /> : null}
      <PickerSheet
        visible={sheet === 'project'}
        onClose={() => setSheet(null)}
        title="Project"
        items={projects}
        selected={projectId ? [projectId] : []}
        onSelect={(pid) => {
          setProjectId(pid === projectId ? undefined : pid);
          setSheet(null);
        }}
        onCreate={(name) => {
          setProjectId(os.records.create({ object: 'project', title: name, data: {}, status: 'active' }).id);
          setSheet(null);
        }}
      />
      <PickerSheet visible={sheet === 'people'} onClose={() => setSheet(null)} title="People" items={people} selected={personIds} onSelect={(pid) => setPersonIds((x) => (x.includes(pid) ? x.filter((p) => p !== pid) : [...x, pid]))} />
    </Screen>
  );
}

const AREAS = projectType.fields.find((f) => f.key === 'area')?.options ?? [];

export function ProjectForm(props: RecordFormProps) {
  const { id, initial } = props;
  const existing = useLive((o) => (id ? o.records.get<ProjectData>(id) : undefined), [id]);
  const seed = { ...(existing?.data ?? {}), ...(initial ?? {}) } as Partial<ProjectData>;
  const [title, setTitle] = useState(existing?.title ?? (initial?.title as string) ?? '');
  const [status, setStatus] = useState<string | null>(existing?.status ?? 'active');
  const [aim, setAim] = useState(seed.description ?? '');
  const [target, setTarget] = useState<string | undefined>(seed.dueDate?.slice(0, 10));
  const [area, setArea] = useState<string | undefined>(seed.area);
  const [picking, setPicking] = useState(false);
  const { save, close, error } = useSave('project', props);
  const weeks = target ? differenceInCalendarWeeks(dayDate(target), new Date()) : 0;
  const word = !target ? 'Choose' : weeks > 1 ? `in ${weeks} weeks` : weeks < -1 ? `${-weeks} weeks ago` : 'Change';
  const submit = () => save(title, { description: aim.trim() || undefined, dueDate: target, area }, status);
  return (
    <Screen contentStyle={{ gap: 22 }}>
      <FormTop title={id ? 'Edit project' : 'New project'} onClose={close} onSave={submit} />
      <Group label="Name" gap={8}>
        <Input label="Name" value={title} onChange={setTitle} autoFocus={!id && !title} error={error} />
      </Group>
      {id ? <StatusPills statuses={projectType.statuses} value={status} onChange={setStatus} /> : null}
      <Group label="Aim" gap={8}>
        <Input label="Aim" value={aim} onChange={setAim} placeholder="What done looks like" multiline />
      </Group>
      <Group label="Target date" gap={8}>
        <PickRow icon="calendar" label="Target date" value={target ? format(dayDate(target), 'EEE d MMM yyyy') : 'None'} word={word} muted={!target} onPress={() => setPicking(true)} />
        {target ? (
          <Wrap>
            <Pill label="No date" dashed onPress={() => setTarget(undefined)} />
          </Wrap>
        ) : null}
      </Group>
      <Group label="Area">
        <Wrap>{AREAS.map((a) => <Pill key={a.value} label={a.label} selected={area === a.value} onPress={() => setArea(area === a.value ? undefined : a.value)} />)}</Wrap>
      </Group>
      <Text color="secondary" style={HINT}>Add tasks from the project page, or tell the Dump: “add water the pots to balcony garden”.</Text>
      {picking ? <DayPicker value={target} title="Target date" onPick={(d) => { setTarget(d); if (Platform.OS === 'web') setPicking(false); }} onClose={() => setPicking(false)} /> : null}
    </Screen>
  );
}
