# «Контроль ДЗ»: тексты и анкеты для App Store и Google Play

Готово к копированию. Рядом с каждым полем указано число символов и лимит магазина (`N/лимит`), посчитано
скриптом по тексту в блоке. Блоки копируйте целиком, без кавычек «```».

- **Название в магазинах:** «Контроль ДЗ» («Уроки» занято).
  - Внутри приложения пока «Уроки»; переименование сделает отдельный проход.
  - До отправки на проверку имя на телефоне и в магазине должно совпадать по смыслу (Apple 2.3.8 / Play «Metadata»).
- **Bundle ID / package:** `kz.uroki.app`.
- **Оператор:** ИП «KonG Service», ИИН/БИН 021018500443, г. Алматы.
  Поддержка: urokikazakhstan@gmail.com.
- **Цена:** 2990 ₸ в месяц, 7 дней бесплатно.
- **Сайт:** https://urokiapp.kz (раздаёт `deploy/lite`, исходники в `deploy/lite/site/`).

| Адрес | Для чего |
|---|---|
| https://urokiapp.kz | Marketing URL (App Store), Website (Google Play) |
| https://urokiapp.kz/support | Support URL |
| https://urokiapp.kz/privacy | Privacy Policy URL (оба магазина); `?lang=ru|kk|en`, без параметра — по языку браузера |
| https://urokiapp.kz/terms | Terms of Use / EULA (ссылка в описании App Store) |
| https://urokiapp.kz/delete-account | Google Play → Data safety → Delete account URL |

Когда приложение выйдет, замените на сайте кнопки «скоро». В `deploy/lite/site/{,kk/,en/}{index,support}.html`
найдите комментарии `STORE-LINK`, впишите ссылки в `href`, уберите `aria-disabled="true"` и слово «скоро»,
затем запустите `deploy`.

---

## 1. App Store Connect

### 1.1. Языки

- **Основной язык: русский.** Дополнительный: English (U.S.).
- Казахский: если App Store Connect предлагает «Kazakh» в списке локализаций, добавьте тексты из раздела kk.
  Если не предлагает, казахские тексты используются только в Google Play и на сайте. В магазине Казахстана
  тогда показывается русская версия.
- Имя приложения одинаковое во всех локализациях. Так проще с проверкой Apple 2.3.8: имя на телефоне совпадает с
  именем в магазине.

### 1.2. Русский (ru)

**Name** — 11/30
```text
Контроль ДЗ
```

**Subtitle** — 30/30
```text
Домашка, дела и экранное время
```

**Promotional Text** — 125/170 (можно менять без новой сборки)
```text
Родитель ставит уроки и дела, ребёнок отмечает и прикладывает фото. Игры подождут, пока домашка не сделана. 7 дней бесплатно.
```

**Keywords** — 98/100 (слова из названия и подзаголовка не повторяем, Apple их уже учитывает)
```text
уроки,школа,школьник,задания,дневник,расписание,родительский,лимит,телефон,дети,ребенок,семья,игры
```

**Description** — 2463/4000
```text
«Контроль ДЗ» — семейное приложение для школьной домашки. Родитель ставит ребёнку уроки и дела на день, ребёнок отмечает выполненное и фотографирует тетрадь, родитель видит прогресс и одобряет. Без вечерних споров «а ты всё сделал?».

КАК ЭТО РАБОТАЕТ
• Родитель задаёт расписание уроков, задания по предметам и дела по дому: собрать портфель, форма на физкультуру, почитать 20 минут.
• Ребёнок на своём телефоне отмечает задания и прикладывает фото сделанной работы — камерой прямо в приложении, по каждому предмету.
• Родитель видит, что сделано и когда, смотрит фото, одобряет или просит переделать. Пропустить задание ребёнок может только с одобрения родителя.

НАПОМИНАНИЯ
• Ребёнку — заранее, в выбранное время.
• Родителю — если задание не сделано к сроку.
• Тихие часы, чтобы никого не будить.

ЭКРАННОЕ ВРЕМЯ
• Лимит на день и на отдельные приложения.
• Время сна и школьные часы: открыты только разрешённые приложения.
• «Сначала уроки»: вечером перед учебным днём игры закрыты, пока не сделаны обязательные задания.
• Новые приложения — только с разрешения родителя.
• «Дать ещё время» одной кнопкой.
Звонки и сообщения работают всегда. Ребёнок видит, что контроль включён: никакой скрытой слежки, переписка и содержимое приложений не читаются. На iPhone ребёнка правила применяются через «Экранное время» Apple — ребёнок должен быть в вашей «Семье» (Семейный доступ).

ЕЩЁ
• Чат прямо у задания и голосовые заметки от ребёнка.
• Календарь месяца: вовремя, с опозданием, не сделано. Серии и звёзды за старание.
• Отчёт за неделю.
• Учебники: ссылки на электронные учебники и свои PDF внутри приложения.
• Второй родитель и репетитор подключаются по коду или QR-коду, без паролей и почты. Репетитору можно дать режим «только просмотр».
• Русский, қазақша, English. Светлая и тёмная тема. iPhone, iPad и Android в любом сочетании.

ПОДПИСКА
Одна подписка на всю семью: все дети и оба родителя. 2990 ₸ в месяц, первые 7 дней бесплатно (один раз на Apple ID). Оплата списывается с Apple ID после пробного периода. Подписка продлевается автоматически, если не отменить её минимум за 24 часа до конца периода. Управлять подпиской и отменить её можно в настройках Apple ID. Настроить семью можно и без подписки.

Без рекламы и сторонних трекеров. Удалить семью и все данные можно в настройках приложения в один шаг.

Условия использования: https://urokiapp.kz/terms
Политика конфиденциальности: https://urokiapp.kz/privacy
Поддержка: urokikazakhstan@gmail.com
```

> Абзац «На iPhone ребёнка правила применяются через „Экранное время“ Apple…» оставляйте только в сборке, где
> включено iOS-экранное время (`iosScreenTime`, docs/SCREEN_TIME.md). Без Family Controls замените его на
> «Экранное время работает на Android-телефоне ребёнка.» Иначе это нарушение Apple 2.3.1 (функция не работает).

**What's New (1.0)**
```text
Первая версия «Контроль ДЗ».
```

### 1.3. Қазақша (kk)

**Name** — 11/30
```text
Контроль ДЗ
```

**Subtitle** — 30/30
```text
Үй тапсырмасы мен экран уақыты
```

**Promotional Text** — 126/170
```text
Ата-ана сабақ пен істерді береді, бала белгілеп, фото тіркейді. Үй тапсырмасы орындалмайынша ойындар күте тұрады. 7 күн тегін.
```

**Keywords** — 93/100
```text
сабақ,мектеп,оқушы,тапсырма,күнделік,кесте,ата-ана,бақылау,лимит,телефон,бала,отбасы,уроки,дз
```

**Description** — 2585/4000
```text
«Контроль ДЗ» — мектеп үй тапсырмасына арналған отбасылық қосымша. Ата-ана балаға күнге арналған сабақ пен істерді береді, бала орындағанын белгілеп, дәптерін суретке түсіреді, ата-ана прогресті көріп, мақұлдайды. «Бәрін істедің бе?» деген кешкі дау-дамайсыз.

