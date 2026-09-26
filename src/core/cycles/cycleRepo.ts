import type { DatabaseAdapter, Row, SqlParam } from '../db/adapter';
import type { Entity, EntityTypeDef } from '../domain/types';
import { newId } from '../domain/ids';
import { bus, type Actor } from '../events/bus';
import type { TimelineRepo } from '../repo/timelineRepo';
import type { ChangeLog } from '../sync/changeLog';
import { safeJson } from '../repo/entityRepo';
import { cycleStatus, DAY, nextAfterDone, nextAfterSkip, startOfDay, type CycleDue, type CycleKind, type CycleStatus, type CycleUnit } from './schedule';

export interface Cycle {
  id: string;
  entityId: string;
  name: string;
  kind: CycleKind;
  everyN: number | null;
  everyUnit: CycleUnit | null;
  meter: string | null;
  meterEvery: number | null;
  lastDoneAt: number | null;
  lastMeter: number | null;
  nextDueAt: number | null;
  nextDueMeter: number | null;
  leadDays: number;
  costEstimate: number | null;
  currency: string | null;
  notes: string | null;
  prefs: Record<string, unknown>;
  template: string | null;
  snoozedUntil: number | null;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export type CycleInput = Pick<Cycle, 'entityId' | 'name' | 'kind'> & Partial<Omit<Cycle, 'id' | 'entityId' | 'name' | 'kind' | 'createdAt' | 'updatedAt'>>;

export interface MeterReading {
  id: string;
  entityId: string;
  meter: string;
  value: number;
  unit: string | null;
  readAt: number;
  source: string;
  note: string | null;
}

export interface DoneInput {
  at?: number;
  meter?: number | null;
  cost?: number | null;
  note?: string | null;
}

export interface CycleStats {
  count: number;
  /** Most recent first. */
  history: Array<{ eventId: string; at: number; meter: number | null; cost: number | null; note: string | null; late: boolean }>;
  avgIntervalDays: number | null;
  totalCost: number;
  /** Share of completions done on or before their due date. */
  onTimeRate: number | null;
}

const COLS: Array<[keyof Cycle, string]> = [
  ['name', 'name'], ['kind', 'kind'], ['everyN', 'every_n'], ['everyUnit', 'every_unit'], ['meter', 'meter'], ['meterEvery', 'meter_every'],
  ['lastDoneAt', 'last_done_at'], ['lastMeter', 'last_meter'], ['nextDueAt', 'next_due_at'], ['nextDueMeter', 'next_due_meter'], ['leadDays', 'lead_days'],
  ['costEstimate', 'cost_estimate'], ['currency', 'currency'], ['notes', 'notes'], ['prefs', 'prefs'], ['template', 'template'], ['snoozedUntil', 'snoozed_until'], ['enabled', 'enabled'],
];

/**
 * Cycles on any record. Every change is logged; "done", "skipped", "snoozed"
 * and "next due set" land on the record's timeline as `cycle.*` events with
 * meta.cycleId, which is also the cycle's history (stats read it back).
 */
export class CycleRepo {
  constructor(private db: DatabaseAdapter, private timeline: TimelineRepo, private changes: ChangeLog) {}

  /** Set by the core: writes a cycle's dates back into its record's fields (EntityTypeDef.cycleFields). */
  onChanged?: (cycle: Cycle) => void;

  /** Set by the core: mirrors the latest reading into the record's meter field (odometerKm). */
  onReading?: (entityId: string, meter: string, actor: Actor) => void;

  /** Latest reading of a meter on a record (odometer by default). */
  latestMeter(entityId: string, meter = 'odometer'): number | null {
    return this.db.get<{ value: number }>(`SELECT value FROM meter_readings WHERE entity_id=? AND meter=? AND deleted_at IS NULL ORDER BY read_at DESC, rowid DESC LIMIT 1`, [entityId, meter])?.value ?? null;
  }

  /** Readings of a meter, newest first. */
  readings(entityId: string, meter = 'odometer', limit = 50): MeterReading[] {
    return this.db
      .all<Row>(`SELECT * FROM meter_readings WHERE entity_id=? AND meter=? AND deleted_at IS NULL ORDER BY read_at DESC, rowid DESC LIMIT ?`, [entityId, meter, limit])
      .map((r) => ({ id: r.id as string, entityId: r.entity_id as string, meter: r.meter as string, value: r.value as number, unit: (r.unit as string | null) ?? null, readAt: r.read_at as number, source: r.source as string, note: (r.note as string | null) ?? null }));
  }

