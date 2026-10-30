import type { ObjectRecord } from './domain/types';
import type { LifeOSContext } from './registry/context';
import { normAlias } from './repo/aliasRepo';

/**
 * Who a UPI id, a phone number or an email belongs to (R2). Objects say how
 * their records are known (`ObjectDef.identity`: crm's Person gives its UPI
 * ids, phone and email); a sender learned once ("Who is priya.s@okicici?") is
 * an alias on the record (core's aliases, shared with Turf). Finance's payee
 * matching and games' payment matching ask here, so neither imports crm.
 */

/** Last 10 digits: +91 98450 12345 = 09845012345 = 9845012345. */
export const phoneKey = (p: string | null | undefined) => (p ?? '').replace(/\D/g, '').slice(-10);

/** A UPI id whose handle is a mobile number (9845012345@ybl) carries that number. */
export function phoneInUpi(upi: string | null | undefined): string | null {
  const local = (upi ?? '').split('@')[0] ?? '';
  const digits = local.replace(/\D/g, '');
  return /^\+?(91)?\d{10}$/.test(local.replace(/[\s-]/g, '')) && digits.length >= 10 ? digits.slice(-10) : null;
}

export interface Identity {
  upi?: string | null;
  phone?: string | null;
  email?: string | null;
}

export interface WhoIs {
  record: ObjectRecord;
  /** What matched: a UPI id on the record, a learned alias, the phone number, the email. */
  by: 'upi' | 'alias' | 'phone' | 'email';
}

const lower = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();

/**
 * The one record a sender is, or null. Order: a UPI id on the record, a UPI id
 * learned as an alias, the phone number (given, or inside the UPI id), the
 * email. Two records with the same phone or email are not a match (ambiguous).
 */
export function whoIs(os: LifeOSContext, id: Identity, objects?: string[]): WhoIs | null {
  const upi = lower(id.upi);
  const phone = phoneKey(id.phone) || phoneInUpi(upi) || '';
  const email = lower(id.email);
  if (!upi && phone.length < 8 && !email) return null;
  const defs = [...os.registry.objects.values()].filter((d) => (!objects || objects.includes(d.id)) && d.identity);
  const known = defs.flatMap((d) => os.records.query<Record<string, unknown>>(d.id, {}, { limit: 20_000 }).map((r) => ({ r, k: d.identity!(r.data as never) })));
  if (upi) {
    const hit = known.find((x) => (x.k.upi ?? []).some((u) => lower(u) === upi));
    if (hit) return { record: hit.r, by: 'upi' };
    const norm = normAlias(upi);
    for (const a of os.aliases.lookup(upi)) {
      if (normAlias(a.alias) !== norm) continue;
      const r = os.records.get(a.entityId);
      if (r && (!objects || objects.includes(r.object))) return { record: r, by: 'alias' };
    }
  }
  const unique = (xs: typeof known) => (xs.length === 1 ? xs[0]!.r : null);
  if (phone.length >= 8) {
    const r = unique(known.filter((x) => (x.k.phone ?? []).some((p) => phoneKey(p) === phone)));
    if (r) return { record: r, by: 'phone' };
  }
  if (email) {
    const r = unique(known.filter((x) => (x.k.email ?? []).some((e) => lower(e) === email)));
    if (r) return { record: r, by: 'email' };
  }
  return null;
}
