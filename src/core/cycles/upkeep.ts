import type { Entity, EntityTypeDef } from '../domain/types';
import type { LifeOSContext } from '../registry/context';
import type { Cycle } from './cycleRepo';
import { addPeriod, startOfDay, type CycleStatus, type UpkeepBucket } from './schedule';

/** Upkeep filter chips → record types (PRODUCT §5, SCOPE C2). */
export const UPKEEP_FILTERS = {
  Subscriptions: ['subscription'],
  Vehicles: ['vehicle'],
  Things: ['asset', 'item'],
  Chores: ['routine'],
  People: ['person'],
  Documents: ['document'],
} as const satisfies Record<string, readonly string[]>;
export type UpkeepFilter = 'All' | keyof typeof UPKEEP_FILTERS;

export interface UpkeepItem {
  cycle: Cycle;
  entity: Entity;
  def: EntityTypeDef | undefined;
  status: CycleStatus;
}

export interface Upkeep {
  items: UpkeepItem[];
  sections: Record<UpkeepBucket, UpkeepItem[]>;
  overdue: number;
  /** Estimated cost of cycles due by the end of this calendar month (overdue included). */
  monthCost: number;
  monthCostCount: number;
}

/** Every live cycle with its record and status, grouped for the Upkeep tab. */
export function upkeep(os: LifeOSContext, filter: UpkeepFilter = 'All', now = Date.now()): Upkeep {
  const types: readonly string[] | null = filter === 'All' ? null : UPKEEP_FILTERS[filter];
  const items: UpkeepItem[] = [];
  for (const cycle of os.cycles.all()) {
    const entity = os.entities.get(cycle.entityId);
    if (!entity || (types && !types.includes(entity.type))) continue;
    items.push({ cycle, entity, def: os.registry.entityTypes.get(entity.type), status: os.cycles.status(cycle, now) });
  }
  const rank = (i: UpkeepItem) => (i.status.daysLeft ?? (i.status.meterLeft != null && i.cycle.meterEvery ? (i.status.meterLeft / i.cycle.meterEvery) * 180 : 9999));
  items.sort((a, b) => rank(a) - rank(b));
  const sections: Upkeep['sections'] = { overdue: [], week: [], month: [], later: [] };
  for (const i of items) sections[i.status.bucket].push(i);

  const monthEnd = addPeriod(new Date(new Date(startOfDay(now)).setDate(1)).getTime(), 1, 'month');
  const dueThisMonth = items.filter((i) => i.cycle.costEstimate && (i.status.bucket === 'overdue' || (i.cycle.nextDueAt != null && i.cycle.nextDueAt < monthEnd)));
  return {
    items,
    sections,
    overdue: sections.overdue.length,
    monthCost: dueThisMonth.reduce((a, i) => a + (i.cycle.costEstimate ?? 0), 0),
    monthCostCount: dueThisMonth.length,
  };
}

/** Finance category for a cost logged against a record of this type. */
const COST_CATEGORY: Record<string, string> = { vehicle: 'transport', subscription: 'subscriptions', document: 'fees', person: 'gifts', routine: 'housing', asset: 'housing', item: 'shopping' };

export interface LoggedDone {
  eventId: string;
  transactionId: string | null;
}

/**
 * "Done" from Upkeep, optionally with a cost. With `asExpense` (and a Finance
 * transaction type installed) the cost is also filed as an expense linked to
 * the record — the user entered the amount themselves, which is the money
 * confirmation. Undo with `undoLoggedDone`.
 */
export function logDone(os: LifeOSContext, cycleId: string, input: { cost?: number | null; note?: string | null; meter?: number | null; at?: number; asExpense?: boolean } = {}): LoggedDone {
  const cycle = os.cycles.get(cycleId);
  if (!cycle) throw new Error(`Cycle ${cycleId} not found`);
  const at = input.at ?? Date.now();
  let transactionId: string | null = null;
  let eventId = '';
  os.db.transaction(() => {
    eventId = os.cycles.markDone(cycleId, { at, cost: input.cost, note: input.note, meter: input.meter });
    if (input.asExpense && input.cost && input.cost > 0 && os.registry.entityTypes.has('transaction')) {
      const record = os.entities.get(cycle.entityId);
      const tx = os.entities.create({
        type: 'transaction',
        data: { amount: input.cost, kind: 'expense', category: COST_CATEGORY[record?.type ?? ''] ?? 'other', merchant: record ? `${record.title} · ${cycle.name}` : cycle.name, date: localDate(at), note: input.note ?? undefined, currency: cycle.currency ?? undefined },
      });
      if (record) os.relations.link(tx.id, record.id, record.type);
      transactionId = tx.id;
    }
  });
  return { eventId, transactionId };
}

export function undoLoggedDone(os: LifeOSContext, done: LoggedDone): void {
  os.cycles.undoDone(done.eventId);
  if (done.transactionId) os.entities.delete(done.transactionId);
}

function localDate(at: number): string {
  const d = new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
