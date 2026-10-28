# Передача работы в локальный чат (23.10.2026)

Это документ для следующей сессии Claude Code на компьютере владельца. Прочитай его целиком перед работой.

## Как начать локально

```powershell
git clone https://github.com/shalomsuchkam/school-app.git
cd school-app
npm ci
claude
```

Первое сообщение в новом чате: «Прочитай docs/HANDOFF.md, AGENTS.md и docs/SCREEN_TIME.md и продолжай с раздела
"Что делать дальше"».

## Проект

- **«Уроки»**: родитель задаёт ребёнку домашку и дела на день, ребёнок отмечает выполнение.
  - Экранное время: блокировка телефона за невыполнение, лимиты, сон и школа.
  - Учебники.
  - Чат, календарь, голосовые заметки.
- **Стек:** Expo SDK 57, RN 0.86, React 19.2 (React Compiler), Expo Router. Маршруты в `src/app/`.
- **Бэкенд:** одна Deno-функция `supabase/functions/app/` (index.ts, core.ts, lib.ts, screen.ts, invite.ts и др.).
  - Схема в `supabase/migrations/*.sql`: только таблицы `app_*`.
  - Тесты: `deno test -A supabase/functions/app/logic_test.ts`, 26 штук. Запускать с `DENO_NO_PACKAGE_JSON=1` из папки функции.
- **Дизайн «Тетрадь»:**
  - тёплая бумага, акцент `#2A4BB0`;
  - примитивы в `src/components/ui.tsx` и `src/components/ui/*`;
  - токены в `src/lib/theme.ts`.
- **Оператор:** ИП «KonG Service», ИИН/БИН 021018500443, Алматы, urokikazakhstan@gmail.com.
  - Подписка 2990 ₸/мес, 7 дней пробно. Скидок нет.

## Жёсткие правила владельца

- **Старую систему не трогать никак:**
  - таблицы без префикса `app_` в облачном Supabase;
  - функцию `hw` и cron `hw-tick`;
  - репозиторий amor, сайт на Netlify, бота @Izabel11_bot.
- Секреты не коммитить. Бесплатный доступ выдаёт только владелец.
- Пушить в `main` репозитория school-app. PR только по просьбе.
- Перед завершением прогонять `npx tsc --noEmit`, `npx expo lint`, `npm test`.

## Что сделано (последние коммиты в main)

- **`74a556f`** — бэкенд экранного времени и учебников (`screen.ts`, миграция `20261022_screen_time.sql`).
  Миграция **применена** к облачной базе.
- **`ff98049`** — нативный модуль Android `modules/screen-guard` (Kotlin):
  - UsageStats, foreground service с видимым уведомлением, экран блокировки «Открыть Уроки» / «Домой»;
  - BOOT и PACKAGE_ADDED;
  - `isMonitoringTool=child_monitoring`.
  - **Без device admin и без запрета удаления.** Решение принято осознанно: если ребёнок выключит защиту, родитель видит «Защита выключена».
- **`0d44ee1`** — клиент:
  - `src/app/parent/screen.tsx`: экранное время у родителя;
  - мастер разрешений и полка «Учебники» у ребёнка;
  - `src/app/child/reader.tsx`;
  - PDF только локально, на Android через `expo-intent-launcher`.
- **`3b858bd`, `264cdf6`, `c5546ca`** — облегчённый сервер `deploy/lite/` и workflow `.github/workflows/server.yml`.
- **Сборка 17** зелёная: https://github.com/shalomsuchkam/school-app/releases/tag/build-17
  - Подписана debug-ключом.
  - Адрес API в ней всё ещё облачный.

## Сервер (переезд с Supabase Cloud на свой VPS)

- **VPS:** ps.kz «amorflowers-vps», Алматы, 1 vCPU / 1 ГБ / 20 ГБ, Ubuntu 22.04, IPv4 `194.110.54.193`.
  - Тариф Basic-1, оплачен до 06.09.2027.
- **Домен:** `urokiapp.kz` (ps.kz, до 22.10.2027). Оформлен на физлицо Oleg Ledovskoy; позже переоформить на ИП.
  - DNS: A `@`, A `api` → `194.110.54.193`. Записи `www`, `mail`, MX, SPF добавлены ps.kz.
  - Нужно включить автопродление домена и VPS.
- **Комплект `deploy/lite/`:**
  - supabase/postgres 17, PostgREST, storage-api, Deno 2.9.7, Caddy;
  - лимиты памяти в сумме ≤ 624 МБ;
  - подробности в `deploy/lite/README.md`.