ҚАЛАЙ ЖҰМЫС ІСТЕЙДІ
• Ата-ана сабақ кестесін, пәндер бойынша тапсырмаларды және үй істерін береді: портфельді жинау, дене шынықтыру формасы, 20 минут кітап оқу.
• Бала өз телефонында тапсырмаларды белгілеп, орындалған жұмыстың фотосын тіркейді — тікелей қосымшадағы камерамен, әр пән бойынша.
• Ата-ана не және қашан орындалғанын көреді, фотоларды қарайды, мақұлдайды немесе қайта істеуді сұрайды. Бала тапсырманы тек ата-ана рұқсатымен өткізіп жібере алады.

ЕСКЕ САЛҒЫШТАР
• Балаға — алдын ала, таңдалған уақытта.
• Ата-анаға — тапсырма уақытында орындалмаса.
• Ешкімді оятпау үшін тыныш сағаттар.

ЭКРАН УАҚЫТЫ
• Күндік лимит және жеке қолданбаларға лимит.
• Ұйқы уақыты мен мектеп сағаттары: тек рұқсат етілген қолданбалар ашық.
• «Алдымен сабақ»: оқу күнінің алдындағы кеште міндетті тапсырмалар орындалмайынша ойындар жабық.
• Жаңа қолданбалар — тек ата-ана рұқсатымен.
• «Тағы уақыт беру» — бір батырмамен.
Қоңыраулар мен хабарламалар әрқашан жұмыс істейді. Бала бақылау қосулы екенін көреді: жасырын бақылау жоқ, хат-хабар мен қолданбалардың мазмұны оқылмайды. Бала iPhone-ында ережелер Apple «Экран уақыты» арқылы қолданылады — бала сіздің «Отбасыңызда» болуы керек (Отбасылық қолжетімділік).

ТАҒЫ
• Тапсырманың жанындағы чат және баланың дауыстық жазбалары.
• Ай күнтізбесі: уақытында, кешігіп, орындалмаған. Ынта үшін серия мен жұлдыздар.
• Апталық есеп.
• Оқулықтар: электрондық оқулықтарға сілтемелер және өз PDF-тарыңыз қосымша ішінде.
• Екінші ата-ана мен репетитор кодпен не QR-кодпен қосылады, құпиясөз бен поштасыз. Репетиторға «тек қарау» режимін беруге болады.
• Русский, қазақша, English. Ашық және қараңғы тақырып. iPhone, iPad және Android кез келген үйлесімде.

ЖАЗЫЛЫМ
Бүкіл отбасыға бір жазылым: барлық балалар және екі ата-ана. Айына 2990 ₸, алғашқы 7 күн тегін (Apple ID-ге бір рет). Төлем сынақ мерзімі біткен соң Apple ID-ден алынады. Кезең аяқталуына кемінде 24 сағат қалғанда бас тартпасаңыз, жазылым автоматты түрде ұзартылады. Жазылымды Apple ID баптауларында басқаруға және тоқтатуға болады. Отбасын жазылымсыз да баптауға болады.

Жарнамасыз, бөгде трекерлерсіз. Отбасын және барлық деректерді қосымша баптауларында бір қадаммен жоюға болады.

Пайдалану шарттары: https://urokiapp.kz/terms?lang=kk
Құпиялылық саясаты: https://urokiapp.kz/privacy?lang=kk
Қолдау: urokikazakhstan@gmail.com
```

### 1.4. English (en)

**Name** — 11/30
```text
Контроль ДЗ
```
Если Apple не пропустит кириллицу в англоязычной локализации или захочется латиницу, вот запасной вариант:
`Kontrol DZ: Homework Check` (26/30).

**Subtitle** — 30/30
```text
Homework, chores & screen time
```

**Promotional Text** — 122/170
```text
Parents set homework and chores, kids check them off with a photo. Games wait until the homework is done. Try 7 days free.
```

**Keywords** — 93/100
```text
parental,control,school,kids,child,family,tasks,planner,timetable,limit,phone,study,checklist
```

**Description** — 2550/4000
```text
Контроль ДЗ (Kontrol DZ) is a family app for school homework. The parent sets the child's homework and to-dos for the day, the child checks them off and photographs the exercise book, and the parent sees the progress and approves. No more evening arguments about "have you done everything?".

HOW IT WORKS
• The parent sets the class timetable, homework per subject and chores: pack the school bag, PE kit, read for 20 minutes.
• On their own phone the child checks tasks off and attaches a photo of the finished work — taken with the in-app camera, per subject.
• The parent sees what was done and when, looks at the photos, approves or asks for a redo. A child can skip a task only with a parent's approval.

REMINDERS
• For the child — ahead of time, at the times you choose.
• For the parent — if a task isn't done on time.
• Quiet hours so nobody is woken up.

SCREEN TIME
• A daily limit and limits for individual apps.
• Bedtime and school hours: only allowed apps are open.
• "Homework first": on the evening before a school day games stay locked until the required tasks are done.
• New apps only with a parent's approval.
• "Give more time" with one tap.
Calls and messages always work. The child sees that parental control is on: no hidden monitoring, messages and app content are never read. On the child's iPhone the rules are applied through Apple's Screen Time — the child must be in your Family Sharing group.

ALSO
• A chat right on each task and voice notes from the child.
• A month calendar: on time, late, not done. Streaks and stars for effort.
• A weekly report.
• Textbooks: links to e-textbooks and your own PDFs inside the app.
• A second parent and a tutor join with a code or QR code — no passwords, no email. A tutor can get view-only access.
• Russian, Kazakh and English. Light and dark theme. iPhone, iPad and Android in any combination.

SUBSCRIPTION
One subscription for the whole family: all children and both parents. 2990 ₸ a month (or the equivalent in your currency), the first 7 days free (once per Apple ID). Payment is charged to your Apple ID after the trial. The subscription renews automatically unless cancelled at least 24 hours before the end of the current period. Manage or cancel it in your Apple ID settings. You can set up the family without a subscription.

No ads, no third-party trackers. Delete the family and all its data in one step in the app's settings.

Terms of Use: https://urokiapp.kz/terms?lang=en
Privacy Policy: https://urokiapp.kz/privacy?lang=en
Support: urokikazakhstan@gmail.com
```

### 1.5. Адреса, категория, авторские права

| Поле | Значение |
|---|---|
| Support URL | `https://urokiapp.kz/support` (en: `https://urokiapp.kz/en/support`) |
| Marketing URL | `https://urokiapp.kz` (en: `https://urokiapp.kz/en`) |
| Privacy Policy URL | `https://urokiapp.kz/privacy` |
| License Agreement | стандартный Apple EULA. Наши условия даны ссылкой в описании |
| Primary Category | **Education** |
| Secondary Category | **Productivity** |
| Copyright | `2026 ИП «KonG Service»` |
| Routing App Coverage | не нужно |

**Почему не категория Kids:**

- **Для кого приложение.** Пользователь и покупатель — родитель: он создаёт семью, задаёт правила и оплачивает подписку.
  Детский экран — только одна из ролей. Kids Category предназначена для приложений, сделанных *для детей*.
- **Что Kids Category требует** (Apple 1.3 и 5.1.4):
  - родительский барьер перед каждой внешней ссылкой и покупкой;
  - никакой сторонней аналитики и рекламы.
  - **Чем это нам мешает:** на экранах родителя есть ссылки на условия, политику и управление подпиской в App Store.
    Родительский барьер пришлось бы ставить везде без пользы.
- **Возраст.** Kids Category требует выбрать возрастной диапазон ребёнка (5 и младше, 6–8, 9–11). Это сужает аудиторию и
  вводит в заблуждение: в магазине приложение ищут и покупают родители.
- **Родительский контроль.** Приложение с Screen Time API (FamilyControls) — это инструмент родителя.
  Apple рассматривает такие приложения в обычных категориях.
