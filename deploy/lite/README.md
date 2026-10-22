# «Уроки»: лёгкий сервер на 1 ГБ (ps.kz, Алматы)

Бэкенд мобильного приложения на маленьком VPS: **1 vCPU, 1 ГБ RAM, 20 ГБ диска**, Ubuntu 22.04,
IP `194.110.54.193`, адрес API **`https://api.urokiapp.kz/functions/v1/app`**.

Полный комплект `deploy/selfhost/` (весь Supabase, 4 vCPU / 8 ГБ) сюда не помещается. Этот запускает **тот же
код функции без изменений**, но только то, что ей действительно нужно.

---

## Часть 1. Для владельца

### Что работает на сервере

| Что | Зачем | Память (лимит) |
|---|---|---|
| **Postgres** (образ Supabase) | база: семьи, задания, расписание; задача «каждые 5 минут» | 256 МБ |
| **Storage** (Supabase) | фото и голосовые заметки, файлы лежат на диске сервера | 128 МБ |
| **Функция `app`** (Deno) | сам сервер приложения | 128 МБ |
| **Caddy** | HTTPS-сертификат, пропускает наружу только API приложения | 64 МБ |
| **PostgREST** | «переводчик» между функцией и базой | 48 МБ |
| **Итого** | | **≤ 624 МБ** (в покое ~300 МБ) |

Плюс файл подкачки 2 ГБ (создаётся сам, если его нет), брандмауэр (открыты только 22, 80, 443), автоматические
обновления безопасности Ubuntu, ночной бэкап в 03:15 (хранится 7 дней).

Наружу видно только `https://api.urokiapp.kz/functions/v1/app…` и короткие ссылки на фото (15 минут). Всё остальное
отвечает 404. База, пароли и ключи с сервера никуда не уходят.

### Перед первой установкой

1. DNS: запись **`A`** `api.urokiapp.kz` → `194.110.54.193`. Запись `AAAA` не создавать.
2. На ps.kz сделайте **снимок (snapshot)** сервера.
3. В GitHub: **Settings → Secrets and variables → Actions → New repository secret**:

| Секрет | Что вписать |
|---|---|
| `SELFHOST_HOST` | `194.110.54.193` |
| `SELFHOST_USER` | `root` (или пользователь с `sudo` без пароля) |
| `SELFHOST_SSH_KEY` | закрытый SSH-ключ (инженер создаст пару и положит открытую часть на сервер) |
| `SELFHOST_SSH_PORT` | только если SSH не на 22 |
| `SELFHOST_SSH_KNOWN_HOSTS` | по желанию: «отпечаток» сервера (иначе берётся при первом подключении и печатается в логе) |
| `SELFHOST_ACME_EMAIL` | по желанию: почта для писем Let's Encrypt |
| `SUPABASE_DB_URL` | только для переноса данных из облака (строка «Session pooler») |
| `BACKUP_PASSPHRASE` | по желанию: длинный пароль, чтобы скачивать зашифрованные бэкапы |

Старые имена `SELFHOST_SSH_HOST` / `SELFHOST_SSH_USER` тоже подходят.

### Как запускать действия

**GitHub → Actions → «Server (lite, KZ)» → Run workflow → выбрать `action` → Run workflow.**

| action | Что делает | Меняет сервер? |
|---|---|---|
| `inspect` | показывает систему, память, диск, занятые порты, docker, работающие сайты, содержимое `/opt` и `/var/www`, указывает ли домен на сервер | **нет**, только смотрит |
| `install` | первая установка (можно повторять) | да |
| `deploy` | выкладывает новый код функции и новые миграции, проверяет здоровье; при ошибке — красный крестик | да |
| `status` | контейнеры, память, «тик» каждые 5 минут, сертификат, бэкапы | нет |
| `maintenance-on` | приложение видит «Идут технические работы» (503) | да |
| `maintenance-off` | снова обычная работа | да |
| `backup` | свежий бэкап на сервере; при наличии `BACKUP_PASSPHRASE` ещё и зашифрованный файл в «Artifacts» запуска (7 дней) | только бэкап |
| `migrate-from-cloud` | копирует данные приложения из Supabase Cloud на сервер (см. ниже) | да |

`deploy` также запускается **сам** после каждого изменения `supabase/functions/**` или `supabase/migrations/**`
в ветке `main` (если секреты не заданы — пропускается с пометкой).

**Порядок первого запуска:** `inspect` → (освободить 80/443, см. ниже) → `install` → `status` →
при необходимости `migrate-from-cloud`.