  /**
   * Log a meter reading ("Creta at 34,200 km"). Lands on the timeline; cycles
   * on the record compute from the latest reading. Returns the reading id for Undo.
   */
  logMeter(entityId: string, value: number, opts: { meter?: string; unit?: string | null; at?: number; note?: string | null; label?: string } = {}, actor: Actor = 'user'): string {
    const meter = opts.meter ?? 'odometer';
    const at = opts.at ?? Date.now();
    const now = Date.now();
    const id = newId(now);
    this.db.transaction(() => {
      this.db.run(`INSERT INTO meter_readings(id,entity_id,meter,value,unit,read_at,source,note,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`, [id, entityId, meter, value, opts.unit ?? null, at, actor, opts.note ?? null, now, now]);
      this.changes.record('meter_readings', id, 'insert', 1);
      this.timeline.add({ entityId, kind: 'meter.reading', title: `${opts.label ?? 'Odometer'} ${value.toLocaleString('en-IN')}${opts.unit ? ` ${opts.unit}` : ''}`, body: opts.note ?? null, actor, occurredAt: at, meta: { readingId: id, meter, value } });
    });
    this.onReading?.(entityId, meter, actor);
    bus.emit('data.changed', { table: 'meter_readings', id });
    return id;
  }

  /** Remove a reading (Undo). Its timeline entry goes with it. */
  removeReading(id: string): void {
    this.db.transaction(() => {
      this.db.run(`UPDATE meter_readings SET deleted_at=?, version=version+1 WHERE id=?`, [Date.now(), id]);
      this.changes.record('meter_readings', id, 'delete', 1);
      this.db.run(`DELETE FROM timeline_events WHERE kind='meter.reading' AND json_extract(meta,'$.readingId')=?`, [id]);
    });
    const r = this.db.get<{ entity_id: string; meter: string }>(`SELECT entity_id, meter FROM meter_readings WHERE id=?`, [id]);
    if (r) this.onReading?.(r.entity_id, r.meter, 'user');
    bus.emit('data.changed', { table: 'meter_readings', id });
  }

  create(input: CycleInput, actor: Actor = 'user'): Cycle {
    const now = Date.now();
    const id = newId(now);
    const c: Cycle = {
      id, entityId: input.entityId, name: input.name, kind: input.kind,
      everyN: input.everyN ?? null, everyUnit: input.everyUnit ?? null,
      meter: input.meter ?? (input.kind === 'meter' || input.kind === 'either' ? 'odometer' : null), meterEvery: input.meterEvery ?? null,
      lastDoneAt: input.lastDoneAt ?? null, lastMeter: input.lastMeter ?? null, nextDueAt: input.nextDueAt ?? null, nextDueMeter: input.nextDueMeter ?? null,
      leadDays: input.leadDays ?? 0, costEstimate: input.costEstimate ?? null, currency: input.currency ?? null, notes: input.notes ?? null,
      prefs: input.prefs ?? {}, template: input.template ?? null, snoozedUntil: null, enabled: input.enabled ?? true, createdAt: now, updatedAt: now,
    };
    // Fill the first due date from "last done" when only that is known.
    if (c.nextDueAt == null && c.nextDueMeter == null && (c.lastDoneAt != null || c.lastMeter != null)) {
      const meter = c.lastMeter ?? (c.meter ? this.latestMeter(c.entityId, c.meter) : null);
      Object.assign(c, nextAfterDone(c, c.lastDoneAt ?? now, meter, null));
    }
    // A pure meter cycle (tyre rotation every 8,000 km) starts counting from the latest reading.
    if (c.kind === 'meter' && c.nextDueMeter == null && c.meterEvery && c.meter && c.lastMeter == null) {
      const m = this.latestMeter(c.entityId, c.meter);
      if (m != null) c.nextDueMeter = m + c.meterEvery;
    }
    this.db.run(
      `INSERT INTO cycles(id,entity_id,${COLS.map(([, col]) => col).join(',')},created_at,updated_at) VALUES (?,?,${COLS.map(() => '?').join(',')},?,?)`,
      [id, c.entityId, ...COLS.map(([k]) => toDb(c[k])), now, now],
    );
    this.changes.record('cycles', id, 'insert', 1);
    bus.emit('data.changed', { table: 'cycles', id });
    void actor;
    return c;
  }

