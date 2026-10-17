// Public legal pages served at /legal/terms, /legal/privacy and /legal/delete (?lang=ru|kk|en).
// Bump LEGAL_VERSION whenever the text changes: families accept a specific version at sign-up.
import { secret } from "./lib.ts";

export const LEGAL_VERSION = "2026-10-19.1";

// Operator details come from app_secrets (app_operator_ru / app_operator_kk / app_operator_en, app_support_email),
// so the owner can fill in the legal entity, БИН and address without a new deploy.
type L = "ru" | "kk" | "en";
const FALLBACK_OPERATOR: Record<L, string> = {
  ru: "владелец приложения «Уроки» (реквизиты — в карточке приложения в App Store и Google Play)",
  kk: "«Уроки» қосымшасының иесі (деректемелері — App Store және Google Play беттерінде)",
  en: "the owner of the “Uroki” app (details are listed on the App Store and Google Play pages)",
};
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

type Ctx = { op: string; mail: string };

const ru = {
  terms: ({ op, mail }: Ctx) => `
<h1>Пользовательское соглашение «Уроки»</h1>
<p>Редакция ${LEGAL_VERSION}. Оператор: ${op}. Связь: <a href="mailto:${mail}">${mail}</a>.</p>
<h2>1. Что это за сервис</h2>
<p>«Уроки» помогает семье следить за домашними заданиями и подготовкой к учебному дню: ученик отмечает задания и фотографирует выполненную работу, родитель видит прогресс, одобряет пропуски и получает напоминания.</p>
<h2>2. Кто может пользоваться</h2>
<p>Учётную запись семьи создаёт совершеннолетний родитель или законный представитель. Он подключает ребёнка кодом приглашения и отвечает за использование сервиса ребёнком. Создавая семью, родитель подтверждает, что является законным представителем ребёнка и даёт согласие на обработку его персональных данных.</p>
<h2>3. Подписка</h2>
<ul>
<li>Полный доступ предоставляется по подписке. Новым подписчикам может предлагаться бесплатный пробный период 7 дней — один раз на Apple ID или аккаунт Google, по правилам магазина.</li>
<li>Оплата производится через App Store или Google Play по цене, указанной в магазине (в Казахстане — 2990 ₸ в месяц). Если есть пробный период, первое списание происходит по его окончании. Подписка продлевается автоматически, если не отменить её минимум за 24 часа до конца текущего периода.</li>
<li>Управление и отмена — в настройках подписок App Store / Google Play. Возвраты — по правилам магазина.</li>
<li>Без активной подписки данные семьи сохраняются (с учётом срока хранения фото), но ежедневные функции недоступны.</li>
</ul>
<h2>4. Правила использования</h2>
<p>Нельзя загружать фото, не относящиеся к учёбе и подготовке к школе, чужие персональные данные, незаконный контент; нельзя пытаться обойти оплату, получить доступ к чужим семьям или нарушить работу сервиса. Мы можем ограничить доступ при нарушении.</p>
<h2>5. Ответственность</h2>
<p>Сервис предоставляется «как есть». Напоминания зависят от настроек телефона и сети; мы не гарантируем их доставку в каждом случае и не отвечаем за оценки и учебные результаты.</p>
<h2>6. Удаление и изменение условий</h2>
<p>Родитель может в любой момент удалить семью и все данные в Настройках. Об изменении условий мы сообщаем в приложении; продолжение использования означает согласие с новой редакцией.</p>
<h2>7. Применимое право</h2>
<p>К соглашению применяется право Республики Казахстан, если обязательные нормы страны пользователя не предусматривают иное.</p>
<p>См. также <a href="privacy?lang=ru">Политику конфиденциальности</a>.</p>`,
  privacy: ({ op, mail }: Ctx) => `
<h1>Политика конфиденциальности «Уроки»</h1>
<p>Редакция ${LEGAL_VERSION}. Оператор (собственник и оператор базы данных): ${op}. Связь: <a href="mailto:${mail}">${mail}</a>.</p>
<h2>Какие данные мы обрабатываем</h2>
<ul>
<li><b>Данные семьи:</b> имена учеников и родителей/устройств (как их укажет родитель), страна, язык, часовой пояс, расписание, списки дел, заметки и комментарии, сроки и настройки.</li>
<li><b>Фото выполненных заданий</b>, сделанные камерой в приложении, время их отправки и, если родитель включил учёт времени, длительность занятий.</li>
<li><b>Голосовые заметки</b>, которые ученик сам записывает к заданию, и <b>сообщения</b> в чате задания между учеником и родителями.</li>
<li>Если родитель разрешит, приглашённый им репетитор или учитель может только просматривать расписание, задания, фото, отчёты и сообщения семьи; родитель может отключить его в любой момент.</li>
<li><b>Технические данные:</b> случайный токен устройства (хранится у нас только в виде хэша), токен push-уведомлений, время последнего входа, IP-адрес для защиты от злоупотреблений.</li>
<li><b>Подписка:</b> идентификатор покупателя (это идентификатор семьи), статус и срок подписки от App Store / Google Play через RevenueCat. Платёжные данные карты мы не получаем.</li>
<li>Если родитель подключит Telegram — идентификатор чата для отправки уведомлений.</li>
</ul>
<p>Мы не собираем геолокацию, контакты, рекламные идентификаторы, не показываем рекламу и не передаём данные для рекламы, профилирования или аналитики третьим лицам.</p>
<h2>Основание и цели</h2>
<p>Данные обрабатываются на основании согласия родителя (законного представителя), данного при регистрации, и для исполнения соглашения — только чтобы показать задания и фото родителю, напомнить о сроках, проверить подписку и защитить сервис от злоупотреблений.</p>
<h2>Где и сколько хранится</h2>
<ul>
<li>Данные хранятся на серверах Supabase (Европейский союз) в защищённом виде; доступ к ним имеет только серверная часть приложения. Регистрируясь, родитель соглашается на такую трансграничную передачу.</li>
<li>Фото и голосовые заметки автоматически удаляются через срок, выбранный родителем (от 7 до 40 дней), заменённые пересъёмкой фото — через сутки.</li>
<li>Остальные данные хранятся, пока существует семья. Устройства, не входившие 180 дней, отключаются.</li>
<li>При удалении семьи все её данные и фото удаляются безвозвратно.</li>
</ul>
<h2>Кому передаются (обработчики)</h2>
<p>Supabase (хранение и сервер), RevenueCat, Apple и Google (проверка подписки), Expo, Apple и Google (доставка push-уведомлений), Telegram (только если подключён родителем). Иным лицам — только по требованию закона.</p>
<h2>Дети</h2>
<p>Ребёнок пользуется приложением только с согласия родителя, который создаёт семью и управляет ею. Ребёнок не может сам покупать подписку, у ребёнка нет рекламы и внешних ссылок. Родитель может в любой момент посмотреть данные ребёнка, запретить их дальнейший сбор (отключить устройство ребёнка) и удалить их. Для пользователей из США это соответствует требованиям COPPA о прямом уведомлении и согласии родителя.</p>
<h2>Ваши права</h2>
<p>Вы вправе знать, какие данные обрабатываются, получить их копию, исправить, отозвать согласие и потребовать удаления — в приложении (Настройки → Удалить семью и все данные) или по адресу ${mail}. Мы отвечаем в течение 30 дней. Жители Казахстана вправе обратиться в уполномоченный орган по защите персональных данных (Закон РК «О персональных данных и их защите»), жители ЕС — в надзорный орган своей страны (GDPR).</p>`,
  delete: ({ mail }: Ctx) => `
<h1>Удаление аккаунта «Уроки»</h1>
<p><b>В приложении:</b> родитель открывает Настройки → «Удалить семью и все данные» и подтверждает. Сразу и безвозвратно удаляются расписание, задания, история, все фото и все подключённые телефоны семьи.</p>
<p><b>Без приложения:</b> напишите на ${mail} с темой «Удалить аккаунт» и укажите код семьи (Настройки → Подписка) или имя ученика и примерную дату регистрации. Мы удалим данные в течение 7 дней и ответим на письмо.</p>
<p>Платную подписку отменяйте отдельно в настройках App Store или Google Play — удаление аккаунта её не отменяет. Данные о покупках хранятся у магазина по его правилам.</p>`,
};

