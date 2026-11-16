import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTheme } from '@ui/theme/ThemeProvider';
import { useRouter } from 'expo-router';
import { activeHabits } from '@core/habits/habits';
import { knownApps, knownCalendars, ruleText, trackers, upsertTracker, type MetricRuleId, type Tracker, type TrackerRule } from '@core/activity/trackers';
import { CATEGORIES } from '@modules/finance/types';
import { useLive, useOS } from '@ui/hooks';
import { Button, ChipRow, FilterChip, Icon, IconButton, NumberField, Screen, Segmented, SwitchField, Text, TextField } from '@ui/kit';
import { TRACKER_TINTS, TrackerDisc, trackerColor } from './grid';
import { RULE_ICON } from './tracker';

type Kind = TrackerRule['kind'];
const KINDS: Array<{ value: Kind; label: string; icon: string }> = [
  { value: 'message', label: 'A text or email says…', icon: 'comment' },
  { value: 'payment', label: 'A payment', icon: 'wallet' },
  { value: 'record', label: 'A record', icon: 'file' },
  { value: 'metric', label: 'A health number', icon: 'activity' },
  { value: 'screen', label: 'Time in apps', icon: 'signal' },
  { value: 'calendar', label: 'A calendar event', icon: 'calendar' },
  { value: 'habit', label: 'A habit ticked', icon: 'flame' },
];
const ICONS = ['grid', 'briefcase', 'activity', 'shoe', 'food', 'wallet', 'book', 'moon', 'heart', 'cart', 'car', 'flame', 'phone', 'film', 'leaf', 'bolt'];
const words = (s: string) => s.split(/[,/]+/).map((w) => w.trim()).filter(Boolean);

const COLOR_NAMES: Record<string, string> = { tasks: 'Events', health: 'Body', finance: 'Money', people: 'People', memory: 'Notes', travel: 'Trips', upkeep: 'Things', documents: 'Places' };

/**
 * New tracker or edit one (the A3 artboard): a name, an icon, a colour, and
 * the rules (a day counts when any of them matches what LifeOS already
 * filed; nothing is typed in by hand). Save tracker.
 */
