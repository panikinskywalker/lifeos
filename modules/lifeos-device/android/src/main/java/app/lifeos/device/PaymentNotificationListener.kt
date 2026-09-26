package app.lifeos.device

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

/**
 * Reads notifications only from the payment / bank apps you allowed
 * (GPay, PhonePe, Paytm, bank apps…) and keeps their title and text.
 * Everything else is ignored and never stored.
 */
class PaymentNotificationListener : NotificationListenerService() {
  override fun onNotificationPosted(sbn: StatusBarNotification) {
    val allowed = Inbox.getStringSet(applicationContext, "notification_allowlist")
    if (!allowed.contains(sbn.packageName)) return
    val extras = sbn.notification?.extras ?: return
    if ((sbn.notification.flags and Notification.FLAG_GROUP_SUMMARY) != 0) return
    val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString() ?: ""
    val text = (extras.getCharSequence(Notification.EXTRA_BIG_TEXT) ?: extras.getCharSequence(Notification.EXTRA_TEXT))?.toString() ?: ""
    if (title.isBlank() && text.isBlank()) return
    Inbox.add(
      applicationContext,
      "notifications",
      mapOf("package" to sbn.packageName, "title" to title, "text" to text, "at" to sbn.postTime.toDouble(), "key" to sbn.key),
    )
  }
}
