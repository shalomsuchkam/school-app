# Переезд бэкенда «Уроки» на свой сервер в Казахстане

Сейчас сервер приложения работает в Supabase Cloud (проект `cmranrfjvvmhktntbnpg`, Франкфурт, `eu-central-1`).
По закону РК «О персональных данных и их защите» (ст. 12) база с персональными данными граждан РК должна
находиться на территории Казахстана. Этот комплект переносит бэкенд приложения на арендованный VPS в Алматы
(ps.kz) с тем же самым программным обеспечением Supabase, только установленным у нас.

**Что переезжает:** таблицы `app_*`, функция `app_rate_hit`, фото из хранилища `app-photos`, серверная функция
`app`, задача `app-tick` (раз в 5 минут, напоминания), ключи `app_*` из `app_secrets`.

**Что НЕ трогаем:** всё остальное в облачном проекте: старая система (таблицы без префикса `app_`, функция `hw`,
задача `hw-tick`, ключи без `app_` в `app_secrets`). Скрипты читают облако только для чтения. Единственная запись
в облако — отдельная команда `cloud-freeze`, она выключает только задачу `app-tick`.

---

## Часть 1. Для владельца

### 1.1. Что купить и проверить на ps.kz

| Что | Требование | Отметка |
|---|---|---|
| VPS | **KVM** (не OpenVZ/контейнер), **дата-центр Алматы** | ☐ |
| Ресурсы | 4 vCPU, 8 ГБ RAM, SSD 100+ ГБ | ☐ |
| ОС | Ubuntu 24.04 LTS (чистая установка) | ☐ |
| Сеть | Выделенный **публичный IPv4** | ☐ |
| Снимки (snapshots) | Возможность делать снимок диска перед изменениями | ☐ |
| Резервные копии | Автоматический бэкап VPS (услуга ps.kz), если есть | ☐ |
| Второе место для копий | **ps.kz Object Storage (S3)** или второй маленький VPS в другом ДЦ Казахстана (например, Астана) | ☐ |
| Договор | Договор/оферта с указанием, что данные хранятся в РК (для документов по ПДн) | ☐ |
| Доступ | Вход по SSH-ключу, пользователь с `sudo` (инженер настроит) | ☐ |

### 1.2. Домен и DNS

1. Домен (например, `uroki.kz` или любой свой). Если домена нет — купить (на ps.kz тоже можно).
2. В DNS создать запись **`A`**: `api.<ваш-домен>` → IPv4 сервера. Запись `AAAA` (IPv6) **не создавать**.
3. Адрес API для приложения будет: `https://api.<ваш-домен>/functions/v1/app`.

DNS нужно настроить **до** установки: сертификат HTTPS выпускается автоматически только на рабочее имя.

### 1.3. Сколько стоит (заполнить по прайсу ps.kz)

| Статья | Цена |
|---|---|
| VPS 4 vCPU / 8 ГБ / 100 ГБ SSD, Алматы | ____ ₸/мес |
| Снимки / автобэкап VPS | ____ ₸/мес |
| Object Storage для копий (≈10–50 ГБ) или второй VPS | ____ ₸/мес |
| Домен | ____ ₸/год |
| Работа инженера (≈1 рабочий день + дежурство в день переезда) | ____ ₸ |
| **Итого в месяц** | **____ ₸** |

Supabase Cloud для старой системы остаётся, как есть.

### 1.4. Сроки

| Этап | Время |
|---|---|
| Покупка VPS, домена, DNS | 1 день (DNS обновляется до нескольких часов) |
| Установка сервера (автоматически) | 30–60 мин |
| Пробный перенос данных и проверка | 1–2 часа |
| Новая сборка приложения с новым адресом + публикация в магазинах | 1–3 дня (проверка Apple/Google) |
| Окончательный переезд | 15–30 минут, приложение в это время показывает «технические работы» |
| Наблюдение, потом удаление данных приложения из облака | 2–4 недели |

### 1.5. Что передать инженеру (без пересылки паролей в чатах — через менеджер паролей)

- Доступ к панели ps.kz (или IP сервера + SSH-доступ).
- Доступ к DNS домена.
- Пароль базы данных облачного проекта и ключ `service_role` (Supabase → Project Settings). Нужны **только на день переезда**, вводятся прямо на сервере.
- Права администратора в репозитории GitHub (для секретов).
- Доступ к RevenueCat (поменять адрес вебхука) и, если подключён, к Telegram-боту.

### 1.6. Что изменится для пользователей