- **Важно:** уйти из Kids Category после публикации нельзя без новой проверки. Отказаться от неё сразу безопаснее.

### 1.6. Возрастной рейтинг (Age Rating), цель 4+

Ответы на анкету в App Store Connect (App Information → Age Rating). У Apple новая анкета, действует с 2025 года:
сначала «In-App Controls / Capabilities», затем частота контента.

| Вопрос | Ответ | Пояснение |
|---|---|---|
| Parental Controls | **Yes** | Родитель управляет устройством ребёнка: правила, одобрение пропусков, экранное время |
| Age Assurance | No | |
| Unrestricted Web Access | **No** | Учебники открываются во встроенном просмотрщике, только сайт этой ссылки (переходы на другие сайты закрыты) |
| User-Generated Content | **Yes** | Фото, голосовые заметки, текст заданий |
| Messaging and Chat | **Yes** | Чат у задания только между участниками одной семьи |
| Advertising | No | |
| Cartoon/Fantasy Violence, Realistic Violence, Prolonged Graphic Violence | None | |
| Profanity or Crude Humor | None | |
| Mature/Suggestive Themes | None | |
| Horror/Fear Themes | None | |
| Medical/Treatment Information | None | |
| Alcohol, Tobacco, Drug Use or References | None | |
| Simulated Gambling, Contests | None | |
| Sexual Content or Nudity, Graphic Sexual Content | None | |
| Loot boxes | No | |
| Health or Wellness Topics | No | |

**Пользовательский контент и чат: что сказать Apple.** Для поля Review Notes (см. 1.11) и на случай вопроса в
Resolution Center:

- Все участники семьи подключаются только по одноразовому коду из телефона родителя (48 часов). Посторонних в чате нет.
- Ни поиска пользователей, ни публичных профилей, ни ленты нет.
- Родитель видит всю переписку и все фото ребёнка.
- Родитель может отключить любое устройство и удалить семью.
- Жалобы — на urokikazakhstan@gmail.com.

Если анкета всё равно выставит 9+ или 13+ из-за чата, это допустимо: приложение покупают родители.
Не занижайте ответы, чтобы получить 4+.

### 1.7. App Privacy («этикетка»)

App Store Connect → App Privacy → Get Started. **Do you or your third-party partners collect data from this app? — Yes.**
Совпадает с `ios.privacyManifests` в `app.json`, политикой конфиденциальности и сервером (`supabase/functions/app`).

Для каждого типа ответы одинаковые:

- **Usage:** App Functionality.
- **Linked to the user's identity:** Yes. Всё привязано к семье.
- **Used for tracking:** No.

| Категория → тип | Что именно | Где в коде |
|---|---|---|
| Contact Info → **Name** | имена детей и родителей/устройств, как их ввёл родитель | `app_children.name`, `app_devices.name` |
| User Content → **Photos or Videos** | фото выполненных заданий (только камерой в приложении) | Storage `app-photos`, `app_photos` |
| User Content → **Audio Data** | голосовые заметки ребёнка к заданию (до 60 с) | `app_tasks.voice_path` |
| User Content → **Other User Content** | задания, заметки, комментарии родителя, сообщения чата у задания, расписание, ссылки на учебники | `app_tasks`, сообщения, `app_textbooks` |
| Identifiers → **User ID** | идентификатор семьи (он же ID покупателя в RevenueCat), случайный токен устройства (храним только хэш), chat id Telegram, если родитель подключил бота | `app_families.id`, `app_devices` |
| Purchases → **Purchase History** | статус подписки и дата окончания от App Store / Google Play через RevenueCat | `app_families.paid_until`, `billing_*` |
| Usage Data → **Other Usage Data** | минуты в приложениях и список приложений с Android-телефона ребёнка. Родитель видит их и в iOS-приложении | `POST /screen/report` |

Не отмечать:

- **Location, Contacts, Health, Financial Info (карт мы не получаем), Browsing History, Search History,
  Sensitive Info.** Ничего из этого не собираем.
- **Device ID.** Push-токен Expo нужен только для доставки уведомлений. Apple не считает его «Device ID» (это не
  IDFA/IDFV).
- **Diagnostics.** Нет Crashlytics/Sentry, crash-логи мы не собираем.
- **IP-адрес.** Используется только для защиты от перебора (счётчик запросов на минуты) и не хранится с данными
  семьи. По правилам Apple это не «сбор».

**Строка «Other Usage Data».** iOS-приложение само ничего с iPhone не отправляет: «Экранное время» Apple не отдаёт
статистику приложению. Строку добавляем ради полноты, потому что iOS-приложение родителя показывает статистику
с Android. Чтобы манифест совпадал с этикеткой, в `app.json → ios.privacyManifests.NSPrivacyCollectedDataTypes`
можно добавить `NSPrivacyCollectedDataTypeOtherUsageData` с теми же флагами. Это сделает тот, кто сейчас правит `app.json`.

### 1.8. Экспортный контроль

`ITSAppUsesNonExemptEncryption = false` уже стоит в `app.json`. Приложение использует только HTTPS/TLS из ОС.
При загрузке сборки вопрос не задаётся. Если App Store Connect всё же спросит: «Does your app use encryption?» → **No**
(или «Yes» → «only exempt: standard HTTPS» → без документов).

### 1.9. Подписка (In-App Purchases → Subscriptions)

| Поле | Значение |
|---|---|
| Subscription Group (Reference Name) | `Контроль ДЗ — семья` |
| Group Display Name (ru / kk / en) | `Подписка для семьи` / `Отбасылық жазылым` / `Family subscription` |
| Reference Name | `Monthly` |
| Product ID | `kz.uroki.app.monthly` (навсегда; повторно использовать нельзя) |
| Duration | 1 Month |
| Price | Kazakhstan — 2990 ₸ (в сетке цен Apple ближайшая точка; остальные страны — автоматически от неё) |
| Family Sharing | **Off** (подписка и так на всю семью через наш сервер; включение позволит другому Apple ID в «Семье» получить её бесплатно, что сбивает учёт) |
| Display Name (ru / kk / en) | `Контроль ДЗ на месяц` / `Контроль ДЗ, 1 ай` / `Контроль ДЗ, 1 month` |
| Description (ru, ≤ 55) | `Все функции для всей семьи: дети и оба родителя` |
| Description (kk) | `Бүкіл отбасыға барлық мүмкіндік` |
| Description (en) | `All features for the whole family` |
| Introductory Offer | Free Trial, **1 week**, все страны, новые подписчики |
| Review Screenshot | скриншот экрана оплаты (Paywall) с ценой, «7 дней бесплатно», «Восстановить покупки» и ссылками на условия и политику: `docs/store/review-paywall.png`, если есть, иначе снимок с устройства в Sandbox |
| Review Notes | `Unlocks daily features for the whole family (all parents and children). Restore Purchases is on the paywall and in Settings → Subscription.` |

**RevenueCat:**

- продукт `kz.uroki.app.monthly` (App Store) и такой же Product ID в Google Play;
- entitlement `pro`, offering `default` с пакетом Monthly.

Код берёт продукт из offering (`src/lib/billing.ts`), поэтому Product ID в приложении не зашит.

> В `docs/STORE.md` раньше предлагался `uroki_monthly`. Используйте один ID в обоих магазинах и в RevenueCat —
> лучше новый `kz.uroki.app.monthly`. Старый нигде не создан.

Перед отправкой на проверку:

