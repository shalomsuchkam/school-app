// Server messages are written in Russian; clients send x-lang (ru | kk | en) and get them translated here.
// Texts like "👍 Принято: Математика" are matched by the part before ": " and the rest is kept as is.
const T: Record<string, { kk: string; en: string }> = {
  "Ученик не найден": { kk: "Оқушы табылмады", en: "Student not found" },
  "Не больше 8 учеников в семье": { kk: "Отбасында 8 оқушыдан артық болмайды", en: "At most 8 students per family" },
  "В семье должен остаться хотя бы один ученик": { kk: "Отбасында кемінде бір оқушы қалуы керек", en: "A family needs at least one student" },
  "Ошибка сервера": { kk: "Сервер қатесі", en: "Server error" },
  "Учёт времени выключен": { kk: "Уақыт есебі өшірулі", en: "Time tracking is off" },
  "💬 Комментарий сохранён": { kk: "💬 Пікір сақталды", en: "💬 Comment saved" },
  "Telegram пока не настроен": { kk: "Telegram әзірге бапталмаған", en: "Telegram is not set up yet" },
  "Вход устарел — подключите устройство заново кодом": { kk: "Кіру мерзімі өтті — құрылғыны кодпен қайта қосыңыз", en: "Sign-in expired — reconnect this device with a code" },
  "Вы единственный родитель. Сначала пригласите второго родителя.": {
    kk: "Сіз жалғыз атасыз/анасыз. Алдымен екінші ата-ананы шақырыңыз.",
    en: "You are the only parent. Invite a second parent first.",
  },
  "День недели 1–7": { kk: "Апта күні 1–7", en: "Weekday must be 1–7" },
  "Для этого пункта нужно фото": { kk: "Бұл тармаққа фото керек", en: "This item needs a photo" },
  "Задание не найдено": { kk: "Тапсырма табылмады", en: "Task not found" },
  "Задание уже изменилось": { kk: "Тапсырма өзгеріп кетті", en: "The task has already changed" },
  "Код не найден или устарел": { kk: "Код табылмады немесе мерзімі өтті", en: "Code not found or expired" },
  "Максимум 2 фото": { kk: "Ең көбі 2 фото", en: "2 photos at most" },
  "Название пустое": { kk: "Атауы бос", en: "The name is empty" },
  "Не найдено": { kk: "Табылмады", en: "Not found" },
  "Не удалось проверить подписку": { kk: "Жазылымды тексеру мүмкін болмады", en: "Could not verify the subscription" },
  "Неверная дата": { kk: "Күні қате", en: "Invalid date" },
  "Неизвестное действие": { kk: "Белгісіз әрекет", en: "Unknown action" },
  "Нет фото": { kk: "Фото жоқ", en: "No photo" },
  "Нечего отменять": { kk: "Болдырмайтын ештеңе жоқ", en: "Nothing to undo" },
  "Нужен вход": { kk: "Кіру қажет", en: "Sign-in required" },
  "Нужно принять соглашение и политику конфиденциальности": {
    kk: "Келісім мен құпиялылық саясатын қабылдау қажет",
    en: "Please accept the terms and the privacy policy",
  },
  "Пропуск уже одобрен": { kk: "Өткізу мақұлданып қойған", en: "The skip is already approved" },
  "Семья не найдена": { kk: "Отбасы табылмады", en: "Family not found" },
  "Семья с таким кодом не найдена": { kk: "Мұндай кодпен отбасы табылмады", en: "No family with this code" },
  "Только для родителя": { kk: "Тек ата-анаға арналған", en: "Parents only" },
  "Только для ученика": { kk: "Тек оқушыға арналған", en: "Students only" },
  "Уже сдано": { kk: "Тапсырылып қойған", en: "Already handed in" },
  "Устройство не найдено — войдите снова": { kk: "Құрылғы табылмады — қайта кіріңіз", en: "Device not found — sign in again" },
  "Фото слишком большое": { kk: "Фото тым үлкен", en: "The photo is too large" },
  "Это задание не на ближайший учебный день": { kk: "Бұл тапсырма жақын оқу күніне емес", en: "This task is not for the next school day" },
  "Это не фото": { kk: "Бұл фото емес", en: "This is not a photo" },
  "Слишком много попыток. Попробуйте позже.": { kk: "Тым көп әрекет. Кейінірек көріңіз.", en: "Too many attempts. Try again later." },
  "Подписка закончилась": { kk: "Жазылым аяқталды", en: "The subscription has ended" },
  "Попроси родителя продлить подписку": { kk: "Ата-анаңнан жазылымды ұзартуды сұра", en: "Ask a parent to renew the subscription" },
  // action results (prefix before ": ")
  "↩️ Выполнение отменено": { kk: "↩️ Орындау болдырылмады", en: "↩️ Completion undone" },
  "↩️ Отменено": { kk: "↩️ Болдырылмады", en: "↩️ Undone" },
  "✅ Отмечено": { kk: "✅ Белгіленді", en: "✅ Marked done" },
  "✅ Пропуск одобрен": { kk: "✅ Өткізу мақұлданды", en: "✅ Skip approved" },
  "❌ Пропуск отклонён": { kk: "❌ Өткізу қабылданбады", en: "❌ Skip declined" },
  "👍 Принято": { kk: "👍 Қабылданды", en: "👍 Accepted" },
  "🔄 Попросили переснять": { kk: "🔄 Қайта түсіру сұралды", en: "🔄 Asked to retake" },
};

export type Lang = "ru" | "kk" | "en";
export const langOf = (req: Request): Lang => {
  const v = (req.headers.get("x-lang") ?? "").toLowerCase();
  return v === "kk" || v === "en" ? v : "ru";
};

export function tr(lang: Lang, msg: string): string {
  if (lang === "ru" || !msg) return msg;
  const whole = T[msg];
  if (whole) return whole[lang];
  const i = msg.indexOf(": ");
  if (i > 0) {
    const head = T[msg.slice(0, i)];
    if (head) return `${head[lang]}${msg.slice(i)}`;
  }
  return msg;
}
