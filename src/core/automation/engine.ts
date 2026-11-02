import type { DatabaseAdapter, Row } from '../db/adapter';
import type { FilterClause } from '../domain/types';
import { newId } from '../domain/ids';
import { bus, type CoreEvents, type EventName } from '../events/bus';
import type { Registry } from '../registry/registry';
import type { AutomationContext, AutomationTemplate, StepResult } from '../registry/types';
import type { LifeOSContext } from '../registry/context';
import type { BrainModel } from '../brain/model';
import { brainSettings, plainDashes } from '../brain/runner';
import { recordUsage } from '../ai/routing';
import { safeJson } from '../repo/recordRepo';
import { evaluateCondition, renderTemplate } from './conditions';

/* ------------------------------------------------------------------ */
/* Rule model (docs/MODEL.md layer 3 *Automations*, as built in R10)   */
/* ------------------------------------------------------------------ */

export interface RuleTrigger {
  /** Registered trigger id (e.g. "core.entity.created") */
  id: string;
  config: Record<string, unknown>; // e.g. { entityType: 'transaction' }
}
/** A rule's action before R10 (one per line, no key). Still accepted by `save`. */
export interface RuleAction {
  id: string; // registered action id
  config: Record<string, unknown>;
}
/** One step: an action, its settings, and the key later steps read its output by. */
export interface RuleStep {
  key: string;
  action: string;
  config: Record<string, unknown>;
}
export interface AutomationRule {
  id: string;
  name: string;
  enabled: boolean;
  trigger: RuleTrigger;
  conditions: FilterClause[]; // evaluated against ctx.entity (+ vars via "vars.x")
  steps: RuleStep[];
  lastRunAt?: number | null;
  runCount: number;
  createdAt: number;
  updatedAt: number;
}
export type RuleInput = Omit<AutomationRule, 'id' | 'runCount' | 'createdAt' | 'updatedAt' | 'steps'> & {
  id?: string;
  steps?: Array<Partial<RuleStep> & { action: string }>;
  /** The pre-R10 shape (create_automation, module installs): becomes steps. */
  actions?: RuleAction[];
};

export interface RunLogLine {
  at: number;
  level: 'info' | 'error';
  msg: string;
}

export type StepStatus = 'done' | 'failed' | 'stopped' | 'undone';
/** One step of one run, as the run log keeps it. */
export interface StepRun {
  key: string;
  action: string;
  label: string;
  status: StepStatus;
  /** The settings as filled in for this run. */
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  line: string;
  /** What undo needs; null when the action can't be undone or did nothing. */
  undo: unknown;
  canUndo: boolean;
  at: number;
  error?: string;
}
export type RunStatus = 'ok' | 'error' | 'skipped' | 'undone';
export interface AutomationRun {
  id: string;
  ruleId: string;
  status: RunStatus;
  /** What started it: the record (id, title) and the trigger's vars. */
  about: { entityId?: string | null; title?: string | null; vars?: Record<string, unknown>; manual?: boolean } | null;
  steps: StepRun[];
  /** Plain lines: why a run was skipped, and runs from before R10. */
  log: RunLogLine[];
  startedAt: number;
  finishedAt: number | null;
}

/** Runs kept; older ones are dropped as new ones come in. */
export const RUNS_KEPT = 200;
export const MANUAL_TRIGGER = 'core.manual';
export const DAILY_TRIGGER = 'core.schedule.daily';

function toSteps(raw: unknown): RuleStep[] {
  const list = Array.isArray(raw) ? (raw as Array<Record<string, unknown>>) : [];
  const used = new Set<string>();
  const steps: RuleStep[] = [];
  for (const s of list) {
    const action = String(s.action ?? s.id ?? '');
    if (!action) continue;
    let key = typeof s.key === 'string' && s.key && !used.has(s.key) ? s.key : '';
    for (let n = steps.length + 1; !key; n++) if (!used.has(`s${n}`) && !list.some((x) => x.key === `s${n}`)) key = `s${n}`;
    used.add(key);
    steps.push({ key, action, config: (s.config as Record<string, unknown>) ?? {} });
  }
  return steps;
}