- на сервере включено `app_secrets.app_billing_enabled = '1'`;
- в RevenueCat загружен App Store Connect API key (In-App Purchase Key);
- подписка в статусе «Ready to Submit» прикреплена к версии 1.0 (раздел «In-App Purchases and Subscriptions» на
  странице версии). Первая подписка проверяется **только вместе со сборкой**.

### 1.10. Демо-аккаунт для проверки

У приложения нет логина и пароля: устройство входит в семью по одноразовому коду (действует 48 часов, работает один раз).
Поэтому в App Store Connect → App Review Information:

- **Sign-in required:** **No.** Проверяющий может сам создать семью кнопкой «Я родитель — начать».
- Готовая семья — в заметках (ниже).

**Как подготовить демо-семью** (владелец, за 1–2 дня до отправки):

1. На любом телефоне: «Я родитель — начать», семья «Demo», ученица «Алия».
   - Добавьте 4–5 уроков в расписание и 2 дела.
   - Отметьте пару заданий с телефона ребёнка, чтобы были история и фото.
2. Бесплатный доступ навсегда:
   - `POST https://api.urokiapp.kz/functions/v1/app/admin/grant`;
   - заголовок `x-admin-key: <app_admin_key>`;
   - тело `{"code":"<код семьи>"}`.
   Тогда проверке не мешает оплата. Сама подписка проверяется в Sandbox отдельной новой семьёй.
3. Настройки → «Пригласить второго родителя» → код → это `DEMO_PARENT_CODE`.
   Настройки → «Пригласить ученика» → код → `DEMO_CHILD_CODE`. Сделайте по 3 кода каждого вида:
   - коды одноразовые;
   - проверяющие часто ставят приложение несколько раз.
4. Коды живут 48 часов. Если проверка затянулась, обновите их в Notes или ответьте на запрос Apple новыми кодами.

### 1.11. App Review Notes (вставить в «Notes», английский)

```text
Контроль ДЗ (Kontrol DZ) is a family app for homework. It has two roles on two devices:

• PARENT: creates the family, sets the timetable, homework and to-dos, approves skipped tasks, sees photos, reports and the calendar, sets screen-time rules and pays for the subscription.
• CHILD: sees today's tasks, checks them off, takes photos of the finished work with the in-app camera, records voice notes and chats with the parent about a task.

There is no username/password. A device joins a family with a one-time invite code (valid 48 hours) that a parent creates in Settings. To review both roles you need two devices (or a device and a simulator).

DEMO FAMILY (full access, no payment needed):
1. Device A — parent: on the first screen tap "У меня есть код" (I have a code) and enter one of the parent codes: DEMO_PARENT_CODE_1, DEMO_PARENT_CODE_2, DEMO_PARENT_CODE_3
2. Device B — child: tap "У меня есть код" and enter one of the student codes: DEMO_CHILD_CODE_1, DEMO_CHILD_CODE_2, DEMO_CHILD_CODE_3
Each code works once. If the codes have expired, please write to us in Resolution Center and we will send new ones within a few hours, or create a new family yourself: "Я родитель — начать" (I'm a parent — start) on device A, then Settings → "Пригласить ученика" (Invite student) shows a code for device B.
The language can be switched to English in Settings → Language.

SUBSCRIPTION: a new family can open the paywall from Settings → Subscription → Subscribe. It shows the price, the 7-day free trial, auto-renewal terms, Restore Purchases and links to the Terms of Use and Privacy Policy. Use a Sandbox account to test. The demo family above has free access granted by us, so the paywall does not appear there.

SCREEN TIME: the parental-control rules (Settings → "Экранное время и учебники" / Screen time) are applied on the CHILD's iPhone through Apple's Screen Time API (FamilyControls with .child authorization). This requires the child's Apple ID to be a child member of the parent's Family Sharing group; the parent approves the authorization with their Apple ID on the child's device. Without Family Sharing the app shows the rules but cannot apply them. Calls and messages are never blocked, and the child always sees that control is on.

USER CONTENT: photos, voice notes and the task chat are visible only inside one family. Members join only with a one-time code from a parent's phone; there is no search, no public profiles and no contact with strangers. Parents can disconnect any device and delete the family with all data (Settings → "Удалить семью и все данные").

Support: urokikazakhstan@gmail.com
Operator: IE "KonG Service", Almaty, Kazakhstan
```

> Абзац SCREEN TIME оставьте, только если сборка с iOS-экранным временем (Family Controls Distribution одобрен
> Apple). Без него замените абзац на:
> `SCREEN TIME rules are applied on Android devices only in this version; on iPhone the screen shows the rules for information.`

**Contact information:** имя и телефон владельца, email urokikazakhstan@gmail.com.

---

## 2. Google Play Console

### 2.1. Главная страница магазина (Main store listing)

Языки: **ru-RU** по умолчанию, **kk** (Kazakh), **en-US**.

#### Русский (ru-RU)

**App name** — 28/30
```text
Контроль ДЗ: уроки и телефон
```

**Short description** — 77/80
```text
Домашка и дела ребёнка с фото, напоминания и экранное время. 7 дней бесплатно
```

**Full description** — 2726/4000
```text
«Контроль ДЗ» — семейное приложение для школьной домашки и родительского контроля экранного времени. Родитель ставит ребёнку уроки и дела на день, ребёнок отмечает выполненное и фотографирует тетрадь, родитель видит прогресс и одобряет.

КАК ЭТО РАБОТАЕТ
• Родитель задаёт расписание уроков, задания по предметам и дела по дому: собрать портфель, форма на физкультуру, почитать 20 минут.
• Ребёнок на своём телефоне отмечает задания и прикладывает фото сделанной работы — камерой прямо в приложении.
• Родитель видит, что сделано и когда, смотрит фото, одобряет или просит переделать. Пропустить задание можно только с одобрения родителя.
• Напоминания: ребёнку — заранее, родителю — если задание не сделано к сроку. Тихие часы.

РОДИТЕЛЬСКИЙ КОНТРОЛЬ ЭКРАННОГО ВРЕМЕНИ (Android)
Родитель на своём телефоне настраивает правила для телефона ребёнка:
• лимит на день и на отдельные приложения;
• время сна и школьные часы — открыты только разрешённые приложения;
• «Сначала уроки»: вечером перед учебным днём игры закрыты, пока не сделаны обязательные задания;
• новые приложения — только с разрешения родителя;
• «Дать ещё время» одной кнопкой.

Это открытый родительский контроль, не скрытая слежка:
• ребёнок сам включает контроль на своём телефоне, видит, какие разрешения нужны и зачем;
• пока контроль работает, в шторке всегда есть уведомление «родительский контроль включён»;
• приложение не прячет свою иконку и удаляется обычным способом — родитель увидит «Защита выключена»;
• родитель видит список приложений и минуты в них, но не переписку, не историю браузера и не содержимое приложений; местоположение не отслеживается;
• звонки, сообщения и экстренные вызовы работают всегда.
Для работы на телефоне ребёнка нужны доступ к статистике использования (чтобы считать минуты в приложениях) и разрешение «Поверх других приложений» (чтобы показать экран «Время вышло»).

ЕЩЁ
• Чат прямо у задания и голосовые заметки от ребёнка.
• Календарь месяца и отчёт за неделю, серии и звёзды за старание.
• Учебники: ссылки на электронные учебники и свои PDF.
• Второй родитель и репетитор подключаются по коду или QR-коду. Репетитору можно дать режим «только просмотр».
• Виджет «Завтра» на главном экране.
• Русский, қазақша, English. Светлая и тёмная тема.

ПОДПИСКА
Одна подписка на всю семью: все дети и оба родителя. 2990 ₸ в месяц, первые 7 дней бесплатно (один раз на аккаунт Google). Подписка продлевается автоматически; отменить её можно в Google Play → Платежи и подписки. Настроить семью можно и без подписки.

Без рекламы и сторонних трекеров. Удалить семью и все данные можно в настройках приложения или по ссылке https://urokiapp.kz/delete-account

Поддержка: urokikazakhstan@gmail.com · https://urokiapp.kz/support
```

