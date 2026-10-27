# Apple: настройка для iPhone (TestFlight и «Экранное время»)

Инструкция для владельца аккаунта Apple Developer (Individual). Шаги, отмеченные «✅ уже сделано», вы прошли;
они оставлены для справки, если что-то придётся повторить.

Что нужно в итоге:
- GitHub сам собирает подписанное приложение и загружает его в TestFlight;
- после одобрения Apple в приложении включается «Экранное время» на iPhone ребёнка.

> Team ID (10 символов) в репозиторий не записываем. Он хранится только в секрете GitHub `APPLE_TEAM_ID`.

---

## 1. Ключ App Store Connect API и секреты GitHub ✅ уже сделано (секреты добавляются)

1. Откройте https://appstoreconnect.apple.com → **Users and Access** (Пользователи и доступ).
2. Вкладка **Integrations** → слева **App Store Connect API** → **Team Keys**.
3. Нажмите **«+»** (Generate API Key):
   - имя: `GitHub CI`;
   - роль (Access): **Admin**.

   Роль Admin нужна, чтобы Xcode на сервере GitHub сам создавал сертификаты и профили.
4. **Download API Key**. Файл `AuthKey_XXXXXXXXXX.p8` скачивается **только один раз**: сохраните его в менеджер паролей.
5. На этой же странице:
   - **Issuer ID** — длинная строка над таблицей;
   - **Key ID** — 10 символов в строке ключа.

Team ID: https://developer.apple.com/account → **Membership details** → **Team ID**.

Теперь добавьте секреты в GitHub: репозиторий → **Settings** → **Secrets and variables** → **Actions** →
**New repository secret**. Четыре секрета:

| Имя | Что вставить |
|---|---|
| `ASC_KEY_ID` | Key ID |
| `ASC_ISSUER_ID` | Issuer ID |
| `ASC_KEY_P8` | всё содержимое файла `.p8` (откройте в Блокноте, Ctrl+A, Ctrl+C), вместе со строками `-----BEGIN PRIVATE KEY-----` и `-----END PRIVATE KEY-----` |
| `APPLE_TEAM_ID` | Team ID |

Когда все четыре заданы, каждая сборка (Actions → «Build APK + IPA») подписывается и уходит в TestFlight. Если не задан
ни один, собирается неподписанный IPA, как раньше. Если задана только часть, сборка iPhone остановится с подсказкой.

## 2. Идентификаторы (Identifiers)

Сайт: https://developer.apple.com/account → **Certificates, IDs & Profiles** → **Identifiers**.

### 2.1. Группа приложений (App Group)

1. **«+»** → **App Groups** → Continue.
2. Description: `Uroki group`, Identifier: `group.kz.uroki.app` → Continue → Register.

### 2.2. Приложение `kz.uroki.app` ✅ уже сделано

1. **«+»** → **App IDs** → **App** → Continue.
2. Description: `Uroki`, Bundle ID: **Explicit** → `kz.uroki.app`.
3. В Capabilities включите:
   - **Family Controls**;
   - **App Groups**;
   - **Push Notifications**.
4. Continue → Register.

Проверьте, что у App Groups выбрана группа: откройте App ID → у **App Groups** нажмите **Configure** → отметьте
`group.kz.uroki.app` → Save.

### 2.3. Три расширения «Экранного времени»

Повторите для каждого Bundle ID ниже: **«+»** → **App IDs** → **App** → Bundle ID **Explicit**. Включите
**Family Controls** и **App Groups**; в App Groups → **Configure** выберите `group.kz.uroki.app`.

| Description | Bundle ID |
|---|---|
| `Uroki Activity Monitor` | `kz.uroki.app.ActivityMonitorExtension` |
| `Uroki Shield Configuration` | `kz.uroki.app.ShieldConfiguration` |
| `Uroki Shield Action` | `kz.uroki.app.ShieldAction` |

Bundle ID нужно ввести **точно так**, с большими буквами: их создаёт библиотека, и другие не подойдут.

## 3. Приложение в App Store Connect ✅ уже сделано

