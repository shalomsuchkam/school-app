package expo.modules.exactalarm

import android.app.AlarmManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Android 12+ delivers local reminders late unless the app may set exact alarms.
// On Android 14+ that permission is off by default and only the user can turn it on.
class ExactAlarmModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ExactAlarm")

    Function("canSchedule") {
      val ctx = appContext.reactContext
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S || ctx == null) {
        true
      } else {
        val am = ctx.getSystemService(Context.ALARM_SERVICE) as? AlarmManager
        am?.canScheduleExactAlarms() ?: true
      }
    }

    Function("openSettings") {
      val ctx = appContext.reactContext
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S || ctx == null) {
        false
      } else {
        val intent = Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:${ctx.packageName}"))
        val activity = appContext.currentActivity
        try {
          if (activity != null) {
            activity.startActivity(intent)
          } else {
            ctx.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
          }
          true
        } catch (e: Exception) {
          false
        }
      }
    }
  }
}
