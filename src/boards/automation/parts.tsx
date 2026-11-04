import React from 'react';
import { Alert, Platform, Pressable, TextInput, View, type TextStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { format, isToday } from 'date-fns';
import type { LifeOSContext } from '@core/registry/context';
import { MANUAL_TRIGGER, DAILY_TRIGGER, type AutomationRule, type AutomationRun, type RuleStep, type RuleTrigger } from '@core/automation/engine';
import { useTheme } from '@ui/theme/ThemeProvider';
import { shortNameForModule, tintForModule } from '@ui/theme/moduleTint';
import { blocks, fontForWeight, monoFonts } from '@ui/theme/tokens';
import { Icon, Text, Toggle, useToast, type IconName } from '@ui/kit';

/**
 * Automations' shared parts (NR-Automations-*): how a trigger, a step and a
 * run are put in words, and the pieces the artboards repeat that the kit
 * lacks. Lilac is the Automations colour.
 */

export const LILAC = blocks.lilac;
export const route = (page: string, q: Record<string, string> = {}) => {
  const qs = Object.entries(q).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  return `/board/automation/${page}${qs ? `?${qs}` : ''}` as never;
};

/* ------------------------------------------------------------------ */
/* Modules and triggers in words                                       */
/* ------------------------------------------------------------------ */

export function moduleWord(os: LifeOSContext, id: string | undefined): string {
  if (!id) return '';
  return id === 'finance' ? 'Money' : shortNameForModule(id, os.registry.modules.get(id)?.name ?? id);
}

/** The module's colour; core has none of its own. */
export function useModuleColor() {
  const t = useTheme();
  return (id: string | undefined) => (!id || id === 'core' ? t.c.fg.tertiary : t.tints[tintForModule(id)].ink);
}

/** The Object a trigger is about: its setting, or the middle of a module trigger's id (finance.transaction.created). */
export function triggerObject(os: LifeOSContext, trigger: RuleTrigger): string | undefined {
  if (trigger.config.entityType) return String(trigger.config.entityType);
  const guess = trigger.id.split('.')[1];
  return guess && os.registry.objects.has(guess) ? guess : undefined;
}

export function triggerModule(os: LifeOSContext, trigger: RuleTrigger): string {
  const own = os.registry.triggers.get(trigger.id)?.module ?? 'core';
  if (own !== 'core') return own;
  const object = triggerObject(os, trigger);
  return (object && os.registry.objects.get(object)?.module) || 'core';
}

/** Icon and line for the triggers core brings (NR-Automations-Trigger). */
export const TRIGGER_COPY: Record<string, { icon: IconName; line: string; label?: string }> = {
  'core.entity.created': { icon: 'plus', line: 'A Person, Document, Asset, any Object' },
  'core.entity.updated': { icon: 'edit', line: 'Only when a Field you pick changes' },
  'core.entity.status': { icon: 'transfer', line: 'To a status you pick, like done or settled' },
  'core.tag.applied': { icon: 'tag', line: 'Any record tagged, say, review' },
  'core.entity.deleted': { icon: 'trash', line: 'Kept in the run log, so you can see what went' },
  'core.reminder.due': { icon: 'bell', line: 'A one-off Cycle reaches its time' },
  'core.schedule.daily': { icon: 'clock', line: 'Once a day, after a time you pick' },
  [MANUAL_TRIGGER]: { icon: 'bolt', line: 'A button on Automations, or a sentence in the Dump box', label: 'Manual run' },
  'finance.transaction.created': { icon: 'rupee', line: 'expense or income' },
  'projects.task.completed': { icon: 'check-circle', line: 'gives its project' },
};

const VERBS: Record<string, string> = { 'core.entity.created': 'created', 'core.entity.updated': 'updated', 'core.entity.status': 'status changed', 'core.entity.deleted': 'deleted' };

/** "Transaction created" · "Manual run" · "Every day after 10:00". */
export function triggerLabel(os: LifeOSContext, trigger: RuleTrigger): string {
  if (trigger.id === DAILY_TRIGGER) return `Every day after ${String(trigger.config.time || '08:00')}`;
  const object = trigger.config.entityType ? os.registry.objects.get(String(trigger.config.entityType))?.label : undefined;
  if (object && VERBS[trigger.id]) return `${object} ${VERBS[trigger.id]}`;
  return TRIGGER_COPY[trigger.id]?.label ?? os.registry.triggers.get(trigger.id)?.label ?? trigger.id;
}

export function triggerIcon(os: LifeOSContext, trigger: RuleTrigger): string {
  const object = trigger.config.entityType ? os.registry.objects.get(String(trigger.config.entityType))?.icon : undefined;
  return object ?? TRIGGER_COPY[trigger.id]?.icon ?? os.registry.modules.get(triggerModule(os, trigger))?.icon ?? 'bolt';
}

export const isManual = (rule: Pick<AutomationRule, 'trigger'>) => rule.trigger.id === MANUAL_TRIGGER;
export const manualPhrase = (rule: Pick<AutomationRule, 'trigger' | 'name'>) => `“run ${String(rule.trigger.config.phrase || rule.name).toLowerCase()}”`;
/** A rule can be run now when it doesn't need a record to start from. */
export const runsWithoutRecord = (rule: AutomationRule) => isManual(rule) || rule.trigger.id === DAILY_TRIGGER;

export const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;
/** Most recently run first. */
export function byLastRun(rules: AutomationRule[], runs: AutomationRun[]) {
  const last = new Map<string, number>();
  for (const r of runs) if (!last.has(r.ruleId)) last.set(r.ruleId, r.startedAt);
  return [...rules].sort((a, b) => (last.get(b.id) ?? b.lastRunAt ?? 0) - (last.get(a.id) ?? a.lastRunAt ?? 0));
}
/** Each rule whose latest real run failed, with that run. */
export function failedRuns(runs: AutomationRun[]) {
  const seen = new Set<string>();
  const failed = new Map<string, AutomationRun>();
  for (const r of runs) {
    if (r.status === 'skipped' || seen.has(r.ruleId)) continue;
    seen.add(r.ruleId);
    if (r.status === 'error') failed.set(r.ruleId, r);
  }
  return failed;
}

/* ------------------------------------------------------------------ */
/* Steps in words                                                      */
/* ------------------------------------------------------------------ */

const STEP_NAMES: Record<string, string> = { 'core.askModel': 'Ask the model', 'core.notify': 'Notify' };
export const stepName = (os: LifeOSContext, action: string) => STEP_NAMES[action] ?? os.registry.actions.get(action)?.label ?? action;

const TOKEN = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;
/** {{data.amount}} is "amount"; {{steps.s2.text}} is "step 2 · text". */
export function tokenLabel(path: string, steps: Array<Pick<RuleStep, 'key'>>): string {
  const [head, ...rest] = path.split('.');
  if (head === 'steps') return `step ${steps.findIndex((s) => s.key === rest[0]) + 1} · ${rest.slice(1).join('.')}`;
  return head === 'data' || head === 'vars' || head === 'entity' ? rest.join('.') : path;
}
export const tokensIn = (s: string) => [...s.matchAll(TOKEN)].map((m) => m[1]!);

/** A step's main setting: what it asks, makes or says. */
export function stepText(step: Pick<RuleStep, 'action' | 'config'>): string {
  const c = step.config;
  if (step.action === 'core.continueIf') return `${String(c.field ?? '')} ${String(c.op ?? '')} ${String(c.value ?? '')}`.trim();
  const main = c.prompt ?? c.title ?? c.tag ?? c.body ?? c.status ?? c.entityType;
  if (main == null || main === '') return '';
  return step.action === 'core.askModel' || step.action === 'core.notify' ? `“${String(main)}”` : String(main);
}

/** Text with its {{values}} as mono chips: lime from the trigger, lilac from a step. */
export function TokenText({ value, steps, strong, lineHeight = 24 }: { value: string; steps: Array<Pick<RuleStep, 'key'>>; strong?: boolean; lineHeight?: number }) {
  const t = useTheme();
  return (
    <Text style={{ fontSize: 15, lineHeight, fontWeight: strong ? '600' : '400' }}>
      {value.split(TOKEN).map((p, i) =>
        i % 2 ? (
          <Text key={i} style={{ fontFamily: monoFonts[500], fontSize: 12, backgroundColor: t.c.bg.tileRaised, color: p.startsWith('steps.') ? LILAC : t.c.accent.gold }}>
            {` ${tokenLabel(p, steps)} `}
          </Text>
        ) : (
          p
        ),
      )}
    </Text>
  );
}

/* ------------------------------------------------------------------ */
/* Runs in words                                                       */
/* ------------------------------------------------------------------ */

export const longAt = (at: number) => format(at, 'EEE d MMM, h:mm aaa');
export const shortAt = (at: number) => (isToday(at) ? format(at, 'h:mm aaa') : Date.now() - at < 6 * 86400000 ? format(at, 'EEE h:mm aaa') : format(at, 'd MMM'));
export const seconds = (ms: number) => `${(Math.max(0, ms) / 1000).toFixed(1)} s`;

export const failedAt = (run: AutomationRun) => run.steps.findIndex((s) => s.status === 'failed');

/** "said in the Dump box" · "by hand" · the record it was about. */
export function runSource(run: AutomationRun): string {
  if (run.about?.vars?.said) return 'said in the Dump box';
  if (run.about?.manual) return 'by hand';
  return run.about?.title ?? 'from its trigger';
}

/** A row's line on the board: what it was about, what happened, when. */
export function runLine(run: AutomationRun): string {
  const f = failedAt(run);
  const what = f >= 0 ? `Stopped at step ${f + 1}` : run.status === 'skipped' ? 'conditions not met' : run.status === 'undone' ? 'undone' : run.steps[run.steps.length - 1]?.line;
  return [f >= 0 ? null : run.about?.title, what, shortAt(run.startedAt)].filter(Boolean).join(' · ');
}

const PILLS: Record<string, { label: string; tone: 'ok' | 'alert' | 'quiet' }> = {
  ok: { label: 'Ran', tone: 'ok' },
  error: { label: 'Failed', tone: 'alert' },
  skipped: { label: 'Skipped', tone: 'quiet' },
  undone: { label: 'Undone', tone: 'quiet' },
};

/** The 24 status pill: lime Ran, coral Failed, quiet Skipped and Undone. */
export function StatusPill({ status, label }: { status: string; label?: string }) {
  const t = useTheme();
  const p = PILLS[status] ?? PILLS.ok!;
  const bg = p.tone === 'ok' ? t.c.ok.sageFill : p.tone === 'alert' ? t.c.alert.coralFill : t.c.bg.tileRaised;
  const fg = p.tone === 'ok' ? t.c.ok.sageText : p.tone === 'alert' ? t.c.alert.coralText : t.c.fg.secondary;
  return (
    <View style={{ alignSelf: 'center', height: 24, paddingHorizontal: 9, borderRadius: 999, backgroundColor: bg, justifyContent: 'center', flexShrink: 0 }}>
      <Text numberOfLines={1} style={{ fontSize: 12, lineHeight: 16, fontWeight: '600', color: fg }}>{label ?? p.label}</Text>
    </View>
  );
}

/** One run in a list: title, line, status pill; opens the run. */
export function RunRow({ run, title, line, chevron }: { run: AutomationRun; title: string; line: string; chevron?: boolean }) {
  const router = useRouter();
  const t = useTheme();
  return (
    <Pressable accessibilityRole="link" onPress={() => router.push(route('run', { run: run.id }))} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, opacity: pressed ? 0.7 : 1 })}>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text numberOfLines={1} style={{ fontSize: 15, lineHeight: 20, fontWeight: '600' }}>{title}</Text>
        <Sub>{line}</Sub>
      </View>
      <StatusPill status={run.status} />
      {chevron ? <Icon name="chevron-right" size={18} color={t.c.fg.tertiary} /> : null}
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/* Pieces the artboards repeat                                         */
/* ------------------------------------------------------------------ */

