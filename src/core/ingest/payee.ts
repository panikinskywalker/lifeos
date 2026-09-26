import type { LifeOSContext } from '../registry/context';
import { bus } from '../events/bus';

/**
 * Payees (M4.2c): everyone you pay or get paid by is one record, and every
 * payment links to it — so paying John ₹1,300 then ₹500 lands on one John.
 * A person already in People is matched by UPI ID, a name you confirmed
 * before, or their name; a close-but-unsure name is linked as a flagged
 * guess you confirm on the payment ("We think JOHN D is John Doe").
 */

export interface PayeeMatch {
  id: string;
  type: 'person' | 'org';
  created: boolean;
  /** Set when the link is a guess worth a look. */
  guess: string | null;
  confidence: number;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const tokens = (s: string) => norm(s).replace(/\b(mr|mrs|ms|dr|shri|smt|miss)\b/g, '').split(' ').filter(Boolean);
const titleCase = (s: string) => s.toLowerCase().replace(/(^|\s)(\S)/g, (m) => m.toUpperCase());
const BUSINESS = /\b(ltd|pvt|limited|llp|inc|corp|store|stores|mart|enterprises?|services|restaurant|cafe|caf[eé]|hotel|pharmacy|medicals?|traders|technologies|tech|foods?|retail|bank|payments?|india|solutions|agency|centre|center|motors|bazaar|bakery|kitchen|brewpub|pub|bar)\b|\d/i;

/** Same person? "JOHN D" vs "John Doe" (initial), "JOHN" vs "John Doe" (first name only), full names equal. */
function nameScore(said: string, title: string): number {
  const a = tokens(said);
  const b = tokens(title);
  if (!a.length || !b.length) return 0;
  if (a.join(' ') === b.join(' ')) return 1;
  if (a[0] !== b[0]) return 0;
  // Rest of what was said: initials or words that match the rest of the name, in order.
  const rest = a.slice(1);
  const restTitle = b.slice(1);
  if (!rest.length) return 0.75; // first name only
  const ok = rest.every((w, i) => restTitle[i] != null && (restTitle[i] === w || (w.length === 1 && restTitle[i]!.startsWith(w))));
  return ok ? 0.85 : 0;
}

export function payeeFor(os: LifeOSContext, name: string | null | undefined, vpa?: string | null, opts: { business?: boolean } = {}): PayeeMatch | null {
  const said = (name ?? '').trim() || (vpa ? vpa.split('@')[0]!.replace(/[._-]+/g, ' ') : '');
  if (!said || /^(atm|cash|self|transfer)\b/i.test(said)) return null;
  const hasPeople = os.registry.entityTypes.has('person');
  const hasOrgs = os.registry.entityTypes.has('org');
  const people = hasPeople ? os.entities.query<{ upi?: string }>('person', {}, { limit: 5000 }) : [];
  const orgs = hasOrgs ? os.entities.query<{ upi?: string; kind?: string }>('org', {}, { limit: 5000 }) : [];
  const v = vpa?.toLowerCase();
  const byUpi = <T extends { data: { upi?: string } }>(list: T[]) => (v ? list.find((e) => (e.data.upi ?? '').toLowerCase().split(/[,\s]+/).includes(v)) : undefined);
  const p1 = byUpi(people);
  if (p1) return { id: p1.id, type: 'person', created: false, guess: null, confidence: 1 };
  const o1 = byUpi(orgs);
  if (o1) return { id: o1.id, type: 'org', created: false, guess: null, confidence: 1 };
  // A name you confirmed before.
  for (const a of os.aliases.lookup(norm(said))) {
    const e = os.entities.get(a.entityId);
    if (e && (e.type === 'person' || e.type === 'org')) return { id: e.id, type: e.type, created: false, guess: null, confidence: 1 };
  }
  const business = opts.business ?? BUSINESS.test(said);
  if (!business && people.length) {
    const scored = people.map((p) => ({ p, s: nameScore(said, p.title) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
    const [best, next] = scored;
    if (best && best.s === 1 && (!next || next.s < 1)) return { id: best.p.id, type: 'person', created: false, guess: null, confidence: 1 };
    if (best && (!next || next.s < best.s)) {
      return { id: best.p.id, type: 'person', created: false, guess: `We think “${said}” is ${best.p.title}`, confidence: best.s };
    }
    if (best && next) return { id: best.p.id, type: 'person', created: false, guess: `“${said}” could be ${best.p.title} or ${next.p.title}`, confidence: 0.6 };
  }
  if (!hasOrgs) return null;
  const n = norm(said);
  const o2 = orgs.find((o) => norm(o.title) === n) ?? orgs.find((o) => n.length >= 4 && (norm(o.title).startsWith(n) || n.startsWith(norm(o.title))));
  if (o2) {
    if (v && !(o2.data.upi ?? '').includes(v)) os.entities.update(o2.id, { data: { upi: [o2.data.upi, v].filter(Boolean).join(', ') } }, 'system');
    return { id: o2.id, type: 'org', created: false, guess: null, confidence: 1 };
  }
  const e = os.entities.create({ type: 'org', title: titleCase(said), data: { kind: business ? 'shop' : 'payee', upi: v ?? undefined } }, 'assistant');
  return { id: e.id, type: 'org', created: true, guess: null, confidence: 1 };
}

/** Link a payment to its payee (people as 'person', everyone else as 'payee'), remembering what the message called them. */
export function linkPayee(os: LifeOSContext, txId: string, m: PayeeMatch, said: string | null, vpa: string | null, source = 'sms') {
  const kind = m.type === 'person' ? 'person' : 'payee';
  os.relations.link(txId, m.id, kind, { as: said, vpa, guess: m.guess }, 'assistant', { source: source as never, confidence: m.confidence });
}

/** You said yes: the link is certain, and that name / UPI ID now means them. */
export function confirmPayee(os: LifeOSContext, relationId: string) {
  const r = os.relations.get(relationId);
  if (!r) return;
  os.relations.setConfidence(relationId, 1);
  const as = r.meta.as as string | undefined;
  const vpa = r.meta.vpa as string | undefined;
  if (as) os.aliases.learn(norm(as), r.toId);
  if (vpa) {
    const e = os.entities.get<{ upi?: string }>(r.toId);
    if (e && !(e.data.upi ?? '').includes(vpa)) os.entities.update(r.toId, { data: { upi: [e.data.upi, vpa].filter(Boolean).join(', ') } }, 'user');
  }
  bus.emit('data.changed', { table: 'relations', id: relationId });
}

/** Not them: unlink, and give the payment its own payee under the name the message used. */
export function rejectPayee(os: LifeOSContext, relationId: string) {
  const r = os.relations.get(relationId);
  if (!r) return;
  os.relations.remove(relationId);
  const as = (r.meta.as as string | undefined) ?? 'Payee';
  const e = os.entities.create({ type: 'org', title: titleCase(as), data: { kind: 'payee', upi: (r.meta.vpa as string | undefined) ?? undefined } }, 'user');
  os.relations.link(r.fromId, e.id, 'payee', { as }, 'user', { source: 'manual', confidence: 1 });
}

/** Payments filed before payees existed: link them once. */
export function linkMissingPayees(os: LifeOSContext): number {
  if (!os.registry.entityTypes.has('transaction')) return 0;
  let n = 0;
  for (const t of os.entities.query<{ merchant?: string; kind?: string; category?: string }>('transaction', {}, { limit: 20000 })) {
    if (!t.data.merchant || t.data.category === 'investment' || t.data.kind === 'transfer') continue;
    if (os.relations.forEntity(t.id).some((r) => r.relation.kind === 'payee' || r.relation.kind === 'person')) continue;
    const m = payeeFor(os, t.data.merchant, null);
    if (!m) continue;
    linkPayee(os, t.id, m, t.data.merchant, null, 'assistant');
    n++;
  }
  return n;
}
