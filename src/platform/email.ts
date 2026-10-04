import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import type { LifeOSContext } from '@core/registry/context';
import { bus } from '@core/events/bus';
import { fileMail } from '@core/filing/messages';
import { mailKind, type Mail } from '@core/filing/mail';
import { quietly } from '@ui/hooks';
import { Device, deviceAvailable } from '../../modules/lifeos-device';

/**
 * Gmail accounts (M4.2b): each connected with an app password over IMAP,
 * read-only. The password lives in the phone's secure store; the account
 * list and sync position in settings. Only receipts, bookings, shipping and
 * bank alerts are downloaded (chosen from the headers); everything they
 * file names the mailbox it came from.
 */

export interface MailAccount {
  email: string;
  addedAt: number;
  lastSync: number | null;
  /** Highest UID read, and the mailbox generation it belongs to. */
  lastUid: number;
  uidValidity: number;
  /** Records filed (or matched) from this mailbox so far. */
  filed: number;
  error: string | null;
}

const KEY = 'email.accounts';
const HISTORY_DAYS = 90;
const DAY = 86_400_000;

const pwKey = (email: string) => `lifeos_mail_${email.toLowerCase().replace(/[^a-z0-9._-]/g, '_')}`;

export function mailAccounts(os: LifeOSContext): MailAccount[] {
  return os.settings.get<MailAccount[]>(KEY, []);
}

function saveAccount(os: LifeOSContext, email: string, patch: Partial<MailAccount>) {
  const all = mailAccounts(os);
  os.settings.set(KEY, all.map((a) => (a.email === email ? { ...a, ...patch } : a)));
  bus.emit('data.changed', { table: 'settings', id: KEY });
}

export const mailAvailable = Platform.OS === 'android' && deviceAvailable && !!Device?.mailCheck;

/** A readable reason from a failed sign-in or sync. */
export function mailError(e: unknown): string {
  const m = (e as Error)?.message ?? String(e);
  if (/AUTH/i.test(m)) return 'Google refused the app password — check it, or make a new one';
  if (/Unable to resolve host|UnknownHost|timed? ?out|Network|connect/i.test(m)) return 'Couldn’t reach Gmail — no connection?';
  if (/IMAP.*disabled|not enabled/i.test(m)) return 'IMAP is off for this account';
  return m.slice(0, 160);
}

/** Sign in once to check the password, then keep it and read the last 90 days. Throws a readable error. */
export async function addMailAccount(os: LifeOSContext, email: string, appPassword: string): Promise<void> {
  if (!Device?.mailCheck) throw new Error('Gmail needs the new app build');
  const addr = email.trim().toLowerCase();
  const pw = appPassword.replace(/\s+/g, '');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(addr)) throw new Error('That doesn’t look like an email address');
  if (pw.length < 16) throw new Error('An app password is 16 letters (Google shows it in four groups of four)');
  try {
    await Device.mailCheck(addr, pw);
  } catch (e) {
    throw new Error(mailError(e));
  }
  await SecureStore.setItemAsync(pwKey(addr), pw);
  const others = mailAccounts(os).filter((a) => a.email !== addr);
  os.settings.set(KEY, [...others, { email: addr, addedAt: Date.now(), lastSync: null, lastUid: 0, uidValidity: 0, filed: 0, error: null }]);
  bus.emit('data.changed', { table: 'settings', id: KEY });
  void syncMail(os, addr);
}

/** Forget an account and its password. What it filed stays (each record still says where it came from). */
export async function removeMailAccount(os: LifeOSContext, email: string) {
  await SecureStore.deleteItemAsync(pwKey(email)).catch(() => {});
  os.settings.set(KEY, mailAccounts(os).filter((a) => a.email !== email));
  bus.emit('data.changed', { table: 'settings', id: KEY });
}

const running = new Map<string, Promise<void>>();

/** Read new mail from every account (or one). Safe to call often; one run per account at a time. */
/** Sync every mailbox (or one); resolves to how many records were filed this run. */
export function syncMail(os: LifeOSContext, only?: string): Promise<number> {
  if (!mailAvailable) return Promise.resolve(0);
  const accounts = mailAccounts(os).filter((a) => !only || a.email === only);
  const before = accounts.reduce((n, a) => n + a.filed, 0);
  return Promise.all(
    accounts.map((a) => {
      const cur = running.get(a.email);
      if (cur) return cur;
      const p = syncOne(os, a).finally(() => running.delete(a.email));
      running.set(a.email, p);
      return p;
    }),
  ).then(() => Math.max(0, mailAccounts(os).filter((a) => !only || a.email === only).reduce((n, a) => n + a.filed, 0) - before));
}

async function syncOne(os: LifeOSContext, a: MailAccount) {
  const pw = await SecureStore.getItemAsync(pwKey(a.email));
  if (!pw || !Device) return saveAccount(os, a.email, { error: 'Password missing — remove and add this account again' });
  try {
    const since = Date.now() - HISTORY_DAYS * DAY;
    const res = await Device.mailHeaders(a.email, pw, since, a.uidValidity ? a.lastUid : 0, a.uidValidity, a.lastUid ? 500 : 4000);
    const wanted = res.headers.filter((h) => mailKind(h));
    let filed = 0;
    // Oldest first, so a ticket's check-in mail finds the ticket, and a delivery moves forward in order.
    const byUid = new Map(res.headers.map((h) => [h.uid, h]));
    for (let i = 0; i < wanted.length; i += 20) {
      const batch = wanted.slice(i, i + 20);
      const bodies = await Device.mailBodies(a.email, pw, batch.map((h) => h.uid));
      await quietly(async () => {
        os.db.transaction(() => {
          for (const b of bodies) {
            const h = byUid.get(b.uid);
            if (!h) continue;
            const mail: Mail = { ...h, text: b.text };
            const r = fileMail(os, mail, a.email);
            if (r.status === 'confirmed' || r.status === 'duplicate') filed++;
          }
        });
      });
    }
    const lastUid = res.headers.reduce((m, h) => Math.max(m, h.uid), res.uidValidity === a.uidValidity ? a.lastUid : 0);
    saveAccount(os, a.email, { lastSync: Date.now(), lastUid, uidValidity: res.uidValidity, filed: a.filed + filed, error: null });
  } catch (e) {
    saveAccount(os, a.email, { error: mailError(e) });
  }
}
