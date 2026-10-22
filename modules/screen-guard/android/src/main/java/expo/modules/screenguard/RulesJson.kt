package expo.modules.screenguard

import org.json.JSONArray
import org.json.JSONObject
import java.util.TimeZone

/** Rules plus the context the server sends with them (GET /screen/rules, POST /screen/report, setRules()). */
data class Snapshot(
  val rules: ScreenRules,
  val homeworkDone: Boolean,
  /** "YYYY-MM-DD" (family tz) that [homeworkDone] refers to; null = today. */
  val homeworkDate: String?,
  val tz: TimeZone,
  val approved: Set<String>,
  /** "ru" | "kk" | "en" or null (device locale). */
  val lang: String?,
  val schoolDay: Boolean? = null,
  val homeworkDueToday: Boolean? = null,
) {
  /** The day-specific flags only count for the day they were sent for (the phone may be offline after midnight). */
  private fun isForToday(nowMs: Long) = homeworkDate == null || homeworkDate == localDate(nowMs, tz)

  fun homeworkDoneAt(nowMs: Long): Boolean = homeworkDone && isForToday(nowMs)
  fun schoolDayAt(nowMs: Long): Boolean? = if (isForToday(nowMs)) schoolDay else null
  fun homeworkDueTodayAt(nowMs: Long): Boolean? = if (isForToday(nowMs)) homeworkDueToday else null

  companion object {
    val EMPTY = Snapshot(ScreenRules(), false, null, TimeZone.getDefault(), emptySet(), null)
  }
}

object RulesJson {
  fun parseSnapshot(json: JSONObject): Snapshot {
    val tzId = json.optStringOrNull("tz")
    val tz = if (tzId != null) TimeZone.getTimeZone(tzId) else TimeZone.getDefault()
    val rules = json.optJSONObject("rules")?.let { parseRules(it) } ?: ScreenRules()
    val approved = strings(json.optJSONArray("approved")) +
      strings(json.optJSONObject("device")?.optJSONArray("approved"))
    return Snapshot(
      rules = rules,
      homeworkDone = json.optBoolean("homework_done", false),
      homeworkDate = json.optStringOrNull("homework_date"),
      tz = tz,
      approved = approved,
      lang = json.optStringOrNull("lang"),
      schoolDay = json.optBoolOrNull("school_day"),
      homeworkDueToday = json.optBoolOrNull("homework_due_today"),
    )
  }

  fun parseRules(o: JSONObject): ScreenRules {
    val limits = LinkedHashMap<String, Int>()
    o.optJSONArray("app_limits")?.let { arr ->
      for (i in 0 until arr.length()) {
        val item = arr.optJSONObject(i) ?: continue
        val pkg = item.optStringOrNull("pkg") ?: continue
        val min = item.optInt("minutes", -1)
        if (min >= 0) limits[pkg] = min
      }
    }
    return ScreenRules(
      enabled = o.optBoolean("enabled", false),
      dailyLimitMin = if (o.isNull("daily_limit_min")) null else o.optInt("daily_limit_min", -1).takeIf { it >= 0 },
      appLimits = limits,
      blockedApps = strings(o.optJSONArray("blocked_apps")),
      alwaysAllowed = strings(o.optJSONArray("always_allowed")),
      bedtime = o.optJSONObject("bedtime")?.let { window(it, withDays = false) },
      school = o.optJSONObject("school")?.let { window(it, withDays = true) },
      homeworkLock = o.optBoolean("homework_lock", false),
      homeworkLockFromMin = parseHhMm(o.optStringOrNull("homework_lock_from")) ?: 15 * 60,
      blockNewApps = o.optBoolean("block_new_apps", false),
      unlockUntilMs = parseIsoMs(o.optStringOrNull("unlock_until")),
    )
  }

  private fun window(o: JSONObject, withDays: Boolean): TimeWindow? {
    val from = parseHhMm(o.optStringOrNull("from")) ?: return null
    val to = parseHhMm(o.optStringOrNull("to")) ?: return null
    val days: Set<Int>? = if (!withDays) null else o.optJSONArray("days")?.let { arr ->
      (0 until arr.length()).map { arr.optInt(it, 0) }.filter { it in 1..7 }.toSet()
    }
    return TimeWindow(from, to, days, strings(o.optJSONArray("allowed")))
  }

  private fun strings(arr: JSONArray?): Set<String> {
    if (arr == null) return emptySet()
    val out = LinkedHashSet<String>()
    for (i in 0 until arr.length()) {
      val s = arr.optString(i, "")
      if (s.isNotEmpty()) out.add(s)
    }
    return out
  }
}

/** org.json's optString returns "null" for JSON null; this returns Kotlin null for missing/null/empty. */
fun JSONObject.optStringOrNull(key: String): String? {
  if (!has(key) || isNull(key)) return null
  val v = opt(key)
  return if (v is String && v.isNotEmpty()) v else null
}

fun JSONObject.optBoolOrNull(key: String): Boolean? {
  if (!has(key) || isNull(key)) return null
  return opt(key) as? Boolean
}
