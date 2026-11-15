import type { LifeOSContext } from '@core/registry/context';
import type { ObjectRecord } from '@core/domain/types';
import type { Filing } from '@core/repo/filingRepo';
import type { AppearanceData, GameData } from './types';
import { whoIs } from '@core/identity';
import { owedOn } from './sync';
import { recordPayment } from './payments';
import { mePersonId } from './lib';

/**
 * Turf shares paid by SMS (docs/MODEL.md layer 2, *Money*; R9c.6). When finance
 * files a money-in Transaction, games looks for the share it pays:
 * - the **sender** is the UPI id in the text, else the name the bank wrote;
 *   a sender is *known* when it is a learned alias (core `aliases`), one of a
 *   player's UPI ids (core `whoIs`), or the Person finance already matched;
 * - **sure** — a known sender in the Football group (a learned alias, one of
 *   their UPI ids, the Person finance linked the payment to, or a bank name
 *   whose first name is only one player's), the amount exactly what they owe
 *   (one share, or several paid oldest first), within 30 days after the game:
 *   recorded on its own (via 'sms'), the Transaction linked, the sender learned,
 *   and it shows in To check as filed, with Undo (15 Nov, Rutvij: a payment
 *   that comes in is marked paid right away);
 * - otherwise (a part payment, a name two players share), To check asks
 *   ("Priya paid her ₹147 for Sat 19 Sep?"); Yes records it and learns the sender.
 * The SMS itself never leaves the phone: Turf web gets only the entry.
 */

const WINDOW_DAYS = 30;
const DAY = 86_400_000;
export const SMS_PAID = 'turf-payment';
export const SMS_ASK = 'turf-payment-ask';
const SEEN = 'turf.smsSeen';
/** Questions answered Yes: they stay in To check until the payment reaches Turf web, and are never paid twice. */
export const SMS_CONFIRMED = 'turf.smsConfirmed';
export const smsConfirmed = (os: LifeOSContext, filingId: string) => os.settings.get<string[]>(SMS_CONFIRMED, []).includes(filingId);

interface Tx {
  amount: number;
  kind: string;
  date: string;
  payeeId?: string;
  merchant?: string;
  rawText?: string;
}

/** What a Yes needs, kept on the filing. */
export interface SmsAsk {
  txId: string;
  personId: string;
  appearanceIds: string[];
  amount: number;
  sender: string | null;
}

const vpaIn = (text?: string) => /([\w.-]{2,}@[a-z][\w.-]*)/i.exec(text ?? '')?.[1]?.toLowerCase() ?? null;
const shortDay = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

/** The sender of a money-in text: its UPI id, else the bank's spelling of the name. */
export function senderOf(tx: Tx): { vpa: string | null; name: string | null; key: string | null } {
  const vpa = vpaIn(tx.rawText) ?? vpaIn(tx.merchant);
  const name = tx.merchant && !tx.merchant.includes('@') ? tx.merchant.trim() : null;
  return { vpa, name, key: vpa ?? name };
}

function footballPeople(os: LifeOSContext): Set<string> {
  const gid = os.settings.get<string | null>('turf.groupId', null);
  const g = gid ? os.records.get<{ memberIds?: string[] }>(gid) : undefined;
  return new Set(g?.data.memberIds ?? []);
}

/** Who sent it, and whether we know for sure. */
function whoSent(os: LifeOSContext, tx: Tx, txId?: string): { personId: string | null; known: boolean } {
  const members = footballPeople(os);
  // The person finance linked the payment to (its payee).
  const linked = txId ? os.links.forEntity(txId, 'person').find((l) => members.has(l.other.id)) : undefined;
  if (linked) return { personId: linked.other.id, known: true };
  const { vpa, name } = senderOf(tx);
  const people = os.records.query('person', {}, { limit: 100_000 });
  if (vpa) {
    const alias = os.aliases.lookup(vpa).find((a) => members.has(a.entityId));
    if (alias) return { personId: alias.entityId, known: true };
    // One of their UPI ids, or the mobile number inside it (core identity).
    const hit = whoIs(os, { upi: vpa }, ['person']);
    if (hit && members.has(hit.record.id)) return { personId: hit.record.id, known: true };
  }
  if (name) {
    const alias = os.aliases.lookup(name).find((a) => members.has(a.entityId));
    if (alias) return { personId: alias.entityId, known: true };
  }
  if (tx.payeeId && members.has(tx.payeeId)) return { personId: tx.payeeId, known: true };
  // A bank name whose first name is only one player's ("ABHINAV ARUN CH" → Abhinav): sure; two players: a guess.
  if (name) {
    const first = firstName(name).toLowerCase();
    const n = name.toLowerCase();
    const same = people.filter((p) => members.has(p.id) && firstName(p.title).toLowerCase() === first);
    if (same.length === 1) return { personId: same[0]!.id, known: true };
    const guess = people.filter((p) => members.has(p.id) && n.includes(firstName(p.title).toLowerCase()));
    if (guess.length === 1) return { personId: guess[0]!.id, known: false };
  }
  return { personId: null, known: false };
}