https://appstoreconnect.apple.com → **Apps** (My Apps) → **«+»** → **New App**:
- Platforms: **iOS**;
- Name: **«Контроль ДЗ»** (имя «Уроки» занято). Под иконкой на телефоне пока остаётся «Уроки»; это имя не меняем;
- Primary Language: **Russian**;
- Bundle ID: `kz.uroki.app`;
- SKU: `uroki-ios`;
- User Access: Full Access.

## 4. Разрешение Family Controls (Distribution) ✅ запрос отправлен

Форма: https://developer.apple.com/contact/request/family-controls-distribution

- В форме только имя, e-mail, Team ID (подставляется сам) и согласие с условиями.
- Запрос подаётся **один раз на весь аккаунт разработчика**, не на каждый Bundle ID.
- Apple отвечает обычно за 1–4 недели, письмом.

**После одобрения** включите разрешение на всех четырёх App ID: `kz.uroki.app` и трёх расширениях из п. 2.3.
1. **Identifiers** → откройте App ID → вкладка **Additional Capabilities**.
2. Отметьте **Family Controls (Distribution)** → Save.

Без этого на любом из четырёх подписанная сборка не соберётся.

Если Apple попросит описать, как приложение использует Family Controls (письмом или в заметках для App Review),
вот готовый текст:

> «Контроль ДЗ» (on-device name «Уроки») is a parental-control app for families. A parent sets screen-time rules for
> their child: apps are shielded until the child has finished today's homework in the app, apps are shielded during
> bedtime and school hours, and a daily time limit applies to the apps the parent selects. The parent can grant bonus
> time and can prevent installing or deleting apps.
>
> The child's iPhone is a child account in the parent's Family Sharing group. The app calls
> AuthorizationCenter.requestAuthorization(for: .child), so the parent approves with their Apple ID. Apps are chosen
> with Apple's FamilyActivityPicker on the child's device.
>
> We use ManagedSettings for shields and app installation/removal restrictions, and DeviceActivity for schedules
> and limits. Shield screens come from a ShieldConfiguration extension. All Screen Time data (selected apps, tokens,
> usage) stays on the device and is never sent to our servers: the server only stores the parent's rules (times and
> minutes). There is no advertising and no tracking.

## 5. После одобрения

1. Включите Family Controls (Distribution) на четырёх App ID (п. 4).
2. Напишите Claude: «Apple одобрил Family Controls».
3. Claude поставит `iosScreenTime: true` в `app.json` и запушит.
4. Следующая сборка придёт в TestFlight уже с «Экранным временем».

Проверка на телефоне ребёнка:
1. Ребёнок в вашей «Семье».
2. Установите приложение через TestFlight и войдите как ребёнок.
3. На главном экране ребёнка пройдите шаги «Экранного времени»: разрешение (ваш Apple ID) и три списка приложений.
   В «Всегда разрешены» обязательно отметьте «Уроки».

## TestFlight: где смотреть сборки

App Store Connect → **Apps** → «Контроль ДЗ» → **TestFlight**. Сборка появляется через 5–30 минут после окончания
workflow (Apple её обрабатывает).
- Добавьте себя в **Internal Testing**: группа → «+» → тестировщик.
- Установите приложение TestFlight на iPhone.

Вопрос о шифровании Apple не задаст: в приложении уже указано, что нестандартного шифрования нет.

## Если что-то пошло не так

- **«Maximum number of certificates»**: Xcode в GitHub может создавать сертификаты «Apple Development».
  Certificates, IDs & Profiles → **Certificates** → удалите старые «Apple Development», созданные CI, и перезапустите
  сборку.
- **Ошибка про Family Controls или provisioning profile**: на каком-то из четырёх App ID не включено разрешение.
  - До одобрения Apple: так и должно быть, флаг `iosScreenTime` должен оставаться выключенным.
  - После одобрения: проверьте п. 4.
- **Сборка с этим номером уже есть**: номер сборки равен номеру запуска workflow. Просто запустите workflow ещё раз.
