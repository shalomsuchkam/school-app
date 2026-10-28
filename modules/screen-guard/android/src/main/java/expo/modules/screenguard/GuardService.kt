package expo.modules.screenguard

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.util.Log
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit

/**
 * Foreground service with a persistent notification, so the child always sees that parental control is on.
 * While the screen is on it checks the foreground app every ~1 s and opens BlockActivity when the rules say so;
 * every 5 min (and right after start) it reports to the server and applies the returned rules.
 */
class GuardService : Service() {
  private lateinit var store: GuardStore
  private lateinit var reader: UsageReader
  private var loopThread: HandlerThread? = null
  private var loop: Handler? = null
  private var reports: ScheduledExecutorService? = null
  @Volatile private var screenOn = true
  private var lastBlockedPkg: String? = null
  private var lastBlockAtMs = 0L
  // PACKAGE_ADDED is not delivered to manifest receivers since Android 8, so it is registered here
  private val packageReceiver = PackageReceiver()

  private val tickRunnable = object : Runnable {
    override fun run() {
      try {
        tick()
      } catch (e: Exception) {
        Log.w(TAG, "tick failed", e)
      }
      if (screenOn) loop?.postDelayed(this, TICK_MS)
    }
  }

  private val screenReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
      when (intent.action) {
        Intent.ACTION_SCREEN_OFF -> {
          screenOn = false
          loop?.removeCallbacks(tickRunnable)
        }
        Intent.ACTION_SCREEN_ON, Intent.ACTION_USER_PRESENT -> {
          if (!screenOn) {
            screenOn = true
            loop?.removeCallbacks(tickRunnable)
            loop?.post(tickRunnable)
          }
        }
      }
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    store = GuardStore(this)
    reader = UsageReader(this)
    startInForeground()
    isRunning = true
    val t = HandlerThread("screen-guard").also { it.start() }
    loopThread = t
    loop = Handler(t.looper).also { it.post(tickRunnable) }
    val filter = IntentFilter().apply {
      addAction(Intent.ACTION_SCREEN_ON)
      addAction(Intent.ACTION_SCREEN_OFF)
      addAction(Intent.ACTION_USER_PRESENT)
    }
    registerReceiver(screenReceiver, filter)
    registerReceiver(packageReceiver, IntentFilter(Intent.ACTION_PACKAGE_ADDED).apply { addDataScheme("package") })
    reports = Executors.newSingleThreadScheduledExecutor().also {
      it.scheduleWithFixedDelay({ safeReport() }, 0, REPORT_MIN, TimeUnit.MINUTES)
    }
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (!store.configured) {
      stopSelf()
      return START_NOT_STICKY
    }
    if (intent?.action == ACTION_REPORT_NOW) reports?.execute { safeReport() }
    return START_STICKY
  }

  override fun onDestroy() {
    isRunning = false
    try {
      unregisterReceiver(screenReceiver)
      unregisterReceiver(packageReceiver)
    } catch (e: Exception) {
      // not registered
    }
    loop?.removeCallbacks(tickRunnable)
    loopThread?.quitSafely()
    reports?.shutdownNow()
    super.onDestroy()
  }

  private fun safeReport() {
    try {
      Reporter.report(this)
    } catch (e: Exception) {
      Log.w(TAG, "report failed", e)
    }
  }

  private fun tick() {
    val snap = GuardState.snapshot(this)
    val rules = snap.rules
    val now = System.currentTimeMillis()
    val acc = reader.update(now, snap.tz) ?: return
    if (!rules.enabled || store.suspended) return
    val pkg = acc.foreground ?: return
    if (pkg == OWN_PACKAGE) return
    // limits are shared by all the child's devices: the others' minutes (from the server, ≤ ~5 min old) are added
    val other = snap.otherUsageAt(now)
    val input = DecisionInput(
      pkg = pkg,
      nowMs = now,
      tz = snap.tz,
      homeworkDone = snap.homeworkDoneAt(now),
      usageMin = acc.minutes(now),
      otherUsageMin = other?.apps ?: emptyMap(),
      otherTotalMin = other?.totalMin ?: 0,
      systemAllowed = SystemApps.allowed(this),
      settingsGraceUntilMs = store.settingsGraceUntilMs.takeIf { it > 0L },
      installedAtMs = Reporter.installedAt(this, store, pkg),
      rulesEnabledAtMs = store.rulesEnabledAtMs.takeIf { it > 0L },
      approved = snap.approved,
      schoolDay = snap.schoolDayAt(now),
      homeworkDueToday = snap.homeworkDueTodayAt(now),
      suspended = store.suspended,
    )
    val d = decide(rules, input)
    if (d is Decision.Block) {
      // the block screen covers the app; re-open it at most every 1.5 s for the same package
      if (pkg == lastBlockedPkg && now - lastBlockAtMs < 1_500L) return
      lastBlockedPkg = pkg
      lastBlockAtMs = now
      if (d.reason == BlockReason.NEW_APP) reports?.execute { safeReport() }
      BlockActivity.show(this, pkg, d, snap.lang)
    } else {
      lastBlockedPkg = null
    }
  }

  private fun startInForeground() {
    val text = GuardText(GuardState.snapshot(this).lang)
    val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      nm.createNotificationChannel(
        NotificationChannel(CHANNEL_ID, text.channelName, NotificationManager.IMPORTANCE_LOW),
      )
    }
    val open = packageManager.getLaunchIntentForPackage(packageName)
    val pi = open?.let {
      PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }
    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(this, CHANNEL_ID)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(this)
    }
    val notification = builder
      .setContentTitle(text.serviceTitle)
      .setContentText(text.serviceText)
      .setSmallIcon(applicationInfo.icon)
      .setOngoing(true)
      .setContentIntent(pi)
      .build()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
  }

  companion object {
    private const val TAG = "ScreenGuard"
    private const val CHANNEL_ID = "screen_guard"
    private const val NOTIFICATION_ID = 4711
    private const val TICK_MS = 1_000L
    private const val REPORT_MIN = 5L
    const val ACTION_REPORT_NOW = "kz.uroki.screenguard.REPORT_NOW"

    @Volatile
    var isRunning = false
      private set

    fun start(context: Context, reportNow: Boolean = false) {
      val i = Intent(context, GuardService::class.java)
      if (reportNow) i.action = ACTION_REPORT_NOW
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(i) else context.startService(i)
    }

    fun stop(context: Context) {
      context.stopService(Intent(context, GuardService::class.java))
    }
  }
}
