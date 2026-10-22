package expo.modules.screenguard

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.provider.Telephony
import android.telecom.TelecomManager

/** Step-2 packages that depend on the phone: default launcher(s), dialer, SMS app. */
object SystemApps {
  @Volatile
  private var cache: Pair<Long, Set<String>>? = null

  fun allowed(context: Context): Set<String> {
    val now = System.currentTimeMillis()
    cache?.let { (at, set) -> if (now - at < 60_000L) return set }
    val out = HashSet<String>()
    val pm = context.packageManager
    // the default launcher (HOME activity)
    try {
      val home = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME)
      pm.resolveActivity(home, PackageManager.MATCH_DEFAULT_ONLY)?.activityInfo?.packageName?.let { out.add(it) }
    } catch (e: Exception) {
      // ignore
    }
    try {
      val tm = context.getSystemService(Context.TELECOM_SERVICE) as? TelecomManager
      tm?.defaultDialerPackage?.let { out.add(it) }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) tm?.systemDialerPackage?.let { out.add(it) }
    } catch (e: Exception) {
      // ignore
    }
    try {
      Telephony.Sms.getDefaultSmsPackage(context)?.let { out.add(it) }
    } catch (e: Exception) {
      // ignore
    }
    // "android" hosts the resolver / chooser dialogs
    out.add("android")
    out.remove(SETTINGS_PACKAGE)
    cache = now to out
    return out
  }
}
