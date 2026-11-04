import React, { useMemo, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { LifeOSContext } from '@core/registry/context';
import type { Field, FilterClause } from '@core/domain/types';
import { evaluateCondition } from '@core/automation/conditions';
import { describeRRule } from '@core/automation/recurrence';
import type { RuleStep, RuleTrigger } from '@core/automation/engine';
import { FieldInput } from '@ui/components/fields';
import { useTheme } from '@ui/theme/ThemeProvider';
import { fontForWeight } from '@ui/theme/tokens';
import { ActionSheet, Icon, IconButton, PickerSheet, Screen, Text, type PickerItem } from '@ui/kit';
import { Caps, Disc, Dot, Grip, LILAC, Mono, Pill, Sub, TRIGGER_COPY, TokenText, TopBar, confirmDelete, moduleWord, plural, route, shortAt, stepName, tokenLabel, triggerIcon, triggerLabel, triggerModule, triggerObject, useModuleColor, useRunToast } from './parts';
import { TriggerPicker } from './trigger';

const OPS = [
  { id: 'eq', title: 'is' }, { id: 'neq', title: 'is not' }, { id: 'gt', title: 'is more than' }, { id: 'gte', title: 'is at least' },
  { id: 'lt', title: 'is less than' }, { id: 'lte', title: 'is at most' }, { id: 'contains', title: 'contains' }, { id: 'isNull', title: 'is empty' }, { id: 'notNull', title: 'is not empty' },
];
const REPEAT = [{ value: '', label: 'Once' }, ...['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].map((f) => ({ value: `FREQ=${f};INTERVAL=1`, label: describeRRule(`FREQ=${f};INTERVAL=1`) }))];
/** The builder's shorter words for settings, and the reminder's order (the artboard pairs Due in and Repeat). */
const LABELS: Record<string, string> = { inDays: 'Due in (days)', rrule: 'Repeat', atField: 'Or from a date field', offsetDays: 'Days before it' };
const ORDER: Record<string, string[]> = { 'core.createReminder': ['title', 'inDays', 'rrule', 'atField', 'offsetDays'] };
/** Settings that name a thing rather than say words: no {{values}} in them. */
const NOT_WORDS = ['field', 'atField', 'linkKind', 'phrase', 'time', 'toStatus'];
/** What a step acts on, on the right of its card. */
const SCOPE: Record<string, string> = { 'core.addTag': 'Any record', 'core.addComment': 'Any record', 'core.setStatus': 'Any record', 'core.star': 'Any record', 'core.createReminder': 'One-off Cycle' };

const nextKey = (steps: RuleStep[]) => {
  for (let n = steps.length + 1; ; n++) if (!steps.some((s) => s.key === `s${n}`)) return `s${n}`;
};
const asNumber = (v: string) => (v.trim() !== '' && !Number.isNaN(Number(v)) ? Number(v) : v);
const isWords = (f: Field) => (f.type === 'text' || f.type === 'longtext') && !NOT_WORDS.includes(f.key);
const isHalf = (f: Field) => f.type === 'number' || f.key === 'rrule' || f.key === 'atField';
/** Short settings sit two to a row. */
function rowsOf(fields: Field[]) {
  const rows: Field[][] = [];
  for (const f of fields) {
    const last = rows[rows.length - 1];
    if (isHalf(f) && last?.length === 1 && isHalf(last[0]!)) last.push(f);
    else rows.push([f]);
  }
  return rows;
}

/** The most recent record this rule would have fired on, with the context a real run would get. */
function lastMatch(ctx: LifeOSContext, trigger: RuleTrigger, conditions: FilterClause[]) {
  const object = triggerObject(ctx, trigger);
  const def = ctx.registry.triggers.get(trigger.id);
  if (!object || !def || trigger.id === 'core.entity.deleted') return null;
  for (const entity of ctx.records.query(object, { sort: [{ field: 'createdAt', dir: 'desc' }] }, { limit: 30 })) {
    const run = def.toContext({ entity, previous: entity, changed: [], from: null, to: entity.status } as never);
    if (run && conditions.every((c) => evaluateCondition(c, run))) return { entity, run };
  }
  return null;
}

/**
 * The builder (?rule=<id>, or ?template=<id> to start from one;
 * NR-Automations-Builder): name, When, If, Then, the values a step can use,
 * Try it, Save. What Then offers is the actions that exist: core's, then the
 * modules'.
 */
export function EditRule({ ctx, params }: { ctx: LifeOSContext; params: Record<string, string> }) {
  const router = useRouter();
  const t = useTheme();
  const color = useModuleColor();
  const report = useRunToast(ctx);
  const existing = params.rule ? ctx.automation.rules.get(params.rule) : undefined;
  const template = params.template ? ctx.registry.templates.get(params.template) : undefined;
  const [name, setName] = useState(existing?.name ?? template?.name ?? '');
  const [trigger, setTrigger] = useState<RuleTrigger>(existing?.trigger ?? template?.trigger ?? { id: 'core.manual', config: {} });
  const [conditions, setConditions] = useState<FilterClause[]>(existing?.conditions ?? template?.conditions ?? []);
  const [steps, setSteps] = useState<RuleStep[]>(existing?.steps ?? (template?.steps ?? []).map((s, i) => ({ key: `s${i + 1}`, ...s })));
  const [picking, setPicking] = useState(false);
  const [menu, setMenu] = useState<number | null>(null);
  const [into, setInto] = useState<{ step: number; key: string } | null>(null);

  const actions = useMemo(() => [...ctx.registry.actions.values()], [ctx]);
  const objects = useMemo(() => [...ctx.registry.objects.values()].filter((x) => !x.hidden).map((x) => ({ value: x.id, label: x.label })), [ctx]);
  const tune = (f: Field): Field => {
    if (f.key === 'entityType') return { ...f, type: 'select', options: objects };
    if (f.key === 'rrule') return { ...f, label: 'Repeat', type: 'select', options: REPEAT };
    return LABELS[f.key] ? { ...f, label: LABELS[f.key]! } : f;
  };
  const fieldsOf = (action: string) => {
    const fields = (ctx.registry.actions.get(action)?.configFields ?? []).map(tune);
    const order = ORDER[action];
    return order ? [...fields].sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key)) : fields;
  };

  const trigDef = ctx.registry.triggers.get(trigger.id);
  const object = triggerObject(ctx, trigger);
  const objDef = object ? ctx.registry.objects.get(object) : undefined;
  const module = triggerModule(ctx, trigger);
  const back = () => (router.canGoBack() ? router.back() : router.replace(route('index')));

  const setStep = (i: number, patch: Partial<RuleStep>) => setSteps((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const move = (i: number, by: number) => {
    setInto(null);
    setSteps((xs) => {
      const j = i + by;
      if (j < 0 || j >= xs.length) return xs;
      const next = [...xs];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });
  };
  const add = (action: string) => {
    const def = ctx.registry.actions.get(action);
    if (!def) return;
    const config = Object.fromEntries((def.configFields ?? []).filter((f) => f.default !== undefined).map((f) => [f.key, f.default]));
    setInto(null);
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
    confirmDelete(existing.name, () => {
      ctx.automation.rules.remove(existing.id);
      router.replace(route('index'));
    });
  };

  // Values: where a tap inserts (the field you last tapped, else the last step's first words) and what that step can read.
  const lastWords = steps.length ? fieldsOf(steps[steps.length - 1]!.action).find(isWords) : undefined;
  const dest = into ?? (lastWords ? { step: steps.length - 1, key: lastWords.key } : null);
  const fromTrigger = objDef ? ['title', ...objDef.fields.slice(0, 7).map((f) => `data.${f.key}`)] : [];
  const fromSteps = dest ? steps.slice(0, dest.step).flatMap((s) => (ctx.registry.actions.get(s.action)?.outputs ?? []).filter((o) => o !== 'id').map((o) => `steps.${s.key}.${o}`)) : [];
  const insert = (path: string) => {
    if (!dest) return;
    const old = String(steps[dest.step]?.config[dest.key] ?? '');
    setStep(dest.step, { config: { ...steps[dest.step]!.config, [dest.key]: `${old}${old && !/\s$/.test(old) ? ' ' : ''}{{${path}}}` } });
  };

  const match = useMemo(() => (existing ? lastMatch(ctx, trigger, conditions) : null), [ctx, existing?.id, trigger, conditions]);
  const tryIt = async () => {
    if (!existing || !match) return;
    report(name.trim() || existing.name, await ctx.automation.execute({ ...existing, name: name.trim() || existing.name, trigger, conditions, steps }, match.run));
  };
  const coreActions = actions.filter((a) => a.module === 'core');
  const moduleActions = actions.filter((a) => a.module !== 'core');
  const open = menu != null ? steps[menu] : undefined;

  return (
    <Screen contentStyle={{ gap: 20 }}>
      <TopBar caption="When · If · Then" title={existing ? 'Edit automation' : 'New automation'} onBack={back} close />

      <View style={{ gap: 6 }}>
        <Caps style={{ paddingHorizontal: 4 }}>Name</Caps>
        <TextInput value={name} onChangeText={setName} placeholder="Month close" placeholderTextColor={t.c.fg.tertiary} accessibilityLabel="Name" style={{ height: 56, paddingHorizontal: 18, borderRadius: 16, borderWidth: 1, borderColor: t.c.line, backgroundColor: t.c.bg.tileRaised, color: t.c.fg.primary, fontSize: 20, fontFamily: fontForWeight(600) }} />
        {template && !existing ? <View style={{ paddingHorizontal: 4, paddingTop: 2 }}><Sub lines={4}>{template.description}</Sub></View> : null}
      </View>

      <Part icon="bolt" lime title="When" meta="One trigger">
        <Pressable accessibilityRole="button" accessibilityLabel={`Change trigger: ${triggerLabel(ctx, trigger)}`} onPress={() => setPicking(true)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 16, backgroundColor: t.c.bg.tileRaised, minHeight: 64, opacity: pressed ? 0.8 : 1 })}>
          <Disc icon={triggerIcon(ctx, trigger)} color={module === 'core' ? t.c.fg.primary : color(module)} bg={t.c.bg.ground} />
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text numberOfLines={1} style={{ fontSize: 16, lineHeight: 21, fontWeight: '600' }}>{triggerLabel(ctx, trigger)}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {module !== 'core' ? <Dot color={color(module)} /> : null}
              <View style={{ flex: 1, minWidth: 0 }}><Sub lines={2}>{[module !== 'core' ? moduleWord(ctx, module) : null, TRIGGER_COPY[trigger.id]?.line ?? trigDef?.description].filter(Boolean).join(' · ')}</Sub></View>
            </View>
          </View>
          <Text style={{ fontSize: 13, fontWeight: '600', color: t.c.accent.gold }}>Change</Text>
        </Pressable>
        {trigDef?.configFields?.map((f) => <Setting key={f.key} field={tune(f)} value={trigger.config[f.key]} onChange={(v) => setTrigger({ ...trigger, config: { ...trigger.config, [f.key]: v } })} steps={steps} />)}
      </Part>

      <Part icon="filter" title="If" meta={conditions.length ? 'All must be true' : 'Runs every time'}>
        {conditions.map((c, i) => (
          <View key={i} style={{ gap: 14 }}>
            {i ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 }}>
                <View style={{ height: 1, flex: 1, backgroundColor: t.c.line }} />
                <Caps>And</Caps>
                <View style={{ height: 1, flex: 1, backgroundColor: t.c.line }} />
              </View>
            ) : null}
            <Condition ctx={ctx} object={object} value={c} onChange={(next) => setConditions(conditions.map((x, j) => (j === i ? next : x)))} onRemove={() => setConditions(conditions.filter((_, j) => j !== i))} />
          </View>
        ))}
        <View style={{ alignSelf: 'flex-start' }}>
          <Pill title="Add a condition" icon="plus" iconColor={t.c.accent.gold} height={44} size={14} onPress={() => setConditions([...conditions, { field: objDef?.fields[0] ? `data.${objDef.fields[0].key}` : 'title', op: 'eq', value: '' }])} />
        </View>
        <Text style={{ fontSize: 12, lineHeight: 16, color: t.c.fg.secondary, paddingHorizontal: 4 }}>
          {objDef ? `Fields of a ${objDef.label}: ${objDef.fields.slice(0, 6).map((f) => f.label.toLowerCase()).join(', ')}.` : 'Fields: title, status, data.<field>, vars.<name>.'}
        </Text>
      </Part>

      <Part icon="chevron-right" title="Then" meta={steps.length ? `${plural(steps.length, 'step')}, in order` : 'No steps yet'}>
        {steps.map((s, i) => {
          const def = ctx.registry.actions.get(s.action);
          const fields = fieldsOf(s.action);
          const gives = (def?.outputs ?? []).filter((o) => o !== 'id');
          const set = (f: Field, v: unknown) => setStep(i, { config: { ...s.config, [f.key]: v } });
          return (
            <View key={s.key} style={{ gap: 12, padding: 14, borderRadius: 16, backgroundColor: t.c.bg.tileRaised }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Grip />
                <Mono size={10} style={{ letterSpacing: 0.6 }}>{String(i + 1).padStart(2, '0')}</Mono>
                <Text numberOfLines={1} style={{ flex: 1, fontSize: 15, fontWeight: '600' }}>{stepName(ctx, s.action)}</Text>
                {s.action === 'core.askModel' ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Icon name="sparkle" size={12} color={LILAC} />
                    <Text style={{ fontSize: 12, color: LILAC }}>Claude</Text>
                  </View>
                ) : (
                  <Text numberOfLines={1} style={{ fontSize: 12, color: t.c.fg.secondary }}>{SCOPE[s.action] ?? (def?.module && def.module !== 'core' ? moduleWord(ctx, def.module) : '')}</Text>
                )}
                <IconButton icon="more" accessibilityLabel={`Step ${i + 1} options`} color={t.c.fg.secondary} style={{ margin: -10 }} onPress={() => setMenu(i)} />
              </View>
              {rowsOf(fields).map((row) =>
                row.length === 2 ? (
                  <View key={row[0]!.key} style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10 }}>
                    {row.map((f) => <View key={f.key} style={{ flex: 1, minWidth: 0 }}><Setting field={f} value={s.config[f.key]} onChange={(v) => set(f, v)} steps={steps} /></View>)}
                  </View>
                ) : (
                  <Setting key={row[0]!.key} field={row[0]!} value={s.config[row[0]!.key]} onChange={(v) => set(row[0]!, v)} steps={steps} onFocus={() => setInto({ step: i, key: row[0]!.key })} />
                ),
              )}
              {gives.length || def?.description ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                  {gives.length ? (
                    <View style={{ paddingVertical: 3, paddingHorizontal: 8, borderRadius: 8, backgroundColor: t.c.bg.ground }}>
                      <Mono color={LILAC}>{`gives ${gives.join(', ')}`}</Mono>
                    </View>
                  ) : null}
                  {def?.description ? <Text style={{ flexShrink: 1, fontSize: 12, lineHeight: 16, color: t.c.fg.secondary }}>{def.description}</Text> : null}
                </View>
              ) : null}
            </View>
          );
        })}

        {fromTrigger.length + fromSteps.length && dest ? (
          <View style={{ gap: 8, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: t.c.line }}>
            <Caps>Values you can use · tap to insert</Caps>
            {fromTrigger.length ? <Text style={{ fontSize: 12, color: t.c.fg.secondary }}>From the trigger</Text> : null}
            {fromTrigger.length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{fromTrigger.map((p) => <ValueChip key={p} label={tokenLabel(p, steps)} color={t.c.accent.gold} onPress={() => insert(p)} />)}</View> : null}
            {fromSteps.length ? <Text style={{ fontSize: 12, color: t.c.fg.secondary }}>From earlier steps</Text> : null}
            {fromSteps.length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{fromSteps.map((p) => <ValueChip key={p} label={tokenLabel(p, steps)} color={LILAC} onPress={() => insert(p)} />)}</View> : null}
          </View>
        ) : null}

        <View style={{ gap: 10 }}>
          <Caps style={{ paddingHorizontal: 4 }}>Add a step</Caps>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {coreActions.map((a) => <AddStep key={a.id} label={stepName(ctx, a.id)} onPress={() => add(a.id)} />)}
          </View>
          {moduleActions.length ? <Text style={{ fontSize: 12, color: t.c.fg.secondary, paddingHorizontal: 4 }}>From your modules</Text> : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {moduleActions.map((a) => <AddStep key={a.id} label={stepName(ctx, a.id)} dot={color(a.module)} onPress={() => add(a.id)} />)}
          </View>
        </View>
      </Part>

      {match && steps.length ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 20, backgroundColor: t.c.bg.tile }}>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: '600' }}>Try it on the last match</Text>
            <Sub lines={2}>{[match.entity.title, shortAt(match.entity.createdAt), conditions.length ? `passes ${conditions.length === 1 ? 'it' : conditions.length === 2 ? 'both' : 'all'}` : null].filter(Boolean).join(' · ')}</Sub>
          </View>
          <Pill title="Run now" icon="bolt" iconColor={t.c.accent.gold} height={44} size={14} onPress={() => void tryIt()} />
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingHorizontal: 4 }}>
        <Icon name="lock" size={16} color={t.c.fg.secondary} />
        <Text style={{ flex: 1, fontSize: 12, lineHeight: 17, color: t.c.fg.secondary }}>Runs on the phone. Only an Ask the model step sends anything out: its own text, filled in, listed in You › Sent to Claude.</Text>
      </View>

      <View style={{ gap: 8, paddingBottom: 24 }}>
        <Pill title="Save automation" kind="primary" disabled={!ok} onPress={save} />
        {existing ? <Pill title="Delete automation" kind="danger" onPress={remove} /> : null}
      </View>

      <TriggerPicker ctx={ctx} visible={picking} name={name} value={trigger} onClose={() => setPicking(false)} onPick={(id) => { setTrigger(id === trigger.id ? trigger : { id, config: {} }); setPicking(false); }} />
      <ActionSheet
        visible={menu != null}
        onClose={() => setMenu(null)}
        title={open ? `Step ${menu! + 1} · ${stepName(ctx, open.action)}` : ''}
        actions={[
          ...(menu ? [{ label: 'Move up', icon: 'arrow-up', onPress: () => move(menu, -1) }] : []),
          ...(menu != null && menu < steps.length - 1 ? [{ label: 'Move down', icon: 'chevron-down', onPress: () => move(menu, 1) }] : []),
          { label: 'Remove step', icon: 'trash', destructive: true, onPress: () => { const i = menu!; setInto(null); setSteps((xs) => xs.filter((_, j) => j !== i)); } },
        ]}
      />
    </Screen>
  );
}

