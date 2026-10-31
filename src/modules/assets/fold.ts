import type { LifeOSContext } from '@core/registry/context';
import type { AssetData } from './types';
import { clothesSpaces } from './assets';

/**
 * R7a, once on first open (docs/MODEL.md §2, *Retired*). Records are folded
 * in place (same id), so their links, facts, readings, timeline and cycles
 * stay:
 * - `vehicle` → Asset, category vehicle: plate, odometer, next service and
 *   fuel kept; make, model and year are already its title. The Service cycle
 *   becomes the Asset's; Insurance and PUC stay as plain Cycles. Spends and
 *   papers linked with the word `vehicle` are linked with `asset`.
 * - an Asset in *electronics* → device.
 * - Stock kept in a space that holds clothes (R7e filed old clothing items
 *   there) → a clothing Asset, clean, kept in the same space. This waits for
 *   Home's spaces, so it can run on a later open than the rest.
 */

interface VehicleData {
  plate?: string;
  odometerKm?: number;
  fuel?: string;
  nextServiceKm?: number;
  nextServiceDate?: string;
  notes?: string;
}

export function foldVehicles(os: LifeOSContext): number {
  const rows = os.db.all<{ id: string; data: string }>(`SELECT id, data FROM records WHERE object = 'vehicle' AND deleted_at IS NULL`);
  for (const r of rows) {
    let d: VehicleData = {};
    try {
      d = JSON.parse(r.data) as VehicleData;
    } catch {
      /* an unreadable vehicle keeps its title alone */
    }
    os.db.transaction(() => {
      os.db.run(`UPDATE records SET object = 'asset' WHERE id = ?`, [r.id]);
      os.db.run(`UPDATE cycles SET template = 'asset.service' WHERE record_id = ? AND template = 'vehicle.service'`, [r.id]);
      // Through the repo, so search, the subtitle and the timeline see an Asset; keys Asset doesn't know are dropped.
      const data: Partial<AssetData> = { category: 'vehicle', plate: d.plate, odometerKm: d.odometerKm, fuel: d.fuel, nextServiceKm: d.nextServiceKm, nextServiceDate: d.nextServiceDate, notes: d.notes };
      os.records.update<AssetData>(r.id, { data: data as AssetData, status: 'owned' }, 'system');
    });
  }
  os.db.run(`UPDATE links SET kind = 'asset' WHERE kind = 'vehicle'`);
  os.db.run(`DELETE FROM saved_views WHERE object = 'vehicle'`);
  for (const a of os.records.query<AssetData>('asset', { filter: { and: [{ field: 'data.category', op: 'eq', value: 'electronics' }] } }, { limit: 5000 })) {
    os.records.update<AssetData>(a.id, { data: { ...a.data, category: 'device' } }, 'system');
  }
  return rows.length;
}

/** Stock in a clothes space → clothing Assets. Returns how many, or null when Home has no clothes space yet. */
export function foldClothes(os: LifeOSContext): number | null {
  const spaces = clothesSpaces(os);
  if (!spaces.length) return null;
  const ids = spaces.map((s) => s.id);
  const rows = os.db.all<{ id: string }>(`SELECT id FROM records WHERE object = 'stock' AND deleted_at IS NULL AND json_extract(data, '$.spaceId') IN (${ids.map(() => '?').join(',')})`, ids);
  for (const r of rows) {
    os.db.transaction(() => {
      os.db.run(`UPDATE records SET object = 'asset' WHERE id = ?`, [r.id]);
      os.records.update<AssetData>(r.id, { data: { category: 'clothing', state: 'clean' } as AssetData, status: 'owned' }, 'system');
    });
  }
  return rows.length;
}