- Нужно обновить приложение до новой сборки (адрес сервера зашит в сборку). Старые сборки после переезда попросят обновиться.
- В момент переезда — 15–30 минут «технических работ».
- Данные (семьи, расписания, задания, фото) переносятся полностью, заново входить не нужно.

### 1.7. Откат (если что-то пошло не так)

Пока данные приложения в облаке не удалены, вернуться можно за 5 минут: сервер начинает пересылать запросы
в облако (режим `cloud`), задача `app-tick` снова включается в облаке. Подробно — раздел 2.9.
Перед установкой и перед переездом инженер делает снимок VPS в панели ps.kz.

### 1.8. Резервные копии

- Каждую ночь в 03:15: копия базы приложения + фото + ключи сервера.
- Хранится 7 дней на сервере и 30 дней во втором месте **в Казахстане** (Object Storage ps.kz или второй VPS), в зашифрованном виде.
- Раз в месяц инженер проверяет восстановление из копии на тестовой машине.
- Важно для политики конфиденциальности: удалённые фото дополнительно живут в копиях до 30 дней.

### 1.9. Мониторинг

- Каждые 5 минут сервер сам проверяет: работают ли сервисы, отвечает ли API, проходит ли `app-tick`, место на диске, сертификат.
- При проблеме и при восстановлении — сообщение владельцу в Telegram (отдельный служебный бот, без персональных данных).
- Рекомендуется внешний сторож (например, healthchecks.io или UptimeRobot): если сервер «замолчал» целиком — придёт письмо.

---

## Часть 2. Для инженера

### 2.1. Архитектура

```
Интернет ──443──► Caddy (HTTPS, Let's Encrypt)          ← публикуется только 80/443
                   ├─ /functions/v1/app*                → kong:8000 → edge-runtime (functions/app)   [APP_MODE=local]
                   │                                    → https://cmranrfjvvmhktntbnpg.supabase.co      [APP_MODE=cloud]
                   │                                    → 503 «технические работы»                     [APP_MODE=maintenance]
                   ├─ /storage/v1/object/sign/app-photos/*  → kong (подписанные ссылки на фото, 15 мин)
                   ├─ всё остальное только из docker-сети (функция ходит в REST/Storage по SUPABASE_URL)
                   └─ иначе 404
Kong: 127.0.0.1:8000 (Studio — только через SSH-туннель). Postgres, pooler, analytics наружу не публикуются.
pg_cron 'app-tick' (*/5) → pg_net → http://kong:8000/functions/v1/app/tick  (заголовок x-cron-key из app_secrets)
```

Ключевые решения:

- **Официальный self-hosted Supabase** (`supabase/supabase`, каталог `docker/`) на **закреплённом коммите** из
  `versions.env`; в репозиторий он не копируется. `bootstrap.sh` забирает ровно этот коммит (sparse checkout `docker/`),
  проверяет, что тег указывает на тот же коммит, и кладёт наш `docker-compose.override.yml` и `.env`.
- **`SUPABASE_URL` функции = `https://API_DOMAIN`**, а не `http://kong:8000`: `core.ts/signPhotos` строит ссылки на фото
  из `SUPABASE_URL`, телефону нужен публичный адрес. Внутри docker это имя резолвится прямо в Caddy (network alias),
  без hairpin NAT, а REST/Storage пропускаются только с приватных адресов.
- **IP клиента:** `lib.ts/clientIp` берёт `cf-connecting-ip`, затем `x-real-ip`. В облаке их ставит Cloudflare;
  здесь Caddy **перезаписывает** оба реальным адресом, иначе клиент мог бы подделать IP и обойти лимиты.
- **Порты Docker обходят ufw**, поэтому override удаляет все публикации портов upstream (`!reset`/`!override`,
  нужен Docker Compose ≥ 2.24.4), а `userland-proxy: false` — чтобы Caddy видел реальный IP и IPv6 не публиковался.
- `VERIFY_JWT=false` для edge-runtime — аналог `--no-verify-jwt` в `deploy-backend.yml` (функция сама проверяет токены устройств и секреты).

### 2.2. Файлы