/** Their open shares the money could be for: games up to 30 days before it (any game, `anyDay`), oldest first. */
function openShares(os: LifeOSContext, personId: string, txDate: string, anyDay = false) {
  const games = new Map(os.records.query<GameData>('game', {}, { limit: 100_000 }).map((g) => [g.id, g]));
  const at = Date.parse(`${txDate.slice(0, 10)}T12:00:00`);
  return os.records
    .query<AppearanceData>('appearance', { filter: { and: [{ field: 'data.personId', op: 'eq', value: personId }] } }, { limit: 10_000 })
    .filter((a) => !a.archived && owedOn(a.data) > 0)
    .filter((a) => {
      const g = games.get(a.data.gameId);
      const d = Date.parse(`${a.data.gameDate}T12:00:00`);
      return g && g.data.frontedById !== personId && (anyDay || (d <= at + DAY && at - d <= WINDOW_DAYS * DAY));
    })
    .sort((a, b) => a.data.gameDate.localeCompare(b.data.gameDate));
}

/** Shares an amount pays exactly: one share, or the oldest ones together. */
function exactly(shares: Array<ObjectRecord<AppearanceData>>, amount: number): Array<ObjectRecord<AppearanceData>> | null {
  const one = shares.find((a) => Math.abs(owedOn(a.data) - amount) < 0.5);
  if (one) return [one];
  let sum = 0;
  const run: Array<ObjectRecord<AppearanceData>> = [];
  for (const a of shares) {
    sum += owedOn(a.data);
    run.push(a);
    if (Math.abs(sum - amount) < 0.5) return run;
    if (sum > amount) break;
  }
  return null;
}

/** Pay shares, oldest first, up to the amount (the last one may be part paid). */
function pay(os: LifeOSContext, txId: string, appearanceIds: string[], amount: number, sender: string | null) {
  let left = Math.round(amount * 100) / 100;
  const items: string[] = [];
  for (const id of appearanceIds) {
    const a = os.records.get<AppearanceData>(id);
    if (!a || left <= 0) continue;
    const part = Math.min(left, owedOn(a.data));
    if (part <= 0) continue;
    items.push(recordPayment(os, id, { amount: part, via: 'sms', note: `SMS${sender ? ` · ${sender}` : ''}` }).id);
    if (!os.links.forEntity(txId).some((l) => l.other.id === id)) os.links.link(txId, id, 'pays', {}, 'system');
    left = Math.round((left - part) * 100) / 100;
  }
  // A payback, not income (MODEL layer 2, Your share): only what is left over, a credit, still counts as money in.
  if (items.length) os.records.update(txId, { data: { share: Math.max(0, left) } }, 'system');
  return items;
}

/** A known sender paying exactly: recorded, the sender learned, filed in To check with Undo. */
function recordSure(os: LifeOSContext, txId: string, tx: Tx, personId: string, exact: Array<ObjectRecord<AppearanceData>>): Filing | null {
  const name = os.records.get(personId)?.title ?? 'Someone';
  const sender = senderOf(tx);
  let filing: Filing | null = null;
  os.db.transaction(() => {
    const items = pay(os, txId, exact.map((a) => a.id), tx.amount, sender.key);
    if (sender.key && !os.aliases.lookup(sender.key).some((a) => a.entityId === personId)) os.aliases.learn(sender.key, personId);
    filing = os.filings.add({ source: 'turf', sourceRef: txId, kind: SMS_PAID, action: 'logged', entityId: exact[0]!.id, label: `${name} paid ${os.format.currency(tx.amount)} · ${exact.map((a) => shortDay(a.data.gameDate)).join(', ')}`, flag: null, before: { items, appearanceIds: exact.map((a) => a.id), amount: tx.amount } });
  });
  return filing;
}