#### Қазақша (kk)

**App name** — 30/30
```text
Контроль ДЗ: сабақ пен телефон
```

**Short description** — 78/80
```text
Баланың үй тапсырмасы мен істері фотомен, еске салу, экран уақыты. 7 күн тегін
```

**Full description** — 2893/4000
```text
«Контроль ДЗ» — мектеп үй тапсырмасына және экран уақытын ата-аналық бақылауға арналған отбасылық қосымша. Ата-ана балаға күнге арналған сабақ пен істерді береді, бала орындағанын белгілеп, дәптерін суретке түсіреді, ата-ана прогресті көріп, мақұлдайды.

ҚАЛАЙ ЖҰМЫС ІСТЕЙДІ
• Ата-ана сабақ кестесін, пәндер бойынша тапсырмаларды және үй істерін береді: портфельді жинау, дене шынықтыру формасы, 20 минут кітап оқу.
• Бала өз телефонында тапсырмаларды белгілеп, орындалған жұмыстың фотосын тіркейді — тікелей қосымшадағы камерамен.
• Ата-ана не және қашан орындалғанын көреді, фотоларды қарайды, мақұлдайды немесе қайта істеуді сұрайды. Тапсырманы тек ата-ана рұқсатымен өткізіп жіберуге болады.
• Еске салғыштар: балаға — алдын ала, ата-анаға — тапсырма уақытында орындалмаса. Тыныш сағаттар.

ЭКРАН УАҚЫТЫН АТА-АНАЛЫҚ БАҚЫЛАУ (Android)
Ата-ана өз телефонында бала телефонына ережелер орнатады:
• күндік лимит және жеке қолданбаларға лимит;
• ұйқы уақыты мен мектеп сағаттары — тек рұқсат етілген қолданбалар ашық;
• «Алдымен сабақ»: оқу күнінің алдындағы кеште міндетті тапсырмалар орындалмайынша ойындар жабық;
• жаңа қолданбалар — тек ата-ана рұқсатымен;
• «Тағы уақыт беру» — бір батырмамен.

Бұл жасырын бақылау емес, ашық ата-аналық бақылау:
• бақылауды бала өз телефонында өзі қосады, қандай рұқсат не үшін керек екенін көреді;
• бақылау жұмыс істеп тұрғанда хабарландыру тақтасында әрқашан «ата-аналық бақылау қосулы» хабарландыруы тұрады;
• қосымша белгішесін жасырмайды және әдеттегідей жойылады — ата-ана «Қорғау өшірулі» дегенді көреді;
• ата-ана қолданбалар тізімі мен ондағы минуттарды көреді, бірақ хат-хабарды, браузер тарихын және қолданбалардың мазмұнын көрмейді; орналасқан жер бақыланбайды;
• қоңыраулар, хабарламалар және шұғыл қоңыраулар әрқашан жұмыс істейді.
Бала телефонында жұмыс істеу үшін пайдалану статистикасына қолжетімділік (қолданбалардағы минуттарды санау үшін) және «Басқа қолданбалардың үстінен» рұқсаты («Уақыт бітті» экранын көрсету үшін) керек.

ТАҒЫ
• Тапсырманың жанындағы чат және баланың дауыстық жазбалары.
• Ай күнтізбесі және апталық есеп, ынта үшін серия мен жұлдыздар.
• Оқулықтар: электрондық оқулықтарға сілтемелер және өз PDF-тарыңыз.
• Екінші ата-ана мен репетитор кодпен не QR-кодпен қосылады. Репетиторға «тек қарау» режимін беруге болады.
• Басты экрандағы «Ертең» виджеті.
• Русский, қазақша, English. Ашық және қараңғы тақырып.

ЖАЗЫЛЫМ
Бүкіл отбасыға бір жазылым: барлық балалар және екі ата-ана. Айына 2990 ₸, алғашқы 7 күн тегін (Google аккаунтына бір рет). Жазылым автоматты түрде ұзартылады; оны Google Play → Төлемдер мен жазылымдар бөлімінде тоқтатуға болады. Отбасын жазылымсыз да баптауға болады.

Жарнамасыз, бөгде трекерлерсіз. Отбасын және барлық деректерді қосымша баптауларында немесе https://urokiapp.kz/kk/delete-account сілтемесі арқылы жоюға болады.

Қолдау: urokikazakhstan@gmail.com · https://urokiapp.kz/kk/support
```

#### English (en-US)

**App name** — 30/30
```text
Контроль ДЗ: Homework & Screen
```

**Short description** — 77/80
```text
Kids' homework and chores with photos, reminders and screen time. 7 days free
```

**Full description** — 2749/4000
```text
Контроль ДЗ (Kontrol DZ) is a family app for school homework and parental control of screen time. The parent sets the child's homework and to-dos for the day, the child checks them off and photographs the exercise book, and the parent sees the progress and approves.

HOW IT WORKS
• The parent sets the class timetable, homework per subject and chores: pack the school bag, PE kit, read for 20 minutes.
• On their own phone the child checks tasks off and attaches a photo of the finished work, taken with the in-app camera.
• The parent sees what was done and when, looks at the photos, approves or asks for a redo. A task can be skipped only with a parent's approval.
• Reminders: for the child ahead of time, for the parent if a task isn't done on time. Quiet hours.

PARENTAL CONTROL OF SCREEN TIME (Android)
On their own phone the parent sets rules for the child's phone:
• a daily limit and limits for individual apps;
• bedtime and school hours — only allowed apps are open;
• "Homework first": on the evening before a school day games stay locked until the required tasks are done;
• new apps only with a parent's approval;
• "Give more time" with one tap.

This is open parental control, not hidden monitoring:
• the child turns control on on their own phone and sees which permissions are needed and why;
• while control is running, a notification "parental control is on" is always shown;
• the app never hides its icon and can be uninstalled normally — the parent then sees "Protection is off";
• the parent sees the list of apps and the minutes spent in them, but not messages, browsing history or app content; location is not tracked;
• calls, messages and emergency calls always work.
On the child's phone the app needs Usage access (to count minutes in apps) and "Display over other apps" (to show the "Time is up" screen).

ALSO
• A chat right on each task and voice notes from the child.
• A month calendar and a weekly report, streaks and stars for effort.
• Textbooks: links to e-textbooks and your own PDFs.
• A second parent and a tutor join with a code or QR code. A tutor can get view-only access.
• A "Tomorrow" home-screen widget.
• Russian, Kazakh and English. Light and dark theme.

SUBSCRIPTION
One subscription for the whole family: all children and both parents. 2990 ₸ a month (or the equivalent in your currency), the first 7 days free (once per Google account). The subscription renews automatically; cancel it any time in Google Play → Payments & subscriptions. You can set up the family without a subscription.

No ads, no third-party trackers. Delete the family and all its data in the app's settings or at https://urokiapp.kz/en/delete-account

Support: urokikazakhstan@gmail.com · https://urokiapp.kz/en/support
```

### 2.2. Настройки приложения (Store settings) и контакты

