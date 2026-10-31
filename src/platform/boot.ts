import { createLifeOS } from '@core/lifeos';
import type { LifeOSContext } from '@core/registry/context';
import { bus } from '@core/events/bus';
import { installedModules } from '@modules/index';
import { installedBoards } from '@boards/index';
import { bindSettingsPersistence, useSettings } from '@ui/hooks/useSettings';
import { registerBackgroundTick } from './background';
import { getProviderKey, setProviderKey } from './keys';
import { notifications } from './notifications';
import { syncReminderNotifications } from './notifySync';
export { syncReminderNotifications };
import { openDatabase } from './openDatabase';
import { deviceBridge } from './sources';
import { runFiling } from './filing';
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
    boards: installedBoards,
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
  os.device = deviceBridge(os);

  // Settings: DB → zustand, and zustand → DB on change.
  const stored = os.settings.all();
  useSettings.getState().hydrate({
    appearance: (stored.appearance as never) ?? 'dark',
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
  bus.on('app.foreground', () => void runFiling(os));
  // Phone data (bank SMS, payment notifications, screen time, Health Connect): on every foreground and live.
  bus.on('app.foreground', () => void syncSources(os));
  listenLive(os);

  // Run any due scheduled jobs now, then hand off to the background task.
  await os.scheduler.tick();
  registerBackgroundTick(os);
  void runFiling(os);
  void syncSources(os);

  // TEMP diagnostics (counts only, no content): what's in the database on this phone.
  try {
    const q = <T extends Record<string, unknown>>(sql: string) => os.db.all<T>(sql);
    console.log('[diag] records', JSON.stringify(q<{ type: string; n: number }>(`SELECT object, COUNT(*) AS n FROM records WHERE deleted_at IS NULL GROUP BY object`)));
    console.log('[diag] messages', JSON.stringify(q<{ source: string; status: string; n: number }>(`SELECT source, status, COUNT(*) AS n FROM ingest_queue GROUP BY source, status`)));
    console.log('[diag] sources', JSON.stringify(q<{ id: string; enabled: number; last_sync: number | null; total: number; error: string | null }>(`SELECT id, enabled, last_sync, total, error FROM source_state`)));
    console.log('[diag] set aside, why', JSON.stringify(q<{ source: string; reason: string | null; n: number }>(`SELECT source, error AS reason, COUNT(*) AS n FROM ingest_queue WHERE status='dismissed' GROUP BY source, reason ORDER BY n DESC`)));
    console.log('[diag] untrusted senders (bank-style headers only)', JSON.stringify(q<{ address: string; bank: string | null; count: number }>(`SELECT address, bank, count FROM sms_senders WHERE trusted=0 AND address GLOB '*[A-Z]-*' ORDER BY count DESC LIMIT 25`)));
    console.log('[diag] payments by month', JSON.stringify(q<{ m: string; n: number }>(`SELECT substr(json_extract(data,'$.date'),1,7) AS m, COUNT(*) AS n FROM records WHERE object='transaction' AND deleted_at IS NULL GROUP BY m ORDER BY m`)));
    console.log('[diag] dumps', JSON.stringify(q<{ status: string; n: number }>(`SELECT status, COUNT(*) AS n FROM dumps GROUP BY status`)));
    console.log('[diag] usage days', JSON.stringify(q<{ n: number; last: string | null }>(`SELECT COUNT(*) AS n, MAX(day) AS last FROM usage_daily`)));
    console.log('[diag] migrations', JSON.stringify(q<{ v: number }>(`SELECT MAX(version) AS v FROM _migrations`)));
    console.log('[diag] untrusted texts that talk money (counts only)', JSON.stringify(q<{ sender: string; n: number; money: number; shipping: number }>(`SELECT package AS sender, COUNT(*) AS n, SUM(CASE WHEN lower(raw_text) LIKE '%debited%' OR lower(raw_text) LIKE '%credited%' OR lower(raw_text) LIKE '%spent%' OR lower(raw_text) LIKE '%paid%' OR lower(raw_text) LIKE '%payment of%' OR lower(raw_text) LIKE '%received rs%' OR lower(raw_text) LIKE '%txn%' THEN 1 ELSE 0 END) AS money, SUM(CASE WHEN lower(raw_text) LIKE '%deliver%' OR lower(raw_text) LIKE '%shipped%' OR lower(raw_text) LIKE '%dispatched%' OR lower(raw_text) LIKE '%out for%' THEN 1 ELSE 0 END) AS shipping FROM ingest_queue WHERE status='dismissed' AND error='sender not trusted' AND raw_text IS NOT NULL GROUP BY package HAVING money > 0 OR shipping > 0 ORDER BY money DESC, shipping DESC LIMIT 30`)));
    console.log('[diag] set-aside texts not from untrusted senders, by sender (counts only)', JSON.stringify(q<{ sender: string; reason: string; n: number }>(`SELECT package AS sender, error AS reason, COUNT(*) AS n FROM ingest_queue WHERE status='dismissed' AND source='sms' AND error IN ('info','bill','declined') GROUP BY package, error ORDER BY n DESC LIMIT 20`)));
    console.log('[diag] bank texts marked info that look like money moving (counts only)', JSON.stringify(q<{ sender: string; n: number; debit: number; credit: number; withRs: number }>(`SELECT substr(package,4,6) AS sender, COUNT(*) AS n, SUM(CASE WHEN lower(raw_text) LIKE '%debited%' OR lower(raw_text) LIKE '%spent%' OR lower(raw_text) LIKE '%sent rs%' OR lower(raw_text) LIKE '%paid%' OR lower(raw_text) LIKE '%withdrawn%' OR lower(raw_text) LIKE '%used%' THEN 1 ELSE 0 END) AS debit, SUM(CASE WHEN lower(raw_text) LIKE '%credited%' OR lower(raw_text) LIKE '%received%' OR lower(raw_text) LIKE '%refund%' THEN 1 ELSE 0 END) AS credit, SUM(CASE WHEN raw_text LIKE '%Rs%' OR raw_text LIKE '%INR%' OR raw_text LIKE '%₹%' THEN 1 ELSE 0 END) AS withRs FROM ingest_queue WHERE status='dismissed' AND source='sms' AND error='info' AND raw_text IS NOT NULL GROUP BY sender ORDER BY n DESC`)));
    console.log('[diag] info texts with raw text kept', JSON.stringify(q<{ n: number }>(`SELECT COUNT(*) AS n FROM ingest_queue WHERE status='dismissed' AND error='info' AND raw_text IS NOT NULL`)));
    console.log('[diag] dumps waiting, why', JSON.stringify(q<{ status: string; attempts: number; error: string | null; retry_at: number | null }>(`SELECT status, attempts, error, retry_at FROM dumps WHERE status <> 'done'`)));
    console.log('[diag] ai chain', JSON.stringify(os.settings.get('aiChain', null) ?? useSettings.getState().aiChain), 'limits', JSON.stringify(os.settings.get('ai.limits', {})));
    void Promise.all(['groq', 'gemini', 'claude', 'openrouter'].map(async (k) => [k, !!(await getProviderKey(k).catch(() => null))?.length] as const)).then((r) => console.log('[diag] AI keys saved (yes/no only)', JSON.stringify(Object.fromEntries(r))));
  } catch (e) {
    console.log('[diag] failed', (e as Error).message);
  }
  instance = os;
  return os;
}

export function getOS(): LifeOSContext | null {
  return instance;
}

/* API keys live in ./keys (SecureStore on device, localStorage on web); re-exported here for existing imports. */
export { getProviderKey, setProviderKey } from './keys';
/** @deprecated use getProviderKey('claude') */
export const getApiKey = () => getProviderKey('claude');
/** @deprecated use setProviderKey('claude', key) */
export const setApiKey = (key: string | null) => setProviderKey('claude', key);
