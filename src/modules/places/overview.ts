import type { LifeOSContext } from '@core/registry/context';
import { lastMonths, type ModuleOverview, type OverviewBlock } from '@core/dashboard/overview';

/** Places and payees at a glance: who you paid most this month, places you've been. */
export function placesOverview(os: LifeOSContext, now = Date.now()): ModuleOverview {
  const money = os.format.currency;
  const [month] = lastMonths(1, now);
  const orgs = os.registry.entityTypes.has('org') ? os.entities.query('org', {}, { limit: 5000 }) : [];
  const places = os.registry.entityTypes.has('place') ? os.entities.query('place', {}, { limit: 5000 }) : [];
  // Top payees this month: payments linked to each.
  const rows = os.db.all<{ id: string; total: number; n: number }>(
    `SELECT r.to_id AS id, SUM(json_extract(e.data,'$.amount')) AS total, COUNT(*) AS n FROM relations r JOIN entities e ON e.id = r.from_id
     WHERE r.kind='payee' AND r.deleted_at IS NULL AND e.deleted_at IS NULL AND e.type='transaction' AND json_extract(e.data,'$.kind')='expense' AND json_extract(e.data,'$.date') BETWEEN ? AND ?
     GROUP BY r.to_id ORDER BY total DESC LIMIT 8`,
    [month!.start, month!.end],
  );
  const blocks: OverviewBlock[] = [{ kind: 'stats', items: [{ label: 'Places', value: String(places.length) }, { label: 'Shops & payees', value: String(orgs.length) }] }];
  if (rows.length) blocks.push({ kind: 'breakdown', title: 'Paid most this month', parts: rows.map((r) => ({ label: os.entities.get(r.id)?.title ?? '—', value: r.total })), format: 'money' });
  if (rows.length) blocks.push({ kind: 'list', title: 'Top payees this month', items: rows.map((r) => ({ title: os.entities.get(r.id)?.title ?? '—', sub: `${r.n} payment${r.n === 1 ? '' : 's'}`, value: money(r.total), entityId: r.id, type: 'org' })) });
  return { card: { headline: rows[0] ? `${os.entities.get(rows[0].id)?.title ?? ''}` : `${places.length} places`, sub: rows[0] ? `paid most this month · ${money(rows[0].total)}` : null }, blocks };
}