/** When, If or Then: the 18 padded card with its disc and 22/700 title. */
function Part({ icon, lime, title, meta, children }: { icon: string; lime?: boolean; title: string; meta: string; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ padding: 18, borderRadius: 24, backgroundColor: t.c.bg.tile, gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Disc icon={icon} color={lime ? t.c.accent.mustardInk : t.c.accent.gold} bg={lime ? t.c.accent.mustard : undefined} size={32} iconSize={16} />
        <Text accessibilityRole="header" style={{ flex: 1, fontSize: 22, lineHeight: 26, fontWeight: '700', letterSpacing: -0.4 }}>{title}</Text>
        <Text style={{ fontSize: 13, color: t.c.fg.secondary }}>{meta}</Text>
      </View>
      {children}
    </View>
  );
}

/** One setting of a trigger or step: pills for a short choice, words with {{values}} as chips, plain inputs, the kit's for the rest. */
function Setting({ field, value, onChange, steps, onFocus }: { field: Field; value: unknown; onChange: (v: unknown) => void; steps: RuleStep[]; onFocus?: () => void }) {
  const t = useTheme();
  const [editing, setEditing] = useState(false);
  const label = <Text style={{ fontSize: 12, fontWeight: '600', color: t.c.fg.secondary }}>{field.label}</Text>;
  if (field.type === 'select' && field.key !== 'entityType' && (field.options?.length ?? 0) <= 3) {
    const options = [...(field.options ?? []), ...(!field.required && field.default === undefined && field.options?.length === 2 ? [{ value: '', label: 'Either' }] : [])];
    const cur = String(value ?? '');
    return (
      <View style={{ gap: 8 }}>
        <Caps style={{ paddingHorizontal: 4 }}>{field.label}</Caps>
        <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', gap: 2, padding: 4, borderRadius: 999, backgroundColor: t.c.bg.tileRaised }}>
          {options.map((o) => {
            const sel = cur === o.value;
            return (
              <Pressable key={o.value} accessibilityRole="radio" accessibilityState={{ checked: sel }} hitSlop={2} onPress={() => onChange(o.value || undefined)} style={{ flex: 1, height: 40, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: sel ? t.c.fg.primary : 'transparent' }}>
                <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: '600', color: sel ? t.c.bg.ground : t.c.fg.primary }}>{o.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  }
  if (field.key === 'rrule') {
    const cur = String(value ?? '');
    const known = REPEAT.some((o) => o.value === cur);
    return <FieldInput field={known ? field : { ...field, options: [...REPEAT, { value: cur, label: describeRRule(cur) }] }} value={cur} onChange={onChange} />;
  }
  const box = { minHeight: 48, paddingHorizontal: 14, borderRadius: 12, backgroundColor: t.c.bg.ground };
  const inputStyle = { color: t.c.fg.primary, fontSize: 16, fontFamily: fontForWeight(500) };
  if (field.type === 'number') {
    return (
      <View style={{ gap: 6 }}>
        {label}
        <TextInput value={value == null ? '' : String(value)} onChangeText={(v) => onChange(v === '' ? undefined : asNumber(v))} keyboardType="decimal-pad" placeholder={field.placeholder} placeholderTextColor={t.c.fg.tertiary} accessibilityLabel={field.label} style={[box, inputStyle, { height: 48 }]} />
      </View>
    );
  }
  if (field.type === 'text' || field.type === 'longtext') {
    const text = value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
    return (
      <View style={{ gap: 6 }}>
        {label}
        {isWords(field) && !editing ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`${field.label}: ${text || 'empty'}`} onPress={() => { onFocus?.(); setEditing(true); }} style={[box, { paddingVertical: 12, justifyContent: 'center' }]}>
            {text ? <TokenText value={text} steps={steps} /> : <Text style={{ fontSize: 15, color: t.c.fg.tertiary }}>{field.placeholder ?? 'Type here'}</Text>}
          </Pressable>
        ) : (
          <TextInput value={text} onChangeText={onChange} autoFocus={isWords(field)} onFocus={onFocus} onBlur={() => setEditing(false)} multiline={field.type === 'longtext'} autoCapitalize={isWords(field) ? 'sentences' : 'none'} placeholder={field.placeholder} placeholderTextColor={t.c.fg.tertiary} accessibilityLabel={field.label} style={[box, inputStyle, field.type === 'longtext' ? { paddingVertical: 12, textAlignVertical: 'top' } : { height: 48 }]} />
        )}
        {field.description && !isWords(field) ? <Text style={{ fontSize: 12, lineHeight: 16, color: t.c.fg.tertiary }}>{field.description}</Text> : null}
      </View>
    );
  }
  return <FieldInput field={field} value={value} onChange={onChange} />;
}

function PickPill({ label, a11y, onPress }: { label: string; a11y: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={a11y} hitSlop={2} onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingLeft: 14, paddingRight: 12, borderRadius: 999, backgroundColor: t.c.bg.ground, opacity: pressed ? 0.8 : 1, maxWidth: '100%' })}>
      <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 14, fontWeight: '600' }}>{label}</Text>
      <Icon name="chevron-down" size={14} color={t.c.fg.secondary} />
    </Pressable>
  );
}