| Файл | Назначение |
|---|---|
| `bootstrap.sh` | Подготовка ОС (unattended-upgrades, swap, fail2ban, ufw 22/80/443, SSH только по ключу), Docker, upstream на закреплённом коммите, генерация секретов, запуск, таймеры бэкапа и мониторинга. Идемпотентен. |
| `redeploy.sh` | Новый код функции, смена режима (`--mode local|maintenance|cloud`), `--status`. |
| `migrate.sh` | Перенос только объектов приложения из облака, `--dry-run`, проверка, cron, Telegram, `cloud-freeze`. |
| `backup.sh`, `healthcheck.sh` | Ночной бэкап (+ rclone в KZ), проверка каждые 5 минут с оповещением. |
| `docker-compose.override.yml` | Caddy, закрытие портов, env функции, real IP в Kong. |
| `Caddyfile` | HTTPS и маршрутизация, три режима. |
| `versions.env` | Закреплённый коммит/тег supabase/docker и образ клиента Postgres. **Заполнить перед первым запуском.** |
| `.env.example` | Шаблон `/opt/uroki/config.env` и `/opt/uroki/migrate.env`. Секретов в репозитории нет. |
| `common.sh` | Общие функции. |
| `../../.github/workflows/selfhost.yml` | Ручной запуск: загрузка комплекта по SSH и `bootstrap` / `redeploy` / `status`. |

На сервере: `/opt/uroki/{kit,supabase-src,stack}`, `config.env`, `secrets.env` (600, генерируется один раз —
**сохранить копию в менеджер паролей владельца**), `migrate.env` (600, удалить после переезда).

### 2.3. Подготовка (один раз)

1. **Закрепить версию Supabase:** выбрать релизный тег self-hosted docker не моложе 14 дней
   (`docker/CHANGELOG.md` в supabase/supabase), выполнить
   `git ls-remote https://github.com/supabase/supabase.git 'refs/tags/<тег>^{}' 'refs/tags/<тег>'`
   и вписать тег и коммит в `versions.env` (коммит в git, через PR).
2. На сервере создать пользователя для деплоя с ключом и `sudo` без пароля:
   ```bash
   adduser --disabled-password --gecos '' deploy
   usermod -aG sudo deploy
   echo 'deploy ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/90-deploy && chmod 440 /etc/sudoers.d/90-deploy
   install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
   # положить публичный ключ (отдельная пара только для GitHub Actions) в /home/deploy/.ssh/authorized_keys
   ```
   (Пользователь с NOPASSWD фактически root — ключ держать только в секретах GitHub.)
3. Снять отпечаток ключа хоста и сверить с консолью ps.kz: `ssh-keyscan -t ed25519 <IP>`.
4. Секреты репозитория GitHub (Settings → Secrets and variables → Actions):

   | Секрет | Значение |
   |---|---|
   | `SELFHOST_SSH_HOST` | IPv4 сервера |
   | `SELFHOST_SSH_USER` | `deploy` |
   | `SELFHOST_SSH_KEY` | закрытый ключ ed25519 (пара только для CI) |
   | `SELFHOST_SSH_KNOWN_HOSTS` | строка из `ssh-keyscan` (проверенная) |
   | `SELFHOST_API_DOMAIN` | `api.<домен>` |
   | `SELFHOST_ACME_EMAIL` | почта для Let's Encrypt |
   | `SELFHOST_SSH_PORT` | необязательно, по умолчанию 22 |
   | `EXPO_PUBLIC_API_URL` | `https://api.<домен>/functions/v1/app` — для сборки приложения (раздел 2.6) |

   Пароли БД, `service_role` и прочие ключи сервера в GitHub **не нужны**: они генерируются на сервере.
5. Снимок VPS в панели ps.kz.

### 2.4. Установка сервера

Actions → **Self-hosted backend (KZ)** → Run workflow → `action: bootstrap`, `app_mode: maintenance`.
Или вручную на сервере (комплект = `deploy/selfhost/` + `supabase/functions/app/` в `functions/app/`):

```bash
sudo API_DOMAIN=api.example.kz ACME_EMAIL=ops@example.kz ~/uroki-kit/bootstrap.sh --mode maintenance
sudo /opt/uroki/kit/redeploy.sh --status
```

Необязательные настройки (бэкап в KZ, оповещения) — в `/opt/uroki/config.env` по образцу `.env.example`, раздел A.
Для бэкапа вне сервера: `sudo apt-get install rclone`, `sudo rclone config` → remote S3 (ps.kz Object Storage)
+ remote типа `crypt` поверх него; `BACKUP_REMOTE=pskz-crypt:uroki`.

Studio: `ssh -L 8000:127.0.0.1:8000 deploy@<IP>` → http://localhost:8000, логин `uroki-admin`,
пароль `sudo grep DASHBOARD_PASSWORD /opt/uroki/secrets.env`.

