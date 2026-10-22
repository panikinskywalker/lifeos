import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import { cadenceLabel, type PersonData } from './types';

/**
 * People's read side (R2): who to call (keep-in-touch cycles due and
 * birthdays coming, from their Cycles), and when you last met someone (last
 * spoke, the last call, Event and payment linked to them). Boards and the AI
 * tools call these; balances per person are finance's (`balances`).
 */

const DAY = 86_400_000;

export interface ToCall {
  id: string;
  name: string;
  reason: 'keep in touch' | 'birthday';
  /** "12 d overdue", "Birthday in 3 d", "Today". */
  why: string;
  late: boolean;
  dueAt: number;
  lastSpoke: string | null;
}

/** Keep-in-touch cycles due within `withinDays` (or late) and birthdays within `birthdayDays`, soonest first. */
export function peopleToCall(os: LifeOSContext, opts: { withinDays?: number; birthdayDays?: number; limit?: number } = {}, now = Date.now()): ToCall[] {
  const within = opts.withinDays ?? 7;
  const bdays = opts.birthdayDays ?? 14;
  const out: ToCall[] = [];
  for (const p of os.records.query<PersonData>('person', {}, { limit: 5000 })) {
    for (const c of os.cycles.forEntity(p.id)) {
      if (!c.enabled || c.nextDueAt == null) continue;
      const days = Math.round((c.nextDueAt - now) / DAY);
      const base = { id: p.id, name: p.title, dueAt: c.nextDueAt, lastSpoke: p.data.lastContactAt ?? null };
      if (c.template === 'person.birthday' && days <= bdays) out.push({ ...base, reason: 'birthday', why: days <= 0 ? 'Birthday today' : `Birthday in ${days} d`, late: false });
      else if (c.template === 'person.contact' && days <= within) out.push({ ...base, reason: 'keep in touch', why: days < 0 ? `${-days} d overdue` : days === 0 ? 'Today' : `In ${days} d`, late: days < 0 });
    }
  }
  return out.sort((a, b) => a.dueAt - b.dueAt).slice(0, opts.limit ?? 50);
}

/** Whole days since an ISO day (or a time), null when never. */
export function daysSince(day: string | null | undefined, now = Date.now()): number | null {
  if (!day) return null;
  const t = Date.parse(day.length === 10 ? `${day}T00:00:00` : day);
  if (!Number.isFinite(t)) return null;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((start.getTime() - t) / DAY));
}

export interface LastMet {
  id: string;
  name: string;
  lastSpoke: string | null;
  daysAgo: number | null;
  keepInTouch: string | null;
  /** The keep-in-touch cycle's next due, when set. */
  nextDue: number | null;
  lastCall: { at: number; title: string } | null;
  lastEvent: { id: string; title: string; at: number } | null;
  lastPayment: { id: string; title: string; at: number } | null;
}

const at = (r: ObjectRecord) => r.occurredAt ?? (typeof (r.data as { startAt?: number }).startAt === 'number' ? (r.data as { startAt: number }).startAt : Date.parse((r.data as { date?: string }).date ?? '') || null);

/** When you last met or spoke to someone, and through what. */
export function lastMet(os: LifeOSContext, personId: string, now = Date.now()): LastMet | null {
  const p = os.records.get<PersonData>(personId);
  if (!p || p.object !== 'person') return null;
  const call = os.records.timeline.forEntity(p.id, 200).find((e) => e.kind === 'call') ?? null;
  const latest = (object: string) => {
    let best: { id: string; title: string; at: number } | null = null;
    for (const l of os.links.forEntity(p.id)) {
      if (l.other.object !== object) continue;
      const r = os.records.get(l.other.id);
      const t = r ? at(r) : null;
      if (r && t != null && t <= now && (!best || t > best.at)) best = { id: r.id, title: r.title, at: t };
    }
    return best;
  };
  const contact = os.cycles.forEntity(p.id).find((c) => c.template === 'person.contact' && c.enabled);
  return {
    id: p.id,
    name: p.title,
    lastSpoke: p.data.lastContactAt ?? null,
    daysAgo: daysSince(p.data.lastContactAt, now),
    keepInTouch: cadenceLabel(p.data.contactEvery),
    nextDue: contact?.nextDueAt ?? null,
    lastCall: call ? { at: call.occurredAt, title: call.title } : null,
    lastEvent: latest('event'),
    lastPayment: latest('transaction'),
  };
}