### Старый сайт («amor flowers»)

Комплект **никогда не удаляет и не останавливает** чужие сайты, nginx/apache, файлы в `/var/www` и т. п.
Если порты 80/443 заняты старым сайтом, `install` остановится с понятной ошибкой. Уберите старый сайт сами
(или попросите инженера), проверьте `inspect` («ports 80/443 are free») и запустите `install` снова.

### Перенос данных из облака

`migrate-from-cloud` читает облако **только на чтение** и копирует строки таблиц `app_*` и ключи `app_*` из
`app_secrets`. На сервере всё делается одной транзакцией: либо скопировалось всё, либо ничего не изменилось.
Данные на сервере, которые были до этого, **заменяются**.

- **Фото и голосовые заметки не переносятся** (сейчас там только тестовые данные). Старые фото в
  перенесённых заданиях будут без картинки.
- В облаке продолжает работать своя задача напоминаний; пока приложение ходит в облако, это нормально. Когда
  приложение переключат на `api.urokiapp.kz`, облачную задачу `app-tick` нужно выключить (это делается в
  облаке вручную, комплект в облако не пишет), иначе возможны двойные напоминания.

### Откат

- **Плохая версия кода:** откатите коммит в `main` (Revert) — `deploy` выложит прежнюю версию сам. Или
  Actions → Run workflow → выбрать прежний тег/ветку → `deploy`.
- **Сервер работает плохо:** `maintenance-on`, пока разбирается инженер. Приложение, которое ещё ходит в облако,
  это не затрагивает.
- **Испорчены данные:** восстановление из ночного бэкапа (раздел 2.7) или снимок VPS на ps.kz.
- **Отказаться от сервера:** приложение просто продолжает работать с Supabase Cloud — облако комплект не трогает.

### Когда переходить на 2 ГБ

- `status` показывает подкачку (Swap used) больше ~300 МБ постоянно, или контейнер упирается в свой лимит;
- приложение отвечает медленно в часы напоминаний (16:00–21:30);
- больше ~500 активных семей или нужны функции Supabase, которых здесь нет (Studio, Realtime, преобразование фото).

Переход: на ps.kz увеличить тариф (диск и данные сохраняются), затем инженер поднимает лимиты памяти
(`mem_limit` в `deploy/lite/docker-compose.yml` или в файле `/opt/uroki/compose.override.yml` на сервере) и
запускает `deploy`. Например, `shared_buffers=256MB` и `mem_limit: 512m` для db.

---

## Часть 2. Для инженера

### 2.1. Схема

```
Интернет ─80/443─► Caddy (Let's Encrypt, h1/h2)            ← публикуются только 80/443 (IPv4)
                    ├─ /functions/v1/app*  → functions:8000 (Deno)      [APP_MODE=local]
                    │                      → 503 JSON                   [APP_MODE=maintenance]
                    ├─ /storage/v1/object/sign/app-photos/*  → storage:5000   (подписанные ссылки, 15 мин)
                    ├─ /rest/v1/*, /storage/v1/*  → rest:3000 / storage:5000   только remote_ip private_ranges
                    └─ остальное → 404
functions ── SUPABASE_URL=https://api.urokiapp.kz ──► (сетевой alias = Caddy, без hairpin NAT) ─► rest / storage
db: pg_cron 'app-tick' */5 ─► pg_net ─► http://functions:8000/functions/v1/app/tick  (x-cron-key из app_secrets)
Сети: backend (internal, без интернета): db, rest, storage, functions;  edge: caddy, rest, storage, functions.
```

### 2.2. Образы (versions.env, тег + digest, каждый опубликован ≥ 14 дней до закрепления)

| Сервис | Образ | Почему |
|---|---|---|
| db | `supabase/postgres:17.6.1.136` | тот же, что в официальном self-host; роли anon/authenticated/service_role/authenticator/supabase_storage_admin, pg_cron, pg_net |
| rest | `postgrest/postgrest:v14.18` | версия официального self-host compose |
| storage | `supabase/storage-api:v1.79.38` | file backend, файлы в `/opt/uroki/data/storage` |
| functions | `denoland/deno:alpine-2.9.7` | см. 2.3 |
| caddy | `caddy:2.11.6-alpine` | автоматический HTTPS |
| (runner) | `postgres:17.10-alpine` | pg_dump 17 для `migrate-from-cloud` |

### 2.3. Почему Deno, а не supabase/edge-runtime

