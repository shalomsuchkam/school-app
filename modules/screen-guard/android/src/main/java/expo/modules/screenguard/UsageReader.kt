package expo.modules.screenguard

import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import java.util.TimeZone

/**
 * Feeds UsageEvents into a [ForegroundAccumulator]. Used incrementally by the service loop (every ~1 s) and as a
 * one-shot computation for usageToday() / reports. The day boundary is midnight in the family time zone.
 */
class UsageReader(private val context: Context) {
  private val usm = context.getSystemService(Context.USAGE_STATS_SERVICE) as? UsageStatsManager
  private var timeline: UsageTimeline? = null
  private var tzId: String? = null

  /** Brings the accumulator up to [nowMs]; resets at the family-tz midnight or when the tz changes. */
  fun update(nowMs: Long, tz: TimeZone): ForegroundAccumulator? {
    val manager = usm ?: return null
    // Do not advance the query cursor while access is missing. After a grant we must
    // replay today's events, including the activity that is already in the foreground.
    if (!GuardPermissions.usageAccess(context)) {
      timeline = null
      return null
    }
    val dayStart = startOfDay(nowMs, tz)
    var current = timeline
    if (current == null || current.dayStartMs != dayStart || tzId != tz.id) {
      current = UsageTimeline(dayStart)
      timeline = current
      tzId = tz.id
    }
    return try {
      current.update(nowMs, read(manager, current.queryFrom(), nowMs)) {
        read(manager, dayStart - UsageTimeline.LOOKBACK_MS, nowMs)
      }
    } catch (_: Exception) {
      // Do not advance the cursor after a failed query.
      null
    }
  }

  private fun read(manager: UsageStatsManager, from: Long, to: Long): List<UsageRecord> {
    val events: UsageEvents = manager.queryEvents(from, to)
      ?: throw IllegalStateException("Usage events unavailable")
    val result = ArrayList<UsageRecord>()
    val e = UsageEvents.Event()
    while (events.hasNextEvent()) {
      if (!events.getNextEvent(e)) break
      if (e.timeStamp < from) continue
      result.add(UsageRecord(e.timeStamp, e.eventType, e.packageName, e.className))
    }
    return result
  }

  companion object {
    /** Fresh computation of today's minutes per package. */
    fun minutesToday(context: Context, tz: TimeZone, nowMs: Long = System.currentTimeMillis()): Map<String, Int> {
      val reader = UsageReader(context)
      return reader.update(nowMs, tz)?.minutes(nowMs) ?: emptyMap()
    }
  }
}