- **Workflow «Server (lite, KZ)»:** Actions → Run workflow → `action`:
  - `inspect`: только чтение;
  - `install`;
  - `deploy`: также сам на push в `supabase/functions/**`;
  - `migrate-from-cloud`, `status`, `maintenance-on`/`maintenance-off`, `backup`.
- **Где остановились:** запуск `inspect` падает на шаге SSH с ошибкой `Load key: error in libcrypto`.
  - В секрете `SELFHOST_SSH_KEY` лежит не приватный ключ.
  - Ключ создан на ПК владельца: `C:\Users\1\uroki_deploy` (приватный) и `uroki_deploy.pub`.
  - Не подтверждено, что публичный ключ добавлен в `/root/.ssh/authorized_keys` на сервере.
  - Отпечатки ключей хоста из `ssh-keyscan` (сверить с консолью ps.kz):
    - ED25519 `SHA256:PmkG4fDtXtwALr0NpJw/Q+LpRHJV1coqaY6ACrBeSG0`;
    - ECDSA `SHA256:ZT6Psu5moXMGFhXJZMn/h6Q+EQ5tjqG/G5V+7iWJYnw`.

## Каникулы и промокоды (28.10.2026)

- **Каникулы:** родитель задаёт диапазон дат в «Расписание → Каникулы и выходные» (`POST /parent/days-off`,
  ≤ 120 дней, от −30 до +400 дней). Каждая дата — строка `app_days_off` (+ необязательное `note`), поэтому
  напоминания, серии, календарь и экранное время учитывают их сами. Даты каникул не зашиты: их каждый год меняет Министерство.
- **Промокоды:** таблицы `app_promo_codes` / `app_promo_redemptions` (миграция `20261027_promo_codes.sql`),
  родитель вводит код на экране оплаты или в настройках (`POST /parent/promo`). Владелец создаёт код одной командой:

  ```powershell
  ssh -i $HOME\uroki_deploy ubuntu@194.110.54.193 "sudo /opt/uroki/kit/promo.sh --days 365"
  ```

  `--forever` — навсегда, `--uses N`, `--until ГГГГ-ММ-ДД`, `--list`. Подробно: `deploy/lite/README.md` → «Промокоды».

## Секреты GitHub (Settings → Secrets → Actions)

| Секрет | Статус |
|---|---|
| `SELFHOST_HOST` = 194.110.54.193, `SELFHOST_USER` = root | добавлены |
| `SELFHOST_SSH_KEY` | **неверный, перезалить** (см. ниже) |
| `SUPABASE_DB_URL` (Session pooler облака), `BACKUP_PASSPHRASE` | владелец сказал, что добавил; не проверено |
| `ANDROID_KEYSTORE_B64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` | неизвестно; значения в файле `github-secrets.txt`, который передан владельцу |
| `SUPABASE_ACCESS_TOKEN` | **не нужен**: переезжаем на свой сервер |
| `EXPO_PUBLIC_API_URL` | добавить после запуска сервера: `https://api.urokiapp.kz/functions/v1/app` |
| `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8`, `APPLE_TEAM_ID` | ключ App Store Connect API (Admin) и Team ID; добавляются владельцем, см. `docs/APPLE_SETUP.md` |

Перезалить SSH-ключ (PowerShell на ПК владельца):

```powershell
type $HOME\uroki_deploy.pub | ssh root@194.110.54.193 "mkdir -p ~/.ssh; cat >> ~/.ssh/authorized_keys; chmod 700 ~/.ssh; chmod 600 ~/.ssh/authorized_keys"
ssh -i $HOME\uroki_deploy root@194.110.54.193 "echo OK"
Get-Content $HOME\uroki_deploy -Raw | Set-Clipboard   # затем GitHub → SELFHOST_SSH_KEY → Update → Ctrl+V
```

Локально всё это можно сделать через `gh`, если он установлен и авторизован:
`gh secret set SELFHOST_SSH_KEY < $HOME\uroki_deploy`

## Что делать дальше (по порядку)

1. **Починить SSH-ключ** (выше). Запустить `inspect`: `gh workflow run server.yml -f action=inspect`.
   - Прочитать вывод: что занимает порты 80/443, жив ли сайт amor flowers на сервере.
   - Сайт amor владелец убирает сам, комплект его не трогает.
2. Снимок VPS в панели ps.kz, затем `install`, затем `status`.
   - Проверить `https://api.urokiapp.kz/functions/v1/app/`: ответ `{"ok":true}`.
   - Владелец копирует `/opt/uroki/secrets.env` с сервера себе в менеджер паролей.