| Поле | Значение |
|---|---|
| App or game | App |
| Free or paid | Free (с подпиской внутри) |
| Category | **Education** |
| Tags | Education, Parenting, Productivity, Family (до 5 из списка Play) |
| Email | urokikazakhstan@gmail.com |
| Website | https://urokiapp.kz |
| Phone | по желанию |
| Privacy policy | https://urokiapp.kz/privacy |

### 2.3. App content (Политика → Содержание приложения)

**Privacy policy:** `https://urokiapp.kz/privacy`.

**Ads:** No, my app does not contain ads.

**App access:** «All or some functionality is restricted». Добавьте инструкцию (английский) для двух ролей:

- Name: `Parent and child (demo family)`;
- Username / Password: пусто;
- Any other information:

```text
No username/password: a device joins a family with a one-time invite code (48 h).
Parent device: first screen → "У меня есть код" (I have a code) → DEMO_PARENT_CODE_1 (spare: DEMO_PARENT_CODE_2, DEMO_PARENT_CODE_3).
Child device: "У меня есть код" → DEMO_CHILD_CODE_1 (spare: DEMO_CHILD_CODE_2, DEMO_CHILD_CODE_3).
The demo family has free access, no payment needed. You can also create a new family: "Я родитель — начать", then Settings → "Пригласить ученика" shows a code for the second device.
Screen time (parental control) runs on the CHILD's Android device: Parent → Settings → "Экранное время и учебники" → turn on and set a limit; Child device → open the app → grant Usage access and "Display over other apps" → "Включить контроль". A persistent notification shows while control is on. Language: Settings → Language → English.
```

**Content rating (IARC):**

- Category: **«All other app types»** (не игра; утилита, образование, общение).
- Email: urokikazakhstan@gmail.com.

| Вопрос | Ответ |
|---|---|
| Violence, blood, fear, sexuality, profanity, crude humour, drugs, alcohol, tobacco | No на все |
| Gambling / simulated gambling | No |
| Does the app allow users to interact or exchange content with each other? | **Yes**. Чат и фото, только внутри семьи; модерация не нужна, участников приглашает родитель |
| Does the app share the user's current physical location with other users? | **No** |
| Does the app allow users to purchase digital goods? | **Yes** (подписка) |
| Does the app contain unrestricted internet access / web browser? | **No** (учебники открываются во встроенном просмотрщике, только сайт ссылки) |
| Is the app a news / social media app? | No |
| Contains Russian-Federation-specific / content restricted by law? | No |

Ожидаемый результат: **PEGI 3 / ESRB Everyone / IARC 3+**, пометки «Users Interact», «In-App Purchases».

**Target audience and content:**

- Target age groups: **только «18 and over».**
- Appeals to children: **No** («Unintentionally appealing»: No).
- Store listing for children: не использовать.

Почему 18+ (текст можно вставить, если Play спросит):

```text
The app is a parenting tool. Only an adult parent can create a family, set rules and buy the subscription; a child's device can only join a family with a one-time code created on the parent's phone, and the child cannot install or use the app independently. The store listing, screenshots and description address parents. Children use a companion mode set up and supervised by their parent, under the parent's consent (see the privacy policy). The app contains no ads, no third-party analytics and no advertising IDs.
```

**Риск и запасной путь.** Play может решить, что детский режим (серии, звёзды, конфетти) «привлекателен для детей», и
потребовать Families policy. Это бывает у приложений с родительским контролем. Тогда:

- добавьте группы «9–12» и «13–15» вместе с 18+;
- примите Families policy.

Мы её уже соблюдаем:

- рекламы нет, рекламного ID нет;
- сторонних SDK, кроме RevenueCat и Expo push, нет (RevenueCat есть в Families Self-Certified SDK list);
- покупка только на телефоне родителя.

Дополнительно понадобятся:

- декларация «Teacher Approved» не нужна;
- нужна отметка, что приложение соответствует COPPA/GDPR-K.

**News app:** No. **COVID-19:** No. **Government app:** No. **Financial features:** «My app doesn't provide any
financial features». **Health:** No health features.

**Data safety.** Ответы ниже.

### 2.4. Data safety

Общие вопросы:

| Вопрос | Ответ |
|---|---|
| Does your app collect or share any of the required user data types? | **Yes** |
| Is all of the user data collected by your app encrypted in transit? | **Yes** (только HTTPS) |
| Which of the following methods of account creation does your app support? | **«Other»**: аккаунт семьи создаётся в приложении без логина; устройства входят по одноразовому коду |
| Do you provide a way for users to request that their data is deleted? | **Yes**. URL: `https://urokiapp.kz/delete-account` |
| Data shared with third parties | **No** на всё. RevenueCat, Expo и Telegram — обработчики, действуют от нашего имени; по определению Play это не «sharing» |

Собираемые данные. Для каждой строки:

- **Collected:** Yes.
- **Shared:** No.
- **Processed ephemerally:** No, кроме отмеченного.

| Категория → тип | Обязательно / по выбору | Цели (Purposes) | Что это |
|---|---|---|---|
| Personal info → **Name** | Required | App functionality, Account management | имена детей и участников семьи |
| Personal info → **User IDs** | Required | App functionality, Account management, Fraud prevention, security and compliance | ID семьи и устройства, chat id Telegram (если подключён) |
| Financial info → **Purchase history** | Optional | App functionality | статус и срок подписки из Google Play через RevenueCat |
| Photos and videos → **Photos** | Optional | App functionality | фото выполненных заданий |
| Audio → **Voice or sound recordings** | Optional | App functionality | голосовые заметки ребёнка |
| Messages → **Other in-app messages** | Optional | App functionality | чат у задания между участниками семьи |
| App activity → **Installed apps** | Optional | App functionality | список запускаемых приложений на телефоне ребёнка (только если включено экранное время), чтобы родитель задал лимиты и одобрил новые |
| App activity → **Other user-generated content** | Required | App functionality | расписание, задания, заметки, комментарии, ссылки на учебники |
| App activity → **Other actions** | Optional | App functionality | минуты в каждом приложении за день на телефоне ребёнка (экранное время) |
| App info and performance | — | — | **не собираем** (нет crash-логов и диагностики) |
| Device or other IDs → **Device or other IDs** | Required | App functionality | push-токен для уведомлений, случайный токен устройства |

**Не отмечать:**

- Location, Contacts, Calendar, Files and docs: PDF-учебники остаются на телефоне и на сервер не попадают.
- Web browsing, Health and fitness, Emails, SMS.
- Race/ethnicity, political, religious, sexual orientation.

**IP-адрес** используется только для ограничения частоты запросов и хранится считанные минуты. Если Play
спросит, это «processed ephemerally».

> ⚠️ Политика конфиденциальности (`supabase/functions/app/legal.ts`) пока **не упоминает экранное время** (список
> приложений и минуты с телефона ребёнка). Ещё в ней написано «серверы Supabase в ЕС», а сервер теперь в Алматы
> (`api.urokiapp.kz`). Google сверяет Data safety с политикой: до отправки на проверку политику нужно дополнить и
> поднять `LEGAL_VERSION`.

### 2.5. Декларации разрешений Android

Полный список из `app.json` и `modules/*/AndroidManifest.xml` (плюс библиотеки Expo):

