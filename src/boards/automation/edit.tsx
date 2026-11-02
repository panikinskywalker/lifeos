import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import type { LifeOSContext } from '@core/registry/context';
import type { Field, FilterClause } from '@core/domain/types';
import type { RuleStep, RuleTrigger } from '@core/automation/engine';
import { FieldInput } from '@ui/components/fields';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Button, Card, IconButton, Screen, Section, SelectField, Text, TextField } from '@ui/kit';
import { route } from './parts';

const OPS = [
  { value: 'eq', label: 'is' }, { value: 'neq', label: 'is not' }, { value: 'gt', label: 'more than' }, { value: 'gte', label: 'at least' },
  { value: 'lt', label: 'less than' }, { value: 'lte', label: 'at most' }, { value: 'contains', label: 'contains' }, { value: 'isNull', label: 'is empty' }, { value: 'notNull', label: 'is not empty' },
];
const nextKey = (steps: RuleStep[]) => {
  for (let n = steps.length + 1; ; n++) if (!steps.some((s) => s.key === `s${n}`)) return `s${n}`;
};
const asNumber = (v: string) => (v.trim() !== '' && !Number.isNaN(Number(v)) ? Number(v) : v);

/**
 * New or edit (?rule=<id>, or ?template=<id> to start from one). When, Only
 * if, Steps in order (move, remove; each lists what earlier steps hand on as
 * {{steps.s1.title}}), Save. A first pass from the kit until
 * NR-Automations-Edit.
 */
