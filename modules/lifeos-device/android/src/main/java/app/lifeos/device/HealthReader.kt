package app.lifeos.device

import android.content.Context
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.aggregate.AggregateMetric
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.RestingHeartRateRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.WeightRecord
import androidx.health.connect.client.request.AggregateGroupByPeriodRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.Period
import java.time.ZoneId

/**
 * Health Connect → one summary per local day: steps, sleep (by the day you
 * woke up), average and resting heart rate, last weight, and workouts.
 */
object HealthReader {
  val PERMISSIONS: Set<String> = setOf(
    HealthPermission.getReadPermission(StepsRecord::class),
    HealthPermission.getReadPermission(SleepSessionRecord::class),
    HealthPermission.getReadPermission(HeartRateRecord::class),
    HealthPermission.getReadPermission(RestingHeartRateRecord::class),
    HealthPermission.getReadPermission(WeightRecord::class),
    HealthPermission.getReadPermission(ExerciseSessionRecord::class),
    // Reading further back than 30 days (the first import) on Android 14+.
    "android.permission.health.READ_HEALTH_DATA_HISTORY",
  )

  /** "available" | "needs_update" | "unavailable" */
  fun status(context: Context): String =
    when (HealthConnectClient.getSdkStatus(context)) {
      HealthConnectClient.SDK_AVAILABLE -> "available"
      HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> "needs_update"
      else -> "unavailable"
    }

  suspend fun granted(context: Context): List<String> =
    HealthConnectClient.getOrCreate(context).permissionController.getGrantedPermissions().filter { PERMISSIONS.contains(it) }

  suspend fun read(context: Context, startMs: Long, endMs: Long): List<Map<String, Any?>> {
    val client = HealthConnectClient.getOrCreate(context)
    val granted = client.permissionController.getGrantedPermissions()
    val zone = ZoneId.systemDefault()
    val start = Instant.ofEpochMilli(startMs).atZone(zone).toLocalDate().atStartOfDay()
    val end = Instant.ofEpochMilli(endMs).atZone(zone).toLocalDate().plusDays(1).atStartOfDay()
    val days = sortedMapOf<LocalDate, HashMap<String, Any?>>()
    fun day(d: LocalDate) = days.getOrPut(d) { hashMapOf("day" to d.toString()) }
    fun has(c: kotlin.reflect.KClass<out Record>) = granted.contains(HealthPermission.getReadPermission(c))

    val metrics = buildSet<AggregateMetric<*>> {
      if (has(StepsRecord::class)) add(StepsRecord.COUNT_TOTAL)
      if (has(HeartRateRecord::class)) add(HeartRateRecord.BPM_AVG)
      if (has(RestingHeartRateRecord::class)) add(RestingHeartRateRecord.BPM_AVG)
    }
    if (metrics.isNotEmpty()) {
      val groups = client.aggregateGroupByPeriod(AggregateGroupByPeriodRequest(metrics, TimeRangeFilter.between(start, end), Period.ofDays(1)))
      for (g in groups) {
        val d = day(g.startTime.toLocalDate())
        g.result[StepsRecord.COUNT_TOTAL]?.let { d["steps"] = it.toDouble() }
        g.result[HeartRateRecord.BPM_AVG]?.let { d["heartRateAvg"] = it.toDouble() }
        g.result[RestingHeartRateRecord.BPM_AVG]?.let { d["restingHr"] = it.toDouble() }
      }
    }
    val range = TimeRangeFilter.between(Instant.ofEpochMilli(startMs), Instant.ofEpochMilli(endMs))
    if (has(SleepSessionRecord::class)) {
      for (s in client.readRecords(ReadRecordsRequest(SleepSessionRecord::class, range)).records) {
        val d = day(s.endTime.atZone(zone).toLocalDate())
        d["sleepMin"] = ((d["sleepMin"] as? Double) ?: 0.0) + Duration.between(s.startTime, s.endTime).toMinutes().toDouble()
        d["sleepStart"] = (d["sleepStart"] as? Double)?.let { minOf(it, s.startTime.toEpochMilli().toDouble()) } ?: s.startTime.toEpochMilli().toDouble()
        d["sleepEnd"] = maxOf((d["sleepEnd"] as? Double) ?: 0.0, s.endTime.toEpochMilli().toDouble())
      }
    }
    if (has(WeightRecord::class)) {
      for (w in client.readRecords(ReadRecordsRequest(WeightRecord::class, range)).records) {
        day(w.time.atZone(zone).toLocalDate())["weightKg"] = w.weight.inKilograms
      }
    }
    if (has(ExerciseSessionRecord::class)) {
      for (x in client.readRecords(ReadRecordsRequest(ExerciseSessionRecord::class, range)).records) {
        val d = day(x.startTime.atZone(zone).toLocalDate())
        @Suppress("UNCHECKED_CAST")
        val list = (d["workouts"] as? ArrayList<Map<String, Any?>>) ?: ArrayList<Map<String, Any?>>().also { d["workouts"] = it }
        list.add(
          mapOf(
            "id" to x.metadata.id,
            "type" to x.exerciseType,
            "title" to x.title,
            "start" to x.startTime.toEpochMilli().toDouble(),
            "minutes" to Duration.between(x.startTime, x.endTime).toMinutes().toDouble(),
          ),
        )
      }
    }
    return days.values.toList()
  }
}