| Разрешение | Откуда | Нужна декларация в Play Console? |
|---|---|---|
| `CAMERA` | expo-camera | нет (runtime) |
| `RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS` | expo-audio | нет (runtime) |
| `POST_NOTIFICATIONS` | expo-notifications | нет (runtime) |
| `SCHEDULE_EXACT_ALARM` | app.json, `modules/exact-alarm` | **нет**: декларация нужна только для `USE_EXACT_ALARM`, мы его не используем; на Android 14+ пользователь даёт «Будильники и напоминания» сам |
| `RECEIVE_BOOT_COMPLETED` | screen-guard, expo-notifications | нет |
| `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_SPECIAL_USE` | screen-guard (`GuardService`, `foregroundServiceType="specialUse"`) | **да**: App content → Foreground service permissions |
| `PACKAGE_USAGE_STATS` | screen-guard | отдельной формы нет; спецдоступ, его даёт пользователь в настройках. Play проверяет по политике User Data (prominent disclosure) и Stalkerware |
| `SYSTEM_ALERT_WINDOW` | screen-guard | отдельной формы нет; спецдоступ. Проверяется по политике; объяснение — в описании и на экране настройки |
| meta-data `isMonitoringTool=child_monitoring` | screen-guard | формы нет; обязателен для приложений родительского контроля по политике Stalkerware |
| `<queries>` LAUNCHER/HOME (не `QUERY_ALL_PACKAGES`) | screen-guard | **нет** (декларация нужна только для `QUERY_ALL_PACKAGES`) |
| `INTERNET`, `ACCESS_NETWORK_STATE`, `VIBRATE`, `WAKE_LOCK` и т. п. | Expo | нет |

Accessibility Service, Device Admin, VPN, `REQUEST_INSTALL_PACKAGES`, `MANAGE_EXTERNAL_STORAGE`, SMS/Call log и
местоположение **не используются**. Это сильно упрощает проверку.

#### Foreground service (Special use)

Play Console → App content → **Foreground service permissions** → отметить **Special use**:

- **Description of the special use / user-facing feature:**

```text
Parental control (screen time) on a child's device, set up by a parent. The foreground service GuardService checks which app is in the foreground about once a second, counts the minutes spent in each app (UsageStatsManager) and, when the parent's rules say an app is not allowed now (daily or per-app limit reached, bedtime, school hours, homework not done, new app not yet approved), shows a full-screen "Time is up" screen with buttons "Open Контроль ДЗ" and "Home". It must keep running while the app is closed, otherwise the limits would not be enforced. The child turns it on in the app after granting Usage access and "Display over other apps"; a persistent notification "parental control is on" is visible for the whole time the service runs, and the parent sees in their app when it is off.
```

- **Why other service types / APIs are not suitable:**

```text
No other foreground service type covers continuous enforcement of parental screen-time rules: it is not media playback, location, data sync, health, connected device or phone call. WorkManager / JobScheduler run at most every 15 minutes and are deferred by the system, so a limit could be exceeded by many minutes and a blocked app could stay open; the rules must be checked within about a second of the child switching apps. The service does no network work other than refreshing the parent's rules and reporting daily minutes.
```

- **Impact if deferred or interrupted:** «The child's phone stops enforcing the parent's limits; the parent sees "Protection is off"».
- **Video link:** см. «Видео для Google» ниже.

Подтип в манифесте уже задан:

```text
PROPERTY_SPECIAL_USE_FGS_SUBTYPE = "Parental control set up by a parent: shows a block screen when the parent's screen-time rules say an app is not allowed now"
```

#### Usage access (`PACKAGE_USAGE_STATS`): текст для проверки / «Permissions declaration», если попросят

```text
Used only on the child's device, only after the child (with the parent) turns on parental control in the app, to read which app is in the foreground and how many minutes each app was used today. This is required to enforce the daily and per-app time limits that the parent set and to show the parent the list of apps and minutes. We do not read app content, messages, notifications or browsing history. The data (package names, app names, minutes per day) is sent only to the family's own parent devices via our server and is deleted with the child or the family.
```

#### Display over other apps (`SYSTEM_ALERT_WINDOW`)

```text
Used only on the child's device while parental control is on, so that the full-screen "Time is up" block screen can be shown on top of an app that the parent's rules do not allow right now (Android does not let a background service start an activity without this permission). The block screen always offers "Open Контроль ДЗ" and "Home"; calls, messages and emergency calls are never blocked.
```

#### Stalkerware / `isMonitoringTool`

Требования политики Google Play «Stalkerware»:

| Требование | Как выполнено |
|---|---|
| Приложение не скрывает себя и иконку | иконка в лаунчере всегда, обычное удаление |
| Постоянное уведомление во время мониторинга, с понятным текстом | `GuardService` всегда показывает «Уроки: родительский контроль включён» |
| В описании магазина прямо сказано, что это родительский контроль / мониторинг | раздел «Родительский контроль экранного времени» в полном описании (выше) |
| Только для родителей / законных представителей | семью создаёт взрослый родитель, ребёнок подключается кодом с телефона родителя; условия: родитель подтверждает, что он законный представитель |
| Флаг `isMonitoringTool` в манифесте | `child_monitoring` в `modules/screen-guard/android/src/main/AndroidManifest.xml` |
| Нет сбора переписки, звонков, местоположения, фото с устройства | собираются только имена пакетов и минуты; фото — только снятые камерой внутри приложения для заданий |
| Нет обхода системы: не мешаем удалить, нет Device Admin | так и есть |

> Перед загрузкой сборки проверьте, что текст уведомления после переименования говорит «Контроль ДЗ: родительский
> контроль включён» (`modules/screen-guard`, строки уведомления), чтобы совпадал с названием в магазине.

#### Видео для Google

Одно видео на YouTube (доступ по ссылке), 1–3 минуты, запись экрана **телефона ребёнка** и, при необходимости, телефона
родителя. Ссылку вставить в декларацию Foreground service. Её же присылать, если проверка спросит про Usage access,
overlay или Stalkerware.

1. Телефон родителя: Настройки → «Экранное время и учебники» → включить, лимит на день 30 мин, лимит на YouTube 1 мин,
   «Сначала уроки» включено.
2. Телефон ребёнка: открыть приложение.
   - Экран настройки контроля с объяснением.
   - «Доступ к статистике»: системные настройки, включить.
   - «Поверх других приложений»: включить.
   - «Включить контроль».
3. Показать шторку: постоянное уведомление «…родительский контроль включён».
4. Открыть YouTube.
   - Через минуту появляется экран «Время вышло» с причиной и кнопками «Открыть …» / «Домой».
   - Нажать «Домой».
5. Позвонить или открыть «Сообщения»: работают.
6. Закрыть приложение из «Недавних», открыть YouTube снова: блок срабатывает (сервис работает в фоне).
7. Телефон родителя: «Дать ещё время 15 мин» → на телефоне ребёнка YouTube открывается.
8. (Желательно) показать, что выключение доступа к статистике на телефоне ребёнка даёт у родителя «Защита выключена».

Подписи на видео — на английском (или английские субтитры).

#### Точные будильники (`SCHEDULE_EXACT_ALARM`)

Декларация не нужна. Если Play всё же спросит в Policy status, ответ:

```text
Exact alarms are used for homework reminders at the time the parent chose (e.g. 16:00, 18:30) and before the parent's deadline; the user grants "Alarms & reminders" in the app, and without it reminders fall back to inexact scheduling.
```

### 2.6. Удаление аккаунта

App content → **Data deletion**:

- Delete account URL: `https://urokiapp.kz/delete-account`.
- «Do you provide a way for users to request that some or all of their data is deleted without deleting their
  account?» → **Yes**: удаление ученика, отключение устройства, автоудаление фото через 7–40 дней. Всё описано на той же
  странице.