/** The 13/17 secondary line, one row unless told otherwise. */
export function Sub({ children, color, lines = 1 }: { children: React.ReactNode; color?: string; lines?: number }) {
  const t = useTheme();
  return <Text numberOfLines={lines} style={{ fontSize: 13, lineHeight: 17, color: color ?? t.c.fg.secondary, fontVariant: ['tabular-nums'] }}>{children}</Text>;
}

/** The 11/600 uppercase label. */
export function Caps({ children, color, style }: { children: React.ReactNode; color?: string; style?: TextStyle }) {
  const t = useTheme();
  return <Text style={[{ fontSize: 11, lineHeight: 14, fontWeight: '600', letterSpacing: 0.9, textTransform: 'uppercase', color: color ?? t.c.fg.tertiary }, style]}>{children}</Text>;
}

export function Mono({ children, color, size = 12, style }: { children: React.ReactNode; color?: string; size?: number; style?: TextStyle }) {
  const t = useTheme();
  return <Text style={[{ fontFamily: monoFonts[500], fontSize: size, lineHeight: size + 4, color: color ?? t.c.fg.secondary }, style]}>{children}</Text>;
}

export function Dot({ color, size = 8 }: { color: string; size?: number }) {
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, flexShrink: 0 }} />;
}

export function Hairline() {
  const t = useTheme();
  return <View style={{ height: 1, backgroundColor: t.c.line }} />;
}

