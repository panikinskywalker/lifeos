import type { DatabaseAdapter, Row } from '../db/adapter';
import type { FilterClause } from '../domain/types';
import { newId } from '../domain/ids';
import { bus, type CoreEvents, type EventName } from '../events/bus';
import type { Registry } from '../registry/registry';
import type { AutomationContext } from '../registry/types';
import type { LifeOSContext } from '../registry/context';
import { safeJson } from '../repo/entityRepo';
import { evaluateCondition, renderTemplate } from './conditions';

/* ------------------------------------------------------------------ */
/* Rule model                                                          */
/* ------------------------------------------------------------------ */

export interface RuleTrigger {
  /** Registered trigger id (e.g. "core.entity.created") */
  id: string;
  config: Record<string, unknown>; // e.g. { entityType: 'transaction' }
}
export interface RuleAction {
  id: string; // registered action id
  config: Record<string, unknown>;
}
export interface AutomationRule {
  id: string;
  name: string;
  enabled: boolean;
  trigger: RuleTrigger;
  conditions: FilterClause[]; // evaluated against ctx.entity (+ vars via "vars.x")
  actions: RuleAction[];
  lastRunAt?: number | null;
  runCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface RunLogLine {
  at: number;
  level: 'info' | 'error';
  msg: string;
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
  save(rule: Omit<AutomationRule, 'id' | 'runCount' | 'createdAt' | 'updatedAt'> & { id?: string }): AutomationRule {
    const now = Date.now();
    if (rule.id && this.get(rule.id)) {
      this.db.run(`UPDATE automation_rules SET name=?, enabled=?, trigger=?, conditions=?, actions=?, updated_at=? WHERE id=?`, [rule.name, rule.enabled ? 1 : 0, JSON.stringify(rule.trigger), JSON.stringify(rule.conditions), JSON.stringify(rule.actions), now, rule.id]);
      return this.get(rule.id)!;
    }
    const id = rule.id ?? newId(now);
    this.db.run(`INSERT INTO automation_rules(id,name,enabled,trigger,conditions,actions,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)`, [id, rule.name, rule.enabled ? 1 : 0, JSON.stringify(rule.trigger), JSON.stringify(rule.conditions), JSON.stringify(rule.actions), now, now]);
    return this.get(id)!;
  }
  setEnabled(id: string, enabled: boolean) {
    this.db.run(`UPDATE automation_rules SET enabled=?, updated_at=? WHERE id=?`, [enabled ? 1 : 0, Date.now(), id]);
  }
  remove(id: string) {
    this.db.run(`UPDATE automation_rules SET deleted_at=? WHERE id=?`, [Date.now(), id]);
  }
  recordRun(ruleId: string, status: 'ok' | 'error' | 'skipped', payload: unknown, log: RunLogLine[], startedAt: number) {
    this.db.run(`INSERT INTO automation_runs(id,rule_id,status,trigger_payload,log,started_at,finished_at) VALUES (?,?,?,?,?,?,?)`, [newId(), ruleId, status, JSON.stringify(payload ?? null).slice(0, 4000), JSON.stringify(log), startedAt, Date.now()]);
    if (status === 'ok') this.db.run(`UPDATE automation_rules SET last_run_at=?, run_count=run_count+1 WHERE id=?`, [Date.now(), ruleId]);
  }
  runs(ruleId?: string, limit = 50) {
    const rows = ruleId
      ? this.db.all<Row>(`SELECT * FROM automation_runs WHERE rule_id=? ORDER BY started_at DESC LIMIT ?`, [ruleId, limit])
      : this.db.all<Row>(`SELECT * FROM automation_runs ORDER BY started_at DESC LIMIT ?`, [limit]);
    return rows.map((r) => ({ id: r.id as string, ruleId: r.rule_id as string, status: r.status as string, log: (safeJson(r.log as string) as unknown as RunLogLine[]) ?? [], startedAt: r.started_at as number, finishedAt: (r.finished_at as number | null) ?? null }));
  }
}

function toRule(r: Row): AutomationRule {
  return {
    id: r.id as string, name: r.name as string, enabled: !!r.enabled,
    trigger: safeJson(r.trigger as string) as unknown as RuleTrigger,
    conditions: (JSON.parse((r.conditions as string) || '[]') as FilterClause[]) ?? [],
    actions: (JSON.parse((r.actions as string) || '[]') as RuleAction[]) ?? [],
    lastRunAt: (r.last_run_at as number | null) ?? null, runCount: Number(r.run_count ?? 0),
    createdAt: r.created_at as number, updatedAt: r.updated_at as number,
  };
}

/* ------------------------------------------------------------------ */
/* Engine                                                              */
/* ------------------------------------------------------------------ */

/**
 * Trigger → conditions → actions. Triggers and actions are contributed by
 * modules through the registry; the engine itself knows nothing about
 * finance or habits. A re-entrancy guard stops rule loops (an action that
 * creates an entity that fires the same rule...).
 */
export class AutomationEngine {
  readonly rules: AutomationRepo;
  private depth = 0;
  private unsubscribe: (() => void) | null = null;

