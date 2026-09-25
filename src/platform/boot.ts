import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { createLifeOS } from '@core/lifeos';
import type { LifeOSContext } from '@core/registry/context';
import { bus } from '@core/events/bus';
import { installedModules } from '@modules/index';
import { bindSettingsPersistence, useSettings } from '@ui/hooks/useSettings';
import { registerBackgroundTick } from './background';
import { notifications } from './notifications';
import { openDatabase } from './openDatabase';

let instance: LifeOSContext | null = null;
let navigateRef: (path: string) => void = () => {};
export function setNavigator(fn: (path: string) => void) {
  navigateRef = fn;
}

/**
 * App boot: open SQLite → create the OS with all installed modules → hydrate
 * settings into zustand → wire notifications + background scheduler.
 * Idempotent; safe across Fast Refresh.
 */
export async function bootLifeOS(): Promise<LifeOSContext> {
  if (instance) return instance;
  const db = await openDatabase();

  const os = await createLifeOS({
    db,
    modules: installedModules,
    navigate: (p) => navigateRef(p),
    notify: async (n) => {
      const Notifications = notifications();
      if (!Notifications) return null;
      try {
        const id = await Notifications.scheduleNotificationAsync({
          content: { title: n.title, body: n.body, data: n.data },
          trigger: n.at && n.at > Date.now() ? { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(n.at) } : null,
        });
        return id;
      } catch (e) {
        console.warn('notify failed', e);
        return null;
      }
    },
    cancelNotification: async (id) => {
      const Notifications = notifications();
      if (!Notifications) return;
      await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
    },
  });

  // Settings: DB → zustand, and zustand → DB on change.
  const stored = os.settings.all();
  useSettings.getState().hydrate({
    appearance: (stored.appearance as never) ?? 'system',
    locale: { ...useSettings.getState().locale, ...((stored.locale as object) ?? {}) },
    homeDashboardId: (stored.homeDashboardId as string) ?? null,
    aiModel: (stored.aiModel as string) ?? 'claude-sonnet-5',
    aiEnabled: stored.aiEnabled !== false,
    hapticsEnabled: stored.hapticsEnabled !== false,
    onboarded: !!stored.onboarded,
  });
  bindSettingsPersistence((k, v) => os.settings.set(k, v));

  // Reminders → local notifications. Reschedule all pending on boot (cheap,
  // guarantees the OS notification queue matches the DB after reinstalls).
  await syncReminderNotifications(os);
  bus.on('reminder.created', () => void syncReminderNotifications(os));
  bus.on('reminder.completed', () => void syncReminderNotifications(os));

  // Run any due scheduled jobs now, then hand off to the background task.
  await os.scheduler.tick();
  registerBackgroundTick(os);

  instance = os;
  return os;
}

export function getOS(): LifeOSContext | null {
  return instance;
}

async function syncReminderNotifications(os: LifeOSContext) {
  const Notifications = notifications();
  if (!Notifications) return;
  try {
    const perm = await Notifications.getPermissionsAsync();
    if (!perm.granted) return;
    const upcoming = os.reminders.upcoming(64).filter((r) => (r.snoozedUntil ?? r.nextAt ?? r.dueAt) > Date.now());
    await Notifications.cancelAllScheduledNotificationsAsync();
    for (const r of upcoming) {
      const at = r.snoozedUntil ?? r.nextAt ?? r.dueAt;
      const entity = r.entityId ? os.entities.get(r.entityId) : undefined;
      const id = await Notifications.scheduleNotificationAsync({
        content: { title: r.title, body: r.body ?? entity?.title ?? undefined, data: { reminderId: r.id, entityId: r.entityId, entityType: entity?.type } },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(at) },
      });
      os.reminders.setNotificationId(r.id, id);
    }
  } catch (e) {
    console.warn('reminder notification sync failed', e);
  }
}

/* ------------------------------------------------------------------ */
/* API key storage — SecureStore on device, localStorage on web         */
/* ------------------------------------------------------------------ */

const KEY = 'lifeos.anthropic.apiKey';
export async function getApiKey(): Promise<string | null> {
  if (Platform.OS === 'web') {
    try {
      return globalThis.localStorage?.getItem(KEY) ?? null;
    } catch {
      return null;
    }
  }
  return SecureStore.getItemAsync(KEY);
}
export async function setApiKey(key: string | null): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      if (key) globalThis.localStorage?.setItem(KEY, key);
      else globalThis.localStorage?.removeItem(KEY);
    } catch {
      /* ignore */
    }
    return;
  }
  if (key) await SecureStore.setItemAsync(KEY, key);
  else await SecureStore.deleteItemAsync(KEY);
}
