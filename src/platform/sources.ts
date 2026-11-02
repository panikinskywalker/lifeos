import { PermissionsAndroid, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import type { LifeOSContext } from '@core/registry/context';
import { importSource, runSource } from '@core/filing/sources';
import type { DeviceBridge } from '@core/registry/context';
import { sourceState } from '@core/sources/deviceData';
import { applyPendingFx, fxRates, setFxRatesFromInrBase } from '@modules/finance/filing/fx';
import { Device, deviceAvailable } from '../../modules/lifeos-device';
import { quietly } from '@ui/hooks';
import { syncMail } from './email';
import { foldersBridge } from './folders';
import { calendarBridge, calendarGranted, callLogBridge, callLogGranted, contactsBridge, contactsGranted, requestCalendar, requestCallLog } from './phoneSources';

/**
 * Data sources on the phone (M4.2): bank SMS, payment-app notifications,
 * screen time and Health Connect. Each syncs on start, on every foreground,
 * from the background task, and (SMS / notifications) live as they arrive.
 * Every source is declared by its module and reads the phone through the
 * device bridge below (health's Health Connect and Usage access since R6);
 * everything lands through core: raw kept, parsed, deduped, filed, To check.
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

const HISTORY_SMS_DAYS = 180;

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
 * The phone as modules see it (docs/MODEL.md §4): finance's SMS, notification
 * and Gmail sources read through this and never import platform code. Many
 * messages at once are filed by core in batches with a breath between them.
 */
/** Keys for sources (Turf web), in the phone's secure store. Web previews keep none. */
const secrets: NonNullable<DeviceBridge['secrets']> = {
  get: async (key) => (Platform.OS === 'web' ? null : SecureStore.getItemAsync(`lifeos.secret.${key}`).catch(() => null)),
  set: async (key, value) => {
    if (Platform.OS === 'web') return;
    if (value) await SecureStore.setItemAsync(`lifeos.secret.${key}`, value);
    else await SecureStore.deleteItemAsync(`lifeos.secret.${key}`).catch(() => {});
  },
};

export function deviceBridge(os: LifeOSContext): DeviceBridge {
  // Contacts work wherever expo-contacts does; the call log needs the Android module.
  const contacts = Platform.OS === 'web' ? undefined : contactsBridge;
  const calendar = Platform.OS === 'web' ? undefined : calendarBridge;
  if (!Device) return { secrets, contacts, calendar };
  return {
    secrets,
    contacts,
    calendar,
    callLog: callLogBridge,
    sms: {
      access: () => access('sms'),
      read: (since, limit) => Device!.readSms(since, limit).then((xs) => xs.map((m) => ({ from: m.from, body: m.body, at: m.at }))),
      drain: () => Device!.drain('sms') as Array<{ from: string; body: string; at: number }>,
    },
    notifications: {
      access: () => Device!.notificationAccess(),
      setAllowlist: (pkgs) => Device!.setNotificationAllowlist(pkgs),
      drain: () => Device!.drain('notifications') as Array<{ package: string; title: string; text: string; at: number }>,
    },
    mail: { sync: () => syncMail(os) },
    health: { access: () => access('health'), read: (from, to) => Device!.readHealth(from, to) },
    usage: { access: () => access('usage'), read: (from, to) => Device!.queryUsage(from, to) },
    pdfText: (uri) => Device!.pdfText(uri).then((t) => (t.trim() ? t : null)),
    folders: foldersBridge(Device),
  };
}

/** First SMS sync: the last six months as proposals for the review screen. Returns how many were proposed. */
export async function importSmsHistory(os: LifeOSContext): Promise<number> {
  const src = os.registry.sources.get('sms');
  if (!src || (await access('sms')) !== 'granted') return 0;
  return quietly(() => importSource(os, src, HISTORY_SMS_DAYS));
}

/** A source from the registry, if it is usable now (each module's: sms, notifications, gmail, health, usage…). */
async function syncRegistered(os: LifeOSContext, id: string) {
  const src = os.registry.sources.get(id);
  if (!src) return;
  if (id === 'sms' && !sourceState(os, id).enabled) return void console.log('[sync] sms skipped: not enabled');
  await quietly(() => runSource(os, src));
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
const STEP_LIMIT_MS = { fx: 10_000, phone: 90_000, device: 90_000, mail: 120_000, turf: 60_000, notion: 240_000 };

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
    // Projects' calendar (R4) and People's sources (crm, R2): the contacts you picked, the call log.
    // Documents' folders (R7c) after them: a rescan of the folders you picked.
    for (const id of ['calendar', 'contacts', 'calllog', 'folders'] as const) await withLimit(id, STEP_LIMIT_MS.phone, () => syncRegistered(os, id));
    if (deviceAvailable) {
      // Declared by their modules and run through the registry: finance's sms and notifications, health's usage and Health Connect (R6).
      for (const id of ['sms', 'notifications', 'usage', 'health'] as const) await withLimit(id, STEP_LIMIT_MS.device, () => syncRegistered(os, id));
    }
    // Turf web (games): only once its address and key are set.
    await withLimit('turf', STEP_LIMIT_MS.turf, () => syncRegistered(os, 'turf'));
    // Notion (crm, R2b): your People CRM's copy, both ways — only once a token is on this phone. Its own, longer limit: ~3 calls a second.
    await withLimit('notion', STEP_LIMIT_MS.notion, async () => {
      if (await secrets.get('notion.token')) await syncRegistered(os, 'notion');
    });
    // Gmail last: a receipt then matches the SMS already filed for it (and the other way round).
    await withLimit('gmail', STEP_LIMIT_MS.mail, () => syncRegistered(os, 'gmail'));
  })().finally(() => {
    if (running?.p === p) running = null;
  });
  running = { at: Date.now(), p };
  return p;
}

/** Live: a bank SMS or payment notification becomes a transaction within the second it arrives. */
export function listenLive(os: LifeOSContext): () => void {
  if (!Device) return () => {};
  const a = Device.addListener('onSms', () => void syncRegistered(os, 'sms'));
  const b = Device.addListener('onNotification', () => void syncRegistered(os, 'notifications'));
  return () => {
    a.remove();
    b.remove();
  };
}