  /**
   * Give a record its type's default cycles. A template already applied —
   * even if the user later deleted that cycle — is not added again.
   */
  applyTemplates(entity: Entity, def: EntityTypeDef | undefined, actor: Actor = 'system'): Cycle[] {
    if (!def?.cycleTemplates) return [];
    const seen = new Set(this.db.all<{ template: string }>(`SELECT template FROM cycles WHERE entity_id=? AND template IS NOT NULL`, [entity.id]).map((r) => r.template));
    const made: Cycle[] = [];
    for (const seed of def.cycleTemplates(entity.data as never)) {
      if (seen.has(seed.template)) continue;
      made.push(this.create({ ...seed, entityId: entity.id }, actor));
    }
    return made;
  }

  /**
   * Keep template cycles in step with an edited record: the rule (every N,
   * meter, lead, cost) always follows; a due date moves only when the field it
   * comes from changed, so a rolled cycle is not reset by an unrelated edit.
   */
  syncTemplates(entity: Entity, previous: Entity, def: EntityTypeDef | undefined): void {
    if (!def?.cycleTemplates) return;
    const before = new Map(def.cycleTemplates(previous.data as never).map((s) => [s.template, s]));
    const live = new Map(this.forEntity(entity.id).filter((c) => c.template).map((c) => [c.template!, c]));
    for (const seed of def.cycleTemplates(entity.data as never)) {
      const c = live.get(seed.template);
      if (!c) {
        // A field that seeds a cycle was just filled (a birthday, a warranty date): add that cycle, once.
        const ever = this.db.get(`SELECT 1 AS x FROM cycles WHERE entity_id=? AND template=?`, [entity.id, seed.template]);
        if (!before.has(seed.template) && !ever) {
          this.create({ ...seed, entityId: entity.id }, 'system');
          bus.emit('data.changed', { table: 'cycles', id: entity.id });
        }
        continue;
      }
      const old = before.get(seed.template);
      const patch: Partial<Cycle> = { name: seed.name, kind: seed.kind, everyN: seed.everyN ?? null, everyUnit: seed.everyUnit ?? null, meterEvery: seed.meterEvery ?? null, leadDays: seed.leadDays ?? 0, costEstimate: seed.costEstimate ?? null, currency: seed.currency ?? null };
      if (seed.nextDueAt != null && seed.nextDueAt !== old?.nextDueAt) patch.nextDueAt = seed.nextDueAt;
      if (seed.nextDueMeter != null && seed.nextDueMeter !== old?.nextDueMeter) patch.nextDueMeter = seed.nextDueMeter;
      const changed = (Object.keys(patch) as Array<keyof Cycle>).some((k) => JSON.stringify(patch[k]) !== JSON.stringify(c[k]));
      if (changed) {
        this.update(c.id, patch);
        bus.emit('data.changed', { table: 'cycles', id: c.id });
      }
      // "Last done" moved forward on the record (Log contact today, a date typed in the form): that's a done.
      if (seed.lastDoneAt != null && seed.lastDoneAt !== old?.lastDoneAt && (c.lastDoneAt == null || startOfDay(seed.lastDoneAt) > startOfDay(c.lastDoneAt))) {
        this.markDone(c.id, { at: seed.lastDoneAt }, 'user');
      }
    }
  }

  get(id: string): Cycle | null {
    const r = this.db.get<Row>(`SELECT * FROM cycles WHERE id=? AND deleted_at IS NULL`, [id]);
    return r ? toCycle(r) : null;
  }

  forEntity(entityId: string): Cycle[] {
    return this.db.all<Row>(`SELECT * FROM cycles WHERE entity_id=? AND deleted_at IS NULL ORDER BY sort_order, created_at`, [entityId]).map(toCycle);
  }

