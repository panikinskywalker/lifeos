import { PermissionsAndroid, Platform } from 'react-native';
import type { LifeOSContext } from '@core/registry/context';
import { ingestMessage } from '@core/ingest/ingest';
import { PAYMENT_APPS } from '@core/ingest/bankSms';
import { saveHealthDays, saveUsageDays, setSourceState, sourceState } from '@core/sources/deviceData';
import { applyPendingFx, fxRates, setFxRatesFromInrBase } from '@core/ingest/fx';
import { Device, deviceAvailable } from '../../modules/lifeos-device';
import { quietly } from '@ui/hooks';
import type { RawMessage } from '@core/ingest/ingest';
import { syncMail } from './email';
import { calendarGranted, callLogGranted, contactsGranted, requestCalendar, requestCallLog, syncPhoneSources } from './phoneSources';

/**
 * Data sources on the phone (M4.2): bank SMS, payment-app notifications,
 * screen time and Health Connect. Each syncs on start, on every foreground,
 * from the background task, and (SMS / notifications) live as they arrive.
 * Everything lands through core: raw kept, parsed, deduped, filed, To check.
 */

export type SourceId = 'sms' | 'notifications' | 'usage' | 'health' | 'contacts' | 'calendar' | 'calllog';

export interface SourceInfo {
  id: SourceId;
  label: string;
  line: string;
  icon: string;
}

export const SOURCES: SourceInfo[] = [
  { id: 'sms', label: 'Bank SMS', line: 'Debits, credits and card spends from your bank texts become expenses — with months of history on first run.', icon: 'comment' },
  { id: 'notifications', label: 'Payment apps', line: 'GPay, PhonePe, Paytm and bank-app notifications, matched with the SMS so nothing is counted twice.', icon: 'bell' },
  { id: 'usage', label: 'Screen time', line: 'Time per app, unlocks, first and last use — per day, on the phone only.', icon: 'signal' },
  { id: 'health', label: 'Health Connect', line: 'Steps, sleep, heart rate, weight and workouts from your watch or fitness app.', icon: 'activity' },
  { id: 'contacts', label: 'Contacts', line: 'Pick the people to add — never your whole phonebook. The ones you add stay filled in (phone, email, birthday).', icon: 'people' },
  { id: 'calendar', label: 'Calendar', line: 'Events from your phone’s calendars (a month back, two ahead), linked to the people in them.', icon: 'calendar' },
  { id: 'calllog', label: 'Call log', line: 'Calls with people in LifeOS update when you last spoke — so keep-in-touch reminders need no logging.', icon: 'phone' },
];

export type Access = 'granted' | 'needed' | 'unavailable';

const DAY = 86_400_000;
const HISTORY_SMS_DAYS = 180;
const HISTORY_HEALTH_DAYS = 90;
const HISTORY_USAGE_DAYS = 30;

/** What's needed to read a source right now. */
export async function access(id: SourceId): Promise<Access> {
  if (id === 'contacts') return (await contactsGranted()) ? 'granted' : 'needed';
  if (id === 'calendar') return (await calendarGranted()) ? 'granted' : 'needed';
  if (!deviceAvailable || !Device) return 'unavailable';
  switch (id) {
    case 'calllog':
      return (await callLogGranted()) ? 'granted' : 'needed';
    case 'sms':
      return (await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_SMS)) && (await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECEIVE_SMS)) ? 'granted' : 'needed';
    case 'notifications':
      return Device.notificationAccess() ? 'granted' : 'needed';
    case 'usage':
      return Device.usageAccess() ? 'granted' : 'needed';
    case 'health':
      if (Device.healthStatus() !== 'available') return 'unavailable';
      return (await Device.healthGranted()).length ? 'granted' : 'needed';
  }
}

