import type { LifeOSContext } from '@core/registry/context';
import { bus } from '@core/events/bus';
import { whoIs } from '@core/identity';

/**
 * Payees (M4.2c): everyone you pay or get paid by is one record, and every
 * payment links to it — so paying John ₹1,300 then ₹500 lands on one John.
 * A person already in People is matched by UPI ID, a sender learned before
 * (an alias, shared with Turf), the mobile number inside a UPI ID (core's
 * `whoIs`, R2), a name you confirmed before, or their name; a
 * close-but-unsure name is linked as a flagged guess you confirm on the
 * payment ("We think JOHN D is John Doe").
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
  const hasPeople = os.registry.objects.has('person');
  const hasOrgs = os.registry.objects.has('org');
  const people = hasPeople ? os.records.query<{ upi?: string }>('person', {}, { limit: 5000 }) : [];
  const orgs = hasOrgs ? os.records.query<{ upi?: string; kind?: string }>('org', {}, { limit: 5000 }) : [];
  const v = vpa?.toLowerCase();
  const byUpi = <T extends { data: { upi?: string } }>(list: T[]) => (v ? list.find((e) => (e.data.upi ?? '').toLowerCase().split(/[,\s]+/).includes(v)) : undefined);
  const known = v ? whoIs(os, { upi: v }, ['person', 'org']) : null;
  if (known) return { id: known.record.id, type: known.record.object as 'person' | 'org', created: false, guess: null, confidence: 1 };
  const o1 = byUpi(orgs);
  if (o1) return { id: o1.id, type: 'org', created: false, guess: null, confidence: 1 };
  // A name you confirmed before.
  for (const a of os.aliases.lookup(norm(said))) {
    const e = os.records.get(a.entityId);
    if (e && (e.object === 'person' || e.object === 'org')) return { id: e.id, type: e.object, created: false, guess: null, confidence: 1 };
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
    if (v && !(o2.data.upi ?? '').includes(v)) os.records.update(o2.id, { data: { upi: [o2.data.upi, v].filter(Boolean).join(', ') } }, 'system');
    return { id: o2.id, type: 'org', created: false, guess: null, confidence: 1 };
  }
  const e = os.records.create({ object: 'org', title: titleCase(said), data: { kind: business ? 'shop' : 'payee', upi: v ?? undefined } }, 'assistant');
  return { id: e.id, type: 'org', created: true, guess: null, confidence: 1 };
}

/** Link a payment to its payee (people as 'person', everyone else as 'payee'), remembering what the message called them. */
export function linkPayee(os: LifeOSContext, txId: string, m: PayeeMatch, said: string | null, vpa: string | null, source = 'sms') {
  const kind = m.type === 'person' ? 'person' : 'payee';
  os.links.link(txId, m.id, kind, { as: said, vpa, guess: m.guess }, 'assistant', { source: source as never, confidence: m.confidence });
}

/** You said yes: the link is certain, and that name / UPI ID now means them. */
export function confirmPayee(os: LifeOSContext, relationId: string) {
  const r = os.links.get(relationId);
  if (!r) return;
  os.links.setConfidence(relationId, 1);
  const as = r.meta.as as string | undefined;
  const vpa = r.meta.vpa as string | undefined;
  if (as) os.aliases.learn(norm(as), r.toId);
  if (vpa) {
    const e = os.records.get<{ upi?: string }>(r.toId);
    if (e && !(e.data.upi ?? '').includes(vpa)) os.records.update(r.toId, { data: { upi: [e.data.upi, vpa].filter(Boolean).join(', ') } }, 'user');
  }
  bus.emit('data.changed', { table: 'relations', id: relationId });
}

/** Not them: unlink, and give the payment its own payee under the name the message used. */
export function rejectPayee(os: LifeOSContext, relationId: string) {
  const r = os.links.get(relationId);
  if (!r) return;
  os.links.remove(relationId);
  const as = (r.meta.as as string | undefined) ?? 'Payee';
  const e = os.records.create({ object: 'org', title: titleCase(as), data: { kind: 'payee', upi: (r.meta.vpa as string | undefined) ?? undefined } }, 'user');
  os.links.link(r.fromId, e.id, 'payee', { as }, 'user', { source: 'manual', confidence: 1 });
}