export function ActivityEdit({ params }: { params: Record<string, string> }) {
  const id = params.tracker;
  const os = useOS();
  const theme = useTheme();
  const router = useRouter();
  const existing = useLive((o) => (id ? (trackers(o).find((t) => t.id === id) ?? null) : null), [id]);
  const [t, setT] = useState<Tracker>(() => existing ?? { id: `t_${Date.now().toString(36)}`, name: '', icon: 'grid', tint: 'tasks', rules: [] });
  const [adding, setAdding] = useState<Kind | null>(null);
  const setRules = (rules: TrackerRule[]) => setT({ ...t, rules });
  const back = () => (router.canGoBack() ? router.back() : router.replace('/board/activity' as never));
  const save = () => {
    upsertTracker(os, { ...t, name: t.name.trim() || 'Tracker' });
    back();
  };
  const color = trackerColor(t.tint);
  const label = (text: string) => <Text style={{ fontSize: 13, lineHeight: 17, fontWeight: '600', color: theme.c.fg.secondary }}>{text}</Text>;
  const head = (title: string, meta?: string) => (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, paddingTop: 10, paddingHorizontal: 4 }}>
      <Text accessibilityRole="header" style={{ flex: 1, fontSize: 17, lineHeight: 22, fontWeight: '600', color: theme.c.fg.primary }}>{title}</Text>
      {meta ? <Text style={{ fontSize: 13, lineHeight: 17, color: theme.c.fg.secondary }}>{meta}</Text> : null}
    </View>
  );
  const ok = !!t.name.trim() && t.rules.length > 0;
  return (
    <Screen title={existing ? 'Edit tracker' : 'New tracker'} subtitle="Activity" right={<IconButton icon="x" accessibilityLabel="Close" filled onPress={back} />}>
      <TextField label="Name" value={t.name} onChange={(name) => setT({ ...t, name })} placeholder="Ordered food, Gym, Days in office…" autoFocus={!existing} />
      <View style={{ gap: 6 }}>
        {label('Icon')}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {ICONS.map((i) => (
            <Pressable key={i} accessibilityRole="radio" accessibilityState={{ selected: t.icon === i }} accessibilityLabel={`Icon ${i}`} onPress={() => setT({ ...t, icon: i })} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: t.icon === i ? theme.c.accent.mustard : theme.c.bg.tileRaised, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={i as never} size={18} color={t.icon === i ? theme.c.accent.mustardInk : theme.c.fg.secondary} />
            </Pressable>
          ))}
        </View>
      </View>
      <View style={{ gap: 8 }}>
        {label('Colour')}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {TRACKER_TINTS.map((c) => (
            <Pressable key={c} accessibilityRole="radio" accessibilityState={{ selected: t.tint === c }} accessibilityLabel={`Colour ${COLOR_NAMES[c] ?? c}`} onPress={() => setT({ ...t, tint: c })} style={{ width: 40, height: 40, borderRadius: 20, borderWidth: t.tint === c ? 2 : 0, borderColor: theme.c.fg.primary, alignItems: 'center', justifyContent: 'center' }}>
              <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: trackerColor(c) }} />
            </Pressable>
          ))}
        </View>
      </View>

      {head('A day counts when any of these happen', t.rules.length ? `${t.rules.length} rule${t.rules.length === 1 ? '' : 's'}` : undefined)}
      <View style={{ padding: 16, borderRadius: 28, backgroundColor: theme.c.bg.tile, gap: 4 }}>
        {t.rules.length ? (
          t.rules.map((r, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, borderTopWidth: i ? 1 : 0, borderTopColor: 'rgba(255,255,255,0.08)' }}>
              <TrackerDisc icon={RULE_ICON[r.kind]} color={color} />
              <Text style={{ flex: 1, fontSize: 14, lineHeight: 19, fontWeight: '600', color: theme.c.fg.primary }}>{ruleText(r, os)}</Text>
              <IconButton icon="trash" size={36} accessibilityLabel="Remove rule" onPress={() => setRules(t.rules.filter((_, k) => k !== i))} />
            </View>
          ))
        ) : (
          <Text style={{ fontSize: 13, lineHeight: 17, color: theme.c.fg.secondary }}>No rules yet. Add one below.</Text>
        )}
      </View>

      {head('Add a rule')}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {KINDS.map((k) => {
          const on = adding === k.value;
          return (
            <Pressable key={k.value} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => setAdding(on ? null : k.value)} style={{ height: 34, paddingHorizontal: 12, borderRadius: 999, backgroundColor: on ? theme.c.accent.mustard : theme.c.bg.tileRaised, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Icon name={k.icon as never} size={14} color={on ? theme.c.accent.mustardInk : theme.c.fg.secondary} />
              <Text style={{ fontSize: 13, lineHeight: 17, fontWeight: '700', color: on ? theme.c.accent.mustardInk : theme.c.fg.secondary }}>{k.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {adding ? (
        <View style={{ padding: 16, borderRadius: 28, backgroundColor: theme.c.bg.tile }}>
          <RuleForm
            kind={adding}
            onAdd={(r) => {
              setRules([...t.rules, r]);
              setAdding(null);
            }}
          />
        </View>
      ) : null}
      <Text style={{ fontSize: 13, lineHeight: 17, color: theme.c.fg.secondary }}>Nothing is typed in by hand: a day counts from what LifeOS already filed.</Text>
      <Pressable disabled={!ok} onPress={save} accessibilityRole="button" accessibilityState={{ disabled: !ok }} style={{ height: 52, borderRadius: 999, backgroundColor: theme.c.accent.mustard, opacity: ok ? 1 : 0.4, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <Icon name="check" size={18} color={theme.c.accent.mustardInk} />
        <Text style={{ fontSize: 16, lineHeight: 21, fontWeight: '700', color: theme.c.accent.mustardInk }}>Save tracker</Text>
      </Pressable>
    </Screen>
  );
}

/** The fields for one kind of rule. */
function RuleForm({ kind, onAdd }: { kind: Kind; onAdd: (r: TrackerRule) => void }) {
  const os = useOS();
  const [text, setText] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [dir, setDir] = useState<'spent' | 'received' | 'any'>('spent');
  const [type, setType] = useState<string | null>(null);
  const [metric, setMetric] = useState<MetricRuleId>('steps');
  const [useGoal, setUseGoal] = useState(true);
  const [min, setMin] = useState<number | undefined>(undefined);
  const [apps, setApps] = useState<string[]>([]);
  const [minutes, setMinutes] = useState<number | undefined>(30);
  const [cals, setCals] = useState<string[]>([]);
  const [habitId, setHabitId] = useState<string | null>(null);
  const appList = useLive((o) => knownApps(o), []);
  const calList = useLive((o) => knownCalendars(o), []);
  const habits = useLive((o) => activeHabits(o), []);
  const types = [...os.registry.objects.values()].filter((d) => !d.hidden);
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  switch (kind) {
    case 'message':
      return (
        <View style={{ gap: 10 }}>
          <TextField label="Words (any of them)" value={text} onChange={setText} placeholder="zomato, swiggy" autoCapitalize="none" hint="Matches the sender or the text of any SMS, payment-app notification or email." />
          <Button title="Add rule" icon="plus" size="sm" disabled={!words(text).length} onPress={() => onAdd({ kind: 'message', words: words(text) })} />
        </View>
      );
    case 'payment':
      return (
        <View style={{ gap: 10 }}>
          <TextField label="Mentioning (optional)" value={text} onChange={setText} placeholder="zomato, swiggy" autoCapitalize="none" />
          <Text variant="label" color="secondary">In category (optional)</Text>
          <ChipRow>
            {CATEGORIES.map((c) => (
              <FilterChip key={c.value} label={c.label} selected={category === c.value} onPress={() => setCategory(category === c.value ? null : c.value)} />
            ))}
          </ChipRow>
          <Segmented<'spent' | 'received' | 'any'> options={[{ value: 'spent', label: 'Money out' }, { value: 'received', label: 'Money in' }, { value: 'any', label: 'Either' }]} value={dir} onChange={setDir} />
          <Button title="Add rule" icon="plus" size="sm" disabled={!words(text).length && !category} onPress={() => onAdd({ kind: 'payment', words: words(text), category, direction: dir })} />
        </View>
      );
    case 'record':
      return (
        <View style={{ gap: 10 }}>
          <ChipRow>
            {types.map((d) => (
              <FilterChip key={d.id} label={d.label} icon={d.icon} selected={type === d.id} onPress={() => setType(d.id)} />
            ))}
          </ChipRow>
          <Button title="Add rule" icon="plus" size="sm" disabled={!type} onPress={() => onAdd({ kind: 'record', type: type! })} />
        </View>
      );
    case 'metric':
      return (
        <View style={{ gap: 10 }}>
          <Segmented<MetricRuleId> options={[{ value: 'steps', label: 'Steps' }, { value: 'sleep', label: 'Sleep' }, { value: 'resting_hr', label: 'Rest. HR' }, { value: 'weight', label: 'Weight' }]} value={metric} onChange={setMetric} />
          {metric === 'steps' || metric === 'sleep' ? <SwitchField label="When I reach my goal" hint="Follows your goal as it changes." value={useGoal} onChange={setUseGoal} /> : null}
          {!(useGoal && (metric === 'steps' || metric === 'sleep')) ? <NumberField label={metric === 'sleep' ? 'At least (hours)' : 'At least'} value={min} onChange={setMin} /> : null}
          <Button
            title="Add rule"
            icon="plus"
            size="sm"
            disabled={!(useGoal && (metric === 'steps' || metric === 'sleep')) && min == null}
            onPress={() => onAdd(useGoal && (metric === 'steps' || metric === 'sleep') ? { kind: 'metric', metric, goal: true } : { kind: 'metric', metric, min: min ?? 0 })}
          />
        </View>
      );
    case 'screen':
      return (
        <View style={{ gap: 10 }}>
          {appList.length ? (
            <>
              <Text variant="label" color="secondary">Apps (from your screen time)</Text>
              <ChipRow>
                {appList.slice(0, 30).map((a) => (
                  <FilterChip key={a.package} label={a.label} selected={apps.includes(a.label.toLowerCase())} onPress={() => setApps(toggle(apps, a.label.toLowerCase()))} />
                ))}
              </ChipRow>
            </>
          ) : null}
          <TextField label="Or app names" value={text} onChange={setText} placeholder="slack, teams, zoom" autoCapitalize="none" />
          <NumberField label="At least (minutes a day, together)" value={minutes} onChange={setMinutes} />
          <Button title="Add rule" icon="plus" size="sm" disabled={!(apps.length || words(text).length) || !minutes} onPress={() => onAdd({ kind: 'screen', apps: [...apps, ...words(text).map((w) => w.toLowerCase())], minutes: minutes ?? 30 })} />
        </View>
      );
    case 'calendar':
      return (
        <View style={{ gap: 10 }}>
          {calList.length ? (
            <>
              <Text variant="label" color="secondary">On these calendars</Text>
              <ChipRow>
                {calList.map((c) => (
                  <FilterChip key={c} label={c} selected={cals.includes(c)} onPress={() => setCals(toggle(cals, c))} />
                ))}
              </ChipRow>
            </>
          ) : (
            <Text variant="caption" color="secondary">Calendars appear here after the next calendar sync.</Text>
          )}
          <TextField label="Or with these words in the title" value={text} onChange={setText} placeholder="standup, office, client" autoCapitalize="none" />
          <Button title="Add rule" icon="plus" size="sm" disabled={!cals.length && !words(text).length} onPress={() => onAdd({ kind: 'calendar', calendars: cals, words: words(text) })} />
        </View>
      );
    case 'habit':
      return (
        <View style={{ gap: 10 }}>
          {habits.length ? (
            <ChipRow>
              {habits.map((h) => (
                <FilterChip key={h.id} label={h.title} selected={habitId === h.id} onPress={() => setHabitId(h.id)} />
              ))}
            </ChipRow>
          ) : (
            <Text variant="caption" color="secondary">No habits yet.</Text>
          )}
          <Button title="Add rule" icon="plus" size="sm" disabled={!habitId} onPress={() => onAdd({ kind: 'habit', habitId: habitId! })} />
        </View>
      );
  }
}
