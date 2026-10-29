package expo.modules.screenguard

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONObject

// JS API of docs/SCREEN_TIME.md, "Native module API". The child's phone runs the guard after a parent set it up.
class ScreenGuardModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw IllegalStateException("no React context")

  private fun open(intent: Intent): Boolean = try {
    val activity = appContext.currentActivity
    if (activity != null) activity.startActivity(intent) else context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    true
  } catch (e: Exception) {
    false
  }

  /** The phone's settings app may be open for a few minutes while the child grants access in the setup flow. */
  private fun allowSettingsForSetup() {
    GuardStore(context).settingsGraceUntilMs = System.currentTimeMillis() + 5 * 60_000L
  }

  override fun definition() = ModuleDefinition {
    Name("ScreenGuard")

    AsyncFunction("status") {
      val ctx = context
      val out = HashMap<String, Any>()
      out["supported"] = true
      for ((k, v) in GuardPermissions.guardStatus(ctx)) out[k] = v
      out["configured"] = GuardStore(ctx).configured
      out
    }

    AsyncFunction("openUsageAccessSettings") {
      allowSettingsForSetup()
      val pkgIntent = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS, Uri.parse("package:${context.packageName}"))
      open(pkgIntent) || open(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS))
    }

    AsyncFunction("openOverlaySettings") {
      allowSettingsForSetup()
      open(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:${context.packageName}")))
    }

    AsyncFunction("openBatterySettings") {
      allowSettingsForSetup()
      open(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
    }

    AsyncFunction("start") { config: Map<String, Any?> ->
      val apiBase = config["apiBase"] as? String ?: throw IllegalArgumentException("apiBase")
      val token = config["token"] as? String ?: throw IllegalArgumentException("token")
      val childId = config["childId"]?.toString() ?: throw IllegalArgumentException("childId")
      GuardStore(context).saveConfig(apiBase, token, childId)
      GuardService.start(context, reportNow = true)
      true
    }

    // The guard's own copy of the child session (set by start, cleared by stop). The app restores its session from it
    // when its SecureStore copy is lost (src/lib/sessionStore.ts); null when the guard is not configured.
    AsyncFunction("storedSession") {
      val store = GuardStore(context)
      val token = store.token
      val childId = store.childId
      val out: Map<String, String?>? =
        if (store.configured && !token.isNullOrEmpty() && !childId.isNullOrEmpty()) {
          mapOf("token" to token, "childId" to childId, "apiBase" to store.apiBase)
        } else {
          null
        }
      out
    }

    AsyncFunction("stop") {
      GuardService.stop(context)
      GuardStore(context).clearConfig()
      true
    }

    AsyncFunction("setRules") { snapshot: Map<String, Any?> ->
      GuardState.apply(context, JSONObject(snapshot))
      GuardStore(context).suspended = false
      true
    }

    AsyncFunction("installedApps") {
      Reporter.launchableApps(context).map { mapOf("pkg" to it.pkg, "name" to it.name) }
    }

    AsyncFunction("usageToday") {
      val snap = GuardState.snapshot(context)
      val now = System.currentTimeMillis()
      val minutes = UsageReader.minutesToday(context, snap.tz, now)
      val input = DecisionInput(
        pkg = "", nowMs = now, tz = snap.tz, homeworkDone = false,
        usageMin = minutes, systemAllowed = SystemApps.allowed(context),
      )
      mapOf("total_min" to countedMinutes(snap.rules, input), "apps" to minutes)
    }
  }
}
