package expo.modules.screenguard

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

data class LaunchableApp(val pkg: String, val name: String)

/** POST ${apiBase}/screen/report and apply the returned rules. Runs on the service's background executor. */
object Reporter {
  private const val TAG = "ScreenGuard"

  fun launchableApps(context: Context): List<LaunchableApp> {
    val pm = context.packageManager
    val intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
    val list = try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        pm.queryIntentActivities(intent, PackageManager.ResolveInfoFlags.of(0L))
      } else {
        @Suppress("DEPRECATION")
        pm.queryIntentActivities(intent, 0)
      }
    } catch (e: Exception) {
      emptyList()
    }
    val seen = LinkedHashMap<String, LaunchableApp>()
    for (ri in list) {
      val pkg = ri.activityInfo?.packageName ?: continue
      if (seen.containsKey(pkg)) continue
      val name = try {
        ri.loadLabel(pm).toString()
      } catch (e: Exception) {
        pkg
      }
      seen[pkg] = LaunchableApp(pkg, name.take(80))
    }
    return seen.values.sortedBy { it.name.lowercase() }
  }

  fun firstInstallTime(context: Context, pkg: String): Long? = try {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      context.packageManager.getPackageInfo(pkg, PackageManager.PackageInfoFlags.of(0L)).firstInstallTime
    } else {
      @Suppress("DEPRECATION")
      context.packageManager.getPackageInfo(pkg, 0).firstInstallTime
    }
  } catch (e: Exception) {
    null
  }

  /** Install time: what the PACKAGE_ADDED receiver recorded, else PackageInfo.firstInstallTime. */
  fun installedAt(context: Context, store: GuardStore, pkg: String): Long? =
    store.installTimes()[pkg] ?: firstInstallTime(context, pkg)

  fun buildBody(context: Context, store: GuardStore, nowMs: Long): JSONObject {
    val snap = GuardState.snapshot(context)
    val apps = launchableApps(context).take(500)
    // report diff: launchable packages not seen in the previous report are recorded as installed now
    // (unless PackageInfo knows an earlier first-install time)
    val known = store.knownPackages
    if (known.isNotEmpty()) {
      for (a in apps) {
        if (a.pkg !in known) store.recordInstall(a.pkg, firstInstallTime(context, a.pkg) ?: nowMs)
      }
    }
    store.knownPackages = apps.map { it.pkg }.toSet()

    val appsJson = JSONArray()
    for (a in apps) {
      val o = JSONObject().put("pkg", a.pkg).put("name", a.name)
      installedAt(context, store, a.pkg)?.let { o.put("installed_at", formatIsoUtc(it)) }
      appsJson.put(o)
    }
    val minutes = UsageReader.minutesToday(context, snap.tz, nowMs)
    val rulesForCount = snap.rules
    val input = DecisionInput(
      pkg = "", nowMs = nowMs, tz = snap.tz, homeworkDone = false,
      usageMin = minutes, systemAllowed = SystemApps.allowed(context),
    )
    val usage = JSONObject()
      .put("date", localDate(nowMs, snap.tz))
      // total_min counts what the daily limit counts: every app except the always-allowed ones
      .put("total_min", countedMinutes(rulesForCount, input))
      .put("apps", JSONObject(minutes as Map<*, *>))
    val guard = JSONObject()
    for ((k, v) in GuardPermissions.guardStatus(context)) guard.put(k, v)
    return JSONObject().put("apps", appsJson).put("usage", usage).put("guard", guard)
  }

  /** One report round trip. Network errors keep the last known rules. */
  fun report(context: Context): Boolean {
    val store = GuardStore(context)
    val base = store.apiBase ?: return false
    val token = store.token ?: return false
    val now = System.currentTimeMillis()
    var conn: HttpURLConnection? = null
    return try {
      val body = buildBody(context, store, now).toString().toByteArray(Charsets.UTF_8)
      conn = (URL("$base/screen/report").openConnection() as HttpURLConnection).apply {
        requestMethod = "POST"
        connectTimeout = 15_000
        readTimeout = 20_000
        doOutput = true
        setRequestProperty("Authorization", "Bearer $token")
        setRequestProperty("Content-Type", "application/json; charset=utf-8")
        setRequestProperty("Accept", "application/json")
        setFixedLengthStreamingMode(body.size)
      }
      conn.outputStream.use { it.write(body) }
      val code = conn.responseCode
      when {
        code in 200..299 -> {
          val text = conn.inputStream.bufferedReader(Charsets.UTF_8).use { it.readText() }
          val json = JSONObject(text)
          store.suspended = false
          if (json.has("rules")) GuardState.apply(context, json, now)
          store.lastReportMs = now
          true
        }
        code == 402 -> {
          // subscription lapsed: stop blocking until a later successful response
          store.suspended = true
          false
        }
        else -> {
          Log.w(TAG, "report failed: HTTP $code")
          false
        }
      }
    } catch (e: Exception) {
      Log.w(TAG, "report failed: ${e.javaClass.simpleName}")
      false
    } finally {
      conn?.disconnect()
    }
  }
}