/** A condition as a sentence of pills: field, test, value. */
function Condition({ ctx, object, value, onChange, onRemove }: { ctx: LifeOSContext; object: string | undefined; value: FilterClause; onChange: (c: FilterClause) => void; onRemove: () => void }) {
  const t = useTheme();
  const [sheet, setSheet] = useState<'field' | 'op' | 'value' | null>(null);
  const def = object ? ctx.registry.objects.get(object) : undefined;
  const fields: PickerItem[] = [
    { id: 'title', title: 'Title' },
    ...(def?.statuses?.length ? [{ id: 'status', title: 'Status' }] : []),
    ...(def?.fields ?? []).map((f) => ({ id: `data.${f.key}`, title: f.label })),
  ];
  const field = def?.fields.find((f) => `data.${f.key}` === value.field);
  const options = field?.options ?? (value.field === 'status' ? def?.statuses : undefined);
  const noValue = value.op === 'isNull' || value.op === 'notNull';
  const shown = options?.find((o) => o.value === String(value.value))?.label ?? (value.value == null ? '' : String(value.value));
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, borderRadius: 16, backgroundColor: t.c.bg.tileRaised }}>
      <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        <PickPill label={fields.find((f) => f.id === value.field)?.title ?? value.field} a11y={`Field: ${value.field}`} onPress={() => setSheet('field')} />
        <PickPill label={OPS.find((o) => o.id === value.op)?.title ?? value.op} a11y={`Test: ${value.op}`} onPress={() => setSheet('op')} />
        {noValue ? null : options?.length ? (
          <PickPill label={shown || 'Choose'} a11y={`Value: ${shown || 'none'}`} onPress={() => setSheet('value')} />
        ) : (
          <TextInput
            value={value.value == null ? '' : String(value.value)}
            onChangeText={(v) => onChange({ ...value, value: asNumber(v) })}
            placeholder="Value"
            placeholderTextColor={t.c.fg.tertiary}
            accessibilityLabel="Value"
            keyboardType={field?.type === 'money' || field?.type === 'number' ? 'decimal-pad' : 'default'}
            style={{ height: 40, minWidth: 90, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: t.c.accent.mustard, backgroundColor: t.c.bg.ground, color: t.c.fg.primary, fontSize: 14, fontFamily: fontForWeight(700) }}
          />
        )}
      </View>
      <IconButton icon="x" size={40} color={t.c.fg.secondary} accessibilityLabel="Remove condition" onPress={onRemove} />
      <PickerSheet
        visible={sheet === 'field'}
        onClose={() => setSheet(null)}
        title="Field"
        items={fields}
        selected={[value.field]}
        onSelect={(id) => { onChange({ ...value, field: id, value: '' }); setSheet(null); }}
        onCreate={(path) => { onChange({ ...value, field: path, value: '' }); setSheet(null); }}
      />
      <PickerSheet visible={sheet === 'op'} onClose={() => setSheet(null)} title="Test" items={OPS} selected={[value.op]} onSelect={(id) => { onChange({ ...value, op: id as FilterClause['op'] }); setSheet(null); }} />
      <PickerSheet visible={sheet === 'value'} onClose={() => setSheet(null)} title={field?.label ?? 'Value'} items={(options ?? []).map((o) => ({ id: o.value, title: o.label }))} selected={[String(value.value)]} onSelect={(id) => { onChange({ ...value, value: id }); setSheet(null); }} />
    </View>
  );
}

function ValueChip({ label, color, onPress }: { label: string; color: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Insert ${label}`} hitSlop={6} onPress={onPress} style={({ pressed }) => ({ height: 32, paddingHorizontal: 10, borderRadius: 999, backgroundColor: t.c.bg.tileRaised, justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
      <Mono color={color}>{label}</Mono>
    </Pressable>
  );
}

function AddStep({ label, dot, onPress }: { label: string; dot?: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Add step: ${label}`} hitSlop={2} onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: 14, borderRadius: 999, backgroundColor: t.c.bg.tileRaised, opacity: pressed ? 0.8 : 1 })}>
      {dot ? <Dot color={dot} /> : null}
      <Text style={{ fontSize: 14, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}
