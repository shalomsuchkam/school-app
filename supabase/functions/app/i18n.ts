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
  "Нет записи": { kk: "Жазба жоқ", en: "No recording" },
  "Запись слишком большая": { kk: "Жазба тым үлкен", en: "The recording is too large" },
  "Это не аудиозапись": { kk: "Бұл аудиожазба емес", en: "This is not an audio recording" },
  "Сообщение пустое": { kk: "Хабарлама бос", en: "The message is empty" },
  "Сообщение длиннее 500 символов": { kk: "Хабарлама 500 таңбадан ұзын", en: "The message is longer than 500 characters" },
  "Не больше 14 уроков в день": { kk: "Күніне 14 сабақтан артық емес", en: "At most 14 lessons a day" },
  "Предмет не найден": { kk: "Пән табылмады", en: "Subject not found" },
  "Нужен список предметов": { kk: "Пәндер тізімі керек", en: "A list of subjects is required" },
  "Неверный месяц": { kk: "Ай қате", en: "Invalid month" },
  "Тихие часы: укажите начало и конец в формате ЧЧ:ММ": {
    kk: "Тыныш сағаттар: басы мен соңын СС:ММ пішімінде көрсетіңіз",
    en: "Quiet hours: give both a start and an end as HH:MM",
  },
  "Неизвестная категория": { kk: "Белгісіз санат", en: "Unknown category" },
  "Длительность: от 1 до 240 минут": { kk: "Ұзақтығы: 1-ден 240 минутқа дейін", en: "Duration: 1 to 240 minutes" },
  "Сначала разрешите репетиторов в настройках семьи": {
    kk: "Алдымен отбасы баптауларында репетиторларға рұқсат беріңіз",
    en: "Allow tutors in the family settings first",
  },
  // screen time and textbooks
  "Неверные правила": { kk: "Ережелер қате", en: "Invalid rules" },
  "Время в формате ЧЧ:ММ": { kk: "Уақыт СС:ММ пішімінде болуы керек", en: "Time must be HH:MM" },
  "Начало и конец совпадают": { kk: "Басы мен соңы бірдей", en: "Start and end are the same" },
  "Минуты: от 1 до 1440": { kk: "Минуттар: 1-ден 1440-қа дейін", en: "Minutes: 1 to 1440" },
  "Минуты: от 0 до 240": { kk: "Минуттар: 0-ден 240-қа дейін", en: "Minutes: 0 to 240" },
  "Неверное имя приложения": { kk: "Қолданба атауы қате", en: "Invalid app package name" },
  "Не больше 200 приложений в списке": { kk: "Тізімде 200 қолданбадан артық емес", en: "At most 200 apps per list" },
  "Не больше 100 ограничений по приложениям": { kk: "Қолданба шектеулері 100-ден артық емес", en: "At most 100 app limits" },
  "Не больше 500 приложений": { kk: "500 қолданбадан артық емес", en: "At most 500 apps" },
  "Ссылка должна начинаться с http:// или https://": {
    kk: "Сілтеме http:// немесе https:// деп басталуы керек",
    en: "The link must start with http:// or https://",
  },
  "Ссылка длиннее 500 символов": { kk: "Сілтеме 500 таңбадан ұзын", en: "The link is longer than 500 characters" },
  "Не больше 100 учебников": { kk: "100 оқулықтан артық емес", en: "At most 100 textbooks" },
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
