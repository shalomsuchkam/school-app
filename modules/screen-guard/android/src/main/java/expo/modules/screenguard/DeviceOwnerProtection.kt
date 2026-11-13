package expo.modules.screenguard

import android.app.Activity
import android.app.admin.DeviceAdminReceiver
import android.app.admin.DevicePolicyManager
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import org.json.JSONObject

internal object DeviceOwnerProtection {
  private fun engine(context: Context): OwnerProtection {
    val manager = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
    val admin = ComponentName(context, DeviceOwnerReceiver::class.java)
    return OwnerProtection(object : OwnerPolicy {
      override fun isOwner() = manager.isDeviceOwnerApp(context.packageName)
      override fun isBlocked() = manager.isUninstallBlocked(admin, context.packageName)
      override fun setBlocked(blocked: Boolean) = manager.setUninstallBlocked(admin, context.packageName, blocked)
      @Suppress("DEPRECATION")
      override fun clearOwner() = manager.clearDeviceOwnerApp(context.packageName)
    })
  }

  @Synchronized fun status(context: Context) = engine(context).status()
  @Synchronized fun protect(context: Context) = engine(context).protect()
  @Synchronized fun release(context: Context) = engine(context).release()
}

/** Only Android's protected device-admin flow can invoke this receiver. No legacy admin prompt is offered. */
class DeviceOwnerReceiver : DeviceAdminReceiver() {
  override fun onEnabled(context: Context, intent: Intent) {
    // set-device-owner can deliver this before ownership is assigned. The USB setup also explicitly applies it.
    runCatching { DeviceOwnerProtection.protect(context) }
  }

  override fun onProfileProvisioningComplete(context: Context, intent: Intent) {
    runCatching { DeviceOwnerProtection.protect(context) }
  }
}

/**
 * Explicit USB-parent maintenance only. Manifest requires the platform DUMP permission (shell/system).
 * No JS bridge, deep link or unprivileged app can release ownership. Never changes another package's policy.
 */
class OwnerMaintenanceReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    try {
      val state = when (intent.action) {
        "kz.uroki.app.DEVICE_OWNER_STATUS" -> DeviceOwnerProtection.status(context)
        "kz.uroki.app.DEVICE_OWNER_APPLY" -> DeviceOwnerProtection.protect(context)
        "kz.uroki.app.DEVICE_OWNER_RELEASE" -> DeviceOwnerProtection.release(context)
        else -> return
      }
      resultCode = Activity.RESULT_OK
      resultData = JSONObject(state).toString()
    } catch (error: Exception) {
      resultCode = Activity.RESULT_CANCELED
      resultData = "Device Owner operation failed: ${error.javaClass.simpleName}"
    }
  }
}