export class AutomationRepo {
  constructor(private db: DatabaseAdapter) {}
  all(): AutomationRule[] {
    return this.db.all<Row>(`SELECT * FROM automation_rules WHERE deleted_at IS NULL ORDER BY created_at`).map(toRule);
  }
  get(id: string) {
    const r = this.db.get<Row>(`SELECT * FROM automation_rules WHERE id=? AND deleted_at IS NULL`, [id]);
    return r ? toRule(r) : undefined;
  }
  save(rule: RuleInput): AutomationRule {
    const now = Date.now();
    const steps = JSON.stringify(toSteps(rule.steps ?? rule.actions ?? []));
    if (rule.id && this.get(rule.id)) {
      this.db.run(`UPDATE automation_rules SET name=?, enabled=?, trigger=?, conditions=?, actions=?, updated_at=? WHERE id=?`, [rule.name, rule.enabled ? 1 : 0, JSON.stringify(rule.trigger), JSON.stringify(rule.conditions), steps, now, rule.id]);
      bus.emit('data.changed', { table: 'automation_rules', id: rule.id });
      return this.get(rule.id)!;
    }
    const id = rule.id ?? newId(now);
    this.db.run(`INSERT INTO automation_rules(id,name,enabled,trigger,conditions,actions,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)`, [id, rule.name, rule.enabled ? 1 : 0, JSON.stringify(rule.trigger), JSON.stringify(rule.conditions), steps, now, now]);
    bus.emit('data.changed', { table: 'automation_rules', id });
    return this.get(id)!;
  }
  setEnabled(id: string, enabled: boolean) {
    this.db.run(`UPDATE automation_rules SET enabled=?, updated_at=? WHERE id=?`, [enabled ? 1 : 0, Date.now(), id]);
    bus.emit('data.changed', { table: 'automation_rules', id });
  }
  remove(id: string) {
    this.db.run(`UPDATE automation_rules SET deleted_at=? WHERE id=?`, [Date.now(), id]);
    bus.emit('data.changed', { table: 'automation_rules', id });
  }
  /**
   * R10, once: rules saved before steps (one action per line, no key) are
   * rewritten as steps in place; every rule, the deleted ones too, keeps its
   * id, name, trigger, conditions and run count. Returns how many changed.
   */
  migrateSteps(): number {
    let n = 0;
    for (const r of this.db.all<Row>(`SELECT id, actions FROM automation_rules`)) {
      const raw = (safeJson(r.actions as string) as unknown) ?? [];
      const steps = toSteps(raw);
      const next = JSON.stringify(steps);
      if (next === JSON.stringify(raw)) continue;
      this.db.run(`UPDATE automation_rules SET actions=? WHERE id=?`, [next, r.id as string]);
      n++;
    }
    return n;
  }
  recordRun(ruleId: string, status: RunStatus, about: AutomationRun['about'], steps: StepRun[], log: RunLogLine[], startedAt: number): AutomationRun {
    const id = newId();
    const finished = Date.now();
    this.db.run(`INSERT INTO automation_runs(id,rule_id,status,trigger_payload,log,started_at,finished_at) VALUES (?,?,?,?,?,?,?)`, [id, ruleId, status, JSON.stringify(about ?? null).slice(0, 4000), JSON.stringify({ steps, lines: log }), startedAt, finished]);
    if (status === 'ok') this.db.run(`UPDATE automation_rules SET last_run_at=?, run_count=run_count+1 WHERE id=?`, [finished, ruleId]);
    this.db.run(`DELETE FROM automation_runs WHERE id NOT IN (SELECT id FROM automation_runs ORDER BY started_at DESC LIMIT ?)`, [RUNS_KEPT]);
    bus.emit('data.changed', { table: 'automation_runs', id });
    return this.run(id)!;
  }
  updateRun(id: string, status: RunStatus, steps: StepRun[], log: RunLogLine[]) {
    this.db.run(`UPDATE automation_runs SET status=?, log=? WHERE id=?`, [status, JSON.stringify({ steps, lines: log }), id]);
    bus.emit('data.changed', { table: 'automation_runs', id });
  }
  run(id: string): AutomationRun | undefined {
    const r = this.db.get<Row>(`SELECT * FROM automation_runs WHERE id=?`, [id]);
    return r ? toRun(r) : undefined;
  }
  runs(ruleId?: string, limit = 50): AutomationRun[] {
    const rows = ruleId
      ? this.db.all<Row>(`SELECT * FROM automation_runs WHERE rule_id=? ORDER BY started_at DESC LIMIT ?`, [ruleId, limit])
      : this.db.all<Row>(`SELECT * FROM automation_runs ORDER BY started_at DESC LIMIT ?`, [limit]);
    return rows.map(toRun);
  }
}

