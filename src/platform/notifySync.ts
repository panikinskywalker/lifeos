import type { LifeOSContext } from '@core/registry/context';
import { notificationPlan } from '@core/notify/plan';
import { notifications } from './notifications';
import { isDemo } from './demo';

/**
 * Put the notification plan on the phone: reminders, upkeep nudges and the
 * morning brief, switched per kind and kept out of quiet hours (core/notify).
 * Re-run on every change, foreground and background sync, so the brief
 * carries the latest numbers.
 */
export async function syncReminderNotifications(os: LifeOSContext) {
  const Notifications = notifications();
  if (!Notifications || isDemo()) return;
  try {
    const perm = await Notifications.getPermissionsAsync();
    if (!perm.granted) return;
    const plan = notificationPlan(os);
    await Notifications.cancelAllScheduledNotificationsAsync();
    for (const n of plan) {
      const id = await Notifications.scheduleNotificationAsync({
        content: { title: n.title, body: n.body, data: n.data },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(n.at) },
      });
      if (n.kind === 'reminder' && n.data.reminderId) os.reminders.setNotificationId(n.data.reminderId, id);
    }
  } catch (e) {
    console.warn('notification sync failed', e);
  }
}
