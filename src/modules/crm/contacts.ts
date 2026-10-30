import type { CallEntry, DeviceContact, LifeOSContext } from '@core/registry/context';
import { resolveCandidates } from '@core/ai/lifeTools';
import { phoneKey } from '@core/identity';
import { birthdayIso, type PersonData } from './types';
import { touchLastSpoke } from './lastSpoke';

/**
 * Contacts you pick and the call log (M4.2b; crm's since R2). Pure: the
 * platform reads the phone through `os.device` and hands the items here.
 * Contacts are never bulk-imported; the call log only touches people already
 * in LifeOS.
 */

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const people = (os: LifeOSContext) => os.records.query<PersonData>('person', {}, { limit: 5000 });

/** The person a contact already is: the same contact, a phone number, an email, or exactly the same name. */
export function personForContact(os: LifeOSContext, c: DeviceContact): string | null {
  const all = people(os);
  const byContact = all.find((p) => p.data.contactId === c.id);
  if (byContact) return byContact.id;
  const phones = new Set(c.phones.map(phoneKey).filter((k) => k.length >= 8));
  const byPhone = all.find((p) => phones.has(phoneKey(p.data.phone)));
  if (byPhone) return byPhone.id;
  const emails = new Set(c.emails.map((e) => e.toLowerCase()));
  const byEmail = all.find((p) => p.data.email && emails.has(p.data.email.toLowerCase()));
  if (byEmail) return byEmail.id;
  const byName = resolveCandidates(os, c.name, ['person']).find((x) => x.score >= 0.95 && norm(x.title) === norm(c.name));
  return byName?.id ?? null;
}

function contactData(c: DeviceContact): Partial<PersonData> {
  const b = c.birthday;
  // No year on the contact: kept as no year (NO_YEAR), so People never says "turns 0".
  const birthday = b && b.month >= 0 && b.day ? birthdayIso(b.month + 1, b.day, b.year) : undefined;
  return { phone: c.phones[0], email: c.emails[0], birthday, company: c.company ?? undefined, role: c.jobTitle ?? undefined, photo: c.photo ? { uri: c.photo, name: 'Contact photo' } : undefined, contactId: c.id };
}

const filled = (d: Partial<PersonData>) => Object.fromEntries(Object.entries(d).filter(([, v]) => v != null && v !== '')) as Partial<PersonData>;
const isEmpty = (v: unknown) => v == null || v === '';

/** Add the contacts you picked: a new person, or the existing one filled in (only empty fields). */
export function importContacts(os: LifeOSContext, picked: DeviceContact[]): { created: number; updated: number } {
  let created = 0;
  let updated = 0;
  for (const c of picked) {
    if (!c.name.trim()) continue;
    const data = filled(contactData(c));
    const id = personForContact(os, c);
    if (!id) {
      const e = os.records.create({ object: 'person', title: c.name.trim(), data }, 'user');
      os.filings.add({ source: 'contacts', sourceRef: c.id, kind: 'person', entityId: e.id, label: `Person: ${e.title} (from contacts)` });
      created++;
      continue;
    }
    const cur = os.records.get<Record<string, unknown>>(id)!;
    const fill = Object.fromEntries(Object.entries(data).filter(([k]) => isEmpty(cur.data[k])));
    if (Object.keys(fill).length) {
      os.records.update(id, { data: fill }, 'user');
      os.filings.add({ source: 'contacts', sourceRef: c.id, kind: 'person', action: 'updated', entityId: id, label: `${cur.title} · ${Object.keys(fill).filter((k) => k !== 'contactId').join(', ') || 'linked to contact'} from contacts`, before: Object.fromEntries(Object.keys(fill).map((k) => [k, cur.data[k] ?? null])) });
      updated++;
    }
  }
  return { created, updated };
}

/** People you already imported: fill whatever their contact has gained since (never overwrites). */
export function resyncContacts(os: LifeOSContext, contacts: DeviceContact[]): number {
  const byId = new Map(contacts.map((c) => [c.id, c]));
  let n = 0;
  for (const p of people(os)) {
    const c = p.data.contactId ? byId.get(p.data.contactId) : undefined;
    if (!c) continue;
    const cur = p.data as Record<string, unknown>;
    const fill = Object.fromEntries(Object.entries(filled(contactData(c))).filter(([k]) => isEmpty(cur[k])));
    if (Object.keys(fill).length) {
      os.records.update(p.id, { data: fill }, 'system');
      n++;
    }
  }
  return n;
}

/** Calls with people in LifeOS move their "last spoke" (and the keep-in-touch cycle). Missed and unanswered calls don't count. */
export function applyCallLog(os: LifeOSContext, calls: CallEntry[]): number {
  const byPhone = new Map<string, { id: string; title: string }>();
  for (const p of people(os)) {
    const k = phoneKey(p.data.phone);
    if (k.length >= 8) byPhone.set(k, p);
  }
  const latest = new Map<string, CallEntry>();
  for (const c of calls) {
    if (c.type === 'missed' || (c.type === 'incoming' && c.seconds <= 0)) continue;
    const p = byPhone.get(phoneKey(c.number));
    if (!p) continue;
    const prev = latest.get(p.id);
    if (!prev || c.at > prev.at) latest.set(p.id, c);
  }
  let n = 0;
  for (const [id, c] of latest) {
    const p = os.records.get<PersonData>(id)!;
    if (!touchLastSpoke(os, id, c.at)) continue;
    os.records.timeline.add({ entityId: id, kind: 'call', title: `${c.type === 'outgoing' ? 'Called' : 'Call from'} ${p.title}${c.seconds ? ` · ${Math.max(1, Math.round(c.seconds / 60))} min` : ''}`, actor: 'system', occurredAt: c.at, meta: { calllog: true, seconds: c.seconds, type: c.type } });
    n++;
  }
  return n;
}