export function EditRule({ ctx, params }: { ctx: LifeOSContext; params: Record<string, string> }) {
  const router = useRouter();
  const t = useTheme();
  const existing = params.rule ? ctx.automation.rules.get(params.rule) : undefined;
  const template = params.template ? ctx.registry.templates.get(params.template) : undefined;
  const [name, setName] = useState(existing?.name ?? template?.name ?? '');
  const [trigger, setTrigger] = useState<RuleTrigger>(existing?.trigger ?? template?.trigger ?? { id: 'core.manual', config: {} });
  const [conditions, setConditions] = useState<FilterClause[]>(existing?.conditions ?? template?.conditions ?? []);
  const [steps, setSteps] = useState<RuleStep[]>(existing?.steps ?? (template?.steps ?? []).map((s, i) => ({ key: `s${i + 1}`, ...s })));
  const triggers = useMemo(() => [...ctx.registry.triggers.values()], [ctx]);
  const actions = useMemo(() => [...ctx.registry.actions.values()], [ctx]);
  const objects = useMemo(() => [...ctx.registry.objects.values()].filter((x) => !x.hidden).map((x) => ({ value: x.id, label: x.label })), [ctx]);
  const withObjects = (f: Field): Field => (f.key === 'entityType' ? { ...f, type: 'select', options: objects } : f);
  const trigDef = ctx.registry.triggers.get(trigger.id);
  const back = () => (router.canGoBack() ? router.back() : router.replace(route('index')));

  const setStep = (i: number, patch: Partial<RuleStep>) => setSteps((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const move = (i: number, by: number) => setSteps((xs) => {
    const j = i + by;
    if (j < 0 || j >= xs.length) return xs;
    const next = [...xs];
    [next[i], next[j]] = [next[j]!, next[i]!];
    return next;
  });
  const add = (action: string | undefined) => {
    const def = action ? ctx.registry.actions.get(action) : undefined;
    if (!def) return;
    const config = Object.fromEntries((def.configFields ?? []).filter((f) => f.default !== undefined).map((f) => [f.key, f.default]));
    setSteps((xs) => [...xs, { key: nextKey(xs), action: def.id, config }]);
  };
  const ok = !!name.trim() && steps.length > 0;
  const save = () => {
    if (!ok) return;
    const r = ctx.automation.rules.save({ id: existing?.id, name: name.trim(), enabled: existing?.enabled ?? true, trigger, conditions, steps });
    router.replace(route('rule', { rule: r.id }));
  };
  const remove = () => {
    if (!existing) return;
    ctx.automation.rules.remove(existing.id);
    router.replace(route('index'));
  };

  return (
    <Screen title={existing ? 'Edit automation' : 'New automation'} subtitle={template && !existing ? `From the template · ${template.name}` : undefined} onBack={back} contentStyle={{ gap: 14 }}>
      <TextField label="Name" required value={name} onChange={setName} placeholder="Month close" />
      {template && !existing ? <Text style={{ fontSize: 13, lineHeight: 18, color: t.c.fg.secondary, paddingHorizontal: 4 }}>{template.description}</Text> : null}

      <Section title="When">
        <Card style={{ gap: 12 }}>
          <SelectField label="Trigger" options={triggers.map((x) => ({ value: x.id, label: x.label }))} value={trigger.id} onChange={(v) => v && setTrigger({ id: v, config: {} })} />
          {trigDef?.description ? <Text style={{ fontSize: 12, lineHeight: 17, color: t.c.fg.tertiary }}>{trigDef.description}</Text> : null}
          {trigDef?.configFields?.map((f) => <FieldInput key={f.key} field={withObjects(f)} value={trigger.config[f.key]} onChange={(v) => setTrigger({ ...trigger, config: { ...trigger.config, [f.key]: v } })} />)}
        </Card>
      </Section>

      <Section title="Only if" meta="all must hold" action="Add" onAction={() => setConditions([...conditions, { field: 'data.amount', op: 'gt', value: 0 }])}>
        {conditions.length ? (
          conditions.map((c, i) => (
            <Card key={i} style={{ gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <TextField label="Field" value={c.field} onChange={(v) => setConditions(conditions.map((x, j) => (j === i ? { ...x, field: v } : x)))} placeholder="data.amount" autoCapitalize="none" />
                </View>
                <IconButton icon="trash" accessibilityLabel="Remove condition" onPress={() => setConditions(conditions.filter((_, j) => j !== i))} />
              </View>
              <SelectField label="Is" options={OPS} value={c.op} onChange={(v) => setConditions(conditions.map((x, j) => (j === i ? { ...x, op: (v ?? 'eq') as FilterClause['op'] } : x)))} />
              {c.op === 'isNull' || c.op === 'notNull' ? null : <TextField label="Value" value={c.value == null ? '' : String(c.value)} onChange={(v) => setConditions(conditions.map((x, j) => (j === i ? { ...x, value: asNumber(v) } : x)))} placeholder="10000" />}
            </Card>
          ))
        ) : (
          <Text style={{ fontSize: 13, lineHeight: 18, color: t.c.fg.secondary, paddingHorizontal: 4 }}>Runs every time. Fields: title, status, data.&lt;field&gt;, vars.&lt;name&gt;.</Text>
        )}
      </Section>

      <Section title="Steps" meta="in order">
        {steps.map((s, i) => {
          const def = ctx.registry.actions.get(s.action);
          const earlier = steps.slice(0, i).flatMap((p) => (ctx.registry.actions.get(p.action)?.outputs ?? []).map((o) => `{{steps.${p.key}.${o}}}`));
          return (
            <Card key={s.key} style={{ gap: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={{ flex: 1, fontSize: 15, fontWeight: '700', color: t.c.fg.primary }}>{i + 1}. {def?.label ?? s.action}<Text style={{ fontSize: 12, fontWeight: '400', color: t.c.fg.tertiary }}>  {s.key}</Text></Text>
                <IconButton icon="arrow-up" size={36} accessibilityLabel="Move up" disabled={i === 0} onPress={() => move(i, -1)} />
                <IconButton icon="chevron-down" size={36} accessibilityLabel="Move down" disabled={i === steps.length - 1} onPress={() => move(i, 1)} />
                <IconButton icon="trash" size={36} accessibilityLabel="Remove step" onPress={() => setSteps(steps.filter((_, j) => j !== i))} />
              </View>
              {def?.description ? <Text style={{ fontSize: 12, lineHeight: 17, color: t.c.fg.tertiary }}>{def.description}</Text> : null}
              {def?.configFields?.map((f) => <FieldInput key={f.key} field={withObjects(f)} value={s.config[f.key]} onChange={(v) => setStep(i, { config: { ...s.config, [f.key]: v } })} />)}
              {earlier.length ? <Text style={{ fontSize: 12, lineHeight: 17, color: t.c.fg.tertiary }}>From earlier steps: {earlier.join('  ')}</Text> : null}
            </Card>
          );
        })}
        <SelectField label={steps.length ? 'Add a step' : 'First step'} options={actions.map((a) => ({ value: a.id, label: a.label }))} value={undefined} onChange={add} />
      </Section>

      <Button title={existing ? 'Save' : 'Create automation'} block disabled={!ok} onPress={save} />
      {existing ? <Button title="Delete automation" variant="destructive" block onPress={remove} /> : null}
      <Text style={{ fontSize: 12, lineHeight: 17, color: t.c.fg.tertiary, paddingHorizontal: 4 }}>Text settings fill in {'{{title}}'}, {'{{data.amount}}'} from the record that started it, and {'{{steps.s1.title}}'} from a step before.</Text>
      <View style={{ height: 8 }} />
    </Screen>
  );
}

