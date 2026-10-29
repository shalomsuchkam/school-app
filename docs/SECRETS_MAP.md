# Где лежат пароли и ключи («Контроль ДЗ»)

Только места и назначение — **самих значений здесь нет и быть не должно**. В репозитории секретов нет.

## 1. GitHub → Settings → Secrets and variables → Actions
https://github.com/shalomsuchkam/school-app/settings/secrets/actions — значения видны только при создании, потом
GitHub их не показывает (можно только заменить). Проверить, какие заданы: Actions → «Check secrets».

| Секрет | Что это | Откуда взять заново |
|---|---|---|
| `ANDROID_KEYSTORE_B64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` | ключ подписи Android (ключ загрузки для Google Play) | файлы `uroki-release.keystore` + `github-secrets.txt` у владельца. **Потеря ключа = нельзя обновлять приложение** (Google может сбросить ключ загрузки по заявке, но это дни) |
| `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8`, `APPLE_TEAM_ID` | ключ App Store Connect API: подпись iOS и загрузка в TestFlight | App Store Connect → Users and Access → Integrations → App Store Connect API. Файл `.p8` скачивается один раз; при потере — отозвать ключ и создать новый |
| `SELFHOST_HOST`, `SELFHOST_USER`, `SELFHOST_SSH_KEY` | вход на сервер ps.kz (IP 194.110.54.193, пользователь `ubuntu`, приватный SSH-ключ в base64) | ключ на ПК владельца: `C:\Users\1\uroki_deploy` |
| `BACKUP_PASSPHRASE` | пароль шифрования резервных копий базы | только у владельца (записан при создании). Без него копию не открыть |
| `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_URL` | старое облако Supabase — **больше не нужны** | — |
| `PLAY_SERVICE_ACCOUNT_JSON` | (ещё не создан) автозагрузка в Google Play | Play Console → Setup → API access |
| `RC_IOS_KEY`, `RC_ANDROID_KEY`, `EAS_PROJECT_ID` | (ещё не созданы) RevenueCat и push-сервис Expo | RevenueCat / expo.dev |

## 2. Компьютер владельца (Windows)

| Файл | Что это |
|---|---|
| `C:\Users\1\uroki_deploy` | приватный SSH-ключ для сервера (пользователь `ubuntu`). Тот же ключ в секрете `SELFHOST_SSH_KEY` |
| `C:\Users\1\uroki_deploy.pub` | его открытая часть (лежит на сервере в `/home/ubuntu/.ssh/authorized_keys`) — не секрет |
| `C:\Users\1\.ssh\id_ed25519` | старый личный SSH-ключ (тоже пускает на сервер как `ubuntu`) |
| `uroki-release.keystore` + `github-secrets.txt` | ключ подписи Android и пароли к нему — **хранить в двух местах** (флешка/облако) |
| `AuthKey_XXXXXXXX.p8` | ключ App Store Connect API (если сохранён) |

## 3. Сервер ps.kz (Алматы, 194.110.54.193)

| Где | Что |
|---|---|
| `/opt/uroki/secrets.env` (chmod 600) | пароли базы данных, JWT-секрет, служебный ключ хранилища. Создан при установке. Скопировать себе в менеджер паролей: `ssh -i $HOME\uroki_deploy ubuntu@194.110.54.193 "sudo cat /opt/uroki/secrets.env"` |
| `/opt/uroki/config.env` | не секретно: домены, режим работы |
| таблица `app_secrets` в базе | `app_admin_key` (выдача бесплатного доступа через `/admin/grant`), `app_cron_key` (напоминания раз в 5 минут), `app_tg_secret` (Telegram), реквизиты ИП для политики конфиденциальности |
| `/opt/uroki/backups/` | ночные копии базы за 7 дней |

Промокоды: `ssh -i $HOME\uroki_deploy ubuntu@194.110.54.193 "sudo /opt/uroki/kit/promo.sh --days 365"` (см.
`deploy/lite/README.md`).

## 4. Аккаунты (пароли — только у владельца)

| Сервис | Что там |
|---|---|
| GitHub (`shalomsuchkam`) | код, сборки, секреты |
| ps.kz | сервер (тариф Basic-1) и домен `urokiapp.kz` (автопродление включить!) |
| Apple Developer / App Store Connect (Team ID в секрете `APPLE_TEAM_ID`) | приложение «Контроль ДЗ», TestFlight, Family Controls |
| Google Play Console | приложение `kz.uroki.app`, внутренний и закрытый тест |
| Gmail urokikazakhstan@gmail.com | почта поддержки, указана в магазинах и политике |
| Supabase (старое облако) | старая система — не трогать |

## 5. Приложение

Входа по паролю нет: устройство входит в семью **одноразовым кодом** (по умолчанию 48 ч). Код создаёт родитель в
приложении, а без телефона — GitHub Actions → «New code for the GitHub family». Токен устройства хранится в
защищённом хранилище телефона (SecureStore), на сервере — только его хэш.
