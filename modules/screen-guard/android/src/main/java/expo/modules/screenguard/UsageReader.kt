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
  private var acc: ForegroundAccumulator? = null
  private var tzId: String? = null
  private var queriedUntil = 0L

  /** Brings the accumulator up to [nowMs]; resets at the family-tz midnight or when the tz changes. */
  fun update(nowMs: Long, tz: TimeZone): ForegroundAccumulator? {
    val manager = usm ?: return null
    val dayStart = startOfDay(nowMs, tz)
    var a = acc
    if (a == null || a.dayStartMs != dayStart || tzId != tz.id) {
      a = ForegroundAccumulator(dayStart)
      acc = a
      tzId = tz.id
      // look back before midnight so an app opened at 23:50 and still open counts from 00:00
      queriedUntil = dayStart - LOOKBACK_MS
    }
    if (nowMs <= queriedUntil) return a
    feed(manager, a, queriedUntil, nowMs)
    queriedUntil = nowMs
    return a
  }

  private fun feed(manager: UsageStatsManager, a: ForegroundAccumulator, from: Long, to: Long) {
    val events: UsageEvents = try {
      manager.queryEvents(from, to)
    } catch (e: Exception) {
      return
    } ?: return
    val e = UsageEvents.Event()
    while (events.hasNextEvent()) {
      if (!events.getNextEvent(e)) break
      if (e.timeStamp < from) continue
      a.onEvent(e.timeStamp, e.eventType, e.packageName, e.className)
    }
  }

  companion object {
    private const val LOOKBACK_MS = 3 * 60 * 60 * 1000L

    /** Fresh computation of today's minutes per package. */
    fun minutesToday(context: Context, tz: TimeZone, nowMs: Long = System.currentTimeMillis()): Map<String, Int> {
      val reader = UsageReader(context)
      return reader.update(nowMs, tz)?.minutes(nowMs) ?: emptyMap()
    }
  }
}
