import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import type { Link } from '@core/domain/types';
import type { PersonData } from './types';

/**
 * Last spoke (agreed 22 Oct): moved on its own by a call in the call log, an
 * Event with them (met, call, a calendar meeting they are in, a dump) and a
 * payment to or from them. It is the keep-in-touch cycle's last done, so
 * moving it rolls that cycle (core: cycleFields `person.contact`).
 *
 * crm never imports agenda or finance: it reads the records linked to a
 * person by their Object id, through core Links, and only their time.
 */

/** Objects whose records count as contact, when linked to a person. */
export const CONTACT_OBJECTS = new Set(['event', 'transaction']);

const iso = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** When a linked record happened: its domain time, else a start or a date in its data. */
export function happenedAt(r: ObjectRecord): number | null {
  if (r.occurredAt) return r.occurredAt;
  const d = r.data as { startAt?: number; date?: string };
  if (typeof d.startAt === 'number') return d.startAt;
  const t = d.date ? Date.parse(d.date) : NaN;
  return Number.isFinite(t) ? t : null;
}

/** Move a person's last spoke to `at` if that is later (never into the future). Returns whether it moved. */
export function touchLastSpoke(os: LifeOSContext, personId: string, at: number, now = Date.now()): boolean {
  if (at > now + 60_000) return false;
  const p = os.records.get<PersonData>(personId);
  if (!p || p.object !== 'person') return false;
  const day = iso(at);
  if (p.data.lastContactAt && p.data.lastContactAt.slice(0, 10) >= day) return false;
  os.records.update<PersonData>(personId, { data: { lastContactAt: day } }, 'system');
  return true;
}

/** A link just made: a payment or an Event with a person moves their last spoke. Guessed payees (unconfirmed) don't. */
export function onLinkAdded(os: LifeOSContext, link: Link, now = Date.now()): void {
  if ((link.confidence ?? 1) < 0.9) return;
  const a = os.records.get(link.fromId);
  const b = os.records.get(link.toId);
  if (!a || !b) return;
  const [person, other] = a.object === 'person' ? [a, b] : b.object === 'person' ? [b, a] : [null, null];
  if (!person || !other || !CONTACT_OBJECTS.has(other.object)) return;
  const at = happenedAt(other);
  if (at != null) touchLastSpoke(os, person.id, at, now);
}

/** Every person's last spoke from what is already linked to them: all of it once, then on each start only Events (a calendar meeting whose time has since passed). */
export function refreshLastSpoke(os: LifeOSContext, opts: { only?: string[] } = {}, now = Date.now()): number {
  const objects = opts.only ? new Set(opts.only.filter((o) => CONTACT_OBJECTS.has(o))) : CONTACT_OBJECTS;
  let n = 0;
  for (const p of os.records.query<PersonData>('person', {}, { limit: 5000 })) {
    let best: number | null = null;
    for (const l of os.links.forEntity(p.id)) {
      if (!objects.has(l.other.object) || (l.relation.confidence ?? 1) < 0.9) continue;
      const r = os.records.get(l.other.id);
      const at = r ? happenedAt(r) : null;
      if (at != null && at <= now && (best == null || at > best)) best = at;
    }
    if (best != null && touchLastSpoke(os, p.id, best, now)) n++;
  }
  return n;
}
