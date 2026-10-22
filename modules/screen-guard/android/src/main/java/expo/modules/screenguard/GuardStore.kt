package expo.modules.screenguard

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONObject

/**
 * Persistent guard state in a Context.MODE_PRIVATE SharedPreferences file ("screen_guard").
 * androidx.security (EncryptedSharedPreferences) is not in this app's dependency tree, so no encryption layer.
 */
class GuardStore(context: Context) {
  private val prefs: SharedPreferences =
    context.applicationContext.getSharedPreferences(FILE, Context.MODE_PRIVATE)

  var configured: Boolean
    get() = prefs.getBoolean(K_CONFIGURED, false)
    set(v) = prefs.edit().putBoolean(K_CONFIGURED, v).apply()

  val apiBase: String? get() = prefs.getString(K_API_BASE, null)
  val token: String? get() = prefs.getString(K_TOKEN, null)
  val childId: String? get() = prefs.getString(K_CHILD_ID, null)

  fun saveConfig(apiBase: String, token: String, childId: String) {
    prefs.edit()
      .putString(K_API_BASE, apiBase.trimEnd('/'))
      .putString(K_TOKEN, token)
      .putString(K_CHILD_ID, childId)
      .putBoolean(K_CONFIGURED, true)
      .apply()
  }

  /** Last known snapshot JSON (rules + context); network failures keep it. */
  var snapshotJson: String?
    get() = prefs.getString(K_SNAPSHOT, null)
    set(v) = prefs.edit().putString(K_SNAPSHOT, v).apply()

  fun snapshot(): Snapshot {
    val raw = snapshotJson ?: return Snapshot.EMPTY
    return try {
      RulesJson.parseSnapshot(JSONObject(raw))
    } catch (e: Exception) {
      Snapshot.EMPTY
    }
  }

  /** First moment rules were seen enabled on this phone (for block_new_apps). */
  var rulesEnabledAtMs: Long
    get() = prefs.getLong(K_ENABLED_AT, 0L)
    set(v) = prefs.edit().putLong(K_ENABLED_AT, v).apply()

  var settingsGraceUntilMs: Long
    get() = prefs.getLong(K_SETTINGS_GRACE, 0L)
    set(v) = prefs.edit().putLong(K_SETTINGS_GRACE, v).apply()

  /** Set when /screen/report answered 402; cleared by the next successful response. */
  var suspended: Boolean
    get() = prefs.getBoolean(K_SUSPENDED, false)
    set(v) = prefs.edit().putBoolean(K_SUSPENDED, v).apply()

  var lastReportMs: Long
    get() = prefs.getLong(K_LAST_REPORT, 0L)
    set(v) = prefs.edit().putLong(K_LAST_REPORT, v).apply()

  /** pkg -> install time (ms), recorded by the PACKAGE_ADDED receiver and the report diff. */
  fun installTimes(): Map<String, Long> {
    val raw = prefs.getString(K_INSTALLS, null) ?: return emptyMap()
    return try {
      val o = JSONObject(raw)
      o.keys().asSequence().associateWith { o.optLong(it, 0L) }.filterValues { it > 0L }
    } catch (e: Exception) {
      emptyMap()
    }
  }

  @Synchronized
  fun recordInstall(pkg: String, atMs: Long) {
    val map = installTimes().toMutableMap()
    if (map.containsKey(pkg)) return
    map[pkg] = atMs
    prefs.edit().putString(K_INSTALLS, JSONObject(map as Map<*, *>).toString()).apply()
  }

  /** Launchable packages seen in the previous report. */
  var knownPackages: Set<String>
    get() = prefs.getStringSet(K_KNOWN, null)?.toSet() ?: emptySet()
    set(v) = prefs.edit().putStringSet(K_KNOWN, HashSet(v)).apply()

  fun clearConfig() {
    prefs.edit().remove(K_TOKEN).putBoolean(K_CONFIGURED, false).apply()
  }

  companion object {
    const val FILE = "screen_guard"
    private const val K_CONFIGURED = "configured"
    private const val K_API_BASE = "api_base"
    private const val K_TOKEN = "token"
    private const val K_CHILD_ID = "child_id"
    private const val K_SNAPSHOT = "snapshot"
    private const val K_ENABLED_AT = "rules_enabled_at"
    private const val K_SETTINGS_GRACE = "settings_grace_until"
    private const val K_LAST_REPORT = "last_report"
    private const val K_SUSPENDED = "suspended"
    private const val K_INSTALLS = "installs"
    private const val K_KNOWN = "known_pkgs"
  }
}
