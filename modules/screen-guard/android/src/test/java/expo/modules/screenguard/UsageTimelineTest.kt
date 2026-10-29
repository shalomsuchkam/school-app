package expo.modules.screenguard

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class UsageTimelineTest {
  private val youtube = "com.google.android.youtube"
  private fun resumed(time: Long, pkg: String) = UsageRecord(time, UsageEventType.ACTIVITY_RESUMED, pkg, "Main")

  @Test fun aResumeDeliveredAfterItsTimestampIsStillObserved() {
    val timeline = UsageTimeline(0)
    timeline.update(1_000, emptyList()) { error("Unexpected replay") }
    // The resume at t=900 was not available during the first query at t=1000.
    assertTrue(timeline.queryFrom() <= 900)
    val acc = timeline.update(2_000, listOf(resumed(900, youtube))) { error("Unexpected replay") }
    assertEquals(youtube, acc.foreground)
    assertEquals(1, acc.minutes(60_900)[youtube])
  }

  @Test fun overlappingQueriesDoNotCountTheSameIntervalTwice() {
    val timeline = UsageTimeline(0)
    val events = listOf(resumed(1_000, youtube), resumed(61_000, OWN_PACKAGE))
    timeline.update(61_001, events) { error("Unexpected replay") }
    val acc = timeline.update(62_000, events.filter { it.time >= timeline.queryFrom() }) { error("Duplicate events must not trigger replay") }
    assertEquals(1, acc.minutes(62_000)[youtube])
  }

  @Test fun lateOutOfOrderEventsRebuildTheTimelineBeforeApplyingLimits() {
    val timeline = UsageTimeline(0)
    timeline.update(61_000, listOf(resumed(61_000, OWN_PACKAGE))) { error("Unexpected replay") }
    val all = listOf(resumed(1_000, youtube), resumed(61_000, OWN_PACKAGE))
    val acc = timeline.update(62_100, all) { all }
    assertEquals(OWN_PACKAGE, acc.foreground)
    assertEquals(1, acc.minutes(62_100)[youtube])
  }
}
