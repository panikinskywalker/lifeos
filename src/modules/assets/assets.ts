import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import { DAY, startOfDay } from '@core/cycles/schedule';
import type { AssetData, ClothesState } from './types';
import { clothesStateOf } from './types';

/**
 * What the assets module answers (R7a): what's under warranty, what's due for
 * service, and the clothes by state. Plain functions over records and cycles,
 * called by the tools and the boards (Home's Clothes space, the Asset page).
 */

const live = (a: ObjectRecord<AssetData>) => a.status !== 'sold' && a.status !== 'lost';

export function assetsOf(os: LifeOSContext, category?: string): ObjectRecord<AssetData>[] {
  const filter = category ? { and: [{ field: 'data.category', op: 'eq' as const, value: category }] } : undefined;
  return os.records.query<AssetData>('asset', filter ? { filter } : {}, { limit: 5000 }).filter(live);
}

export interface WarrantyRow {
  id: string;
  title: string;
  until: string;
  daysLeft: number;
}

/** Assets whose warranty still runs, soonest end first; `withinDays` keeps those ending by then. */
export function underWarranty(os: LifeOSContext, now = Date.now(), withinDays?: number): WarrantyRow[] {
  const today = startOfDay(now);
  return assetsOf(os)
    .filter((a) => /^\d{4}-\d{2}-\d{2}/.test(a.data.warrantyUntil ?? ''))
    .map((a) => ({ id: a.id, title: a.title, until: a.data.warrantyUntil!.slice(0, 10), daysLeft: Math.round((startOfDay(new Date(`${a.data.warrantyUntil!.slice(0, 10)}T12:00:00`).getTime()) - today) / DAY) }))
    .filter((r) => r.daysLeft >= 0 && (withinDays == null || r.daysLeft <= withinDays))
    .sort((a, b) => a.daysLeft - b.daysLeft);
}

export interface ServiceRow {
  id: string;
  title: string;
  cycleId: string;
  state: string;
  daysLeft: number | null;
  kmLeft: number | null;
  nextDueAt: number | null;
  nextDueKm: number | null;
}

/** Every Asset's Service cycle, most urgent first (overdue, then by days or km left; unscheduled last). */
export function services(os: LifeOSContext, now = Date.now()): ServiceRow[] {
  const rank = (r: ServiceRow) => (r.state === 'unscheduled' ? 1e9 : Math.min(r.daysLeft ?? 1e6, r.kmLeft != null ? r.kmLeft / 50 : 1e6));
  return assetsOf(os)
    .flatMap((a) =>
      os.cycles
        .forEntity(a.id)
        .filter((c) => c.template === 'asset.service' && c.enabled)
        .map((c) => {
          const st = os.cycles.status(c, now);
          return { id: a.id, title: a.title, cycleId: c.id, state: st.state, daysLeft: st.daysLeft, kmLeft: st.meterLeft, nextDueAt: c.nextDueAt, nextDueKm: c.nextDueMeter };
        }),
    )
    .sort((a, b) => rank(a) - rank(b));
}

/** Services due within `withinDays` or 1,000 km, or late. */
export function dueForService(os: LifeOSContext, now = Date.now(), withinDays = 30): ServiceRow[] {
  return services(os, now).filter((r) => r.state === 'overdue' || r.state === 'today' || (r.daysLeft != null && r.daysLeft <= withinDays) || (r.kmLeft != null && r.kmLeft <= 1000));
}

/* ------------------------------------------------------------------ */
/* Clothes                                                             */
/* ------------------------------------------------------------------ */

/** Spaces that hold clothes (Home's Clothes), found by their data: the Space Object is inventory's. */
export function clothesSpaces(os: LifeOSContext): ObjectRecord<{ holds?: string; order?: number }>[] {
  if (!os.registry.objects.has('space')) return [];
  return os.records
    .query<{ holds?: string; order?: number }>('space', { filter: { and: [{ field: 'data.holds', op: 'eq', value: 'clothes' }] } }, { limit: 50 })
    .sort((a, b) => (a.data.order ?? 99) - (b.data.order ?? 99) || a.title.localeCompare(b.title));
}

/**
 * Clothing Assets kept in a space; with no space, all of them. Clothing kept
 * nowhere shows in the first space that holds clothes, so nothing is lost.
 */
export function clothes(os: LifeOSContext, spaceId?: string): ObjectRecord<AssetData>[] {
  const all = assetsOf(os, 'clothing').sort((a, b) => a.title.localeCompare(b.title));
  if (!spaceId) return all;
  const first = clothesSpaces(os)[0]?.id;
  return all.filter((a) => a.data.spaceId === spaceId || (!a.data.spaceId && spaceId === first));
}

export function clothesByState(os: LifeOSContext, spaceId?: string): Record<ClothesState, ObjectRecord<AssetData>[]> {
  const out: Record<ClothesState, ObjectRecord<AssetData>[]> = { clean: [], wash: [], packed: [] };
  for (const a of clothes(os, spaceId)) out[clothesStateOf(a.data)].push(a);
  return out;
}

/** A tap on Home: clean → in the wash → clean; a packed one is back from the trip, so in the wash (as travel's Back home). */
export const nextClothesState = (s: ClothesState): ClothesState => (s === 'wash' ? 'clean' : 'wash');

/** Set a clothing Asset's state; returns its Undo. */
export function setClothesState(os: LifeOSContext, id: string, state: ClothesState): () => void {
  const a = os.records.get<AssetData>(id);
  if (!a || a.object !== 'asset') throw new Error(`Asset ${id} not found`);
  const prev = a.data.state;
  os.records.update<AssetData>(id, { data: { ...a.data, state } }, 'user');
  return () => {
    const now = os.records.get<AssetData>(id);
    if (now) os.records.update<AssetData>(id, { data: { ...now.data, state: prev } }, 'user');
  };
}