`edge-runtime` (≈390 МБ образ) запускает главный воркер, который порождает изолированные воркеры функций, —
это лишняя память и лишний «main»-скрипт. Функции `app` ничего этого не нужно: это один `Deno.serve`.
Чистый Deno (≈50 МБ образ, ~25 МБ RSS в покое) запускает тот же `index.ts` как есть:
`deno run --cached-only --lock=/srv/lock/deno.lock --frozen --no-prompt --allow-net --allow-env`.
Зависимости (`npm:@supabase/supabase-js@2`) скачивает `deploy.sh` (`deno cache`) и фиксирует в
`/opt/uroki/app/lock/deno.lock`; работающий контейнер ничего не скачивает (read-only FS, uid 1000, без capabilities).
Маршрутизация по «/app» в пути совпадает с облаком (`/functions/v1/app/...`). `DENO_USE_CGROUPS=1` в образе
подстраивает кучу V8 под лимит контейнера.

### 2.4. Файлы

| Файл | Назначение |
|---|---|
| `docker-compose.yml` | 5 сервисов, лимиты памяти, сети, alias домена на Caddy |
| `versions.env` | закреплённые образы |
| `caddy/Caddyfile` | маршруты, режимы `local`/`maintenance`, перезапись `Cf-Connecting-Ip`/`X-Real-IP` |
| `lib.sh` | общие функции (compose, psql без паролей в argv, миграции, проверки здоровья) |
| `install.sh` | установка: проверка 80/443, пакеты, swap, ufw, docker, секреты, запуск, схема, таймер бэкапа |
| `deploy.sh` | код + миграции + перезапуск + проверка |
| `mode.sh` | `local` / `maintenance` |
| `status.sh` / `inspect.sh` | только чтение |
| `backup.sh` | ночной бэкап; `--stdout` для действия `backup` |
| `import-cloud.sh` | серверная часть `migrate-from-cloud` |
| `sql/admin.sql`, `sql/pre.sql`, `sql/post.sql`, `sql/record.sql` | «прокладки» вокруг миграций |

На сервере: `/opt/uroki/{kit,app,data,backups,tmp,upload}`, `config.env` (режим, домен), `secrets.env`
(600: пароли БД, JWT_SECRET, ANON_KEY, SERVICE_ROLE_KEY — генерируются на сервере, в CI не выводятся).
Данные Postgres — docker volume `uroki-db-data`. Вне `/opt/uroki` меняются только: swap (`/swapfile`,
`/etc/fstab`, `vm.swappiness`), ufw, установка docker (apt-репозиторий download.docker.com), unattended-upgrades,
`uroki-backup.service/.timer`.

### 2.5. Схема БД и миграции

Каждый `install`/`deploy` выполняет: `sql/admin.sql` (supabase_admin: pg_cron, pg_net, схема `uroki_meta`, бакет
`app-photos` private) → `sql/pre.sql` (postgres) → новые `supabase/migrations/*.sql` по порядку имён, каждая в своей
транзакции вместе со строкой в `uroki_meta.migrations` (имя + sha256; изменённый после применения файл не
перезапускается, выводится предупреждение) → `sql/post.sql`.

Что в облаке было «само собой» и решается прокладками (файлы миграций не меняются):

- `public.app_secrets` используется миграцией 20261014, но ни одна миграция её не создаёт → `pre.sql` создаёт (key/value, RLS, без anon/authenticated).
- 20261014 кладёт облачный `app_fn_url` с `on conflict do nothing` → `pre.sql` заранее пишет
  `https://api.urokiapp.kz/functions/v1/app`, облачный URL в базу не попадает.
- 20261014 планирует `app-tick` на `app_fn_url` → `post.sql` перепланирует его на `http://functions:8000/...`
  внутри docker (работает и в режиме maintenance) и снимает любые задачи с `supabase.co` в команде.
- Бакет и `storage.buckets` для postgres → `admin.sql`.

Таблица учёта нарочно не `app_*`: бэкапы и `migrate-from-cloud` работают ровно с `public.app_*`.

### 2.6. `migrate-from-cloud`

На раннере: `docker run postgres:17.10-alpine pg_dump --data-only --table='public.app_*' --exclude-table-data=public.app_secrets`
(URL только через `-e SUPABASE_DB_URL`) + `copy (... app_secrets where key like 'app\_%' and key <> 'app_fn_url') to stdout`
(сессия `default_transaction_read_only`) + маркер конца → по SSH в `import-cloud.sh`. Сервер буферизует поток в
`/opt/uroki/tmp` (700), проверяет маркер и `dump complete`, затем одной транзакцией (supabase_admin,
`session_replication_role=replica`): `truncate` всех локальных `app_*` (кроме `app_secrets`) → данные → upsert
ключей → `app_fn_url` обратно на сервер. После — перезапуск функции (она кэширует секреты в памяти) и счётчики
строк. Telegram-вебхук после переключения: `POST https://api.urokiapp.kz/functions/v1/app/setup-bot` с
заголовком `x-cron-key` (значение `app_cron_key` из `app_secrets`).