/** Payments filed before payees existed: link them once. */
export function linkMissingPayees(os: LifeOSContext): number {
  if (!os.registry.objects.has('transaction')) return 0;
  let n = 0;
  for (const t of os.records.query<{ merchant?: string; kind?: string; category?: string }>('transaction', {}, { limit: 20000 })) {
    if (!t.data.merchant || t.data.category === 'investment' || t.data.kind === 'transfer') continue;
    if (os.links.forEntity(t.id).some((r) => r.relation.kind === 'payee' || r.relation.kind === 'person')) continue;
    // The message it came from knows the UPI ID, which finds the right person for sure.
    const parsed = os.db.get<{ parsed: string | null }>(`SELECT parsed FROM ingest_queue WHERE record_id=? AND parsed IS NOT NULL LIMIT 1`, [t.id])?.parsed;
    const vpa = parsed ? ((JSON.parse(parsed) as { txn?: { vpa?: string | null } }).txn?.vpa ?? null) : null;
    const m = payeeFor(os, t.data.merchant, vpa);
    if (!m) continue;
    linkPayee(os, t.id, m, t.data.merchant, vpa, 'assistant');
    n++;
  }
  return n;
}

/* ------------------------------------------------------------------ */
/* Who is this? (R2, NR-People-WhoIs)                                   */
/* ------------------------------------------------------------------ */

/** To check kind: a payment from (or to) a UPI ID nobody is known by, under a name that isn't a business. */
export const PAYEE_WHO = 'payee-who';

/** What a "Who is …?" filing keeps (in its `before`): the UPI ID, the name the message used, the stand-in payee. */
export interface WhoAsk {
  vpa: string;
  said: string | null;
  /** The payee record made for it meanwhile (an Organisation of kind 'payee'). */
  payeeId: string | null;
}

export const whoAskOf = (f: { kind: string; before: Record<string, unknown> | null }): WhoAsk | null => (f.kind === PAYEE_WHO && f.before && typeof f.before.vpa === 'string' ? (f.before as unknown as WhoAsk) : null);

/**
 * A new sender: the payment was linked to a new stand-in payee because no one
 * has this UPI ID and the name isn't a shop's. Ask once in To check who it is
 * ("Who is priya.s@okicici?"); the answer is remembered for every payment
 * after. Returns whether it asked (the stand-in then needs no filing of its own).
 */
export function askWhoIs(os: LifeOSContext, txId: string, m: PayeeMatch, said: string | null, vpa: string | null, source: string, sourceRef: string | null): boolean {
  if (!vpa || m.type !== 'org' || !m.created || !os.registry.objects.has('person')) return false;
  if (os.records.get<{ kind?: string }>(m.id)?.data.kind !== 'payee') return false;
  const tx = os.records.get<{ amount?: number; kind?: string }>(txId);
  const money = tx?.data.amount != null ? `${os.format.currency(tx.data.amount)} ${tx.data.kind === 'income' ? 'in' : 'out'}` : null;
  const ask: WhoAsk = { vpa: vpa.toLowerCase(), said: said?.trim() || null, payeeId: m.id };
  os.filings.add({ source, sourceRef, kind: PAYEE_WHO, action: 'logged', entityId: txId, label: `Who is ${ask.vpa}?`, flag: [money, 'answer once and every payment after is theirs'].filter(Boolean).join(' · '), before: ask as unknown as Record<string, unknown> });
  return true;
}