  constructor(private os: LifeOSContext, private registry: Registry) {
    this.rules = new AutomationRepo(os.db);
  }

  start() {
    this.stop();
    this.unsubscribe = bus.onAny((name, payload) => void this.handle(name, payload));
  }
  stop() {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  private async handle(name: EventName, payload: CoreEvents[EventName]) {
    if (this.depth > 3) return; // loop guard
    const rules = this.rules.all().filter((r) => r.enabled);
    if (!rules.length) return;
    for (const rule of rules) {
      const trig = this.registry.triggers.get(rule.trigger.id);
      if (!trig || trig.event !== name) continue;
      const ctx = trig.toContext(payload);
      if (!ctx) continue;
      if (!this.triggerConfigMatches(rule.trigger.config, ctx)) continue;
      await this.execute(rule, ctx, payload);
    }
  }

  private triggerConfigMatches(config: Record<string, unknown>, ctx: AutomationContext): boolean {
    if (config.entityType && ctx.entity && ctx.entity.type !== config.entityType) return false;
    if (config.toStatus && ctx.vars.to !== config.toStatus) return false;
    if (config.field && ctx.changed && !ctx.changed.includes(String(config.field)) && !ctx.changed.includes(`data.${config.field}`)) return false;
    return true;
  }

  /** Run a rule against a context (also used by "Run now" in the UI). */
  async execute(rule: AutomationRule, ctx: AutomationContext, payload?: unknown) {
    const log: RunLogLine[] = [];
    const startedAt = Date.now();
    const info = (msg: string) => log.push({ at: Date.now(), level: 'info', msg });
    try {
      for (const c of rule.conditions) {
        if (!evaluateCondition(c, ctx)) {
          info(`Condition failed: ${c.field} ${c.op} ${JSON.stringify(c.value ?? '')}`);
          this.rules.recordRun(rule.id, 'skipped', payload, log, startedAt);
          return;
        }
      }
      this.depth++;
      for (const a of rule.actions) {
        const def = this.registry.actions.get(a.id);
        if (!def) {
          log.push({ at: Date.now(), level: 'error', msg: `Unknown action ${a.id}` });
          continue;
        }
        const rendered = Object.fromEntries(Object.entries(a.config).map(([k, v]) => [k, typeof v === 'string' ? renderTemplate(v, ctx) : v]));
        const result = await def.run(rendered, ctx, this.os);
        info(`${def.label}${result ? `: ${result}` : ''}`);
      }
      this.rules.recordRun(rule.id, 'ok', payload, log, startedAt);
    } catch (e) {
      log.push({ at: Date.now(), level: 'error', msg: (e as Error).message });
      this.rules.recordRun(rule.id, 'error', payload, log, startedAt);
    } finally {
      this.depth = Math.max(0, this.depth - 1);
    }
  }
}
