package expo.modules.screenguard

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Restarts the guard after a reboot or an app update, when it was set up on this phone. */
class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_MY_PACKAGE_REPLACED -> {
        if (GuardStore(context).configured) {
          try {
            GuardService.start(context)
          } catch (e: Exception) {
            // background start not allowed right now; the app starts it on next launch
          }
        }
      }
    }
  }
}

/** A newly installed app: remember when, and report right away so the parent can approve it. */
class PackageReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Intent.ACTION_PACKAGE_ADDED) return
    if (intent.getBooleanExtra(Intent.EXTRA_REPLACING, false)) return
    val pkg = intent.data?.schemeSpecificPart ?: return
    val store = GuardStore(context)
    if (!store.configured) return
    store.recordInstall(pkg, System.currentTimeMillis())
    if (GuardService.isRunning) {
      try {
        GuardService.start(context, reportNow = true)
      } catch (e: Exception) {
        // the 5-minute report picks it up
      }
    }
  }
}
