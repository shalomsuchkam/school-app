package expo.modules.screenguard

import java.util.Calendar
import java.util.TimeZone

// Pure Kotlin (JDK only, no Android classes): the screen-time decision from docs/SCREEN_TIME.md,
// "Decision order". Unit-tested in android/src/test. java.util time classes are used instead of java.time
// because minSdk is 24 and java.time needs API 26 (or desugaring) on Android.

const val OWN_PACKAGE = "kz.uroki.app"
const val SETTINGS_PACKAGE = "com.android.settings"

/** Packages that are allowed by step 2 on every phone, in addition to the resolved default apps. */
val BUILT_IN_ALLOWED: Set<String> = setOf(
  OWN_PACKAGE,
  "com.android.systemui",
  // calls and emergency calls (in-call UI, telecom, emergency dialer / emergency info)
  "com.android.phone",
  "com.android.server.telecom",
  "com.android.incallui",
  "com.samsung.android.incallui",
  "com.android.emergency",
  "com.google.android.apps.safetyhub",
  "com.samsung.android.emergency",
)

/** A time window in minutes after local midnight; `from > to` means the window crosses midnight. */
data class TimeWindow(
  val fromMin: Int,
  val toMin: Int,
  /** ISO weekdays 1..7 (Monday = 1); null = every day. For a window crossing midnight the day is the day it started. */
  val days: Set<Int>?,
  val allowed: Set<String>,
)

data class ScreenRules(
  val enabled: Boolean = false,
  val dailyLimitMin: Int? = null,
  /** pkg -> minutes per day */
  val appLimits: Map<String, Int> = emptyMap(),
  val blockedApps: Set<String> = emptySet(),
  val alwaysAllowed: Set<String> = emptySet(),
  val bedtime: TimeWindow? = null,
  val school: TimeWindow? = null,
  val homeworkLock: Boolean = false,
  val homeworkLockFromMin: Int = 15 * 60,
  val blockNewApps: Boolean = false,
  val unlockUntilMs: Long? = null,
)

/** Everything the decision needs besides the rules. */
data class DecisionInput(
  val pkg: String,
  val nowMs: Long,
  val tz: TimeZone,
  val homeworkDone: Boolean,
  /** Today's foreground minutes per package (family time zone day). */
  val usageMin: Map<String, Int> = emptyMap(),
  /** Step-2 packages resolved on the device: default launcher, dialer, SMS app, … (BUILT_IN_ALLOWED is added). */
  val systemAllowed: Set<String> = emptySet(),
  /** `com.android.settings` is allowed until this moment (guard setup flow); null = not allowed by step 2. */
  val settingsGraceUntilMs: Long? = null,
  /** When the package was installed (null = unknown, treated as not new). */
  val installedAtMs: Long? = null,
  /** When the rules were first enabled on this phone (null = unknown, nothing is new). */
  val rulesEnabledAtMs: Long? = null,
  /** Packages a parent approved (`DeviceReport.approved`). */
  val approved: Set<String> = emptySet(),
  /** Server's `school_day` for today (holidays/days off included); null = unknown, fall back to `school.days`. */
  val schoolDay: Boolean? = null,
  /** Server's `homework_due_today`; null = unknown, fall back to "today is a school day". */
  val homeworkDueToday: Boolean? = null,
  /** The server answered 402 (subscription lapsed): nothing is blocked until a later successful response. */
  val suspended: Boolean = false,
)

enum class BlockReason(val code: String) {
  BLOCKED("blocked"),
  NEW_APP("new_app"),
  BEDTIME("bedtime"),
  SCHOOL("school"),
  HOMEWORK("homework"),
  APP_LIMIT("app_limit"),
  DAILY_LIMIT("daily_limit"),
}

sealed class Decision {
  object Allow : Decision() {
    override fun toString() = "Allow"
  }

  /** [untilMin] = end of the bedtime/school window (minutes after midnight), [limitMin] = the exhausted limit. */
  data class Block(val reason: BlockReason, val untilMin: Int? = null, val limitMin: Int? = null) : Decision()
}

/** Step 2 of the decision order. */
fun isAlwaysAllowed(pkg: String, rules: ScreenRules, input: DecisionInput): Boolean {
  if (pkg in BUILT_IN_ALLOWED || pkg in input.systemAllowed || pkg in rules.alwaysAllowed) return true
  if (pkg == SETTINGS_PACKAGE) {
    val until = input.settingsGraceUntilMs
    return until != null && input.nowMs < until
  }
  return false
}