  /** Every enabled cycle on a live record, soonest first (undated last). */
  all(): Cycle[] {
    return this.db
      .all<Row>(`SELECT c.* FROM cycles c JOIN entities e ON e.id=c.entity_id WHERE c.deleted_at IS NULL AND c.enabled=1 AND e.deleted_at IS NULL AND e.archived=0 ORDER BY c.next_due_at IS NULL, c.next_due_at`)
      .map(toCycle);
  }

  status(c: Cycle, now = Date.now()): CycleStatus {
    return cycleStatus(c, now, c.meter ? this.latestMeter(c.entityId, c.meter) : null);
  }

  update(id: string, patch: Partial<Omit<Cycle, 'id' | 'entityId' | 'createdAt' | 'updatedAt'>>): Cycle {
    const cur = this.get(id);
    if (!cur) throw new Error(`Cycle ${id} not found`);
    const next: Cycle = { ...cur, ...patch, updatedAt: Date.now() };
    this.write(next);
    return next;
  }

  /**
   * Did it: log a `cycle.done` event (with cost / meter / note) and roll the
   * cycle. Returns the event id — pass it to `undoDone` for Undo.
   */
  markDone(id: string, input: DoneInput = {}, actor: Actor = 'user'): string {
    const c = this.get(id);
    if (!c) throw new Error(`Cycle ${id} not found`);
    const at = input.at ?? Date.now();
    const meter = input.meter ?? (c.meter ? this.latestMeter(c.entityId, c.meter) : null);
    const prev = pick(c);
    const due = nextAfterDone(c, at, meter, c.nextDueAt);
    const late = (c.nextDueAt != null && at > c.nextDueAt + DAY) || (c.nextDueMeter != null && meter != null && meter > c.nextDueMeter);
    let eventId = '';
    let readingId: string | null = null;
    this.db.transaction(() => {
      this.write({ ...c, ...due, lastDoneAt: at, lastMeter: meter ?? c.lastMeter, snoozedUntil: null, updatedAt: Date.now() });
      if (input.meter != null && c.meter) readingId = this.addReading(c.entityId, c.meter, input.meter, at, actor);
      eventId = this.timeline.add({
        entityId: c.entityId, kind: 'cycle.done', title: `${c.name} done`, body: input.note ?? null, actor, occurredAt: at,
        meta: { cycleId: c.id, meter: meter ?? null, cost: input.cost ?? null, late, prev, readingId },
      }).id;
    });
    bus.emit('data.changed', { table: 'cycles', id });
    return eventId;
  }

  /** Undo a markDone: restore the cycle as it was and drop the event. */
  undoDone(eventId: string): void {
    const ev = this.db.get<Row>(`SELECT * FROM timeline_events WHERE id=? AND kind='cycle.done'`, [eventId]);
    if (!ev) return;
    const meta = safeJson(ev.meta as string) as { cycleId: string; prev?: Partial<Cycle>; readingId?: string | null };
    const c = this.get(meta.cycleId);
    this.db.transaction(() => {
      if (c) this.write({ ...c, ...(meta.prev ?? {}), updatedAt: Date.now() });
      if (meta.readingId) this.db.run(`UPDATE meter_readings SET deleted_at=?, version=version+1 WHERE id=?`, [Date.now(), meta.readingId]);
      this.timeline.remove(eventId);
    });
    bus.emit('data.changed', { table: 'cycles', id: meta.cycleId });
  }

  /** Hide from "due" until a time (it still shows, marked snoozed). */
  snooze(id: string, until: number, actor: Actor = 'user'): void {
    const c = this.update(id, { snoozedUntil: until });
    this.timeline.add({ entityId: c.entityId, kind: 'cycle.snoozed', title: `${c.name} snoozed`, actor, occurredAt: Date.now(), meta: { cycleId: id, until } });
  }

  /** "Jio runs out on the 30th": set the next due date (and/or meter) directly. */
  setNextDue(id: string, due: Partial<CycleDue>, actor: Actor = 'user'): void {
    const c = this.update(id, { ...due, snoozedUntil: null });
    this.timeline.add({ entityId: c.entityId, kind: 'cycle.set', title: `${c.name} next due set`, actor, occurredAt: Date.now(), meta: { cycleId: id, ...due } });
  }

