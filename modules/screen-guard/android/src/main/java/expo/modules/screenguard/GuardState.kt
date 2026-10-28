package expo.modules.screenguard

import android.content.Context
import org.json.JSONObject

/** In-memory copy of the stored snapshot shared by the module, the service and the receivers (one process). */
object GuardState {
  @Volatile
  private var cached: Snapshot? = null

  fun snapshot(context: Context): Snapshot {
    cached?.let { return it }
    val s = GuardStore(context).snapshot()
    cached = s
    return s
  }

  /**
   * Merges [incoming] (setRules() snapshot or a server response) into the stored snapshot. Keys missing from
   * [incoming] keep their previous value, so a partial response never drops tz/approved/lang.
   */
  @Synchronized
  fun apply(context: Context, incoming: JSONObject, nowMs: Long = System.currentTimeMillis()) {
    val store = GuardStore(context)
    val merged = try {
      store.snapshotJson?.let { JSONObject(it) } ?: JSONObject()
    } catch (e: Exception) {
      JSONObject()
    }
    for (key in MERGED_KEYS) {
      if (incoming.has(key)) merged.put(key, incoming.get(key))
    }
    // settings_grace_until: ISO string or epoch ms
    if (incoming.has("settings_grace_until") && !incoming.isNull("settings_grace_until")) {
      val v = incoming.get("settings_grace_until")
      val ms = when (v) {
        is Number -> v.toLong()
        is String -> parseIsoMs(v)
        else -> null
      }
      if (ms != null) store.settingsGraceUntilMs = ms
    }
    store.snapshotJson = merged.toString()
    val snap = RulesJson.parseSnapshot(merged)
    if (snap.rules.enabled && store.rulesEnabledAtMs == 0L) store.rulesEnabledAtMs = nowMs
    cached = snap
  }

  fun invalidate() {
    cached = null
  }

  private val MERGED_KEYS = listOf(
    "rules", "homework_done", "homework_date", "tz", "approved", "lang", "school_day", "homework_due_today",
    "usage_other_devices",
  )
}