### 2.7. Закрытое тестирование (личный аккаунт разработчика)

Для личных аккаунтов Play Console, созданных после ноября 2023 года, доступ к Production открывается после закрытого
теста. Условие: **не меньше 12 тестировщиков, подписанных на тест 14 дней подряд**. Затем отвечают на анкету о
тестировании и подают заявку на Production.

1. **Testing → Closed testing → Create track** («Семьи-тестеры»).
   - Страны: Kazakhstan (+ где живут тестеры).
   - Загрузить AAB из CI (`Uroki.aab`, подписан upload-ключом).
2. **Testers → Google Groups.** Создайте группу `kontrol-dz-testers@googlegroups.com` (можно и списком email, но группой
   проще добавлять). Добавьте **15–20 человек**, а не 12: кто-то выпадет, а счётчик 14 дней требует 12
   *непрерывно* подписанных.
3. **Кого звать:** родители из знакомых, одноклассников детей, родительского чата школы. Лучше семьи, где у ребёнка
   Android, — так проверите экранное время. Каждому тестеру нужен **аккаунт Google на Android-телефоне**.
4. **Приглашение (текст):**
   ```text
   Здравствуйте! Мы запускаем «Контроль ДЗ» — приложение, где родитель ставит ребёнку уроки и дела, а ребёнок отмечает их с фото. Помогите протестировать 2 недели, это бесплатно.
   1) Откройте ссылку с телефона Android под своим аккаунтом Google и нажмите «Стать тестировщиком»: <ссылка opt-in из Play Console>
   2) Установите приложение по ссылке Google Play оттуда же.
   3) Пожалуйста, НЕ удаляйте приложение и не выходите из теста 14 дней. Открывайте его хотя бы раз в пару дней.
   Вопросы и замечания: urokikazakhstan@gmail.com. Спасибо!
   ```
5. Для теста выдайте бесплатный доступ: `/admin/grant` на код семьи каждого тестера. Можно и Play «License testing»:
   тестовые покупки без списаний (Setup → License testing → добавить те же email).
6. **Каждые 2–3 дня** выпускайте небольшое обновление в закрытый трек. Google смотрит на активность теста, а не только
   на число людей. Собирайте отзывы: Play Console → Testing → Feedback, письма.
7. Через **14 полных дней** после того, как подписались 12-й тестер: Dashboard → «Apply for production».
   - Ответить на анкету: как набирали тестеров, что исправили по отзывам, почему готово.
   - Проверка заявки — до 7 дней.

---

## 3. Скриншоты

### 3.1. Какие экраны и подписи (ru)

Подпись — крупно над телефоном, фон «бумага» с линейкой, телефон в рамке. Порядок важен: первые 3 видны в поиске.

| # | Экран (роль) | Подпись (заголовок) | Подзаголовок |
|---|---|---|---|
| 1 | «Сегодня» у родителя: прогресс 2/7, «Ждут ответа», фото | **Домашка под контролем** | Что сделано, когда и с фото |
| 2 | Экран ребёнка: кольцо прогресса, задания, «Следующий шаг» | **Ребёнок видит, что осталось** | Отмечает задания и фотографирует тетрадь |
| 3 | Экранное время у родителя: лимит на день, сон, «Сначала уроки» | **Игры — после уроков** | Лимиты, сон и школа на телефоне ребёнка |
| 4 | Карточки «Просит пропустить» и сданное задание с «Принять / Переснять» | **Пропуск — только с вашего «да»** | Принимайте работу или просите переснять |
| 5 | Календарь месяца с цветами | **Весь месяц на одном экране** | Вовремя, с опозданием, не сделано |
| 6 | Чат у задания | **Вопрос по задаче — прямо в задании** | Чат и голосовые заметки |
| 7 | Расписание уроков | **Расписание за пару минут** | Уроки, дела по дому и напоминания |
| 8 | Приглашение по QR-коду | **Вся семья по QR-коду** | Второй родитель, ребёнок, репетитор |

Подписи лежат и в `docs/store/captions.json`. Для kk/en переведите их по смыслу. Сейчас готовые картинки есть только на русском.

### 3.2. Размеры

| Магазин | Устройство | Размер (портрет) | Сколько |
|---|---|---|---|
| App Store | iPhone 6.9" (обязателен) | **1320 × 2868** (или 1290 × 2796) | 3–10 |
| App Store | iPhone 6.5" (если 6.9" нет — обязателен; лучше дать оба) | **1284 × 2778** (или 1242 × 2688) | 3–10 |
| App Store | iPad 13" (обязателен, пока `ios.supportsTablet = true`) | **2064 × 2752** (или 2048 × 2732) | 3–10 |
| Google Play | Телефон | **1080 × 1920** и больше, соотношение до 9:16, сторона 320–3840 px, PNG/JPEG без прозрачности | 2–8 (для рекомендаций — от 4 при ≥ 1080 px) |
| Google Play | Планшет 7" / 10" | по желанию; 1200 × 1920 / 1600 × 2560 | — |
| Google Play | **Feature graphic** | **1024 × 500**, PNG/JPEG без прозрачности | 1 |
| Google Play | **Иконка** | **512 × 512**, PNG 32-bit, ≤ 1 МБ | 1 |
| App Store | Иконка | берётся из сборки (1024 × 1024 без прозрачности) | — |

Скриншоты App Store без прозрачности, RGB. Статус-бар показывает время 9:41 и полную батарею. Без реальных имён
и телефонов: в макетах вымышленные «Алия», «Айгерим», «Тимур».

### 3.3. Готовые файлы (`docs/store/`)

Сгенерированы из веб-сборки приложения (коммит `HEAD` на 27.10.2026) с подставными данными. Сервер не нужен:
API подменяется в браузере. Имена вымышленные.

| Папка | Размер | Куда |
|---|---|---|
| `appstore-iphone-6.9/1…8.png` | 1320 × 2868 | App Store → iPhone 6.9" |
| `appstore-iphone-6.5/1…8.png` | 1284 × 2778 | App Store → iPhone 6.5" |
| `appstore-ipad-13/1…8.png` | 2064 × 2752 | App Store → iPad 13" |
| `play-phone/1…8.png` | 1080 × 1920 | Google Play → Phone screenshots |
| `play/feature-graphic-1024x500.png` | 1024 × 500 | Google Play → Feature graphic |
| `play/icon-512.png` | 512 × 512 | Google Play → App icon (из `assets/images/icon.png`) |

Все файлы — PNG без прозрачности (RGB).

Строка состояния (9:41) нарисована в рамке. Внутри экранов текст берётся из сборки как есть. После
переименования приложения и правок интерфейса картинки стоит пересобрать:

```bash
npx expo export --platform web --output-dir /tmp/webdist           # из чистой копии репозитория
node scripts/store-screens/serve.js /tmp/webdist &                  # http://localhost:8085
node scripts/store-screens/capture.js http://localhost:8085 /tmp/raw              # iPhone 430×932 @3x
node scripts/store-screens/capture.js http://localhost:8085 /tmp/raw-ipad 1024 1366 2
node scripts/store-screens/compose.js /tmp/raw /tmp/raw-ipad /tmp/store assets/images/icon.png
# затем PNG → RGB и в docs/store/ (compose пишет RGB-скриншоты Chromium)
```

Скрипты используют Playwright из `/opt/node22/lib/node_modules/playwright` (Chromium в
`PLAYWRIGHT_BROWSERS_PATH`) и шрифт Inter. Подписи меняются в `compose.js` (массив `shots`).