const kk = {
  terms: ({ op, mail }: Ctx) => `
<h1>«Уроки» пайдаланушы келісімі</h1>
<p>Редакция ${LEGAL_VERSION}. Оператор: ${op}. Байланыс: <a href="mailto:${mail}">${mail}</a>.</p>
<h2>1. Сервис туралы</h2>
<p>«Уроки» отбасына үй тапсырмасы мен оқу күніне дайындықты қадағалауға көмектеседі: оқушы тапсырмаларды белгілеп, орындалған жұмысты суретке түсіреді, ата-ана прогресті көреді, өткізуді мақұлдайды және еске салғыштар алады.</p>
<h2>2. Кім пайдалана алады</h2>
<p>Отбасы есептік жазбасын кәмелетке толған ата-ана немесе заңды өкіл ашады. Ол баланы шақыру кодымен қосады және баланың сервисті пайдалануына жауап береді. Отбасын ашу арқылы ата-ана баланың заңды өкілі екенін растайды және оның дербес деректерін өңдеуге келісім береді.</p>
<h2>3. Жазылым</h2>
<ul>
<li>Толық қолжетімділік жазылым бойынша беріледі. Жаңа жазылушыларға 7 күндік тегін сынақ кезеңі ұсынылуы мүмкін — дүкен ережесі бойынша бір Apple ID немесе Google аккаунтына бір рет.</li>
<li>Төлем App Store немесе Google Play арқылы дүкенде көрсетілген баға бойынша жүргізіледі (Қазақстанда — айына 2990 ₸). Сынақ кезеңі болса, алғашқы төлем ол аяқталғанда алынады. Ағымдағы кезең аяқталуына кемінде 24 сағат қалғанда бас тартпасаңыз, жазылым автоматты түрде ұзартылады.</li>
<li>Басқару және бас тарту — App Store / Google Play жазылым баптауларында. Қайтару — дүкен ережесі бойынша.</li>
<li>Белсенді жазылым болмаса, отбасы деректері сақталады (фото сақтау мерзімін ескере отырып), бірақ күнделікті функциялар қолжетімсіз.</li>
</ul>
<h2>4. Пайдалану ережелері</h2>
<p>Оқуға қатысы жоқ фото, бөгде адамдардың дербес деректерін, заңсыз мазмұнды жүктеуге; төлемді айналып өтуге, басқа отбасыларға қол жеткізуге немесе сервис жұмысын бұзуға болмайды. Бұзушылық болса, қолжетімділікті шектей аламыз.</p>
<h2>5. Жауапкершілік</h2>
<p>Сервис «сол күйінде» беріледі. Еске салғыштар телефон баптаулары мен желіге байланысты; олардың әрдайым жетуіне кепілдік бермейміз және бағалар мен оқу нәтижелеріне жауап бермейміз.</p>
<h2>6. Жою және шарттарды өзгерту</h2>
<p>Ата-ана кез келген уақытта Баптауларда отбасын және барлық деректерді жоя алады. Шарттардың өзгеруі туралы қосымшада хабарлаймыз; пайдалануды жалғастыру жаңа редакциямен келісуді білдіреді.</p>
<h2>7. Қолданылатын құқық</h2>
<p>Егер пайдаланушы елінің міндетті нормаларында өзгеше көзделмесе, келісімге Қазақстан Республикасының құқығы қолданылады.</p>
<p>Сондай-ақ <a href="privacy?lang=kk">Құпиялылық саясатын</a> қараңыз.</p>`,
  privacy: ({ op, mail }: Ctx) => `
<h1>«Уроки» құпиялылық саясаты</h1>
<p>Редакция ${LEGAL_VERSION}. Оператор (дерекқордың меншік иесі және операторы): ${op}. Байланыс: <a href="mailto:${mail}">${mail}</a>.</p>
<h2>Қандай деректерді өңдейміз</h2>
<ul>
<li><b>Отбасы деректері:</b> оқушылар мен ата-аналардың/құрылғылардың аттары (ата-ана көрсеткендей), ел, тіл, уақыт белдеуі, сабақ кестесі, істер тізімі, жазбалар мен пікірлер, мерзімдер мен баптаулар.</li>
<li><b>Орындалған тапсырмалардың фотосы</b> (қосымшадағы камерамен түсірілген), жіберілген уақыты және, ата-ана қосса, сабаққа жұмсалған уақыт.</li>
<li>Оқушы тапсырмаға өзі жазатын <b>дауыстық жазбалар</b> және оқушы мен ата-ана арасындағы тапсырма чатындағы <b>хабарламалар</b>.</li>
<li>Ата-ана рұқсат етсе, ол шақырған репетитор немесе мұғалім отбасының кестесін, тапсырмаларын, фотоларын, есептері мен хабарламаларын тек көре алады; ата-ана оны кез келген уақытта ажырата алады.</li>
<li><b>Техникалық деректер:</b> құрылғының кездейсоқ токені (бізде тек хэш түрінде сақталады), push-хабарландыру токені, соңғы кіру уақыты, теріс пайдаланудан қорғау үшін IP-мекенжай.</li>
<li><b>Жазылым:</b> сатып алушы идентификаторы (отбасы идентификаторы), App Store / Google Play-дан RevenueCat арқылы алынған жазылым мәртебесі мен мерзімі. Карта деректерін алмаймыз.</li>
<li>Ата-ана Telegram қосса — хабарландыру жіберу үшін чат идентификаторы.</li>
</ul>
<p>Геолокацияны, контактілерді, жарнама идентификаторларын жинамаймыз, жарнама көрсетпейміз және деректерді жарнама, профильдеу немесе аналитика үшін үшінші тұлғаларға бермейміз.</p>
<h2>Негіз және мақсат</h2>
<p>Деректер тіркелу кезінде ата-ана (заңды өкіл) берген келісім негізінде және келісімді орындау үшін — тек тапсырмалар мен фотоны ата-анаға көрсету, мерзімдерді еске салу, жазылымды тексеру және сервисті теріс пайдаланудан қорғау үшін өңделеді.</p>
<h2>Қайда және қанша уақыт сақталады</h2>
<ul>
<li>Деректер Supabase серверлерінде (Еуропалық одақ) қорғалған түрде сақталады; оларға тек қосымшаның серверлік бөлігі қол жеткізеді. Тіркелу арқылы ата-ана осындай трансшекаралық беруге келісім береді.</li>
<li>Фотолар мен дауыстық жазбалар ата-ана таңдаған мерзімнен кейін (7-ден 40 күнге дейін) автоматты түрде жойылады, қайта түсірілген фотолар — бір тәуліктен кейін.</li>
<li>Басқа деректер отбасы бар болғанша сақталады. 180 күн кірмеген құрылғылар ажыратылады.</li>
<li>Отбасы жойылғанда оның барлық деректері мен фотолары қайтарымсыз жойылады.</li>
</ul>
<h2>Кімге беріледі (өңдеушілер)</h2>
<p>Supabase (сақтау және сервер), RevenueCat, Apple және Google (жазылымды тексеру), Expo, Apple және Google (push-хабарландыру жеткізу), Telegram (тек ата-ана қосса). Басқа тұлғаларға — тек заң талабы бойынша.</p>
<h2>Балалар</h2>
<p>Бала қосымшаны тек отбасын ашып, оны басқаратын ата-ананың келісімімен пайдаланады. Бала жазылымды өзі сатып ала алмайды, балада жарнама мен сыртқы сілтемелер жоқ. Ата-ана кез келген уақытта баланың деректерін көре алады, оларды әрі қарай жинауға тыйым сала алады (бала құрылғысын ажырату) және жоя алады.</p>
<h2>Сіздің құқықтарыңыз</h2>
<p>Қандай деректер өңделетінін білуге, көшірмесін алуға, түзетуге, келісімді кері қайтарып алуға және жоюды талап етуге құқығыңыз бар — қосымшада (Баптаулар → Отбасын және барлық деректерді жою) немесе ${mail} мекенжайы арқылы. 30 күн ішінде жауап береміз. Қазақстан тұрғындары дербес деректерді қорғау жөніндегі уәкілетті органға («Дербес деректер және оларды қорғау туралы» ҚР Заңы) жүгіне алады.</p>`,
  delete: ({ mail }: Ctx) => `
<h1>«Уроки» аккаунтын жою</h1>
<p><b>Қосымшада:</b> ата-ана Баптаулар → «Отбасын және барлық деректерді жою» бөлімін ашып, растайды. Сабақ кестесі, тапсырмалар, тарих, барлық фотолар және отбасының барлық қосылған телефондары бірден әрі қайтарымсыз жойылады.</p>
<p><b>Қосымшасыз:</b> ${mail} мекенжайына «Аккаунтты жою» тақырыбымен жазып, отбасы кодын (Баптаулар → Жазылым) немесе оқушының атын және шамамен тіркелу күнін көрсетіңіз. Деректерді 7 күн ішінде жойып, хатқа жауап береміз.</p>
<p>Ақылы жазылымнан App Store немесе Google Play баптауларында бөлек бас тартыңыз — аккаунтты жою оны тоқтатпайды. Сатып алу деректерін дүкен өз ережесі бойынша сақтайды.</p>`,
};

