import type { LifeOSContext } from '@core/registry/context';
import { daysUntil, inDays, isoOf, type ModuleOverview, type OverviewBlock } from '@core/dashboard/overview';
import { tripSpend, type TripData } from '@modules/travel';

/** Travel at a glance: the next trip, trips this year, what each cost against its budget. */
export function travelOverview(os: LifeOSContext, now = Date.now()): ModuleOverview {
  const money = os.format.currency;
  const today = isoOf(now);
  const trips = os.records.query<TripData>('trip', { sort: [{ field: 'data.startDate', dir: 'asc' }] }, { limit: 500 });
  const upcoming = trips.filter((t) => t.data.startDate && (t.data.endDate ?? t.data.startDate) >= today);
  const year = today.slice(0, 4);
  const thisYear = trips.filter((t) => t.data.startDate?.startsWith(year));
  // What a trip cost: money out linked to it (the Trip Field or a booking mail).
  const cost = new Map(thisYear.map((t) => [t.id, tripSpend(os, t, now).spent]));
  const spent = (id: string) => cost.get(id) ?? 0;
  const blocks: OverviewBlock[] = [
    { kind: 'stats', items: [{ label: 'Next trip', value: upcoming[0] ? upcoming[0].data.destination : 'None', sub: upcoming[0]?.data.startDate ? inDays(daysUntil(upcoming[0].data.startDate, now)) : null }, { label: `Trips in ${year}`, value: String(thisYear.length) }, { label: `Spent in ${year}`, value: money(thisYear.reduce((n, t) => n + spent(t.id), 0)) }] },
    { kind: 'list', title: 'Coming up', items: upcoming.slice(0, 6).map((t) => ({ title: t.title, sub: `${t.data.startDate!.slice(8)}/${t.data.startDate!.slice(5, 7)}${t.data.endDate ? ` – ${t.data.endDate.slice(8)}/${t.data.endDate.slice(5, 7)}` : ''}`, value: inDays(daysUntil(t.data.startDate!, now)), entityId: t.id, type: 'trip' })), empty: 'No trips planned. Tickets from Gmail and dumps add them.' },
  ];
  const budgeted = thisYear.filter((t) => t.data.budget);
  if (budgeted.length) blocks.push({ kind: 'progress', title: 'Budget used', items: budgeted.map((t) => ({ label: t.title, ratio: spent(t.id) / t.data.budget!, sub: `${money(spent(t.id))} of ${money(t.data.budget!)}`, entityId: t.id, type: 'trip', over: spent(t.id) > t.data.budget! })) });
  const past = thisYear.filter((t) => (t.data.endDate ?? t.data.startDate ?? '') < today);
  if (past.length) blocks.push({ kind: 'bars', title: `Trips in ${year}: what each cost`, labels: past.slice(-6).map((t) => t.data.destination.slice(0, 6)), values: past.slice(-6).map((t) => spent(t.id)), format: 'money' });
  return { card: { headline: upcoming[0] ? `${upcoming[0].data.destination} ${upcoming[0].data.startDate ? inDays(daysUntil(upcoming[0].data.startDate, now)) : ''}`.trim() : 'No trip planned', sub: `${thisYear.length} trip${thisYear.length === 1 ? '' : 's'} this year` }, blocks };
}
