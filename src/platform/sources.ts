import { PermissionsAndroid, Platform } from 'react-native';
import type { LifeOSContext } from '@core/registry/context';
import { ingestMessage } from '@core/ingest/ingest';
import { PAYMENT_APPS } from '@core/ingest/bankSms';
import { saveHealthDays, saveUsageDays, setSourceState, sourceState } from '@core/sources/deviceData';
import { Device, deviceAvailable } from '../../modules/lifeos-device';

/**
 * Data sources on the phone (M4.2): bank SMS, payment-app notifications,
 * screen time and Health Connect. Each syncs on start, on every foreground,
 * from the background task, and (SMS / notifications) live as they arrive.
 * Everything lands through core: raw kept, parsed, deduped, filed, To check.
 */

export type SourceId = 'sms' | 'notifications' | 'usage' | 'health';

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
];

export type Access = 'granted' | 'needed' | 'unavailable';

const DAY = 86_400_000;
const HISTORY_SMS_DAYS = 180;
const HISTORY_HEALTH_DAYS = 90;
const HISTORY_USAGE_DAYS = 30;

/** What's needed to read a source right now. */
export async function access(id: SourceId): Promise<Access> {
  if (!deviceAvailable || !Device) return 'unavailable';
  switch (id) {
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
  if (!Device) return false;
  switch (id) {
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

/** First SMS sync: the last six months as proposals for the review screen. Returns how many were proposed. */
export async function importSmsHistory(os: LifeOSContext): Promise<number> {
  if (!Device || (await access('sms')) !== 'granted') return 0;
  const since = Date.now() - HISTORY_SMS_DAYS * DAY;
  const all = await Device.readSms(since, 5000);
  let proposed = 0;
  for (const m of all.reverse()) {
    const r = ingestMessage(os, { source: 'sms', from: m.from, body: m.body, receivedAt: m.at }, { mode: 'import' });
    if (r.status === 'proposed') proposed++;
  }
  setSourceState(os, 'sms', { enabled: true, lastSync: Date.now(), cursor: String(Date.now()), error: null });
  return proposed;
}

async function syncSms(os: LifeOSContext) {
  const st = sourceState(os, 'sms');
  if (!Device || !st.enabled || (await access('sms')) !== 'granted') return;
  // Anything that arrived while the app was closed: the receiver's queue, then the inbox since the last sync.
  let n = 0;
  for (const m of Device.drain('sms') as Array<{ from: string; body: string; at: number }>) if (ingestMessage(os, { source: 'sms', from: m.from, body: m.body, receivedAt: m.at }).status === 'confirmed') n++;
  const since = Number(st.cursor ?? Date.now() - DAY);
  for (const m of (await Device.readSms(since, 500)).reverse()) if (ingestMessage(os, { source: 'sms', from: m.from, body: m.body, receivedAt: m.at }).status === 'confirmed') n++;
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
  if (!Device || !Device.usageAccess()) return;
  const st = sourceState(os, 'usage');
  const from = st.lastSync ? Math.min(st.lastSync, Date.now() - DAY) - DAY : Date.now() - HISTORY_USAGE_DAYS * DAY;
  const start = new Date(from);
  start.setHours(0, 0, 0, 0);
  const days = await Device.queryUsage(start.getTime(), Date.now());
  saveUsageDays(os, days);
  setSourceState(os, 'usage', { enabled: true, lastSync: Date.now(), addTotal: st.lastSync ? 0 : days.length, error: null });
}

async function syncHealth(os: LifeOSContext) {
  if (!Device || Device.healthStatus() !== 'available' || !(await Device.healthGranted()).length) return;
  const st = sourceState(os, 'health');
  const from = st.lastSync ? Math.min(st.lastSync, Date.now() - DAY) - DAY : Date.now() - HISTORY_HEALTH_DAYS * DAY;
  const days = await Device.readHealth(from, Date.now());
  const created = saveHealthDays(os, days);
  setSourceState(os, 'health', { enabled: true, lastSync: Date.now(), addTotal: created, error: null });
}

let running: Promise<void> | null = null;

/** Sync every source that has access. Safe to call often; one run at a time. */
export function syncSources(os: LifeOSContext): Promise<void> {
  if (!deviceAvailable || Platform.OS !== 'android') return Promise.resolve();
  if (running) return running;
  running = (async () => {
    for (const [id, fn] of [['sms', syncSms], ['notifications', syncNotifications], ['usage', syncUsage], ['health', syncHealth]] as const) {
      try {
        await fn(os);
      } catch (e) {
        setSourceState(os, id, { error: (e as Error).message.slice(0, 200) });
      }
    }
  })().finally(() => {
    running = null;
  });
  return running;
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
