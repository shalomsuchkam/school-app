// Public legal pages served at /legal/terms and /legal/privacy (?lang=ru|en).
// Bump LEGAL_VERSION whenever the text changes: families accept a specific version at sign-up.
export const LEGAL_VERSION = "2026-10-16";

// Filled in by the owner before store publication.
const OPERATOR = {
  ru: "Владелец приложения «Уроки» (данные оператора указываются в карточке приложения в App Store и Google Play)",
  en: "The owner of the “Uroki” app (operator details are listed on the App Store and Google Play pages)",
};
const CONTACT = "support@uroki.app";

const ru = {
  terms: `
<h1>Пользовательское соглашение «Уроки»</h1>
<p>Редакция от ${LEGAL_VERSION}. Оператор: ${OPERATOR.ru}. Связь: ${CONTACT}.</p>
<h2>1. Что это за сервис</h2>
<p>«Уроки» помогает семье следить за домашними заданиями и подготовкой к учебному дню: ученик отмечает задания и фотографирует выполненную работу, родитель видит прогресс, одобряет пропуски и получает напоминания.</p>
<h2>2. Кто может пользоваться</h2>
<p>Учётную запись семьи создаёт совершеннолетний родитель или законный представитель. Он подключает ребёнка кодом приглашения и отвечает за использование сервиса ребёнком. Создавая семью, родитель подтверждает, что имеет право давать согласие на обработку данных ребёнка.</p>
<h2>3. Подписка</h2>
<ul>
<li>Полный доступ предоставляется по подписке. Первые 7 дней бесплатно (один раз на учётную запись магазина и устройство).</li>
<li>Оплата производится через App Store или Google Play по цене, указанной в магазине (в Казахстане — 2990 ₸ в месяц). Подписка продлевается автоматически, если не отменить её минимум за 24 часа до конца периода.</li>
<li>Управление и отмена — в настройках подписок App Store / Google Play. Возвраты — по правилам магазина.</li>
<li>Без активной подписки данные семьи сохраняются (с учётом срока хранения фото), но приложение работает только в режиме просмотра экрана оплаты.</li>
</ul>
<h2>4. Правила использования</h2>
<p>Нельзя загружать фото, не относящиеся к учёбе и подготовке к школе, чужие персональные данные, незаконный контент; нельзя пытаться обойти оплату, получить доступ к чужим семьям или нарушить работу сервиса. Мы можем ограничить доступ при нарушении.</p>
<h2>5. Ответственность</h2>
<p>Сервис предоставляется «как есть». Напоминания зависят от настроек телефона и сети; мы не гарантируем их доставку в каждом случае и не отвечаем за оценки и учебные результаты.</p>
<h2>6. Удаление и изменение условий</h2>
<p>Родитель может в любой момент удалить семью и все данные в Настройках. Об изменении условий мы сообщаем в приложении; продолжение использования означает согласие с новой редакцией.</p>
<p>См. также <a href="privacy?lang=ru">Политику конфиденциальности</a>.</p>`,
  privacy: `
<h1>Политика конфиденциальности «Уроки»</h1>
<p>Редакция от ${LEGAL_VERSION}. Оператор: ${OPERATOR.ru}. Связь: ${CONTACT}.</p>
<h2>Какие данные мы обрабатываем</h2>
<ul>
<li><b>Данные семьи:</b> имя ученика (как его укажет родитель), имена устройств, страна, язык, часовой пояс, расписание, списки дел, сроки и настройки.</li>
<li><b>Фото выполненных заданий</b>, сделанные камерой в приложении, и время их отправки.</li>
<li><b>Технические данные:</b> случайный токен устройства (хранится у нас только в виде хэша), время последнего входа, IP-адрес для защиты от злоупотреблений.</li>
<li><b>Подписка:</b> статус и срок, полученные от App Store / Google Play. Платёжные данные карты мы не получаем.</li>
<li>Если родитель подключит Telegram — идентификатор чата для отправки уведомлений.</li>
</ul>
<p>Мы не собираем геолокацию, контакты, рекламные идентификаторы, не показываем рекламу и не передаём данные для рекламы или аналитики третьим лицам.</p>
<h2>Зачем</h2>
<p>Только для работы сервиса: показать задания и фото родителю, напомнить о сроках, проверить подписку и защитить сервис от злоупотреблений.</p>
<h2>Где и сколько хранится</h2>
<ul>
<li>Данные хранятся на серверах Supabase в защищённом виде; доступ к ним имеет только серверная часть приложения.</li>
<li>Фото автоматически удаляются через срок, выбранный родителем (от 7 до 40 дней), заменённые пересъёмкой — через сутки.</li>
<li>При удалении семьи все её данные и фото удаляются безвозвратно.</li>
</ul>
<h2>Кому передаются</h2>
<p>Supabase (хранение), Apple / Google (оплата и уведомления), Telegram (только если подключён родителем). Иным лицам — только по требованию закона.</p>
<h2>Дети</h2>
<p>Ребёнок пользуется приложением с согласия родителя, который создаёт семью и управляет ею. Ребёнок не может сам покупать подписку. Родитель может в любой момент посмотреть данные и удалить их.</p>
<h2>Ваши права</h2>
<p>Получить, исправить или удалить данные — в приложении (Настройки → Удалить семью и все данные) или по адресу ${CONTACT}.</p>`,
};