/**
 * Open questions looked at again (each payment is otherwise looked at once):
 * one asked under an older rule whose sender is known now and paid exactly is
 * recorded, and a question whose shares were paid some other way goes.
 */
function reaskOpen(os: LifeOSContext): number {
  let n = 0;
  for (const f of os.filings.ofKind(SMS_ASK, { open: true, limit: 500 })) {
    const ask = f.before as unknown as SmsAsk | null;
    if (!ask || smsConfirmed(os, f.id)) continue;
    const tx = os.records.get<Tx>(ask.txId);
    const owed = ask.appearanceIds.some((id) => {
      const a = os.records.get<AppearanceData>(id);
      return a && !a.archived && owedOn(a.data) > 0;
    });
    if (!tx || !owed || os.links.forEntity(ask.txId, 'pays').length) {
      os.filings.setChecked(f.id);
      continue;
    }
    const who = whoSent(os, tx.data, tx.id);
    const exact = who.known && who.personId ? exactly(openShares(os, who.personId, tx.data.date), tx.data.amount) : null;
    if (!exact || !recordSure(os, tx.id, tx.data, who.personId!, exact)) continue;
    os.filings.setChecked(f.id);
    n++;
  }
  return n;
}

/** Look at a newly filed Transaction; record, ask, or leave it. Returns what happened. */
export function matchTransaction(os: LifeOSContext, txId: string): 'paid' | 'asked' | null {
  const seen = os.settings.get<string[]>(SEEN, []);
  if (seen.includes(txId)) return null;
  const tx = os.records.get<Tx>(txId);
  if (!tx || tx.object !== 'transaction' || tx.data.kind !== 'income' || !(tx.data.amount > 0)) return null;
  const who = whoSent(os, tx.data, txId);
  if (!who.personId) return null;
  const shares = openShares(os, who.personId, tx.data.date);
  if (!shares.length) return null;
  os.settings.set(SEEN, [...seen.slice(-500), txId]);
  const exact = exactly(shares, tx.data.amount);
  if (who.known && exact) return recordSure(os, txId, tx.data, who.personId, exact) ? 'paid' : null;
  const name = os.records.get(who.personId)?.title ?? 'Someone';
  const sender = senderOf(tx.data);
  const money = os.format.currency(tx.data.amount);
  const target = exact ?? [shares[0]!];
  const owed = target.reduce((s, a) => s + owedOn(a.data), 0);
  const part = tx.data.amount < owed - 0.5;
  const ask: SmsAsk = { txId, personId: who.personId, appearanceIds: target.map((a) => a.id), amount: Math.min(tx.data.amount, owed), sender: sender.key };
  os.filings.add({
    source: 'turf',
    sourceRef: txId,
    kind: SMS_ASK,
    action: 'logged',
    entityId: txId,
    label: part ? `${firstName(name)} paid ${money} of ${os.format.currency(owed)} for ${shortDay(target[0]!.data.gameDate)}?` : `${firstName(name)} paid ${money} for ${target.map((a) => shortDay(a.data.gameDate)).join(', ')}?`,
    flag: `${money} in from ${sender.name ?? sender.vpa ?? name} · SMS · ${shortDay(tx.data.date)}`,
    before: ask as unknown as Record<string, unknown>,
  });
  return 'asked';
}

/**
 * Yes on a To check question: record it, link the Transaction, learn the
 * sender. The question stays (answered) until the payment has reached Turf
 * web — `settleSmsAsk` ticks it then — and a second Yes does nothing.
 */
export function confirmSmsAsk(os: LifeOSContext, filingId: string): void {
  const f = os.filings.get(filingId);
  const ask = f?.before as unknown as SmsAsk | null;
  if (!f || !ask || smsConfirmed(os, filingId)) return;
  os.db.transaction(() => {
    pay(os, ask.txId, ask.appearanceIds, ask.amount, ask.sender);
    if (ask.sender && !os.aliases.lookup(ask.sender).some((a) => a.entityId === ask.personId)) os.aliases.learn(ask.sender, ask.personId);
    os.settings.set(SMS_CONFIRMED, [...os.settings.get<string[]>(SMS_CONFIRMED, []).slice(-200), filingId]);
  });
}

/** An answered question whose payment has gone: it leaves To check. */
export function settleSmsAsk(os: LifeOSContext, filingId: string): void {
  if (smsConfirmed(os, filingId)) os.filings.setChecked(filingId);
}

