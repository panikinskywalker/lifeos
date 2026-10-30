import type { LifeOSContext } from '@core/registry/context';
import type { ObjectRecord } from '@core/domain/types';
import type { Filing } from '@core/repo/filingRepo';
import type { AppearanceData, GameData } from './types';
import { whoIs } from '@core/identity';
import { owedOn } from './sync';
import { recordPayment } from './payments';

/**
 * Turf shares paid by SMS (docs/MODEL.md layer 2, *Money*; R9c.6). When finance
 * files a money-in Transaction, games looks for the share it pays:
 * - the **sender** is the UPI id in the text, else the name the bank wrote;
 *   a sender is *known* when it is a learned alias (core `aliases`), one of a
 *   player's UPI ids (core `whoIs`), or the Person finance already matched;
 * - **sure** — a known sender in the Football group, the amount exactly what
 *   they owe (one share, or several paid oldest first), within ten days after
 *   the game: the payment is recorded on its own (via 'sms'), the Transaction
 *   linked, and it shows in To check as filed, with Undo;
 * - otherwise, when someone could be meant, To check asks ("Priya paid her
 *   ₹147 for Sat 19 Sep?"); Yes records it and learns the sender, so next time
 *   it is sure; a smaller amount is a part payment.
 * The SMS itself never leaves the phone: Turf web gets only the entry.
 */

const WINDOW_DAYS = 10;
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
function whoSent(os: LifeOSContext, tx: Tx): { personId: string | null; known: boolean } {
  const members = footballPeople(os);
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
  // A name that looks like one of the squad: a guess, never sure.
  if (name) {
    const n = name.toLowerCase();
    const guess = people.filter((p) => members.has(p.id) && n.includes(firstName(p.title).toLowerCase()));
    if (guess.length === 1) return { personId: guess[0]!.id, known: false };
  }
  return { personId: null, known: false };
}

/** Their open shares the money could be for: games up to ten days before it, oldest first. */
function openShares(os: LifeOSContext, personId: string, txDate: string) {
  const games = new Map(os.records.query<GameData>('game', {}, { limit: 100_000 }).map((g) => [g.id, g]));
  const at = Date.parse(`${txDate.slice(0, 10)}T12:00:00`);
  return os.records
    .query<AppearanceData>('appearance', { filter: { and: [{ field: 'data.personId', op: 'eq', value: personId }] } }, { limit: 10_000 })
    .filter((a) => !a.archived && owedOn(a.data) > 0)
    .filter((a) => {
      const g = games.get(a.data.gameId);
      const d = Date.parse(`${a.data.gameDate}T12:00:00`);
      return g && g.data.frontedById !== personId && d <= at + DAY && at - d <= WINDOW_DAYS * DAY;
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
  return items;
}

/** Look at a newly filed Transaction; record, ask, or leave it. Returns what happened. */
export function matchTransaction(os: LifeOSContext, txId: string): 'paid' | 'asked' | null {
  const seen = os.settings.get<string[]>(SEEN, []);
  if (seen.includes(txId)) return null;
  const tx = os.records.get<Tx>(txId);
  if (!tx || tx.object !== 'transaction' || tx.data.kind !== 'income' || !(tx.data.amount > 0)) return null;
  const who = whoSent(os, tx.data);
  if (!who.personId) return null;
  const shares = openShares(os, who.personId, tx.data.date);
  if (!shares.length) return null;
  os.settings.set(SEEN, [...seen.slice(-500), txId]);
  const name = os.records.get(who.personId)?.title ?? 'Someone';
  const sender = senderOf(tx.data);
  const money = os.format.currency(tx.data.amount);
  const exact = exactly(shares, tx.data.amount);
  if (who.known && exact) {
    let filing!: Filing;
    os.db.transaction(() => {
      const items = pay(os, txId, exact.map((a) => a.id), tx.data.amount, sender.key);
      filing = os.filings.add({ source: 'turf', sourceRef: txId, kind: SMS_PAID, action: 'logged', entityId: exact[0]!.id, label: `${name} paid ${money} · ${exact.map((a) => shortDay(a.data.gameDate)).join(', ')}`, flag: null, before: { items, appearanceIds: exact.map((a) => a.id), amount: tx.data.amount } });
    });
    return filing ? 'paid' : null;
  }
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
    os.filings.markUndone(filingId);
  });
}