const en = {
  terms: `
<h1>“Uroki” Terms of Use</h1>
<p>Version ${LEGAL_VERSION}. Operator: ${OPERATOR.en}. Contact: ${CONTACT}.</p>
<h2>1. The service</h2>
<p>Uroki helps a family keep track of homework and getting ready for the school day: the student ticks tasks and photographs finished work, the parent sees progress, approves skips and gets reminders.</p>
<h2>2. Who may use it</h2>
<p>A family account is created by an adult parent or legal guardian, who connects the child with an invite code and is responsible for the child's use. By creating a family the parent confirms they may consent to the processing of the child's data.</p>
<h2>3. Subscription</h2>
<ul>
<li>Full access requires a subscription. The first 7 days are free (once per store account and device).</li>
<li>Payment is made through the App Store or Google Play at the price shown in the store. The subscription renews automatically unless cancelled at least 24 hours before the end of the period.</li>
<li>Manage or cancel in your App Store / Google Play subscription settings. Refunds follow the store's rules.</li>
<li>Without an active subscription the family's data is kept (subject to photo retention) but the app only shows the subscription screen.</li>
</ul>
<h2>4. Acceptable use</h2>
<p>Do not upload photos unrelated to school, other people's personal data or unlawful content; do not try to bypass payment, access other families or disrupt the service. We may restrict access for violations.</p>
<h2>5. Liability</h2>
<p>The service is provided “as is”. Reminders depend on phone settings and the network; delivery is not guaranteed and we are not responsible for grades or school results.</p>
<h2>6. Deletion and changes</h2>
<p>A parent can delete the family and all data at any time in Settings. We announce changes to these terms in the app; continued use means acceptance.</p>
<p>See also the <a href="privacy?lang=en">Privacy Policy</a>.</p>`,
  privacy: `
<h1>“Uroki” Privacy Policy</h1>
<p>Version ${LEGAL_VERSION}. Operator: ${OPERATOR.en}. Contact: ${CONTACT}.</p>
<h2>Data we process</h2>
<ul>
<li><b>Family data:</b> the student's name (as entered by the parent), device names, country, language, time zone, timetable, checklists, deadlines and settings.</li>
<li><b>Photos of finished work</b> taken with the in-app camera, and when they were sent.</li>
<li><b>Technical data:</b> a random device token (we store only its hash), last sign-in time, IP address for abuse protection.</li>
<li><b>Subscription:</b> status and expiry from the App Store / Google Play. We never receive card details.</li>
<li>If a parent connects Telegram — the chat id used to send notifications.</li>
</ul>
<p>We do not collect location, contacts or advertising identifiers, show no ads and share no data for advertising or analytics.</p>
<h2>Why</h2>
<p>Only to run the service: show tasks and photos to the parent, remind about deadlines, verify the subscription and protect the service from abuse.</p>
<h2>Storage and retention</h2>
<ul>
<li>Data is stored on Supabase servers; only the app's server side can access it.</li>
<li>Photos are deleted automatically after the period chosen by the parent (7–40 days); photos replaced by a re-shoot after one day.</li>
<li>Deleting the family permanently deletes all its data and photos.</li>
</ul>
<h2>Processors</h2>
<p>Supabase (storage), Apple / Google (payments and notifications), Telegram (only if connected by the parent). Others only where required by law.</p>
<h2>Children</h2>
<p>A child uses the app with the consent of the parent who creates and manages the family. A child cannot buy the subscription. The parent can view and delete the data at any time.</p>
<h2>Your rights</h2>
<p>Access, correct or delete your data in the app (Settings → Delete family and all data) or at ${CONTACT}.</p>`,
};

// Google Play requires a web page where users can ask for account deletion without the app.
const del = {
  ru: `
<h1>Удаление аккаунта «Уроки»</h1>
<p><b>В приложении:</b> родитель открывает Настройки → «Удалить семью и все данные» и подтверждает. Сразу и безвозвратно удаляются расписание, задания, история, все фото и все подключённые телефоны семьи.</p>
<p><b>Без приложения:</b> напишите на ${CONTACT} с темой «Удалить аккаунт» и укажите код семьи (Настройки → Подписка) или имя ученика и примерную дату регистрации. Мы удалим данные в течение 7 дней и ответим на письмо.</p>
<p>Платную подписку отменяйте отдельно в настройках App Store или Google Play — удаление аккаунта её не отменяет. Данные о покупках хранятся у магазина по его правилам.</p>`,
  en: `
<h1>Delete your “Uroki” account</h1>
<p><b>In the app:</b> a parent opens Settings → “Delete family and all data” and confirms. The timetable, tasks, history, all photos and all connected phones are deleted immediately and permanently.</p>
<p><b>Without the app:</b> email ${CONTACT} with the subject “Delete account” and include the family code (Settings → Subscription) or the student's name and approximate sign-up date. We delete the data within 7 days and reply to you.</p>
<p>Cancel a paid subscription separately in App Store or Google Play settings — deleting the account does not cancel it. Purchase records are kept by the store under its own rules.</p>`,
};

export function legalPage(kind: "terms" | "privacy" | "delete", lang: string) {
  const t = kind === "delete" ? del[lang === "en" ? "en" : "ru"] : (lang === "en" ? en : ru)[kind];
  const html = `<!doctype html><html lang="${lang === "en" ? "en" : "ru"}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${kind === "terms" ? "Uroki — Terms" : kind === "privacy" ? "Uroki — Privacy" : "Uroki — Delete account"}</title>
<style>body{font:16px/1.55 -apple-system,system-ui,Segoe UI,Roboto,sans-serif;max-width:720px;margin:0 auto;padding:20px 16px 48px;color:#1b1b29;background:#fff}
h1{font-size:26px;line-height:1.2}h2{font-size:18px;margin-top:28px}a{color:#6355f5}
@media(prefers-color-scheme:dark){body{color:#ececf5;background:#111118}a{color:#8478ff}}</style></head><body>${t}</body></html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