/** Not this: the question goes; the Transaction stays as finance filed it. */
export const dismissSmsAsk = (os: LifeOSContext, filingId: string) => os.filings.setChecked(filingId);

/** Undo a payment recorded from an SMS: a correction takes it back off each share, the link goes. */
export function undoSmsPayment(os: LifeOSContext, filingId: string): void {
  const f = os.filings.get(filingId);
  const b = f?.before as { appearanceIds?: string[]; amount?: number } | null;
  if (!f || !b?.appearanceIds) return;
  os.db.transaction(() => {
    let left = b.amount ?? 0;
    for (const id of b.appearanceIds!) {
      const a = os.records.get<AppearanceData>(id);
      if (!a || left <= 0) continue;
      const part = Math.min(left, a.data.amountPaid ?? left);
      if (part > 0) recordPayment(os, id, { amount: -part, kind: 'correction', note: 'SMS match undone' });
      left -= part;
      if (f.sourceRef) os.links.unlink(f.sourceRef, id, 'pays', 'user');
    }
    if (f.sourceRef && os.records.get(f.sourceRef)) os.records.update(f.sourceRef, { data: { share: undefined } }, 'user');
    os.filings.markUndone(filingId);
  });
}

/** Money in not yet matched to a share, once on start and after a sync (payments filed before this rule, or before the game synced), and open questions looked at again. */
export function matchRecentPayments(os: LifeOSContext, days = 60): number {
  if (!os.registry.objects.has('transaction')) return 0;
  const since = new Date(Date.now() - days * DAY).toISOString().slice(0, 10);
  let n = reaskOpen(os);
  for (const t of os.records.query<Tx>('transaction', { filter: { and: [{ field: 'data.kind', op: 'eq', value: 'income' }, { field: 'data.date', op: 'gte', value: since }] }, sort: [{ field: 'data.date', dir: 'asc' }] }, { limit: 20000 })) {
    if (os.links.forEntity(t.id, 'pays').length) continue;
    if (matchTransaction(os, t.id) === 'paid') n++;
  }
  return n;
}

/** Squad members who owe you, most first: who a payment could be from, picked by hand. */
export function playersOwing(os: LifeOSContext): Array<{ personId: string; name: string; owed: number }> {
  const members = footballPeople(os);
  const me = mePersonId(os);
  const by = new Map<string, number>();
  for (const a of os.records.query<AppearanceData>('appearance', {}, { limit: 100_000 })) {
    if (a.archived || !members.has(a.data.personId) || a.data.personId === me) continue;
    const owed = owedOn(a.data);
    if (owed > 0) by.set(a.data.personId, (by.get(a.data.personId) ?? 0) + owed);
  }
  return [...by].map(([personId, owed]) => ({ personId, name: os.records.get(personId)?.title ?? 'Someone', owed })).sort((a, b) => b.owed - a.owed);
}

/**
 * By hand: this money in is from them. It pays their open shares, oldest first,
 * up to the amount (the last may be part paid), links the payment, learns the
 * sender, and is filed in To check with Undo (undoSmsPayment). Returns the filing.
 */
export function linkPaymentToPlayer(os: LifeOSContext, txId: string, personId: string): string | null {
  const tx = os.records.get<Tx>(txId);
  if (!tx || tx.data.kind !== 'income') return null;
  const shares = openShares(os, personId, tx.data.date, true);
  if (!shares.length) return null;
  const sender = senderOf(tx.data);
  const name = os.records.get(personId)?.title ?? 'Someone';
  let id: string | null = null;
  os.db.transaction(() => {
    const items = pay(os, txId, shares.map((a) => a.id), tx.data.amount, sender.key);
    if (sender.key && !os.aliases.lookup(sender.key).some((a) => a.entityId === personId)) os.aliases.learn(sender.key, personId);
    const paidIds = shares.filter((a) => os.links.forEntity(txId, 'pays').some((l) => l.other.id === a.id)).map((a) => a.id);
    id = os.filings.add({ source: 'turf', sourceRef: txId, kind: SMS_PAID, action: 'logged', entityId: paidIds[0] ?? shares[0]!.id, label: `${name} paid ${os.format.currency(tx.data.amount)} · ${shares.filter((a) => paidIds.includes(a.id)).map((a) => shortDay(a.data.gameDate)).join(', ')}`, flag: null, before: { items, appearanceIds: paidIds, amount: tx.data.amount } }).id;
  });
  return id;
}