/** Ask for access (a system dialog, or the settings screen where you flip a switch). Returns whether it's granted now. */
export async function requestAccess(id: SourceId): Promise<boolean> {
  if (id === 'calendar') return requestCalendar();
  if (id === 'contacts') return false; // the picker asks
  if (!Device) return false;
  switch (id) {
    case 'calllog':
      return requestCallLog();
    case 'sms': {
      const r = await PermissionsAndroid.requestMultiple([PermissionsAndroid.PERMISSIONS.READ_SMS, PermissionsAndroid.PERMISSIONS.RECEIVE_SMS]);
      return Object.values(r).every((v) => v === PermissionsAndroid.RESULTS.GRANTED);
    }
    case 'notifications':
      Device.openNotificationAccessSettings();
      return false; // comes back via the foreground sync
    case 'usage':
      Device.openUsageAccessSettings();
      return false;
    case 'health':
      if (Device.healthStatus() === 'needs_update') {
        Device.openHealthConnect();
        return false;
      }
      return (await Device.requestHealthPermissions()).length > 0;
  }
}

/* ------------------------------------------------------------------ */
/* Sync                                                                 */
/* ------------------------------------------------------------------ */

/**
 * Many messages at once (a history import, a backlog after days offline):
 * 200 per database transaction, a breath between batches so the app stays
 * responsive, and one screen refresh at the end.
 */
async function ingestMany(os: LifeOSContext, msgs: RawMessage[], mode: 'live' | 'import'): Promise<{ confirmed: number; proposed: number }> {
  const out = { confirmed: 0, proposed: 0 };
  await quietly(async () => {
    for (let i = 0; i < msgs.length; i += 200) {
      os.db.transaction(() => {
        for (const m of msgs.slice(i, i + 200)) {
          const r = ingestMessage(os, m, { mode });
          if (r.status === 'confirmed') out.confirmed++;
          if (r.status === 'proposed') out.proposed++;
        }
      });
      await new Promise((r) => setTimeout(r, 16));
    }
  });
  return out;
}

/** First SMS sync: the last six months as proposals for the review screen. Returns how many were proposed. */
export async function importSmsHistory(os: LifeOSContext): Promise<number> {
  if (!Device || (await access('sms')) !== 'granted') return 0;
  const since = Date.now() - HISTORY_SMS_DAYS * DAY;
  const all = await Device.readSms(since, 5000);
  const { proposed } = await ingestMany(os, all.reverse().map((m) => ({ source: 'sms' as const, from: m.from, body: m.body, receivedAt: m.at })), 'import');
  setSourceState(os, 'sms', { enabled: true, lastSync: Date.now(), cursor: String(Date.now()), error: null });
  return proposed;
}

async function syncSms(os: LifeOSContext) {
  const st = sourceState(os, 'sms');
  if (!Device || !st.enabled || (await access('sms')) !== 'granted') return void console.log(`[sync] sms skipped: enabled ${st.enabled}, access ${await access('sms')}`);
  // Anything that arrived while the app was closed: the receiver's queue, then the inbox since the last sync.
  const since = Number(st.cursor ?? Date.now() - DAY);
  const queued = Device.drain('sms') as Array<{ from: string; body: string; at: number }>;
  const inbox = (await Device.readSms(since, 500)).reverse();
  const n = (await ingestMany(os, [...queued, ...inbox].map((m) => ({ source: 'sms' as const, from: m.from, body: m.body, receivedAt: m.at })), 'live')).confirmed;
  setSourceState(os, 'sms', { lastSync: Date.now(), cursor: String(Date.now()), addTotal: n, error: null });
}

async function syncNotifications(os: LifeOSContext) {
  if (!Device) return;
  Device.setNotificationAllowlist(Object.keys(PAYMENT_APPS));
  if (!Device.notificationAccess()) return;
  let n = 0;
  for (const m of Device.drain('notifications') as Array<{ package: string; title: string; text: string; at: number }>) {
    if (ingestMessage(os, { source: 'notification', from: m.package, title: m.title, body: m.text, receivedAt: m.at }).status === 'confirmed') n++;
  }
  setSourceState(os, 'notifications', { enabled: true, lastSync: Date.now(), addTotal: n, error: null });
}

async function syncUsage(os: LifeOSContext) {
  if (!Device || !Device.usageAccess()) return void console.log('[sync] usage skipped: no Usage access');
  const st = sourceState(os, 'usage');
  const from = st.lastSync ? Math.min(st.lastSync, Date.now() - DAY) - DAY : Date.now() - HISTORY_USAGE_DAYS * DAY;
  const start = new Date(from);
  start.setHours(0, 0, 0, 0);
  const days = await Device.queryUsage(start.getTime(), Date.now());
  saveUsageDays(os, days);
  setSourceState(os, 'usage', { enabled: true, lastSync: Date.now(), addTotal: st.lastSync ? 0 : days.length, error: null });
}

