import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { createLifeOS } from '@core/lifeos';
import type { LifeOSContext } from '@core/registry/context';
import { bus } from '@core/events/bus';
import { installedModules } from '@modules/index';
import { bindSettingsPersistence, useSettings } from '@ui/hooks/useSettings';
import { registerBackgroundTick } from './background';
import { notifications } from './notifications';
import { syncReminderNotifications } from './notifySync';
export { syncReminderNotifications };
import { openDatabase } from './openDatabase';
import { runDumpExtraction } from './dumpExtraction';
import { listenLive, syncSources } from './sources';

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
    aiFastModel: (stored.aiFastModel as string) ?? 'claude-haiku-4-5',
    aiRouting: stored.aiRouting !== false,
    aiChain: (stored.aiChain as never) ?? useSettings.getState().aiChain,
    aiMonthlyCaps: (stored.aiMonthlyCaps as never) ?? {},
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
  // Cycle nudges follow cycles, readings and record edits (debounced: a "done" touches several tables).
  let pending: ReturnType<typeof setTimeout> | null = null;
  const resync = () => {
    if (pending) clearTimeout(pending);
    pending = setTimeout(() => void syncReminderNotifications(os), 1500);
  };
  bus.on('data.changed', ({ table }) => {
    if (table === 'cycles' || table === 'meter_readings' || table === 'settings') resync();
  });
  bus.on('entity.updated', resync);
  bus.on('entity.deleted', resync);
  bus.on('app.foreground', resync);
  // Dumps saved offline or before a key was added get extracted now.
  bus.on('app.foreground', () => void runDumpExtraction(os));
  // Phone data (bank SMS, payment notifications, screen time, Health Connect): on every foreground and live.
  bus.on('app.foreground', () => void syncSources(os));
  listenLive(os);

  // Run any due scheduled jobs now, then hand off to the background task.
  await os.scheduler.tick();
  registerBackgroundTick(os);
  void runDumpExtraction(os);
  void syncSources(os);

  instance = os;
  return os;
}

export function getOS(): LifeOSContext | null {
  return instance;
}

/* ------------------------------------------------------------------ */
/* API key storage — SecureStore on device, localStorage on web         */
/* ------------------------------------------------------------------ */

const LEGACY_KEY = 'lifeos.anthropic.apiKey';
/** Claude keeps its original key name so keys saved before the provider chain still work. */
const keyName = (provider: string) => (provider === 'claude' ? LEGACY_KEY : `lifeos.ai.key.${provider}`);

/** API key for one provider kind ('groq' | 'gemini' | 'claude' | …) — SecureStore on device, localStorage on web. */
export async function getProviderKey(provider: string): Promise<string | null> {
  const k = keyName(provider);
  if (Platform.OS === 'web') {
    try {
      return globalThis.localStorage?.getItem(k) ?? null;
    } catch {
      return null;
    }
  }
  return SecureStore.getItemAsync(k);
}
export async function setProviderKey(provider: string, key: string | null): Promise<void> {
  const k = keyName(provider);
  if (Platform.OS === 'web') {
    try {
      if (key) globalThis.localStorage?.setItem(k, key);
      else globalThis.localStorage?.removeItem(k);
    } catch {
      /* ignore */
    }
    return;
  }
  if (key) await SecureStore.setItemAsync(k, key);
  else await SecureStore.deleteItemAsync(k);
}
/** @deprecated use getProviderKey('claude') */
export const getApiKey = () => getProviderKey('claude');
/** @deprecated use setProviderKey('claude', key) */
export const setApiKey = (key: string | null) => setProviderKey('claude', key);