3. `migrate-from-cloud`: переносит строки `app_*` и ключи `app_*` из `app_secrets`; в облако ничего не пишет.
   - Фото из облачного хранилища не переносятся: там только тестовые данные.
4. `deploy` и проверка новых эндпоинтов на живом сервере: `/screen/*`, `/textbooks`, чат, календарь, приглашения.
5. **Переключить приложение:**
   - `API_BASE` по умолчанию в `src/lib/api.ts` → `https://api.urokiapp.kz/functions/v1/app`, либо секрет `EXPO_PUBLIC_API_URL`;
   - новая сборка с релизным ключом;
   - проверка на Samsung A11 (Android 12, One UI 4.1): установка и блокировка за уроки, сон, лимит приложения.
6. **После переключения:**
   - выключить облачный `app-tick` (вручную, только задачу `app-tick`, НЕ `hw-tick`);
   - если используется Telegram-бот приложения, вызвать `/setup-bot` на новом сервере.
7. Удалить тестовое устройство `dfe547d2-8524-4b18-8402-0d7e0bbf1d7d` («проверка»).

## Открытые вопросы и задачи

- **iOS: экранное время и TestFlight** (подробно: `docs/SCREEN_TIME.md` → «iOS», `docs/APPLE_SETUP.md`).
  - Сделано через `react-native-device-activity` 0.6.1 и включается флагом `expo.extra.iosScreenTime` в `app.json`.
    Сейчас `false`: ждём одобрения Family Controls (Distribution); запрос подан на аккаунт.
  - После одобрения владелец включает Family Controls (Distribution) на четырёх App ID: `kz.uroki.app`,
    `kz.uroki.app.ActivityMonitorExtension`, `kz.uroki.app.ShieldConfiguration`, `kz.uroki.app.ShieldAction`.
    Затем поставить флаг в `true` и запушить.
  - **Сборка:** `build.yml`, job `ios`.
    - Если заданы все четыре секрета `ASC_*` и `APPLE_TEAM_ID`: `xcodebuild archive` с автоматической (облачной)
      подписью через API-ключ, `-exportArchive` (app-store-connect), загрузка в TestFlight через `altool --upload-app`.
      Если `altool` нет, загружает сам `xcodebuild` (destination upload). Номер сборки = `github.run_number`.
    - Без секретов: неподписанный IPA, как раньше.
    - Ключ `.p8` пишется во временный файл (600) и удаляется шагом `always()`.
  - Имя в App Store — «Контроль ДЗ» («Уроки» занято). В приложении, на сервере и в нативных экранах имя тоже
    сменено на «Контроль ДЗ»; bundle ID `kz.uroki.app`, схема `uroki`, домен и `expo.name` (`Uroki`, имя нативного проекта) не менялись.
  - Ребёнок должен быть в «Семейном доступе». Виджет iOS ещё не сделан.
- **Google Play:** Console 25 $. Нужно 12 тестировщиков на 14 дней. Декларация child monitoring. RevenueCat.
- **BilimClass:** официального API нет. Сделан импорт через WebView на устройстве и вставку текста.
  Есть черновик письма о партнёрстве; телефон +7 (707) 944 95 94.
- **Samsung A11:** установщик пакетов выдаёт ошибку, через ADB ставится.
  - Подозрение на debug-подпись; ждём сборку с релизным ключом.
  - Есть отдельный 32-битный APK.
- **Владелец не выбрал** из 30 предложенных улучшений.
- **Аудит кода раунда 6** не завершён, стоит повторить.
- Workflow `deploy-backend.yml` (облако) можно отключить после переезда.

## Важные файлы

- `docs/SCREEN_TIME.md`: контракт экранного времени (правила, порядок решения, эндпоинты, нативный API).
- `docs/API.md`: API сервера.
- `deploy/lite/README.md`: сервер.
- `.github/workflows/`:
  - `build.yml`: APK + IPA (или TestFlight при Apple-секретах), релиз build-N;
  - `server.yml`: свой сервер;
  - `backup.yml`;
  - `android-smoke.yml`: ручной;
  - `deploy-backend.yml`: облако.
- `modules/screen-guard/`: Android-модуль (Kotlin), обёртка `src/lib/screenGuard.ts`.
- **Ключ подписи Android** (`uroki-release.keystore` + `github-secrets.txt`): только у владельца, в репозитории его нет.
  Без этого ключа нельзя выпускать обновления в Google Play. Хранить копию.
