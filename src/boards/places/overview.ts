import type { LifeOSContext } from '@core/registry/context';
import { lastMonths, type ModuleOverview, type OverviewBlock } from '@core/dashboard/overview';
import { allOrgs, allPlaces, placesBeen } from '@modules/places';

/** Places and organisations at a glance: where you have been this month, who you paid most. */
export function placesOverview(os: LifeOSContext, now = Date.now()): ModuleOverview {
  const money = os.format.currency;
  const [month] = lastMonths(1, now);
  const places = allPlaces(os);
  const orgs = allOrgs(os);
  const been = placesBeen(os, 30, now);
  // Top payees this month: payments linked to each.
  const rows = os.db.all<{ id: string; total: number; n: number }>(
    `SELECT r.to_id AS id, SUM(json_extract(e.data,'$.amount')) AS total, COUNT(*) AS n FROM links r JOIN records e ON e.id = r.from_id
     WHERE r.kind='payee' AND r.deleted_at IS NULL AND e.deleted_at IS NULL AND e.object='transaction' AND json_extract(e.data,'$.kind')='expense' AND json_extract(e.data,'$.date') BETWEEN ? AND ?
     GROUP BY r.to_id ORDER BY total DESC LIMIT 8`,
    [month!.start, month!.end],
  );
  const blocks: OverviewBlock[] = [
    { kind: 'stats', items: [{ label: 'Places', value: String(places.length) }, { label: 'Organisations', value: String(orgs.length) }] },
  ];
  if (been.length) blocks.push({ kind: 'list', title: 'Been, last 30 days', items: been.slice(0, 6).map((p) => ({ title: p.name, sub: `${p.visits} visit${p.visits === 1 ? '' : 's'} · last ${p.last ? new Date(`${p.last}T12:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''}`, value: null, entityId: p.id, type: 'place' })) });
  if (rows.length) blocks.push({ kind: 'breakdown', title: 'Paid most this month', parts: rows.map((r) => ({ label: os.records.get(r.id)?.title ?? '—', value: r.total })), format: 'money' });
  if (rows.length) blocks.push({ kind: 'list', title: 'Top payees this month', items: rows.map((r) => ({ title: os.records.get(r.id)?.title ?? '—', sub: `${r.n} payment${r.n === 1 ? '' : 's'}`, value: money(r.total), entityId: r.id, type: 'org' })) });
  const top = been[0];
  return {
    card: top ? { headline: top.name, sub: `most visited this month · ${top.visits}×` } : rows[0] ? { headline: os.records.get(rows[0].id)?.title ?? '', sub: `paid most this month · ${money(rows[0].total)}` } : { headline: `${places.length} places`, sub: null },
    blocks,
  };
}