const en = {
  terms: ({ op, mail }: Ctx) => `
<h1>“Uroki” Terms of Use</h1>
<p>Version ${LEGAL_VERSION}. Operator: ${op}. Contact: <a href="mailto:${mail}">${mail}</a>.</p>
<h2>1. The service</h2>
<p>Uroki helps a family keep track of homework and getting ready for the school day: the student ticks tasks and photographs finished work, the parent sees progress, approves skips and gets reminders.</p>
<h2>2. Who may use it</h2>
<p>A family account is created by an adult parent or legal guardian, who connects the child with an invite code and is responsible for the child's use. By creating a family the parent confirms they are the child's legal guardian and consent to the processing of the child's personal data.</p>
<h2>3. Subscription</h2>
<ul>
<li>Full access requires a subscription. New subscribers may be offered a 7-day free trial — once per Apple ID or Google account, under the store's rules.</li>
<li>Payment is made through the App Store or Google Play at the price shown in the store. If there is a free trial, the first charge happens when it ends. The subscription renews automatically unless cancelled at least 24 hours before the end of the current period.</li>
<li>Manage or cancel in your App Store / Google Play subscription settings. Refunds follow the store's rules.</li>
<li>Without an active subscription the family's data is kept (subject to photo retention) but daily features are unavailable.</li>
</ul>
<h2>4. Acceptable use</h2>
<p>Do not upload photos unrelated to school, other people's personal data or unlawful content; do not try to bypass payment, access other families or disrupt the service. We may restrict access for violations.</p>
<h2>5. Liability</h2>
<p>The service is provided “as is”. Reminders depend on phone settings and the network; delivery is not guaranteed and we are not responsible for grades or school results.</p>
<h2>6. Deletion and changes</h2>
<p>A parent can delete the family and all data at any time in Settings. We announce changes to these terms in the app; continued use means acceptance.</p>
<h2>7. Governing law</h2>
<p>These terms are governed by the law of the Republic of Kazakhstan unless mandatory rules of the user's country provide otherwise.</p>
<p>See also the <a href="privacy?lang=en">Privacy Policy</a>.</p>`,
  privacy: ({ op, mail }: Ctx) => `
<h1>“Uroki” Privacy Policy</h1>
<p>Version ${LEGAL_VERSION}. Operator (controller): ${op}. Contact: <a href="mailto:${mail}">${mail}</a>.</p>
<h2>Data we process</h2>
<ul>
<li><b>Family data:</b> student and parent/device names (as entered by the parent), country, language, time zone, timetable, checklists, notes and comments, deadlines and settings.</li>
<li><b>Photos of finished work</b> taken with the in-app camera, when they were sent and, if the parent turns on time tracking, how long the student worked.</li>
<li><b>Voice notes</b> the student records on a task, and <b>messages</b> in a task's chat between the student and the parents.</li>
<li>If the parent allows it, a tutor or teacher the parent invites can only view the family's timetable, tasks, photos, reports and messages; the parent can disconnect them at any time.</li>
<li><b>Technical data:</b> a random device token (we store only its hash), the push notification token, last sign-in time, IP address for abuse protection.</li>
<li><b>Subscription:</b> the customer id (the family id), subscription status and expiry from the App Store / Google Play via RevenueCat. We never receive card details.</li>
<li>If a parent connects Telegram — the chat id used to send notifications.</li>
</ul>
<p>We do not collect location, contacts or advertising identifiers, show no ads and share no data for advertising, profiling or analytics.</p>
<h2>Legal basis and purpose</h2>
<p>We process data based on the consent of the parent (legal guardian) given at sign-up and to perform our terms (GDPR Art. 6(1)(a), 6(1)(b) and 8) — only to show tasks and photos to the parent, remind about deadlines, verify the subscription and protect the service from abuse.</p>
<h2>Storage and retention</h2>
<ul>
<li>Data is stored on Supabase servers in the European Union; only the app's server side can access it. By signing up the parent agrees to this cross-border transfer.</li>
<li>Photos and voice notes are deleted automatically after the period chosen by the parent (7–40 days); photos replaced by a re-shoot after one day.</li>
<li>Other data is kept while the family exists. Devices unused for 180 days are signed out.</li>
<li>Deleting the family permanently deletes all its data and photos.</li>
</ul>
<h2>Processors</h2>
<p>Supabase (storage and server), RevenueCat, Apple and Google (subscription verification), Expo, Apple and Google (push delivery), Telegram (only if connected by the parent). Others only where required by law.</p>
<h2>Children</h2>
<p>A child uses the app only with the consent of the parent who creates and manages the family. A child cannot buy the subscription and sees no ads or external links. The parent can review the child's data, stop further collection (disconnect the child's device) and delete it at any time. For US users this is our direct notice to parents under COPPA; we collect only what is needed for the service.</p>
<h2>Your rights</h2>
<p>You may access, export, correct or delete your data, withdraw consent and object to processing — in the app (Settings → Delete family and all data) or at ${mail}. We reply within 30 days. EU residents may complain to their data protection authority; Kazakhstan residents to the authorized personal data protection body.</p>`,
  delete: ({ mail }: Ctx) => `
<h1>Delete your “Uroki” account</h1>
<p><b>In the app:</b> a parent opens Settings → “Delete family and all data” and confirms. The timetable, tasks, history, all photos and all connected phones are deleted immediately and permanently.</p>
<p><b>Without the app:</b> email ${mail} with the subject “Delete account” and include the family code (Settings → Subscription) or the student's name and approximate sign-up date. We delete the data within 7 days and reply to you.</p>
<p>Cancel a paid subscription separately in App Store or Google Play settings — deleting the account does not cancel it. Purchase records are kept by the store under its own rules.</p>`,
};

