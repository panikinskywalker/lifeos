import type { LifeOSContext } from '@core/registry/context';
import type { StockData } from './types';
import { addSpace, daysSince, ensureSpaces, estimatedLife, guessSpaceName, isoDay, spaceNamed } from './stock';

/**
 * R7e, once on first open (docs/MODEL.md §2, *Retired*): the seven spaces are
 * made, and the old `item` records become Stock in place (same id, so their
 * links, facts and timeline stay): location → a Space (yours when it names
 * none of the seven), expires → your life, restock-below → on the list,
 * unit → size. Their "Use or replace" cycles go: going off is a nudge now.
 */

interface ItemData {
  quantity?: number;
  unit?: string;
  location?: string;
  minQuantity?: number;
  expiresOn?: string;
  category?: string;
  notes?: string;
}

const BY_CATEGORY: Record<string, string> = { pantry: 'Kitchen', household: 'Cleaning', medicine: 'Cabinets', clothing: 'Clothes' };

export function foldItems(os: LifeOSContext): number {
  ensureSpaces(os);
  const rows = os.db.all<{ id: string; title: string; data: string; created_at: number }>(`SELECT id, title, data, created_at FROM records WHERE object = 'item' AND deleted_at IS NULL`);
  for (const r of rows) {
    let d: ItemData = {};
    try {
      d = JSON.parse(r.data) as ItemData;
    } catch {
      /* an unreadable item keeps its title alone */
    }
    const loc = d.location?.trim();
    const space = (loc && spaceNamed(os, loc)) || (loc ? addSpace(os, loc) : spaceNamed(os, BY_CATEGORY[d.category ?? ''] ?? guessSpaceName(r.title)));
    const boughtOn = isoDay(r.created_at);
    const life = d.expiresOn ? daysSince(boughtOn, new Date(`${d.expiresOn.slice(0, 10)}T12:00:00`).getTime()) : null;
    const est = estimatedLife(r.title);
    const quantity = Math.max(0, Number(d.quantity ?? 1) || 0);
    const data: StockData = {
      quantity,
      ...(d.unit ? { size: d.unit } : {}),
      ...(space ? { spaceId: space.id } : {}),
      boughtOn,
      ...(life && life > 0 ? { lifeDays: life, lifeBy: 'yours' as const } : est ? { lifeDays: est, lifeBy: 'estimated' as const } : {}),
      source: 'you',
      ...(d.minQuantity != null && quantity <= d.minQuantity ? { onList: true } : {}),
      ...(d.notes ? { notes: d.notes } : {}),
    };
    os.db.transaction(() => {
      os.db.run(`UPDATE records SET object = 'stock' WHERE id = ?`, [r.id]);
      // Through the repo, so the Space link, search and the timeline see it as Stock. Item keys the schema doesn't know are dropped.
      os.records.update<StockData>(r.id, { data }, 'system');
      for (const c of os.cycles.forEntity(r.id)) os.cycles.remove(c.id);
    });
  }
  // The item views ("Low stock") go with the Object.
  os.db.run(`DELETE FROM saved_views WHERE object = 'item'`);
  return rows.length;
}
