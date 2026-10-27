# Уроки — мобильное приложение (iOS + Android)

Контроль домашних заданий и сборов к школе: ученик фотографирует ДЗ и отмечает дела,
родитель видит прогресс, одобряет пропуски и получает уведомления (в приложении или Telegram).

## Устройство
- `src/app` — экраны (Expo Router): онбординг родителя, вход по коду, экран ученика и камера, вкладки родителя (Сегодня, Расписание, Дела, Настройки).
- `src/components`, `src/lib` — дизайн-система, API-клиент, локальные напоминания.
- `supabase/` — сервер приложения: таблицы `app_*` и функция `app` (Supabase Edge Functions).
  Отдельно от веб-версии и бота (`hw`) — они не затрагиваются.

## Разработка
```bash
npm ci
npx expo start            # запуск
npx tsc --noEmit          # типы
npx expo lint             # линтер
```

## Сборки
GitHub Actions (`.github/workflows/build.yml`) на каждый пуш в `main` собирает `Uroki.apk` и неподписанный
`Uroki-unsigned.ipa` и публикует их в Releases.
- Номер сборки (`android.versionCode`, `ios.buildNumber`) берётся из `BUILD_NUMBER` — в CI это номер запуска
  workflow, поэтому каждая сборка новее предыдущей (`app.config.ts`; локально — 1).
- APK — тестовая сборка для прямой установки. Пока в секретах репозитория нет ключа, APK подписывается
  общедоступным debug-ключом шаблона React Native (в логе будет предупреждение) — это тестовая подпись, не для
  распространения. Сборки для магазина подписываются закрытым ключом; при смене подписи установленную тестовую
  версию нужно один раз удалить. Чтобы подписывать APK закрытым ключом, создайте его один раз (вне репозитория)
  и добавьте секреты `ANDROID_KEYSTORE_B64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`:
  ```bash
  keytool -genkeypair -v -keystore uroki-release.jks -alias uroki -keyalg RSA -keysize 2048 -validity 10000
  base64 -w0 uroki-release.jks   # значение для ANDROID_KEYSTORE_B64
  ```
  Ключ и пароли храните в надёжном месте: без них новые версии не встанут поверх установленных.
- IPA устанавливается через Sideloadly / AltStore с вашим Apple ID. Для App Store нужен Apple Developer Program.

## Telegram (опция)
Бот подключается в настройках родителя. Сервер включает опцию, когда в `app_secrets` задан `app_bot_token`
и выполнен вызов `/setup-bot`.
