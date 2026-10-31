import type { DatabaseAdapter, Row } from '../db/adapter';
import { newId } from '../domain/ids';
import { bus } from '../events/bus';
import type { Candidate, Nudge, NudgeState } from './contract';

/**
 * Where the brain keeps what it does and learns (migration v16, in backups):
 * the nudges it filed, the learned store (answers by key, facts, Not this),
 * its Skills and the Sent to Claude log. `os.brain`.
 */

const DAY = 86_400_000;
const json = (v: unknown) => {
  if (v == null) return null;
  try {
    return JSON.parse(String(v));
  } catch {
    return null;
  }
};
const changed = (id: string) => bus.emit('data.changed', { table: 'brain', id });

export function startOfDay(at: number): number {
  const d = new Date(at);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export type LearnedKind = 'answer' | 'fact' | 'not-this' | 'held';
export type LearnedSource = 'claude' | 'you' | 'code';

export interface Learned {
  key: string;
  module: string;
  kind: LearnedKind;
  value: unknown;
  source: LearnedSource;
  uses: number;
  createdAt: number;
  updatedAt: number;
}

const toLearned = (r: Row): Learned => ({ key: r.key as string, module: r.module as string, kind: r.kind as LearnedKind, value: json(r.value), source: r.source as LearnedSource, uses: r.uses as number, createdAt: r.created_at as number, updatedAt: r.updated_at as number });

export class LearnedStore {
  constructor(private db: DatabaseAdapter) {}
  get<T = unknown>(key: string): T | undefined {
    const r = this.db.get<Row>(`SELECT * FROM brain_learned WHERE key=?`, [key]);
    return r ? (toLearned(r).value as T) : undefined;
  }
  has(key: string): boolean {
    return !!this.db.get(`SELECT 1 FROM brain_learned WHERE key=?`, [key]);
  }
  put(key: string, value: unknown, opts: { module: string; kind?: LearnedKind; source?: LearnedSource; at?: number }) {
    const at = opts.at ?? Date.now();
    this.db.run(
      `INSERT INTO brain_learned(key,module,kind,value,source,uses,created_at,updated_at) VALUES (?,?,?,?,?,0,?,?)
       ON CONFLICT(key) DO UPDATE SET value=excluded.value, kind=excluded.kind, source=excluded.source, updated_at=excluded.updated_at`,
      [key, opts.module, opts.kind ?? 'answer', JSON.stringify(value), opts.source ?? 'claude', at, at],
    );
    changed(key);
  }
  /** Counts a use (an answer that saved a call). */
  used(key: string) {
    this.db.run(`UPDATE brain_learned SET uses = uses + 1 WHERE key=?`, [key]);
  }
  forget(key: string) {
    this.db.run(`DELETE FROM brain_learned WHERE key=?`, [key]);
    changed(key);
  }
  all(opts: { kinds?: LearnedKind[]; limit?: number } = {}): Learned[] {
    const kinds = opts.kinds ?? ['answer', 'fact', 'not-this'];
    return this.db.all<Row>(`SELECT * FROM brain_learned WHERE kind IN (${kinds.map(() => '?').join(',')}) ORDER BY updated_at DESC LIMIT ?`, [...kinds, opts.limit ?? 500]).map(toLearned);
  }
}

export interface Skill {
  id: string;
  module: string;
  name: string;
  body: string;
  source: LearnedSource;
  updatedAt: number;
}

export class SkillStore {
  constructor(private db: DatabaseAdapter) {}
  /** Adds or replaces the skill `module/name`. A skill you edited is not overwritten by code's seed. */
  put(s: { module: string; name: string; body: string; source: LearnedSource }, opts: { seed?: boolean } = {}) {
    const id = `${s.module}/${s.name}`;
    const cur = this.db.get<{ source: string; body: string }>(`SELECT source, body FROM brain_skills WHERE id=?`, [id]);
    if (cur && opts.seed && (cur.source !== 'code' || cur.body === s.body)) return;
    const at = Date.now();
    this.db.run(
      `INSERT INTO brain_skills(id,module,name,body,source,created_at,updated_at) VALUES (?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET body=excluded.body, source=excluded.source, updated_at=excluded.updated_at`,
      [id, s.module, s.name, s.body.trim(), s.source, at, at],
    );
    changed(id);
  }
  remove(id: string) {
    this.db.run(`DELETE FROM brain_skills WHERE id=?`, [id]);
    changed(id);
  }
  /** In a stable order, so the cached prompt does not change between passes. */
  all(): Skill[] {
    return this.db.all<Row>(`SELECT * FROM brain_skills ORDER BY id`).map((r) => ({ id: r.id as string, module: r.module as string, name: r.name as string, body: r.body as string, source: r.source as LearnedSource, updatedAt: r.updated_at as number }));
  }
}

const toNudge = (r: Row): Nudge => ({
  id: r.id as string,
  key: r.key as string,
  module: r.module as string,
  kind: r.kind as Nudge['kind'],
  shape: r.shape as Nudge['shape'],
  passId: r.pass_id as string,
  filingId: (r.filing_id as string | null) ?? null,
  recordId: (r.record_id as string | null) ?? null,
  route: (r.route as string | null) ?? null,
  title: r.title as string,
  line: r.line as string,
  yes: (r.yes as string | null) ?? null,
  urgent: r.urgent === 1,
  payload: json(r.payload),
  undo: json(r.undo),
  state: r.state as NudgeState,
  notifiedAt: (r.notified_at as number | null) ?? null,
  createdAt: r.created_at as number,
  updatedAt: r.updated_at as number,
});

export class NudgeStore {
  constructor(private db: DatabaseAdapter) {}
  add(module: string, c: Candidate, x: { passId: string; line: string; at: number }): Nudge {
    const id = newId(x.at);
    this.db.run(`INSERT INTO nudges(id,key,module,kind,shape,pass_id,record_id,route,title,line,yes,urgent,payload,state,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'open',?,?)`, [
      id, c.key, module, c.kind, c.shape, x.passId, c.subjectId ?? null, c.route ?? null, c.title, x.line, c.yes ?? null, c.urgent ? 1 : 0, c.payload === undefined ? null : JSON.stringify(c.payload), x.at, x.at,
    ]);
    changed(id);
    return this.get(id)!;
  }
  get(id: string): Nudge | null {
    const r = this.db.get<Row>(`SELECT * FROM nudges WHERE id=?`, [id]);
    return r ? toNudge(r) : null;
  }
  forFiling(filingId: string): Nudge | null {
    const r = this.db.get<Row>(`SELECT * FROM nudges WHERE filing_id=?`, [filingId]);
    return r ? toNudge(r) : null;
  }
  update(id: string, patch: { filingId?: string; state?: NudgeState; undo?: unknown; notifiedAt?: number; at?: number }) {
    const n = this.get(id);
    if (!n) return;
    this.db.run(`UPDATE nudges SET filing_id=?, state=?, undo=?, notified_at=?, updated_at=? WHERE id=?`, [
      patch.filingId ?? n.filingId,
      patch.state ?? n.state,
      patch.undo !== undefined ? JSON.stringify(patch.undo) : n.undo == null ? null : JSON.stringify(n.undo),
      patch.notifiedAt ?? n.notifiedAt,
      patch.at ?? Date.now(),
      id,
    ]);
    changed(id);
  }
  /** Was this key ever filed? */
  filed(key: string): boolean {
    return !!this.db.get(`SELECT 1 FROM nudges WHERE key=?`, [key]);
  }
  /** Nudges filed since `since`, newest pass first, urgent first inside it. */
  since(since: number): Nudge[] {
    return this.db.all<Row>(`SELECT * FROM nudges WHERE created_at >= ? ORDER BY created_at DESC, urgent DESC, rowid`, [since]).map(toNudge);
  }
  filedToday(module: string, now: number): number {
    return this.db.get<{ n: number }>(`SELECT COUNT(*) n FROM nudges WHERE module=? AND created_at >= ?`, [module, startOfDay(now)])?.n ?? 0;
  }
  notifiedToday(now: number): number {
    return this.db.get<{ n: number }>(`SELECT COUNT(*) n FROM nudges WHERE notified_at IS NOT NULL AND created_at >= ?`, [startOfDay(now)])?.n ?? 0;
  }
  /** What you did with a module's nudges over the last `days`: Not this, and acted on (yes / kept). */
  answers(module: string, now: number, days = 14): { no: number; yes: number } {
    const r = this.db.get<{ no: number; yes: number }>(`SELECT SUM(state='no') no, SUM(state='yes') yes FROM nudges WHERE module=? AND created_at >= ?`, [module, now - days * DAY]);
    return { no: r?.no ?? 0, yes: r?.yes ?? 0 };
  }
}

export interface SentEntry {
  id: string;
  at: number;
  pass: string;
  why: string;
  model: string;
  /** What left, line by line ("Home · going off · Paneer: bought Mon, use by tomorrow"). */
  lines: string[];
  records: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  outcome: 'ok' | 'error';
  error: string | null;
}

export class SentLog {
  constructor(private db: DatabaseAdapter) {}
  add(e: Omit<SentEntry, 'id'>): SentEntry {
    const id = newId(e.at);
    this.db.run(`INSERT INTO brain_sent(id,at,pass,why,model,lines,records,input_tokens,output_tokens,cache_read,cache_write,outcome,error) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
      id, e.at, e.pass, e.why, e.model, JSON.stringify(e.lines), e.records, e.input, e.output, e.cacheRead, e.cacheWrite, e.outcome, e.error,
    ]);
    changed(id);
    return { id, ...e };
  }
  recent(limit = 30): SentEntry[] {
    return this.db.all<Row>(`SELECT * FROM brain_sent ORDER BY at DESC LIMIT ?`, [limit]).map((r) => ({
      id: r.id as string,
      at: r.at as number,
      pass: r.pass as string,
      why: r.why as string,
      model: r.model as string,
      lines: (json(r.lines) as string[] | null) ?? [],
      records: r.records as number,
      input: r.input_tokens as number,
      output: r.output_tokens as number,
      cacheRead: r.cache_read as number,
      cacheWrite: r.cache_write as number,
      outcome: r.outcome as SentEntry['outcome'],
      error: (r.error as string | null) ?? null,
    }));
  }
  /**
   * Tokens spent today against the daily budget: input and output in full,
   * cache writes in full, cache reads at a tenth (what they cost).
   */
  tokensToday(now: number): number {
    const r = this.db.get<{ n: number }>(`SELECT COALESCE(SUM(input_tokens + output_tokens + cache_write + cache_read / 10), 0) n FROM brain_sent WHERE at >= ?`, [startOfDay(now)]);
    return Math.round(r?.n ?? 0);
  }
}

export class BrainStore {
  learned: LearnedStore;
  skills: SkillStore;
  nudges: NudgeStore;
  sent: SentLog;
  constructor(db: DatabaseAdapter) {
    this.learned = new LearnedStore(db);
    this.skills = new SkillStore(db);
    this.nudges = new NudgeStore(db);
    this.sent = new SentLog(db);
  }
}