### 2.5. Перенос данных

`/opt/uroki/migrate.env` (chmod 600) по разделу C `.env.example`:
`SRC_DB_URL` (строка **Session pooler** из Supabase → Connect: прямое подключение `db.<ref>.supabase.co` только по IPv6),
`SRC_SUPABASE_URL`, `SRC_SERVICE_ROLE_KEY`.

Что делает `migrate.sh` (шаги можно запускать по отдельности, всё повторяемо):

| Шаг | Действие |
|---|---|
| `preflight` | Подключение к обоим концам, версии Postgres, список `app_*` таблиц/функций, задачи cron, ключи, объём фото, счётчики строк |
| `schema` | `pg_net`, `pg_cron`; таблицы `public.app_*` из `pg_dump --schema-only --table='public.app_*'` облака (если их ещё нет; если есть — сверка колонок, при расхождении стоп); функции `public.app_*` через `pg_get_functiondef`; права как в миграции `20261016` (RLS, без anon/authenticated, `service_role`); бакет `app-photos` с теми же лимитами |
| `data` | `pg_dump --data-only` всех `app_*`, кроме `app_secrets`; на сервере в **одной транзакции** `truncate` + загрузка (повторный запуск = свежая копия) |
| `secrets` | строки `app_secrets` с ключом `app_%` (upsert), `app_fn_url` = `https://API_DOMAIN/functions/v1/app` |
| `storage` | список `storage.objects` бакета с обеих сторон; недостающие объекты: скачать через Storage API облака (`service_role`) → загрузить в локальный Storage API (`x-upsert`) |
| `verify` | счётчики строк по каждой таблице с обеих сторон, ключи `app_%`, число фото, `app_rate_hit`, `GET /app/` → `{"ok":true}`, `POST /app/join` с несуществующим кодом → 404 (проверка пути функция → БД) |
| `cron` | **только при переезде:** задача `app-tick` на сервере (`*/5`, `x-cron-key` из `app_secrets`) → `http://kong:8000/functions/v1/app/tick` |
| `telegram` | перенастроить вебхук бота на новый адрес через `/setup-bot` функции |
| `cloud-freeze` | **запись в облако:** `cron.unschedule` только для `app-tick`; при `CLOUD_MIN_BUILD` — `app_min_build` в облаке (старые сборки просят обновиться) |
| `cron-off` | убрать `app-tick` с сервера (откат) |

Без шагов = `preflight schema data secrets storage verify`. `--dry-run` ничего не пишет ни туда, ни туда.
Ключи передаются curl через файлы заголовков, не через командную строку. Дампы с персональными данными лежат
только на сервере в `/opt/uroki/migrate-work` (700) и удаляются после успешного прогона.

**Пробный перенос** (за день-два до переезда, приложение пользователей не затрагивает):

```bash
sudo /opt/uroki/kit/migrate.sh --dry-run
sudo /opt/uroki/kit/migrate.sh --yes            # cron НЕ включается — иначе напоминания уйдут дважды
sudo /opt/uroki/kit/redeploy.sh --mode local     # временно, чтобы проверить тестовой сборкой
#   ...тест на своём телефоне с тестовой сборкой (EXPO_PUBLIC_API_URL = новый адрес)...
sudo /opt/uroki/kit/redeploy.sh --mode maintenance   # или cloud — см. 2.7
```

### 2.6. Переключение приложения на новый сервер

Сейчас адрес **зашит в код**, переменной окружения для него нет:

- `src/lib/api.ts:8` — `export const API_BASE = 'https://cmranrfjvvmhktntbnpg.supabase.co/functions/v1/app';`
  (используется для всех запросов и для ссылок на юридические страницы `legalUrl`);
- `app.config.js` / `app.json` адрес не содержат и `EXPO_PUBLIC_*` не используют.

Значит, нужна новая сборка с одной правкой кода (в этот комплект она **не внесена** — сделать отдельным PR):

```ts
// src/lib/api.ts
export const API_BASE =
  process.env.EXPO_PUBLIC_API_URL || 'https://cmranrfjvvmhktntbnpg.supabase.co/functions/v1/app';
```

и в `.github/workflows/build.yml` в `env:` обоих заданий (`android` и `ios`):

```yaml
      # API of the app; empty = Supabase Cloud
      EXPO_PUBLIC_API_URL: ${{ secrets.EXPO_PUBLIC_API_URL }}
```

