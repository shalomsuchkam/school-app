package expo.modules.screenguard

import java.util.Locale

/** Russian / Kazakh / English texts of the guard (lang from the snapshot, else the device locale, else ru). */
class GuardText(lang: String?) {
  val lang: String = pick(lang)

  private fun t(ru: String, kk: String, en: String) = when (lang) {
    "kk" -> kk
    "en" -> en
    else -> ru
  }

  val serviceTitle get() = t("Уроки: родительский контроль включён", "Уроки: ата-ана бақылауы қосулы", "Уроки: parental control is on")
  val serviceText get() = t("Правила экранного времени от родителя", "Ата-ананың экран уақыты ережелері", "Screen-time rules set by a parent")
  val channelName get() = t("Родительский контроль", "Ата-ана бақылауы", "Parental control")
  val blockChannelName get() = t("Блокировка приложений", "Қолданбаларды бұғаттау", "App blocking")
  val blockTitle get() = t("Сейчас нельзя", "Қазір болмайды", "Not now")
  val openUroki get() = t("Открыть Уроки", "Уроки-ді ашу", "Open Уроки")
  val home get() = t("Домой", "Басты экран", "Home")
  fun reason(code: String, untilMin: Int?, limitMin: Int?): String {
    val until = untilMin?.let { formatHhMm(it) }
    return when (code) {
      "blocked" -> t("Это приложение запрещено родителем.", "Бұл қолданбаға ата-ана тыйым салған.", "A parent has blocked this app.")
      "new_app" -> t(
        "Новое приложение — ждёт разрешения родителя.",
        "Жаңа қолданба — ата-ананың рұқсатын күтуде.",
        "New app — waiting for a parent's approval.",
      )
      "bedtime" -> if (until != null) {
        t("Время сна. Телефон отдыхает до $until.", "Ұйқы уақыты. Телефон $until дейін демалады.", "Bedtime. The phone rests until $until.")
      } else {
        t("Время сна.", "Ұйқы уақыты.", "Bedtime.")
      }
      "school" -> if (until != null) {
        t("Идут уроки (до $until).", "Сабақ уақыты ($until дейін).", "School time (until $until).")
      } else {
        t("Идут уроки.", "Сабақ уақыты.", "School time.")
      }
      "homework" -> t(
        "Сначала сделай домашнее задание в «Уроках».",
        "Алдымен «Уроки» қолданбасында үй тапсырмасын орында.",
        "Finish today's homework in «Уроки» first.",
      )
      "app_limit" -> t(
        "Лимит на это приложение на сегодня исчерпан (${limitMin ?: 0} мин).",
        "Бұл қолданбаның бүгінгі лимиті бітті (${limitMin ?: 0} мин).",
        "Today's limit for this app is used up (${limitMin ?: 0} min).",
      )
      "daily_limit" -> t(
        "Дневной лимит экранного времени исчерпан (${limitMin ?: 0} мин).",
        "Экран уақытының бүгінгі лимиті бітті (${limitMin ?: 0} мин).",
        "Today's screen time limit is used up (${limitMin ?: 0} min).",
      )
      else -> t("Сейчас это приложение недоступно.", "Қазір бұл қолданба қолжетімсіз.", "This app is not available right now.")
    }
  }

  companion object {
    fun pick(lang: String?): String {
      val l = (lang ?: Locale.getDefault().language).lowercase(Locale.ROOT)
      return when (l) {
        "kk", "kz" -> "kk"
        "en" -> "en"
        else -> "ru"
      }
    }
  }
}