export function Disc({ icon, color, bg, size = 40, iconSize = 18 }: { icon: string; color: string; bg?: string; size?: number; iconSize?: number }) {
  const t = useTheme();
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg ?? t.c.bg.tileRaised, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <Icon name={icon} size={iconSize} color={color} />
    </View>
  );
}

/** The 24 card that holds rows. */
export function Group({ children, gap = 8, padding = 14 }: { children: React.ReactNode; gap?: number; padding?: number }) {
  const t = useTheme();
  return <View style={{ padding, borderRadius: 24, backgroundColor: t.c.bg.tile, gap }}>{children}</View>;
}

/** A block: 17/600 title, 13 line, a link on the right. */
export function Block({ title, line, action, chevron, onAction, children }: { title: string; line?: string; action?: string; chevron?: boolean; onAction?: () => void; children?: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingTop: 6, paddingHorizontal: 4 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text accessibilityRole="header" style={{ fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: -0.2 }}>{title}</Text>
          {line ? <Sub lines={2}>{line}</Sub> : null}
        </View>
        {action ? (
          <Pressable accessibilityRole="link" hitSlop={12} onPress={onAction} style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: t.c.fg.secondary }}>{action}</Text>
            {chevron ? <Icon name="chevron-right" size={14} color={t.c.fg.secondary} /> : null}
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

/** The top bar: a round 44 back or close, a caption (with a dot) over the 22/700 title, round actions. */
export function TopBar({ caption, dot, title, onBack, close, right }: { caption?: string; dot?: string; title?: string; onBack?: () => void; close?: boolean; right?: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      {onBack ? (
        <Pressable accessibilityRole="button" accessibilityLabel={close ? 'Close' : 'Back'} onPress={onBack} style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, backgroundColor: t.c.bg.tileRaised, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.75 : 1 })}>
          <Icon name={close ? 'x' : 'chevron-left'} size={18} color={t.c.fg.primary} />
        </Pressable>
      ) : null}
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        {caption ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {dot ? <Dot color={dot} /> : null}
            <Sub>{caption}</Sub>
          </View>
        ) : null}
        {title ? <Text accessibilityRole="header" numberOfLines={1} style={{ fontSize: 22, lineHeight: 25, fontWeight: '700', letterSpacing: -0.5 }}>{title}</Text> : null}
      </View>
      {right ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>{right}</View> : null}
    </View>
  );
}