Секрет репозитория `EXPO_PUBLIC_API_URL` = `https://api.<домен>/functions/v1/app` (без `/` в конце).
Expo подставляет `process.env.EXPO_PUBLIC_*` в бандл при сборке (обращаться именно так, без деструктуризации).
Сменить адрес у уже установленных приложений без новой сборки нельзя.

Также после переезда:
- **RevenueCat** → Integrations → Webhooks: URL `https://api.<домен>/functions/v1/app/billing/revenuecat`
  (заголовок Authorization тот же; обновить и `docs/STORE.md`).
- **Telegram**: `migrate.sh --yes telegram`.
- **`.github/workflows/deploy-backend.yml`** продолжает деплоить функцию в облако при каждом push —
  отключить (Actions → Deploy backend → Disable workflow) и дальше выкатывать через `selfhost.yml` (`redeploy`).
- Тексты политики (`supabase/functions/app/legal.ts`): обработчик «Supabase (storage and server)» → сервер в РК (ps.kz),
  поднять `LEGAL_VERSION`. Согласовать с юристом трансграничную передачу (push через Expo/Apple/Google, Telegram, RevenueCat).

### 2.7. День переезда (runbook)

Вариант A (рекомендуется при небольшой базе): **сначала выпустить новую сборку, потом переехать.**
1. Сервер в режиме `cloud`: `redeploy.sh --mode cloud` (новый домен прозрачно проксирует в облако).
2. Выпустить сборку с `EXPO_PUBLIC_API_URL` = новый домен, дождаться обновления большинства.
   ⚠️ В этом режиме облако видит всех через один IP сервера: лимиты по IP (5 новых семей в час,
   10 попыток входа по коду за 15 минут) становятся общими. Держать фазу короткой (дни).
3. Переезд (ниже). Пользователи новой сборки увидят только паузу.

Вариант B: переехать сразу, а сборку выпустить в тот же день — старые сборки попросят обновиться (`CLOUD_MIN_BUILD`).

Переезд, 15–30 минут:

```bash
# 0. снимок VPS в панели ps.kz; свежий бэкап
sudo /opt/uroki/kit/backup.sh
# 1. пауза записи через новый домен
sudo /opt/uroki/kit/redeploy.sh --mode maintenance
# 2. облако: выключить только app-tick (+ CLOUD_MIN_BUILD=<номер новой сборки> в migrate.env, если нужно)
sudo /opt/uroki/kit/migrate.sh --yes cloud-freeze
# 3. финальная копия + проверка (счётчики должны совпасть)
sudo /opt/uroki/kit/migrate.sh --yes
# 4. включить новый сервер, напоминания, Telegram
sudo /opt/uroki/kit/redeploy.sh --mode local
sudo /opt/uroki/kit/migrate.sh --yes cron telegram verify
# 5. RevenueCat webhook URL, отключить deploy-backend.yml, удалить /opt/uroki/migrate.env после стабилизации
```

Через 10 минут: `redeploy.sh --status` — у `app-tick` есть успешные запуски; в приложении видны фото.

### 2.8. После переезда (2–4 недели)

Когда новый сервер стабилен и откат больше не нужен, данные приложения в облаке **удалить** (это часть соответствия
закону). Только объекты приложения, старую систему не трогать. В SQL Editor облака:

```sql
-- проверить список перед удалением!
select tablename from pg_tables where schemaname = 'public' and tablename like 'app\_%' and tablename <> 'app_secrets';
-- затем: drop table public.app_photos, public.app_tasks, ... ;   (все из списка, кроме app_secrets)
drop function if exists public.app_rate_hit(text, int, int);
delete from public.app_secrets where key like 'app\_%';   -- саму таблицу не удалять: она могла появиться раньше app_*
```

Бакет `app-photos`: Dashboard → Storage → очистить и удалить. Функцию `app`: Dashboard → Edge Functions → удалить
(`hw` не трогать). Задача `app-tick` уже снята `cloud-freeze`; `hw-tick` не трогать.

### 2.9. Откат

Пока облачные данные приложения не удалены:

```bash
sudo /opt/uroki/kit/migrate.sh --yes cron-off      # остановить тик на сервере
sudo /opt/uroki/kit/redeploy.sh --mode cloud        # новый домен снова ведёт в облако
```

В облаке (SQL Editor) вернуть задачу ровно как в миграции `20261014_app_schema.sql`:

```sql
select cron.schedule('app-tick', '*/5 * * * *', $$
  select net.http_post(
    url := (select value from public.app_secrets where key = 'app_fn_url') || '/tick',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-key',(select value from public.app_secrets where key = 'app_cron_key')),
    body := '{}'::jsonb
  )
$$);
```

