package app.lifeos.device

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.CallLog
import android.provider.Settings
import android.provider.Telephony
import androidx.core.app.NotificationManagerCompat
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import expo.modules.kotlin.activityresult.AppContextActivityResultContract
import expo.modules.kotlin.activityresult.AppContextActivityResultLauncher
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** Health Connect's permission screen as an Expo activity-result contract (input must be Serializable). */
private class HealthPermissionContract : AppContextActivityResultContract<HashSet<String>, Set<String>> {
  private val inner = PermissionController.createRequestPermissionResultContract()
  override fun createIntent(context: Context, input: HashSet<String>): Intent = inner.createIntent(context, input)
  override fun parseResult(input: HashSet<String>, resultCode: Int, intent: Intent?): Set<String> = inner.parseResult(resultCode, intent)
}

class LifeosDeviceModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()
  private lateinit var healthLauncher: AppContextActivityResultLauncher<HashSet<String>, Set<String>>

  private fun open(intent: Intent) {
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    context.startActivity(intent)
  }

  override fun definition() = ModuleDefinition {
    Name("LifeosDevice")
    Events("onSms", "onNotification")

    OnCreate {
      Inbox.listener = { queue, item -> sendEvent(if (queue == "sms") "onSms" else "onNotification", item) }
    }
    OnDestroy {
      Inbox.listener = null
    }

    RegisterActivityContracts {
      healthLauncher = registerForActivityResult(HealthPermissionContract())
    }

    /* ---------------- SMS ---------------- */

    AsyncFunction("readSms") { sinceMs: Double, limit: Int ->
      val out = ArrayList<Map<String, Any?>>()
      val cursor = context.contentResolver.query(
        Telephony.Sms.Inbox.CONTENT_URI,
        arrayOf(Telephony.Sms.ADDRESS, Telephony.Sms.BODY, Telephony.Sms.DATE),
        "${Telephony.Sms.DATE} >= ?",
        arrayOf(sinceMs.toLong().toString()),
        "${Telephony.Sms.DATE} DESC",
      )
      cursor?.use { c ->
        while (c.moveToNext() && out.size < limit) {
          out.add(mapOf("from" to (c.getString(0) ?: ""), "body" to (c.getString(1) ?: ""), "at" to c.getLong(2).toDouble()))
        }
      }
      out
    }

    /** New SMS / notifications that arrived while the app wasn't running ("sms" | "notifications"). */
    Function("drain") { queue: String -> Inbox.drain(context, queue) }

    /* ---------------- Notifications ---------------- */

    Function("setNotificationAllowlist") { packages: List<String> -> Inbox.putStringSet(context, "notification_allowlist", packages.toSet()) }
    Function("notificationAccess") { NotificationManagerCompat.getEnabledListenerPackages(context).contains(context.packageName) }
    Function("openNotificationAccessSettings") { open(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)) }

    /* ---------------- Screen time ---------------- */

    Function("usageAccess") { UsageReader.hasAccess(context) }
    Function("openUsageAccessSettings") {
      val i = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)
      i.data = Uri.parse("package:${context.packageName}")
      try { open(i) } catch (e: Exception) { open(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)) }
    }
    AsyncFunction("queryUsage") { startMs: Double, endMs: Double -> UsageReader.query(context, startMs.toLong(), endMs.toLong()) }

    /* ---------------- Health Connect ---------------- */

    Function("healthStatus") { HealthReader.status(context) }
    AsyncFunction("healthGranted") Coroutine { -> if (HealthReader.status(context) == "available") HealthReader.granted(context) else emptyList() }
    AsyncFunction("requestHealthPermissions") Coroutine { ->
      if (HealthReader.status(context) != "available") return@Coroutine emptyList<String>()
      healthLauncher.launch(HashSet(HealthReader.PERMISSIONS)).toList()
    }
    AsyncFunction("readHealth") Coroutine { startMs: Double, endMs: Double -> HealthReader.read(context, startMs.toLong(), endMs.toLong()) }
    Function("openHealthConnect") {
      val i = Intent(HealthConnectClient.ACTION_HEALTH_CONNECT_SETTINGS)
      try { open(i) } catch (e: Exception) { open(Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=com.google.android.apps.healthdata"))) }
    }

    /* ---------------- Shared PDFs ---------------- */

    AsyncFunction("pdfText") Coroutine { uri: String -> withContext(Dispatchers.IO) { PdfText.read(context, uri) } }

    /* ---------------- Call log ---------------- */

    // Gmail over IMAP (app password) — read-only; see MailReader.
    AsyncFunction("mailCheck") Coroutine { email: String, password: String -> withContext(Dispatchers.IO) { MailReader.check(email, password) } }
    AsyncFunction("mailHeaders") Coroutine { email: String, password: String, sinceMs: Double, afterUid: Double, uidValidity: Double, max: Int ->
      withContext(Dispatchers.IO) { MailReader.headers(email, password, sinceMs.toLong(), afterUid.toLong(), uidValidity.toLong(), max) }
    }
    AsyncFunction("mailBodies") Coroutine { email: String, password: String, uids: List<Double> -> withContext(Dispatchers.IO) { MailReader.bodies(email, password, uids) } }

    AsyncFunction("readCallLog") { sinceMs: Double, limit: Int ->
      val out = ArrayList<Map<String, Any?>>()
      val cursor = context.contentResolver.query(
        CallLog.Calls.CONTENT_URI,
        arrayOf(CallLog.Calls.NUMBER, CallLog.Calls.CACHED_NAME, CallLog.Calls.DATE, CallLog.Calls.DURATION, CallLog.Calls.TYPE),
        "${CallLog.Calls.DATE} >= ?",
        arrayOf(sinceMs.toLong().toString()),
        "${CallLog.Calls.DATE} DESC",
      )
      cursor?.use { c ->
        while (c.moveToNext() && out.size < limit) {
          val type = when (c.getInt(4)) {
            CallLog.Calls.INCOMING_TYPE -> "incoming"
            CallLog.Calls.OUTGOING_TYPE -> "outgoing"
            CallLog.Calls.MISSED_TYPE -> "missed"
            else -> "other"
          }
          out.add(mapOf("number" to (c.getString(0) ?: ""), "name" to c.getString(1), "at" to c.getLong(2).toDouble(), "seconds" to c.getLong(3).toDouble(), "type" to type))
        }
      }
      out
    }
  }
}