/** The payments linked to the stand-in payee from this UPI ID (the asked one first). */
function askedPayments(os: LifeOSContext, txId: string | null, ask: WhoAsk): Array<{ txId: string; linkId: string | null; as: string | null }> {
  const out: Array<{ txId: string; linkId: string | null; as: string | null }> = [];
  if (txId) {
    const r = os.links.forEntity(txId).find((x) => x.direction === 'out' && (x.relation.kind === 'payee' || x.relation.kind === 'person'));
    out.push({ txId, linkId: r?.relation.id ?? null, as: (r?.relation.meta.as as string | undefined) ?? ask.said });
  }
  if (ask.payeeId) {
    for (const r of os.links.forEntity(ask.payeeId, 'payee')) {
      if (r.direction !== 'in' || r.other.id === txId || r.other.object !== 'transaction') continue;
      out.push({ txId: r.other.id, linkId: r.relation.id, as: (r.relation.meta.as as string | undefined) ?? ask.said });
    }
  }
  return out;
}

/**
 * "This": the payment (and any since from the same UPI ID) is theirs. The
 * links move to the person, certain; the UPI ID is learned (an alias, shared
 * with Turf) and joins their UPI IDs; the stand-in payee goes if nothing else
 * uses it. The question leaves To check.
 */
export function answerWhoIs(os: LifeOSContext, filingId: string, personId: string): void {
  const f = os.filings.get(filingId);
  const ask = f ? whoAskOf(f) : null;
  if (!f || !ask || !os.records.get(personId)) return;
  os.db.transaction(() => {
    for (const p of askedPayments(os, f.entityId, ask)) {
      if (p.linkId) os.links.remove(p.linkId, 'user');
      os.links.link(p.txId, personId, 'person', { as: p.as, vpa: ask.vpa }, 'user', { source: 'manual', confidence: 1 });
    }
    os.aliases.learn(ask.vpa, personId);
    if (ask.said) os.aliases.learn(norm(ask.said), personId);
    const e = os.records.get<{ upi?: string }>(personId);
    if (e && !(e.data.upi ?? '').toLowerCase().split(/[,\s]+/).includes(ask.vpa)) os.records.update(personId, { data: { upi: [e.data.upi, ask.vpa].filter(Boolean).join(', ') } }, 'user');
    const stand = ask.payeeId ? os.records.get<{ kind?: string }>(ask.payeeId) : null;
    if (stand && stand.data.kind === 'payee' && !os.links.forEntity(stand.id).length) os.records.delete(stand.id, 'user');
    os.filings.setChecked(filingId);
  });
  bus.emit('data.changed', { table: 'relations', id: filingId });
}

/** "It's a shop or company": the stand-in payee stays, as an Organisation (a shop), and the UPI ID means it from now on. */
export function keepWhoAsOrg(os: LifeOSContext, filingId: string): string | null {
  const f = os.filings.get(filingId);
  const ask = f ? whoAskOf(f) : null;
  if (!f || !ask) return null;
  let orgId = ask.payeeId && os.records.get(ask.payeeId) ? ask.payeeId : null;
  os.db.transaction(() => {
    if (!orgId) {
      const e = os.records.create({ object: 'org', title: titleCase(ask.said ?? ask.vpa.split('@')[0]!.replace(/[._-]+/g, ' ')), data: { kind: 'shop', upi: ask.vpa } }, 'user');
      orgId = e.id;
      for (const p of askedPayments(os, f.entityId, ask)) {
        if (p.linkId) os.links.remove(p.linkId, 'user');
        os.links.link(p.txId, e.id, 'payee', { as: p.as, vpa: ask.vpa }, 'user', { source: 'manual', confidence: 1 });
      }
    } else {
      const org = os.records.get<{ kind?: string; upi?: string }>(orgId)!;
      const patch: Record<string, unknown> = {};
      if (org.data.kind === 'payee') patch.kind = 'shop';
      if (!(org.data.upi ?? '').toLowerCase().includes(ask.vpa)) patch.upi = [org.data.upi, ask.vpa].filter(Boolean).join(', ');
      if (Object.keys(patch).length) os.records.update(orgId, { data: patch }, 'user');
    }
    os.aliases.learn(ask.vpa, orgId!);
    os.filings.setChecked(filingId);
  });
  return orgId;
}