и убрать `app_min_build` из облачного `app_secrets`, если его ставили; Telegram — `POST /setup-bot` на облачном адресе;
RevenueCat — вернуть старый URL. Данные, созданные на новом сервере после переезда, в облако автоматически
не возвращаются (обратный перенос — вручную), поэтому решение об откате принимать в первые часы.
Если сломан сам сервер — восстановить снимок VPS ps.kz.

### 2.10. Бэкап и восстановление

`backup.sh` (таймер `uroki-backup.timer`, 03:15): `app.dump` (только `app_*`), `full.dump` (вся БД), `storage.tar.gz`,
`server-secrets.tar` → `/var/backups/uroki/<дата>` (7 дней) → `rclone` в `BACKUP_REMOTE` (30 дней, crypt-remote в РК).

Восстановление данных приложения на установленный сервер:

```bash
sudo /opt/uroki/kit/redeploy.sh --mode maintenance
cd /opt/uroki/stack
sudo docker compose -f docker-compose.yml -f docker-compose.override.yml exec -T db \
  pg_restore -U postgres -d postgres --clean --if-exists --no-owner < /var/backups/uroki/<дата>/app.dump
# (если pg_restore спросит пароль: POSTGRES_PASSWORD из /opt/uroki/secrets.env)
sudo tar -C /opt/uroki/stack/volumes -xzf /var/backups/uroki/<дата>/storage.tar.gz
sudo docker compose -f docker-compose.yml -f docker-compose.override.yml restart storage
sudo /opt/uroki/kit/redeploy.sh --mode local
```

Полное восстановление на новом VPS: `bootstrap.sh` с теми же `secrets.env`/`config.env` из `server-secrets.tar`
(положить в `/opt/uroki/` до запуска), затем шаги выше. Раз в месяц проверять на тестовом VPS.

### 2.11. Мониторинг

`healthcheck.sh` (каждые 5 минут): контейнеры `db kong functions storage rest caddy`, `GET /app/` локально и публично,
диск < 85 %, успешные ответы `app-tick` за 15 минут (`net._http_response`), срок сертификата. Сообщение в Telegram
(`ALERT_TG_BOT_TOKEN`/`ALERT_TG_CHAT_ID`) только при смене состояния; `HEALTHCHECK_PING_URL` — «сторож» снаружи.
Логи: `cd /opt/uroki/stack && sudo docker compose -f docker-compose.yml -f docker-compose.override.yml logs -f functions caddy`.

### 2.12. Обновления

- Ubuntu: unattended-upgrades (security), автоперезагрузка в 04:30 при необходимости.
- Функция `app`: Actions → Self-hosted backend (KZ) → `redeploy` (проверка `deno check` + тесты перед выкладкой).
- Supabase: новый тег/коммит в `versions.env` → снимок VPS → `bootstrap.sh --upgrade` (сам делает бэкап перед обновлением).

### 2.13. Риски и замечания

- `versions.env` не заполнен: тег и коммит supabase/docker нужно выбрать и проверить (без этого `bootstrap.sh` не стартует).
  Образ `caddy:2.10.0-alpine` и `postgres:17.6-alpine` закреплены тегом; при желании закрепить по digest.
- Override рассчитан на текущую структуру upstream compose (сервисы `kong functions db storage rest supavisor analytics`);
  `bootstrap.sh` проверяет их наличие и плейсхолдеры в `.env`, но после смены версии читать upstream CHANGELOG.
- Если в облаке Postgres 17, а в self-hosted образе 15: перенос идёт простым SQL (строка `SET transaction_timeout` вырезается);
  для этих таблиц это работает, `verify` подтвердит.
- edge-runtime self-hosted ограничивает воркер по времени/памяти (настройки в upstream `volumes/functions/main/index.ts`);
  при большом числе семей `/tick` может упереться в лимит — следить за `app-tick` в мониторинге.
- Функция при первом запуске скачивает `npm:@supabase/supabase-js@2` — серверу нужен исходящий интернет.
- Пока работают две копии (облако и сервер), включать `app-tick` можно только в одной — иначе двойные напоминания.
- Старые сборки приложения ходят прямо в облако; после `cloud-freeze` их записи туда не попадут на сервер — поэтому `CLOUD_MIN_BUILD`.
- Пользователь деплоя с `NOPASSWD` sudo = root; ключ хранить только в секретах GitHub, окружение `selfhost` защитить ревьюерами.
