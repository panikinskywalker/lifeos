package app.lifeos.device

import android.app.AppOpsManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.pm.PackageManager
import android.os.Process
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

/**
 * Screen time from Android's usage events: per local day, foreground time
 * per app (sessions split at midnight), unlocks ("pickups"), first and last
 * use. Launchers and the system UI don't count as screen time.
 */
private class Day {
  var total: Long = 0
  var pickups: Int = 0
  var first: Long? = null
  var last: Long? = null
  val apps: HashMap<String, Long> = HashMap()
  val launches: HashMap<String, Int> = HashMap()
}

object UsageReader {
  fun hasAccess(context: Context): Boolean {
    val ops = context.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
    val mode = if (android.os.Build.VERSION.SDK_INT >= 29) {
      ops.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName)
    } else {
      @Suppress("DEPRECATION")
      ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName)
    }
    return mode == AppOpsManager.MODE_ALLOWED
  }

  private fun label(pm: PackageManager, pkg: String): String =
    try {
      pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString()
    } catch (e: Exception) {
      pkg
    }

  private fun isLauncherOrSystemUi(pm: PackageManager, pkg: String): Boolean {
    if (pkg == "com.android.systemui") return true
    val home = android.content.Intent(android.content.Intent.ACTION_MAIN).addCategory(android.content.Intent.CATEGORY_HOME)
    return pm.queryIntentActivities(home, 0).any { it.activityInfo.packageName == pkg }
  }

  fun query(context: Context, startMs: Long, endMs: Long): List<Map<String, Any?>> {
    val usm = context.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
    val pm = context.packageManager
    val zone = ZoneId.systemDefault()
    val events = usm.queryEvents(startMs, endMs)
    val e = UsageEvents.Event()

    val days = HashMap<LocalDate, Day>()
    val open = HashMap<String, Long>()
    val skip = HashMap<String, Boolean>()
    fun dayOf(t: Long) = Instant.ofEpochMilli(t).atZone(zone).toLocalDate()

    fun addSpan(pkg: String, from: Long, to: Long) {
      var s = from
      while (s < to) {
        val d = dayOf(s)
        val dayEnd = d.plusDays(1).atStartOfDay(zone).toInstant().toEpochMilli()
        val e2 = minOf(to, dayEnd)
        val day = days.getOrPut(d) { Day() }
        val ms = e2 - s
        day.apps[pkg] = (day.apps[pkg] ?: 0L) + ms
        day.total += ms
        if (day.first == null || s < day.first!!) day.first = s
        if (day.last == null || e2 > day.last!!) day.last = e2
        s = e2
      }
    }

    while (events.hasNextEvent()) {
      events.getNextEvent(e)
      val pkg = e.packageName ?: continue
      when (e.eventType) {
        1 /* ACTIVITY_RESUMED */ -> {
          if (skip.getOrPut(pkg) { isLauncherOrSystemUi(pm, pkg) }) continue
          if (!open.containsKey(pkg)) {
            open[pkg] = e.timeStamp
            val day = days.getOrPut(dayOf(e.timeStamp)) { Day() }
            day.launches[pkg] = (day.launches[pkg] ?: 0) + 1
          }
        }
        2 /* ACTIVITY_PAUSED */, 23 /* ACTIVITY_STOPPED */ -> {
          val from = open.remove(pkg) ?: continue
          if (e.timeStamp > from) addSpan(pkg, from, e.timeStamp)
        }
        18 /* KEYGUARD_HIDDEN */ -> days.getOrPut(dayOf(e.timeStamp)) { Day() }.pickups++
        16 /* SCREEN_NON_INTERACTIVE */ -> {
          // Screen off ends whatever was open.
          for ((p, from) in open) if (e.timeStamp > from) addSpan(p, from, e.timeStamp)
          open.clear()
        }
      }
    }
    val now = minOf(endMs, System.currentTimeMillis())
    for ((p, from) in open) if (now > from) addSpan(p, from, now)

    return days.entries.sortedBy { it.key }.map { (d, day) ->
      mapOf(
        "day" to d.toString(),
        "totalMs" to day.total.toDouble(),
        "pickups" to day.pickups,
        "firstUse" to day.first?.toDouble(),
        "lastUse" to day.last?.toDouble(),
        "apps" to day.apps.entries.sortedByDescending { it.value }.take(40).map { (pkg, ms) ->
          mapOf("package" to pkg, "label" to label(pm, pkg), "ms" to ms.toDouble(), "launches" to (day.launches[pkg] ?: 0))
        },
      )
    }
  }
}
