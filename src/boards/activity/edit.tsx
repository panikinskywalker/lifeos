import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTheme } from '@ui/theme/ThemeProvider';
import type { TintKey } from '@ui/theme/tokens';
import { useRouter } from 'expo-router';
import { activeHabits } from '@core/habits/habits';
import { knownApps, knownCalendars, ruleText, trackers, upsertTracker, type MetricRuleId, type Tracker, type TrackerRule } from '@core/activity/trackers';
import { CATEGORIES } from '@modules/finance/types';
import { useLive, useOS } from '@ui/hooks';
import { Button, ChipRow, FilterChip, IconButton, NumberField, RowItem, RowList, Screen, Section, Segmented, SwitchField, Text, TextField } from '@ui/kit';

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
const TINTS = ['tasks', 'health', 'finance', 'people', 'memory', 'travel', 'upkeep', 'documents'];
const words = (s: string) => s.split(/[,/]+/).map((w) => w.trim()).filter(Boolean);

/** New tracker or edit one: a name, an icon, and the rules: a day counts when any of them matches. */
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
  return (
    <Screen title={existing ? 'Edit tracker' : 'New tracker'} onBack={back}>
      <TextField label="Name" value={t.name} onChange={(name) => setT({ ...t, name })} placeholder="Ordered food, Gym, Days in office…" autoFocus={!existing} />
      <Text variant="label" color="secondary">Icon</Text>
      <ChipRow>
        {ICONS.map((i) => (
          <FilterChip key={i} label="" icon={i} selected={t.icon === i} onPress={() => setT({ ...t, icon: i })} />
        ))}
      </ChipRow>
      <Text variant="label" color="secondary">Colour</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {TINTS.map((c) => (
          <Pressable key={c} accessibilityRole="radio" accessibilityState={{ selected: t.tint === c }} accessibilityLabel={`Colour ${c}`} onPress={() => setT({ ...t, tint: c })} style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: theme.tints[c as TintKey].ink, borderWidth: t.tint === c ? 3 : 0, borderColor: theme.c.fg.primary }} />
        ))}
      </View>

      <Section title="A day counts when any of these happen">
        {t.rules.length ? (
          <RowList>
            {t.rules.map((r, i) => (
              <RowItem key={i} title={ruleText(r, os)} chevron={false} trailing={<IconButton icon="trash" size={34} accessibilityLabel="Remove rule" onPress={() => setRules(t.rules.filter((_, k) => k !== i))} />} />
            ))}
          </RowList>
        ) : (
          <Text variant="caption" color="secondary">No rules yet. Add one below.</Text>
        )}
      </Section>

      <Section title="Add a rule">
        <ChipRow>
          {KINDS.map((k) => (
            <FilterChip key={k.value} label={k.label} icon={k.icon} selected={adding === k.value} onPress={() => setAdding(adding === k.value ? null : k.value)} />
          ))}
        </ChipRow>
        {adding ? (
          <RuleForm
            kind={adding}
            onAdd={(r) => {
              setRules([...t.rules, r]);
              setAdding(null);
            }}
          />
        ) : null}
      </Section>
      <Button title="Save tracker" icon="check" disabled={!t.name.trim() || !t.rules.length} onPress={save} />
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