  /** Skip this occurrence: due moves on one period, nothing is logged as done. */
  skip(id: string, actor: Actor = 'user'): void {
    const c = this.get(id);
    if (!c) throw new Error(`Cycle ${id} not found`);
    const due = nextAfterSkip(c, c, Date.now());
    this.update(id, { ...due, snoozedUntil: null });
    this.timeline.add({ entityId: c.entityId, kind: 'cycle.skipped', title: `${c.name} skipped`, actor, occurredAt: Date.now(), meta: { cycleId: id } });
  }

  remove(id: string): void {
    this.db.run(`UPDATE cycles SET deleted_at=?, version=version+1 WHERE id=?`, [Date.now(), id]);
    this.changes.record('cycles', id, 'delete', 1);
    bus.emit('data.changed', { table: 'cycles', id });
  }

  restore(id: string): void {
    this.db.run(`UPDATE cycles SET deleted_at=NULL, version=version+1 WHERE id=?`, [id]);
    this.changes.record('cycles', id, 'update', 1);
    bus.emit('data.changed', { table: 'cycles', id });
  }

  stats(id: string): CycleStats {
    const rows = this.db.all<Row>(`SELECT * FROM timeline_events WHERE kind='cycle.done' AND json_extract(meta,'$.cycleId')=? ORDER BY occurred_at DESC`, [id]);
    const history = rows.map((r) => {
      const m = safeJson(r.meta as string);
      return { eventId: r.id as string, at: r.occurred_at as number, meter: (m.meter as number | null) ?? null, cost: (m.cost as number | null) ?? null, note: (r.body as string | null) ?? null, late: m.late === true };
    });
    const gaps = history.slice(0, -1).map((h, i) => (h.at - history[i + 1]!.at) / DAY);
    return {
      count: history.length,
      history,
      avgIntervalDays: gaps.length ? Math.round((gaps.reduce((a, b) => a + b, 0) / gaps.length) * 10) / 10 : null,
      totalCost: history.reduce((a, h) => a + (h.cost ?? 0), 0),
      onTimeRate: history.length ? history.filter((h) => !h.late).length / history.length : null,
    };
  }

  private addReading(entityId: string, meter: string, value: number, at: number, actor: Actor): string {
    const now = Date.now();
    const id = newId(now);
    this.db.run(`INSERT INTO meter_readings(id,entity_id,meter,value,read_at,source,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)`, [id, entityId, meter, value, at, actor, now, now]);
    return id;
  }

  private write(c: Cycle) {
    this.db.run(`UPDATE cycles SET ${COLS.map(([, col]) => `${col}=?`).join(',')}, updated_at=?, version=version+1 WHERE id=?`, [...COLS.map(([k]) => toDb(c[k])), c.updatedAt, c.id]);
    this.changes.record('cycles', c.id, 'update', 1);
    if (c.template) this.onChanged?.(c);
  }
}

function pick(c: Cycle): Partial<Cycle> {
  return { lastDoneAt: c.lastDoneAt, lastMeter: c.lastMeter, nextDueAt: c.nextDueAt, nextDueMeter: c.nextDueMeter, snoozedUntil: c.snoozedUntil };
}

function toDb(v: unknown): SqlParam {
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v && typeof v === 'object') return JSON.stringify(v);
  return (v ?? null) as SqlParam;
}

function toCycle(r: Row): Cycle {
  const n = (k: string) => (r[k] as number | null) ?? null;
  return {
    id: r.id as string, entityId: r.entity_id as string, name: r.name as string, kind: r.kind as CycleKind,
    everyN: n('every_n'), everyUnit: (r.every_unit as CycleUnit | null) ?? null, meter: (r.meter as string | null) ?? null, meterEvery: n('meter_every'),
    lastDoneAt: n('last_done_at'), lastMeter: n('last_meter'), nextDueAt: n('next_due_at'), nextDueMeter: n('next_due_meter'), leadDays: (r.lead_days as number) ?? 0,
    costEstimate: n('cost_estimate'), currency: (r.currency as string | null) ?? null, notes: (r.notes as string | null) ?? null,
    prefs: safeJson(r.prefs as string), template: (r.template as string | null) ?? null, snoozedUntil: n('snoozed_until'), enabled: r.enabled === 1,
    createdAt: r.created_at as number, updatedAt: r.updated_at as number,
  };
}
