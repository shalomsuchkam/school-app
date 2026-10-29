package expo.modules.screenguard

import java.util.TimeZone
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class DecisionUsageTest {
  private val youtube = "com.google.android.youtube"
  private val start = 1_000_000L
  private val rules = ScreenRules(enabled = true, appLimits = mapOf(youtube to 1))

  private fun input(pkg: String, at: Long, usage: Map<String, Int>) = DecisionInput(
    pkg = pkg, nowMs = at, tz = TimeZone.getTimeZone("UTC"), homeworkDone = true,
    usageMin = usage, systemAllowed = setOf("com.android.dialer", "com.android.messaging"),
  )

  @Test fun youtubeBlocksAtOneMinuteButNotBefore() {
    val usage = ForegroundAccumulator(start)
    usage.onEvent(start, UsageEventType.ACTIVITY_RESUMED, youtube)
    assertEquals(Decision.Allow, decide(rules, input(youtube, start + 59_999, usage.minutes(start + 59_999))))
    assertEquals(Decision.Block(BlockReason.APP_LIMIT, limitMin = 1), decide(rules, input(youtube, start + 60_000, usage.minutes(start + 60_000))))
  }

  @Test fun callsAndMessagesRemainAvailableEvenWithZeroDailyLimit() {
    val locked = rules.copy(dailyLimitMin = 0)
    for (pkg in listOf("com.android.dialer", "com.android.messaging", OWN_PACKAGE, "com.android.phone")) {
      assertEquals(Decision.Allow, decide(locked, input(pkg, start, emptyMap())))
    }
  }

  @Test fun returningToYoutubeDoesNotResetItsUsedTime() {
    val usage = ForegroundAccumulator(start)
    usage.onEvent(start, UsageEventType.ACTIVITY_RESUMED, youtube)
    usage.onEvent(start + 60_000, UsageEventType.ACTIVITY_RESUMED, OWN_PACKAGE)
    usage.onEvent(start + 70_000, UsageEventType.ACTIVITY_RESUMED, youtube)
    assertEquals(Decision.Block(BlockReason.APP_LIMIT, limitMin = 1), decide(rules, input(youtube, start + 70_001, usage.minutes(start + 70_001))))
  }

  @Test fun aLateStopFromThePreviousActivityDoesNotHideTheCurrentApp() {
    val usage = ForegroundAccumulator(start)
    usage.onEvent(start, UsageEventType.ACTIVITY_RESUMED, youtube, "Home")
    usage.onEvent(start + 30_000, UsageEventType.ACTIVITY_RESUMED, youtube, "Player")
    usage.onEvent(start + 30_001, UsageEventType.ACTIVITY_STOPPED, youtube, "Home")
    assertEquals(youtube, usage.foreground)
    usage.onEvent(start + 60_000, UsageEventType.SCREEN_NON_INTERACTIVE, null)
    assertNull(usage.foreground)
    assertEquals(1, usage.minutes(start + 120_000)[youtube])
  }
}