async function syncHealth(os: LifeOSContext) {
  if (!Device || Device.healthStatus() !== 'available' || !(await Device.healthGranted()).length) return void console.log(`[sync] health skipped: ${Device ? Device.healthStatus() : 'no module'}, permissions ${Device ? (await Device.healthGranted().catch(() => [])).length : 0}`);
  const st = sourceState(os, 'health');
  const from = st.lastSync ? Math.min(st.lastSync, Date.now() - DAY) - DAY : Date.now() - HISTORY_HEALTH_DAYS * DAY;
  const days = await Device.readHealth(from, Date.now());
  const created = saveHealthDays(os, days);
  setSourceState(os, 'health', { enabled: true, lastSync: Date.now(), addTotal: created, error: null });
}

/** Today's exchange rates for USD / GBP / JPY / AED (once a day, when online), then convert anything waiting. */
export async function refreshFxRates(os: LifeOSContext) {
  const today = new Date().toISOString().slice(0, 10);
  if (fxRates(os)?.day !== today) {
    try {
      const r = await fetch('https://open.er-api.com/v6/latest/INR');
      const j = (await r.json()) as { result?: string; rates?: Record<string, number> };
      if (j.result === 'success' && j.rates) setFxRatesFromInrBase(os, today, j.rates);
    } catch {
      /* offline: keep the last rates */
    }
  }
  applyPendingFx(os);
}

let running: { at: number; p: Promise<void> } | null = null;

/** A step that takes longer than this is given up on (it may still finish in the background) so the rest still run. */
const STEP_LIMIT_MS = { fx: 10_000, phone: 90_000, device: 90_000, mail: 120_000 };

function withLimit<T>(name: string, ms: number, work: () => Promise<T>): Promise<void> {
  const t0 = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<'timeout'>((r) => (timer = setTimeout(() => r('timeout'), ms)));
  return Promise.race([work().then(() => 'ok' as const), limit])
    .then((r) => console.log(`[sync] ${name} ${r} ${((Date.now() - t0) / 1000).toFixed(1)}s`))
    .catch((e) => console.log(`[sync] ${name} error ${(e as Error)?.message ?? e}`))
    .finally(() => clearTimeout(timer));
}

/**
 * Sync every source that has access. Safe to call often; one run at a time.
 * Each step is on its own: one that fails or hangs (a slow network, a phone
 * service not answering) is logged and skipped, and never blocks the rest or
 * the next sync.
 */
export function syncSources(os: LifeOSContext): Promise<void> {
  if (Platform.OS === 'web') return Promise.resolve();
  // A run older than 5 minutes is stuck: start afresh.
  if (running && Date.now() - running.at < 5 * 60_000) return running.p;
  const p = (async () => {
    await withLimit('fx', STEP_LIMIT_MS.fx, () => refreshFxRates(os));
    await withLimit('phone (contacts, calendar, calls)', STEP_LIMIT_MS.phone, () => syncPhoneSources(os));
    if (deviceAvailable) {
      for (const [id, fn] of [['sms', syncSms], ['notifications', syncNotifications], ['usage', syncUsage], ['health', syncHealth]] as const) {
        await withLimit(id, STEP_LIMIT_MS.device, async () => {
          try {
            await fn(os);
          } catch (e) {
            setSourceState(os, id, { error: (e as Error).message.slice(0, 200) });
            throw e;
          }
        });
      }
    }
    // Gmail last: a receipt then matches the SMS already filed for it (and the other way round).
    await withLimit('gmail', STEP_LIMIT_MS.mail, () => syncMail(os));
  })().finally(() => {
    if (running?.p === p) running = null;
  });
  running = { at: Date.now(), p };
  return p;
}

/** Live: a bank SMS or payment notification becomes a transaction within the second it arrives. */
export function listenLive(os: LifeOSContext): () => void {
  if (!Device) return () => {};
  const a = Device.addListener('onSms', () => void syncSms(os));
  const b = Device.addListener('onNotification', () => void syncNotifications(os));
  return () => {
    a.remove();
    b.remove();
  };
}