function toRule(r: Row): AutomationRule {
  return {
    id: r.id as string, name: r.name as string, enabled: !!r.enabled,
    trigger: safeJson(r.trigger as string) as unknown as RuleTrigger,
    conditions: (JSON.parse((r.conditions as string) || '[]') as FilterClause[]) ?? [],
    steps: toSteps(JSON.parse((r.actions as string) || '[]')),
    lastRunAt: (r.last_run_at as number | null) ?? null, runCount: Number(r.run_count ?? 0),
    createdAt: r.created_at as number, updatedAt: r.updated_at as number,
  };
}

function toRun(r: Row): AutomationRun {
  const raw = JSON.parse((r.log as string) || '[]') as unknown;
  // Before R10 the log was a list of lines.
  const log = Array.isArray(raw) ? (raw as RunLogLine[]) : (((raw as { lines?: RunLogLine[] }).lines ?? []) as RunLogLine[]);
  const steps = Array.isArray(raw) ? [] : ((raw as { steps?: StepRun[] }).steps ?? []);
  const payload = (r.trigger_payload ? JSON.parse(r.trigger_payload as string) : null) as Record<string, unknown> | null;
  // Pre-R10 payloads were the bus event itself ({ entity, actor }).
  const ent = payload?.entity as { id?: string; title?: string } | undefined;
  const about = payload && !('entityId' in payload) && !('manual' in payload) && !('vars' in payload) ? (ent ? { entityId: ent.id ?? null, title: ent.title ?? null } : null) : (payload as AutomationRun['about']);
  return { id: r.id as string, ruleId: r.rule_id as string, status: r.status as RunStatus, about, steps, log, startedAt: r.started_at as number, finishedAt: (r.finished_at as number | null) ?? null };
}

/* ------------------------------------------------------------------ */
/* Engine                                                              */
/* ------------------------------------------------------------------ */

const ymd = (at: number) => {
  const d = new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const norm = (s: string) => s.toLowerCase().replace(/^the\s+/, '').replace(/[^a-z0-9]+/g, ' ').trim();

/** Fill a step's settings: every string through the templates, nested values left as they are. */
function fill(config: Record<string, unknown>, ctx: AutomationContext): Record<string, unknown> {
  return Object.fromEntries(Object.entries(config).map(([k, v]) => [k, typeof v === 'string' ? renderTemplate(v, ctx) : v]));
}

/** Plain values only in a step's output (what later steps and the log read). */
function plainOutput(o: Record<string, unknown> | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o ?? {})) {
    if (v == null || ['string', 'number', 'boolean'].includes(typeof v)) out[k] = v;
    else if (Array.isArray(v)) out[k] = v.map((x) => (typeof x === 'object' ? JSON.stringify(x) : x));
  }
  return out;
}

const MODEL_SYSTEM = 'You are one step of a LifeOS automation on the user\'s phone. Answer the prompt in plain words, briefly: a line or two unless it asks for more. No preamble, no markdown, no em dashes.';

/**
 * Trigger → conditions → steps (docs/MODEL.md layer 3 *Automations*).
 * Triggers and actions are contributed by modules through the registry; the
 * engine knows nothing about finance or habits. Each step's output is handed
 * to the next as `steps.<key>`. A re-entrancy guard stops rule loops (a step
 * that creates a record that fires the same rule...).
 */
export class AutomationEngine {
  readonly rules: AutomationRepo;
  /** Claude for the model step; set by the app at boot (tests pass a mock). Null: no key. */
  modelProvider: (() => Promise<BrainModel | null>) | null = null;
  private depth = 0;
  private unsubscribe: (() => void) | null = null;

  constructor(private os: LifeOSContext, private registry: Registry) {
    this.rules = new AutomationRepo(os.db);
  }