### 2.7. Бэкап и восстановление

Ночью (`uroki-backup.timer`, 03:15 Asia/Almaty) в `/opt/uroki/backups/<дата>/`: `app.dump` (pg_dump -Fc
`public.app_*` + `uroki_meta`), `storage-meta.dump` (строки `storage.buckets/objects`), `storage.tar.gz` (файлы).
Хранится 7 дней. **Копия только на этом же сервере** — для защиты от потери сервера используйте действие `backup`
с `BACKUP_PASSPHRASE` и/или снимки ps.kz.

Восстановление (на сервере, root):

```bash
sudo -i
cd /opt/uroki/kit && . ./lib.sh
D=/opt/uroki/backups/2026-10-21                      # нужный день
bash ./mode.sh maintenance
restore() { PGPASSWORD=$(sec POSTGRES_PASSWORD) compose exec -T -e PGPASSWORD db \
  pg_restore -h 127.0.0.1 -U supabase_admin -d postgres --data-only --disable-triggers "$@"; }
# 1) таблицы app_*: очистить и залить (в дампе только app_* и uroki_meta)
L=$(db_q "select string_agg('public.'||tablename, ', ') from pg_tables where schemaname='public' and tablename like 'app\_%'")
db_admin -c "truncate $L restart identity"
restore --schema=public < "$D/app.dump"
# 2) фото: файлы + строки storage.objects
tar -C /opt/uroki/data -xzf "$D/storage.tar.gz"
db_admin -c "delete from storage.objects where bucket_id = 'app-photos'"
restore --table=objects < "$D/storage-meta.dump"
compose restart functions && bash ./mode.sh local
```

Артефакт действия `backup`: `openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in uroki-app-*.dump.enc -out app.dump`
(пароль `BACKUP_PASSPHRASE`), затем `pg_restore` как выше.

### 2.8. Безопасность (как в полном комплекте)

- Наружу публикует порты только Caddy (порты Docker обходят ufw). REST/Storage доступны только из docker-сети.
- `Cf-Connecting-Ip` и `X-Real-IP` **перезаписываются** реальным адресом (`lib.ts/clientIp` берёт их первыми),
  иначе клиент подделал бы IP и обошёл лимиты.
- Функция проверяет токены устройств сама (как `--no-verify-jwt` в облаке); service-role JWT только внутри docker.
- Пароли и ключи генерируются на сервере, в argv не попадают (`docker exec -e NAME`, `\getenv`), в лог CI не выводятся.
- Сеть `backend` без выхода в интернет; у функции, PostgREST, Caddy — `cap_drop: ALL`, `no-new-privileges`, read-only FS.
- Без `SELFHOST_SSH_KNOWN_HOSTS` ключ сервера принимается при первом подключении (TOFU) и печатается в лог —
  сверьте отпечаток с консолью ps.kz и сохраните строку `ssh-keyscan` в этот секрет.
- Пользователь с `NOPASSWD` sudo = root. Ключ — только в секретах GitHub; при желании включите обязательное
  подтверждение через Environments.

### 2.9. Обновления

- Образы: новая строка в `versions.env` (тег ≥ 14 дней + digest) → push → `deploy` (пересоздаст только изменённые
  контейнеры). Мажорная версия Postgres — только через дамп/восстановление.
- Ubuntu: unattended-upgrades (security). Автоперезагрузка не включена — ядро обновлять плановой перезагрузкой
  (контейнеры поднимутся сами, `restart: unless-stopped`).

### 2.10. Ограничения и замечания

- Нет Studio, Auth, Realtime, преобразования изображений — функции они не нужны.
- `deploy` первым делом скачивает npm-зависимости: серверу нужен исходящий интернет (registry.npmjs.org).
  Импорт `npm:@supabase/supabase-js@2` без точной версии; `deno.lock` фиксирует первую скачанную.
- Сертификат выпускается только когда `api.urokiapp.kz` указывает на сервер и 80/443 свободны; до этого функция
  внутри docker тоже не достучится до REST/Storage (TLS на имени домена) — `install` предупредит.
- Двойная работа (облако + сервер) с одними данными → двойные напоминания; выключайте `app-tick` в одном месте.
