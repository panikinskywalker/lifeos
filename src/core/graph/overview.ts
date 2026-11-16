import type { LifeOSContext } from '../registry/context';

/**
 * Everything linked, for Browse › Links (the L6 artboard): how many records
 * and links, the records clustered by module (each with its best-linked
 * records), and when each was filed, so a time-lapse can show them appear in
 * the order they came in. Hidden Objects (check-ins, readings) and records
 * that are a face or a meeting of others (a Player profile, a Venue, an
 * Appearance) are left out, as on the Links screen; mentions are not links.
 */
export interface LinkOverview {
  records: number;
  links: number;
  modules: Array<{ module: string; records: number; times: number[]; top: Array<{ id: string; type: string; title: string; links: number }> }>;
  /** The best-linked records (up to `points`), for the free view. */
  points: Array<{ id: string; type: string; title: string; module: string; links: number; at: number }>;
  /** Links between those records. */
  edges: Array<{ from: string; to: string; at: number }>;
  /** When each linked record and each link was filed, oldest first. */
  recordTimes: number[];
  linkTimes: number[];
}

export function linkOverview(os: LifeOSContext, opts: { points?: number; top?: number } = {}): LinkOverview {
  const skip = [...os.registry.objects.values()].filter((d) => d.hidden || d.linkRole).map((d) => d.id);
  const ph = skip.map(() => '?').join(',') || "''";
  const links = os.db.all<{ from_id: string; to_id: string; at: number }>(
    `SELECT l.from_id, l.to_id, l.created_at AS at FROM links l JOIN records a ON a.id = l.from_id JOIN records b ON b.id = l.to_id
     WHERE l.deleted_at IS NULL AND l.kind <> 'mention' AND a.deleted_at IS NULL AND b.deleted_at IS NULL AND a.object NOT IN (${ph}) AND b.object NOT IN (${ph})`,
    [...skip, ...skip],
  );
  const degree = new Map<string, number>();
  for (const l of links) for (const id of [l.from_id, l.to_id]) degree.set(id, (degree.get(id) ?? 0) + 1);
  const ids = [...degree.keys()];
  const recs = new Map<string, { id: string; type: string; title: string; module: string; at: number }>();
  for (let i = 0; i < ids.length; i += 400) {
    const chunk = ids.slice(i, i + 400);
    for (const r of os.db.all<{ id: string; object: string; title: string; created_at: number }>(`SELECT id, object, title, created_at FROM records WHERE id IN (${chunk.map(() => '?').join(',')})`, chunk))
      recs.set(r.id, { id: r.id, type: r.object, title: r.title, module: os.registry.objects.get(r.object)?.module ?? r.object, at: r.created_at });
  }
  const byModule = new Map<string, Array<{ id: string; type: string; title: string; links: number; at: number }>>();
  for (const r of recs.values()) byModule.set(r.module, [...(byModule.get(r.module) ?? []), { ...r, links: degree.get(r.id) ?? 0 }]);
  const top = opts.top ?? 3;
  const modules = [...byModule.entries()]
    .map(([module, list]) => ({
      module,
      records: list.length,
      times: list.map((x) => x.at).sort((a, b) => a - b),
      top: [...list].sort((a, b) => b.links - a.links || a.title.localeCompare(b.title)).slice(0, top).map(({ id, type, title, links: n }) => ({ id, type, title, links: n })),
    }))
    .sort((a, b) => b.records - a.records || a.module.localeCompare(b.module));
  const points = [...recs.values()]
    .map((r) => ({ ...r, links: degree.get(r.id) ?? 0 }))
    .sort((a, b) => b.links - a.links || a.title.localeCompare(b.title))
    .slice(0, opts.points ?? 80);
  const shown = new Set(points.map((p) => p.id));
  return {
    records: recs.size,
    links: links.length,
    modules,
    points,
    edges: links.filter((l) => shown.has(l.from_id) && shown.has(l.to_id)).map((l) => ({ from: l.from_id, to: l.to_id, at: l.at })),
    recordTimes: [...recs.values()].map((r) => r.at).sort((a, b) => a - b),
    linkTimes: links.map((l) => l.at).sort((a, b) => a - b),
  };
}