/** Today's usage that counts toward `daily_limit_min`: every app except the step-2 ones. */
fun countedMinutes(rules: ScreenRules, input: DecisionInput): Int =
  input.usageMin.entries.sumOf { (pkg, min) ->
    val stepTwo = pkg in BUILT_IN_ALLOWED || pkg in input.systemAllowed || pkg in rules.alwaysAllowed
    if (stepTwo) 0 else min
  }

fun decide(rules: ScreenRules, input: DecisionInput): Decision {
  val pkg = input.pkg
  // 1. master switch (a lapsed subscription counts as switched off)
  if (!rules.enabled || input.suspended) return Decision.Allow
  // 2. Уроки, launcher, system UI, phone, SMS, settings during setup, always_allowed
  if (isAlwaysAllowed(pkg, rules, input)) return Decision.Allow
  // 3. parent's temporary unlock
  val unlock = rules.unlockUntilMs
  if (unlock != null && unlock > input.nowMs) return Decision.Allow
  // 4. never allowed
  if (pkg in rules.blockedApps) return Decision.Block(BlockReason.BLOCKED)
  // 5. new, not approved app
  if (rules.blockNewApps && isNewApp(pkg, rules, input)) return Decision.Block(BlockReason.NEW_APP)

  val local = LocalTime.of(input.nowMs, input.tz)
  // 6. bedtime (every day)
  rules.bedtime?.let { w ->
    if (local.inWindow(w) && pkg !in w.allowed) return Decision.Block(BlockReason.BEDTIME, untilMin = w.toMin)
  }
  // 7. school hours, only on a school day (server's school_day; without it the window's days)
  rules.school?.let { w ->
    val inSchool = when (input.schoolDay) {
      null -> local.inWindow(w)
      true -> local.inWindow(w.copy(days = null))
      false -> false
    }
    if (inSchool && pkg !in w.allowed) return Decision.Block(BlockReason.SCHOOL, untilMin = w.toMin)
  }
  // 8. homework lock: homework is due today, now >= homework_lock_from and it is not done yet
  val homeworkDue = input.homeworkDueToday ?: (local.weekday in schoolDays(rules))
  if (rules.homeworkLock && homeworkDue && !input.homeworkDone && local.minute >= rules.homeworkLockFromMin) {
    return Decision.Block(BlockReason.HOMEWORK)
  }
  // 9. per-app limit
  rules.appLimits[pkg]?.let { limit ->
    if ((input.usageMin[pkg] ?: 0) >= limit) return Decision.Block(BlockReason.APP_LIMIT, limitMin = limit)
  }
  // 10. overall daily limit
  rules.dailyLimitMin?.let { limit ->
    if (countedMinutes(rules, input) >= limit) return Decision.Block(BlockReason.DAILY_LIMIT, limitMin = limit)
  }
  // 11.
  return Decision.Allow
}

/** Fallback when the server did not send homework_due_today: the school window's days, or Monday–Friday. */
fun schoolDays(rules: ScreenRules): Set<Int> = rules.school?.days ?: setOf(1, 2, 3, 4, 5)

private fun isNewApp(pkg: String, rules: ScreenRules, input: DecisionInput): Boolean {
  val installed = input.installedAtMs ?: return false
  val enabledAt = input.rulesEnabledAtMs ?: return false
  if (installed <= enabledAt) return false
  // "approve" with action allow/block/limit also adds the package to one of these lists
  if (pkg in input.approved || pkg in rules.appLimits) return false
  return true
}

/** Local wall-clock time in the family time zone. */
data class LocalTime(val minute: Int, val weekday: Int, val yesterdayWeekday: Int) {
  fun inWindow(w: TimeWindow): Boolean {
    if (w.fromMin == w.toMin) return false
    return if (w.fromMin < w.toMin) {
      minute >= w.fromMin && minute < w.toMin && (w.days == null || weekday in w.days)
    } else if (minute >= w.fromMin) {
      w.days == null || weekday in w.days // evening part: started today
    } else if (minute < w.toMin) {
      w.days == null || yesterdayWeekday in w.days // morning part: started yesterday
    } else {
      false
    }
  }