  start() {
    this.stop();
    if (!this.os.settings.get<boolean>('automation.stepsV1', false)) {
      this.rules.migrateSteps();
      this.os.settings.set('automation.stepsV1', true);
    }
    this.unsubscribe = bus.onAny((name, payload) => void this.handle(name, payload));
  }
  stop() {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  /** Templates from every module, in registration order. */
  templates(): AutomationTemplate[] {
    return [...this.registry.templates.values()];
  }

  private async handle(name: EventName, payload: CoreEvents[EventName]) {
    if (this.depth > 3) return; // loop guard
    const rules = this.rules.all().filter((r) => r.enabled);
    if (!rules.length) return;
    for (const rule of rules) {
      const trig = this.registry.triggers.get(rule.trigger.id);
      if (!trig || !trig.event || trig.event !== name) continue;
      const ctx = trig.toContext(payload);
      if (!ctx) continue;
      if (!this.triggerConfigMatches(rule, ctx)) continue;
      await this.execute(rule, ctx);
    }
  }

  private triggerConfigMatches(rule: AutomationRule, ctx: AutomationContext): boolean {
    const config = rule.trigger.config;
    if (config.entityType && ctx.entity && ctx.entity.object !== config.entityType) return false;
    if (config.toStatus && ctx.vars.to !== config.toStatus) return false;
    if (config.field && ctx.changed && !ctx.changed.includes(String(config.field)) && !ctx.changed.includes(`data.${config.field}`)) return false;
    if (rule.trigger.id === DAILY_TRIGGER) return this.dailyDue(rule, Number(ctx.vars.at ?? Date.now()));
    return true;
  }

  /** Every day: once a day, at the first tick after its time (08:00 unless set). */
  private dailyDue(rule: AutomationRule, at: number): boolean {
    const [h, m] = String(rule.trigger.config.time || '08:00').split(':').map((x) => Number(x));
    const d = new Date(at);
    if (d.getHours() * 60 + d.getMinutes() < (h || 0) * 60 + (m || 0)) return false;
    const key = `automation.daily.${rule.id}`;
    if (this.os.settings.get<string>(key, '') === ymd(at)) return false;
    this.os.settings.set(key, ymd(at));
    return true;
  }

  /** The enabled manual rule a sentence names: "run month close", "run the month close". */
  findManual(text: string): AutomationRule | undefined {
    const m = /^\s*(?:run|start)\s+(.+?)[\s.!]*$/i.exec(text);
    if (!m) return undefined;
    const said = norm(m[1]!);
    if (!said) return undefined;
    return this.rules.all().find((r) => r.enabled && r.trigger.id === MANUAL_TRIGGER && [String(r.trigger.config.phrase ?? ''), r.name].some((p) => p.trim() && norm(p) === said));
  }

  /** Run a rule by hand (its button, Run now, a sentence). */
  runManual(rule: AutomationRule, said?: string): Promise<AutomationRun> {
    return this.execute(rule, { vars: { said: said ?? null, at: Date.now() } }, { manual: true });
  }

  /** Run a rule against a context. Returns its run (also when skipped). */
  async execute(rule: AutomationRule, ctx: AutomationContext, opts: { manual?: boolean } = {}): Promise<AutomationRun> {
    const log: RunLogLine[] = [];
    const steps: StepRun[] = [];
    const startedAt = Date.now();
    const about: AutomationRun['about'] = { entityId: ctx.entity?.id ?? (ctx.vars.entityId as string | undefined) ?? null, title: ctx.entity?.title ?? null, vars: plainOutput(ctx.vars), ...(opts.manual ? { manual: true } : {}) };
    for (const c of rule.conditions) {
      if (!evaluateCondition(c, ctx)) {
        log.push({ at: Date.now(), level: 'info', msg: `Condition failed: ${c.field} ${c.op} ${JSON.stringify(c.value ?? '')}` });
        return this.rules.recordRun(rule.id, 'skipped', about, steps, log, startedAt);
      }
    }
    const run: AutomationContext = { ...ctx, steps: {} };
    let status: RunStatus = 'ok';
    this.depth++;
    try {
      for (const s of rule.steps) {
        const def = this.registry.actions.get(s.action);
        const input = fill(s.config, run);
        const base = { key: s.key, action: s.action, label: def?.label ?? s.action, input, output: {}, undo: null, canUndo: false, at: Date.now() };
        if (!def) {
          steps.push({ ...base, status: 'failed', line: `Unknown action ${s.action}`, error: `Unknown action ${s.action}` });
          status = 'error';
          break;
        }
        let r: StepResult;
        try {
          const got = await def.run(input, run, this.os);
          r = typeof got === 'string' ? { line: got } : got ?? {};
        } catch (e) {
          const msg = (e as Error).message;
          steps.push({ ...base, status: 'failed', line: msg, error: msg });
          status = 'error';
          break;
        }
        const output = plainOutput(r.output);
        run.steps![s.key] = output;
        const undo = r.undo ?? null;
        steps.push({ ...base, status: r.stop ? 'stopped' : 'done', output, line: r.line ?? def.label, undo, canUndo: undo != null && !!def.undo });
        if (r.stop) break;
      }
    } finally {
      this.depth = Math.max(0, this.depth - 1);
    }
    return this.rules.recordRun(rule.id, status, about, steps, log, startedAt);
  }

  /**
   * Undo a run, last step first, for the steps whose action can be undone.
   * Returns what was undone and the labels of what could not be.
   */
  async undoRun(runId: string): Promise<{ undone: number; kept: string[] }> {
    const run = this.rules.run(runId);
    if (!run) return { undone: 0, kept: [] };
    let undone = 0;
    const kept: string[] = [];
    const steps = run.steps.map((s) => ({ ...s }));
    for (const s of [...steps].reverse()) {
      if (s.status !== 'done') continue;
      const def = this.registry.actions.get(s.action);
      if (!s.canUndo || !def?.undo) {
        kept.push(s.label);
        continue;
      }
      try {
        await def.undo(s.undo, this.os);
        s.status = 'undone';
        undone++;
      } catch (e) {
        kept.push(s.label);
        run.log.push({ at: Date.now(), level: 'error', msg: `Undo ${s.label}: ${(e as Error).message}` });
      }
    }
    if (undone) this.rules.updateRun(run.id, 'undone', steps, run.log);
    return { undone, kept };
  }

  /** Run a rule again on the record its run was about (a failed run's Retry). */
  async retry(runId: string): Promise<AutomationRun | null> {
    const run = this.rules.run(runId);
    const rule = run && this.rules.get(run.ruleId);
    if (!run || !rule) return null;
    if (run.about?.manual) return this.runManual(rule, (run.about.vars?.said as string | undefined) ?? undefined);
    const entity = run.about?.entityId ? this.os.records.get(run.about.entityId) : undefined;
    return this.execute(rule, { entity, vars: { ...(run.about?.vars ?? {}) } });
  }

  /**
   * The model step: one prompt to Claude with the brain's key and model,
   * against the brain's daily budget, logged in Sent to Claude.
   */
  async ask(prompt: string, opts: { maxTokens?: number; why: string }): Promise<{ text: string } | { error: string }> {
    const now = Date.now();
    const maxTokens = Math.max(50, Math.min(4000, Math.round(opts.maxTokens ?? 400)));
    const model = this.modelProvider ? await this.modelProvider().catch(() => null) : null;
    if (!model) return { error: 'no Claude key' };
    const set = brainSettings(this.os);
    if (this.os.brain.sent.tokensToday(now) + Math.ceil((MODEL_SYSTEM.length + prompt.length) / 4) + maxTokens > set.budget) return { error: 'over today’s budget' };
    const base = { at: now, pass: 'automation', why: opts.why, model: model.model, lines: [prompt.slice(0, 600)], records: 1 };
    try {
      const r = await model.complete({ system: MODEL_SYSTEM, user: prompt, maxTokens });
      this.os.brain.sent.add({ ...base, ...r.usage, outcome: 'ok', error: null });
      recordUsage(this.os, { provider: 'claude', model: model.model, purpose: 'brain', input: r.usage.input + r.usage.cacheRead + r.usage.cacheWrite, output: r.usage.output, at: now });
      const text = plainDashes(r.text);
      return text ? { text } : { error: 'Claude gave no answer' };
    } catch (e) {
      const usage = (e as { usage?: { input: number; output: number; cacheRead: number; cacheWrite: number } }).usage ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
      this.os.brain.sent.add({ ...base, ...usage, outcome: 'error', error: (e as Error).message.slice(0, 300) });
      return { error: (e as Error).message };
    }
  }
}
