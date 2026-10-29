package expo.modules.screenguard

data class UsageRecord(val time: Long, val type: Int, val pkg: String?, val cls: String?)

/** UsageStats can deliver an event after a query has already passed its timestamp. */
class UsageTimeline(val dayStartMs: Long) {
  private var acc = ForegroundAccumulator(dayStartMs)
  private var queriedUntil: Long? = null
  private val recent = HashSet<UsageRecord>()

  fun queryFrom(): Long = queriedUntil?.let { maxOf(dayStartMs - LOOKBACK_MS, it - OVERLAP_MS) }
    ?: (dayStartMs - LOOKBACK_MS)

  fun update(nowMs: Long, events: List<UsageRecord>, replay: () -> List<UsageRecord>): ForegroundAccumulator {
    var fresh = events.filterNot { it in recent }.sortedBy { it.time }
    if (queriedUntil != null && fresh.any { it.time < acc.lastEventMs }) {
      // A late event precedes an event already counted. Rebuild only in that case,
      // rather than replaying the entire day on every one-second service tick.
      val replayed = replay().sortedBy { it.time }
      acc = ForegroundAccumulator(dayStartMs)
      recent.clear()
      fresh = replayed
    }
    for (e in fresh) acc.onEvent(e.time, e.type, e.pkg, e.cls)
    recent.addAll(fresh.filter { it.time >= nowMs - OVERLAP_MS })
    recent.removeAll { it.time < nowMs - OVERLAP_MS }
    queriedUntil = nowMs
    return acc
  }

  companion object {
    const val LOOKBACK_MS = 3 * 60 * 60 * 1000L
    private const val OVERLAP_MS = 60_000L
  }
}