/** A pill button: lime primary, raised secondary, or any colour. */
export function Pill({ title, icon, onPress, kind = 'secondary', height = 52, flex, disabled, bg, ink, iconColor, size = 15 }: { title: string; icon?: string; onPress?: () => void; kind?: 'primary' | 'secondary' | 'danger'; height?: number; flex?: boolean; disabled?: boolean; bg?: string; ink?: string; iconColor?: string; size?: number }) {
  const t = useTheme();
  const fill = bg ?? (kind === 'primary' ? t.c.accent.mustard : kind === 'danger' ? 'transparent' : t.c.bg.tileRaised);
  const fg = ink ?? (kind === 'primary' ? t.c.accent.mustardInk : kind === 'danger' ? t.c.alert.coralText : t.c.fg.primary);
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => ({ flex: flex ? 1 : undefined, height, paddingHorizontal: 16, borderRadius: 999, backgroundColor: fill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: disabled ? 0.4 : pressed ? 0.8 : 1 })}>
      {icon ? <Icon name={icon} size={16} color={iconColor ?? fg} /> : null}
      <Text numberOfLines={1} style={{ fontSize: size, fontWeight: height < 52 ? '600' : '700', color: fg }}>{title}</Text>
    </Pressable>
  );
}

/** The 48 search box on the raised fill. */
export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingHorizontal: 18, borderRadius: 16, backgroundColor: t.c.bg.tileRaised, borderWidth: 1, borderColor: t.c.line }}>
      <Icon name="search" size={18} color={t.c.fg.tertiary} />
      <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={t.c.fg.tertiary} accessibilityLabel={placeholder} style={{ flex: 1, minWidth: 0, height: 46, fontSize: 16, fontFamily: fontForWeight(500), color: t.c.fg.primary }} />
    </View>
  );
}