const PAGES: Record<L, typeof ru> = { ru, kk, en };
const TITLES: Record<L, Record<"terms" | "privacy" | "delete", string>> = {
  ru: { terms: "Уроки — Соглашение", privacy: "Уроки — Конфиденциальность", delete: "Уроки — Удаление аккаунта" },
  kk: { terms: "Уроки — Келісім", privacy: "Уроки — Құпиялылық", delete: "Уроки — Аккаунтты жою" },
  en: { terms: "Uroki — Terms", privacy: "Uroki — Privacy", delete: "Uroki — Delete account" },
};

export async function legalPage(kind: "terms" | "privacy" | "delete", lang: string) {
  const l: L = lang === "en" || lang === "kk" ? lang : "ru";
  const op = esc((await secret(`app_operator_${l}`)) || FALLBACK_OPERATOR[l]);
  const mail = esc((await secret("app_support_email")) || "urokikazakhstan@gmail.com");
  const html = `<!doctype html><html lang="${l}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${TITLES[l][kind]}</title>
<style>body{font:16px/1.55 -apple-system,system-ui,Segoe UI,Roboto,sans-serif;max-width:720px;margin:0 auto;padding:20px 16px 48px;color:#1b1b29;background:#fff}
h1{font-size:26px;line-height:1.2}h2{font-size:18px;margin-top:28px}a{color:#6355f5}
nav{font-size:14px;margin-bottom:12px}nav a{margin-right:12px}
@media(prefers-color-scheme:dark){body{color:#ececf5;background:#111118}a{color:#8478ff}}</style></head><body>
<nav><a href="?lang=ru">Русский</a><a href="?lang=kk">Қазақша</a><a href="?lang=en">English</a></nav>${PAGES[l][kind]({ op, mail })}</body></html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
