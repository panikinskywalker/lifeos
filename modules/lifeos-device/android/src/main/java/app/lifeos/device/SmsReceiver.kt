package app.lifeos.device

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony

/** A new SMS: kept for JS (multi-part messages joined), pushed at once if the app is running. */
class SmsReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return
    val parts = Telephony.Sms.Intents.getMessagesFromIntent(intent) ?: return
    val byAddress = LinkedHashMap<String, StringBuilder>()
    var at = System.currentTimeMillis()
    for (p in parts) {
      val from = p.displayOriginatingAddress ?: p.originatingAddress ?: continue
      byAddress.getOrPut(from) { StringBuilder() }.append(p.displayMessageBody ?: p.messageBody ?: "")
      if (p.timestampMillis > 0) at = p.timestampMillis
    }
    for ((from, body) in byAddress) {
      Inbox.add(context, "sms", mapOf("from" to from, "body" to body.toString(), "at" to at.toDouble()))
    }
  }
}