/** The lilac block's switch: a ground track, a lilac thumb. */
export function BlockToggle({ value, onChange, accessibilityLabel }: { value: boolean; onChange: (v: boolean) => void; accessibilityLabel: string }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="switch" accessibilityLabel={accessibilityLabel} accessibilityState={{ checked: value }} hitSlop={9} onPress={() => onChange(!value)} style={{ width: 50, height: 30, borderRadius: 15, padding: 3, backgroundColor: value ? t.c.fg.onAccent : t.c.bg.overlay, alignItems: value ? 'flex-end' : 'flex-start', justifyContent: 'center' }}>
      <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: value ? LILAC : t.c.fg.onAccent }} />
    </Pressable>
  );
}

/** The six dots of a step card. */
export function Grip() {
  const t = useTheme();
  return (
    <View style={{ width: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 3, paddingHorizontal: 2.5 }}>
      {[0, 1, 2, 3, 4, 5].map((i) => <View key={i} style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: t.c.fg.tertiary }} />)}
    </View>
  );
}

/** A rule as a row: optional disc, name and line (quiet when off), and on the right its switch or anything else. */
export function RuleRow({ rule, ctx, line, pill, disc, right, minHeight = 56 }: { rule: AutomationRule; ctx: LifeOSContext; line: string; pill?: string; disc?: boolean; right?: React.ReactNode; minHeight?: number }) {
  const router = useRouter();
  const t = useTheme();
  const color = useModuleColor();
  const module = triggerModule(ctx, rule.trigger);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight }}>
      <Pressable accessibilityRole="link" onPress={() => router.push(route('rule', { rule: rule.id }))} style={({ pressed }) => ({ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 44, opacity: pressed ? 0.7 : 1 })}>
        {disc ? <Disc icon={triggerIcon(ctx, rule.trigger)} color={isManual(rule) ? LILAC : color(module)} /> : null}
        <View style={{ flex: 1, minWidth: 0, gap: pill ? 4 : 2 }}>
          <Text numberOfLines={1} style={{ fontSize: 16, lineHeight: 21, fontWeight: '600', color: rule.enabled ? t.c.fg.primary : t.c.fg.secondary }}>{rule.name}</Text>
          <Sub color={rule.enabled ? t.c.fg.secondary : t.c.fg.tertiary}>{line}</Sub>
          {pill ? <View style={{ alignSelf: 'flex-start' }}><StatusPill status="error" label={pill} /></View> : null}
        </View>
      </Pressable>
      {right ?? <Toggle value={rule.enabled} onChange={(v) => ctx.automation.rules.setEnabled(rule.id, v)} accessibilityLabel={rule.name} />}
    </View>
  );
}

/** A native confirm before a rule goes (no confirm on web, as elsewhere). */
export function confirmDelete(name: string, go: () => void) {
  if (Platform.OS === 'web') return go();
  Alert.alert(`Delete ${name}?`, 'Its runs stay in the log. What it already did stays too.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: go }]);
}

/** What a finished run did, as a toast with Undo (or Open when it failed or can't be undone). */
export function useRunToast(ctx: LifeOSContext) {
  const toast = useToast();
  const router = useRouter();
  return (name: string, run: AutomationRun) => {
    const open = { label: 'Open', onPress: () => router.push(route('run', { run: run.id })) };
    if (run.status === 'skipped') return toast.show({ message: `${name}: conditions not met`, icon: 'bolt', action: open });
    const f = failedAt(run);
    if (f >= 0) return toast.show({ message: `${name}: stopped at step ${f + 1}`, icon: 'alert', action: open });
    const done = run.steps.filter((s) => s.status === 'done').length;
    toast.show({
      message: `${name}: ${plural(done, 'step')} done${run.steps.some((s) => s.status === 'stopped') ? ', then stopped' : ''}`,
      icon: 'bolt',
      ...(run.steps.some((s) => s.canUndo) ? { undo: () => void ctx.automation.undoRun(run.id) } : { action: open }),
    });
  };
}

/** Run a rule by hand and say what it did. */
export function useRunNow(ctx: LifeOSContext) {
  const report = useRunToast(ctx);
  return async (rule: AutomationRule, said?: string) => report(rule.name, await ctx.automation.runManual(rule, said));
}
