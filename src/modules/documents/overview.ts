import type { LifeOSContext } from '@core/registry/context';
import { daysUntil, inDays, isoOf, type ModuleOverview, type OverviewBlock } from '@core/dashboard/overview';

/** Papers at a glance: what expires soon (or has), by kind. */
export function documentsOverview(os: LifeOSContext, now = Date.now()): ModuleOverview {
  const docs = os.entities.query<{ kind?: string; expiresOn?: string }>('document', {}, { limit: 2000 });
  const today = isoOf(now);
  const expired = docs.filter((d) => d.data.expiresOn && d.data.expiresOn < today);
  const soon = docs.filter((d) => d.data.expiresOn && d.data.expiresOn >= today && daysUntil(d.data.expiresOn, now) <= 90).sort((a, b) => (a.data.expiresOn! < b.data.expiresOn! ? -1 : 1));
  const byKind = new Map<string, number>();
  for (const d of docs) byKind.set((d.data.kind ?? 'other').replace(/^\w/, (c) => c.toUpperCase()), (byKind.get((d.data.kind ?? 'other').replace(/^\w/, (c) => c.toUpperCase())) ?? 0) + 1);
  const blocks: OverviewBlock[] = [
    { kind: 'stats', items: [{ label: 'Documents', value: String(docs.length) }, { label: 'Expiring (90 d)', value: String(soon.length) }, { label: 'Expired', value: String(expired.length), tone: expired.length ? 'alert' : undefined }] },
    { kind: 'list', title: 'Renew soon', items: [...expired, ...soon].slice(0, 8).map((d) => ({ title: d.title, sub: d.data.expiresOn! < today ? `expired ${inDays(daysUntil(d.data.expiresOn!, now))}` : `expires ${inDays(daysUntil(d.data.expiresOn!, now))}`, entityId: d.id, type: 'document', tone: d.data.expiresOn! < today ? ('alert' as const) : undefined })), empty: 'Nothing expires in the next 90 days.' },
  ];
  if (byKind.size > 1) blocks.push({ kind: 'breakdown', title: 'By kind', parts: [...byKind.entries()].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value })), format: 'number' });
  return { card: { headline: expired.length ? `${expired.length} expired` : soon.length ? `${soon.length} expiring` : `${docs.length} documents`, sub: soon[0] ? `${soon[0].title} ${inDays(daysUntil(soon[0].data.expiresOn!, now))}` : null, alert: expired.length > 0 }, blocks };
}
