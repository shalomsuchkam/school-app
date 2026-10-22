package expo.modules.screenguard

// Pure Kotlin: turns the UsageEvents stream into "which app is in the foreground" and "how long was each app in
// the foreground since the start of the day". The Android side (UsageReader) feeds it events; this file has no
// Android dependencies so it can be unit-tested on the JVM.
//
// Event type values are the public constants of android.app.usage.UsageEvents.Event.
object UsageEventType {
  const val ACTIVITY_RESUMED = 1 // == MOVE_TO_FOREGROUND
  const val ACTIVITY_PAUSED = 2 // == MOVE_TO_BACKGROUND
  const val SCREEN_NON_INTERACTIVE = 16 // API 28
  const val KEYGUARD_SHOWN = 17 // API 28
  const val ACTIVITY_STOPPED = 23 // API 29
  const val DEVICE_SHUTDOWN = 26 // API 29
}

/**
 * Accumulates foreground time per package in [dayStartMs, now]. Feed events in time order with [onEvent], read
 * [foreground] for the app currently on screen and [minutes] for today's totals.
 */
class ForegroundAccumulator(val dayStartMs: Long) {
  /** Package currently resumed (null when nothing / screen off). */
  var foreground: String? = null
    private set
  private var foregroundClass: String? = null
  private var since: Long = 0L
  private val totalsMs = HashMap<String, Long>()

  /** Timestamp of the last event fed in, so incremental queries can continue from here. */
  var lastEventMs: Long = 0L
    private set

  /**
   * [cls] is the activity class name (may be null). A pause/stop only ends the interval when it belongs to the
   * activity that resumed last: switching between two activities of one app logs "B resumed, A stopped".
   */
  fun onEvent(timeMs: Long, type: Int, pkg: String?, cls: String? = null) {
    if (timeMs > lastEventMs) lastEventMs = timeMs
    when (type) {
      UsageEventType.ACTIVITY_RESUMED -> {
        if (pkg == null) return
        if (foreground != pkg) {
          close(timeMs)
          foreground = pkg
          since = timeMs
        }
        foregroundClass = cls
      }
      UsageEventType.ACTIVITY_PAUSED, UsageEventType.ACTIVITY_STOPPED -> {
        if (pkg != null && pkg == foreground && (cls == null || foregroundClass == null || cls == foregroundClass)) {
          close(timeMs)
          foreground = null
          foregroundClass = null
        }
      }
      UsageEventType.SCREEN_NON_INTERACTIVE, UsageEventType.KEYGUARD_SHOWN, UsageEventType.DEVICE_SHUTDOWN -> {
        close(timeMs)
        foreground = null
        foregroundClass = null
      }
    }
  }

  private fun close(endMs: Long) {
    val pkg = foreground ?: return
    val start = maxOf(since, dayStartMs)
    if (endMs > start) totalsMs[pkg] = (totalsMs[pkg] ?: 0L) + (endMs - start)
    since = endMs
  }

  /** Milliseconds per package up to [nowMs] (the running interval of the current app included). */
  fun millis(nowMs: Long): Map<String, Long> {
    val out = HashMap(totalsMs)
    val pkg = foreground
    if (pkg != null) {
      val start = maxOf(since, dayStartMs)
      if (nowMs > start) out[pkg] = (out[pkg] ?: 0L) + (nowMs - start)
    }
    return out
  }

  /** Whole minutes per package (floored), packages with < 1 min left out. */
  fun minutes(nowMs: Long): Map<String, Int> =
    millis(nowMs).mapValues { (it.value / 60_000L).toInt() }.filterValues { it > 0 }
}
