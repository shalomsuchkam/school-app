package expo.modules.screenguard

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.util.TypedValue
import android.view.Gravity
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

/**
 * Full-screen block screen («Тетрадь» colours): why the app is not available now, «Открыть Уроки» and «Домой».
 * Back goes home, never back into the blocked app.
 */
class BlockActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    render(intent)
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    render(intent)
  }

  private fun dp(v: Int) = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v.toFloat(), resources.displayMetrics).toInt()

  private fun render(intent: Intent) {
    val text = GuardText(intent.getStringExtra(EXTRA_LANG))
    val reason = intent.getStringExtra(EXTRA_REASON) ?: ""
    val until = intent.getIntExtra(EXTRA_UNTIL, -1).takeIf { it >= 0 }
    val limit = intent.getIntExtra(EXTRA_LIMIT, -1).takeIf { it >= 0 }
    val appName = intent.getStringExtra(EXTRA_APP_NAME)

    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER
      setBackgroundColor(PAPER)
      setPadding(dp(28), dp(48), dp(28), dp(48))
    }
    root.addView(TextView(this).apply {
      this.text = text.blockTitle
      setTextColor(INK)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 30f)
      typeface = Typeface.create(Typeface.SERIF, Typeface.BOLD)
      gravity = Gravity.CENTER
    })
    if (!appName.isNullOrBlank()) {
      root.addView(TextView(this).apply {
        this.text = appName
        setTextColor(MUTED)
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
        gravity = Gravity.CENTER
        setPadding(0, dp(6), 0, 0)
      })
    }
    root.addView(TextView(this).apply {
      this.text = text.reason(reason, until, limit)
      setTextColor(INK)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 18f)
      gravity = Gravity.CENTER
      setLineSpacing(0f, 1.25f)
      setPadding(0, dp(20), 0, dp(36))
    })
    root.addView(button(text.openUroki, filled = true) { openUroki() })
    root.addView(button(text.home, filled = false) { goHome() }, LinearLayout.LayoutParams(
      LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT,
    ).apply { topMargin = dp(12) })
    setContentView(root)
  }

  private fun button(label: String, filled: Boolean, onClick: () -> Unit) = Button(this).apply {
    text = label
    isAllCaps = false
    setTextSize(TypedValue.COMPLEX_UNIT_SP, 17f)
    setTextColor(if (filled) Color.WHITE else ACCENT)
    minHeight = dp(52)
    background = GradientDrawable().apply {
      cornerRadius = dp(14).toFloat()
      if (filled) setColor(ACCENT) else {
        setColor(Color.TRANSPARENT)
        setStroke(dp(1), ACCENT)
      }
    }
    setOnClickListener { onClick() }
  }

  private fun openUroki() {
    packageManager.getLaunchIntentForPackage(packageName)?.let {
      it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)
      startActivity(it)
    }
    finish()
  }

  private fun goHome() {
    startActivity(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    finish()
  }

  @Deprecated("Back goes home, not into the blocked app")
  override fun onBackPressed() {
    goHome()
  }

  companion object {
    private const val EXTRA_REASON = "reason"
    private const val EXTRA_UNTIL = "until"
    private const val EXTRA_LIMIT = "limit"
    private const val EXTRA_LANG = "lang"
    private const val EXTRA_APP_NAME = "app_name"
    private val PAPER = Color.parseColor("#FBF8F1")
    private val INK = Color.parseColor("#1F2433")
    private val MUTED = Color.parseColor("#6B6F7B")
    private val ACCENT = Color.parseColor("#2A4BB0")

    fun show(context: Context, pkg: String, d: Decision.Block, lang: String?) {
      val name = try {
        val pm = context.packageManager
        pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString()
      } catch (e: Exception) {
        null
      }
      val i = Intent(context, BlockActivity::class.java)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS)
        .putExtra(EXTRA_REASON, d.reason.code)
        .putExtra(EXTRA_UNTIL, d.untilMin ?: -1)
        .putExtra(EXTRA_LIMIT, d.limitMin ?: -1)
        .putExtra(EXTRA_LANG, lang)
        .putExtra(EXTRA_APP_NAME, name)
      context.startActivity(i)
    }
  }
}