  companion object {
    fun of(nowMs: Long, tz: TimeZone): LocalTime {
      val cal = Calendar.getInstance(tz)
      cal.timeInMillis = nowMs
      val minute = cal.get(Calendar.HOUR_OF_DAY) * 60 + cal.get(Calendar.MINUTE)
      val iso = isoWeekday(cal.get(Calendar.DAY_OF_WEEK))
      return LocalTime(minute, iso, if (iso == 1) 7 else iso - 1)
    }
  }
}

/** Calendar.SUNDAY(1)..SATURDAY(7) -> ISO 1 (Monday)..7 (Sunday). */
fun isoWeekday(calendarDay: Int): Int = if (calendarDay == Calendar.SUNDAY) 7 else calendarDay - 1

/** "HH:MM" -> minutes after midnight, or null when malformed. */
fun parseHhMm(s: String?): Int? {
  if (s == null) return null
  val m = Regex("^(\\d{1,2}):(\\d{2})$").find(s.trim()) ?: return null
  val h = m.groupValues[1].toInt()
  val min = m.groupValues[2].toInt()
  if (h > 23 || min > 59) return null
  return h * 60 + min
}

fun formatHhMm(minutes: Int): String = String.format(java.util.Locale.ROOT, "%02d:%02d", minutes / 60, minutes % 60)

/** Start of the day containing [nowMs] in [tz], epoch ms. */
fun startOfDay(nowMs: Long, tz: TimeZone): Long {
  val cal = Calendar.getInstance(tz)
  cal.timeInMillis = nowMs
  cal.set(Calendar.HOUR_OF_DAY, 0)
  cal.set(Calendar.MINUTE, 0)
  cal.set(Calendar.SECOND, 0)
  cal.set(Calendar.MILLISECOND, 0)
  return cal.timeInMillis
}

/** "YYYY-MM-DD" of [nowMs] in [tz]. */
fun localDate(nowMs: Long, tz: TimeZone): String {
  val cal = Calendar.getInstance(tz)
  cal.timeInMillis = nowMs
  return String.format(
    java.util.Locale.ROOT, "%04d-%02d-%02d",
    cal.get(Calendar.YEAR), cal.get(Calendar.MONTH) + 1, cal.get(Calendar.DAY_OF_MONTH),
  )
}

private val ISO_RE = Regex(
  "^(\\d{4})-(\\d{2})-(\\d{2})[T ](\\d{2}):(\\d{2})(?::(\\d{2})(?:[.,](\\d+))?)?\\s*(Z|z|[+-]\\d{2}(?::?\\d{2})?)?$",
)

/** ISO-8601 timestamp as sent by the server (Postgres / JS), e.g. 2026-10-22T18:30:00Z or …00.123+05:00. */
fun parseIsoMs(s: String?): Long? {
  if (s.isNullOrBlank()) return null
  val m = ISO_RE.find(s.trim()) ?: return null
  val g = m.groupValues
  val cal = Calendar.getInstance(TimeZone.getTimeZone("UTC"))
  cal.clear()
  cal.set(g[1].toInt(), g[2].toInt() - 1, g[3].toInt(), g[4].toInt(), g[5].toInt(), g[6].ifEmpty { "0" }.toInt())
  val millis = g[7].take(3).padEnd(3, '0').ifEmpty { "000" }.toInt()
  var ms = cal.timeInMillis + millis
  val zone = g[8]
  if (zone.isNotEmpty() && zone != "Z" && zone != "z") {
    val sign = if (zone[0] == '-') -1 else 1
    val digits = zone.substring(1).replace(":", "")
    val hours = digits.substring(0, 2).toInt()
    val minutes = if (digits.length >= 4) digits.substring(2, 4).toInt() else 0
    ms -= sign * (hours * 3_600_000L + minutes * 60_000L)
  }
  return ms
}

fun formatIsoUtc(ms: Long): String {
  val cal = Calendar.getInstance(TimeZone.getTimeZone("UTC"))
  cal.timeInMillis = ms
  return String.format(
    java.util.Locale.ROOT, "%04d-%02d-%02dT%02d:%02d:%02dZ",
    cal.get(Calendar.YEAR), cal.get(Calendar.MONTH) + 1, cal.get(Calendar.DAY_OF_MONTH),
    cal.get(Calendar.HOUR_OF_DAY), cal.get(Calendar.MINUTE), cal.get(Calendar.SECOND),
  )
}
