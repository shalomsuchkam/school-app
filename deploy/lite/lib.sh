# shellcheck shell=bash
# shellcheck disable=SC2034 # variables used by the scripts that source this file
# Shared helpers of the lite kit. Sourced, never executed. Secrets never go into argv (ps) or the repository.

UROKI_DIR=${UROKI_DIR:-/opt/uroki}         # everything on the server lives here
KIT_DIR=$UROKI_DIR/kit                     # installed copy of deploy/lite (root-owned)
APP_DIR=$UROKI_DIR/app                     # functions/app + migrations + lock/deno.lock
DATA_DIR=$UROKI_DIR/data                   # storage files, caddy certs, deno cache
BACKUP_DIR=$UROKI_DIR/backups
CONFIG_FILE=$UROKI_DIR/config.env          # non-secret: API_DOMAIN, ACME_EMAIL, APP_MODE
SECRETS_FILE=$UROKI_DIR/secrets.env        # generated on the server, chmod 600, never printed
DEFAULT_DOMAIN=api.urokiapp.kz
export UROKI_DIR

log() { printf '\033[1;34m[%s]\033[0m %s\n' "$(date +%H:%M:%S)" "$*" >&2; }
warn() { printf '\033[1;33m[%s] WARN:\033[0m %s\n' "$(date +%H:%M:%S)" "$*" >&2; }
die() {
  printf '\033[1;31m[%s] ERROR:\033[0m %s\n' "$(date +%H:%M:%S)" "$*" >&2
  exit 1
}
need_root() { [ "$(id -u)" -eq 0 ] || die "run as root (sudo $0 ...)"; }

# Read KEY=value from an env file without sourcing it (no code execution).
env_get() {
  [ -f "$1" ] || return 0
  awk -v k="$2" 'index($0, k "=") == 1 { v = substr($0, length(k) + 2) } END { print v }' "$1"
}

# Replace or append KEY=value in an env file, keeping it mode 600.
env_set() {
  local f=$1 k=$2 v=$3 tmp
  [ -f "$f" ] || install -m 600 /dev/null "$f"
  tmp=$(mktemp)
  awk -v k="$k" -v v="$v" 'BEGIN { done = 0 }
    index($0, k "=") == 1 { if (!done) print k "=" v; done = 1; next }
    { print }
    END { if (!done) print k "=" v }' "$f" >"$tmp"
  cat "$tmp" >"$f"
  rm -f "$tmp"
  chmod 600 "$f"
}

cfg() { env_get "$CONFIG_FILE" "$1"; }
sec() { env_get "$SECRETS_FILE" "$1"; }
api_domain() { local d; d=$(cfg API_DOMAIN); printf '%s' "${d:-$DEFAULT_DOMAIN}"; }
app_mode() { local m; m=$(cfg APP_MODE); printf '%s' "${m:-maintenance}"; }

# Optional server-local overrides (e.g. bigger mem_limit after an upgrade to 2 GB) survive deploys:
# /opt/uroki/compose.override.yml
compose() {
  local files=(-f "$KIT_DIR/docker-compose.yml")
  [ -f "$UROKI_DIR/compose.override.yml" ] && files+=(-f "$UROKI_DIR/compose.override.yml")
  docker compose --project-directory "$KIT_DIR" "${files[@]}" \
    --env-file "$KIT_DIR/versions.env" --env-file "$CONFIG_FILE" --env-file "$SECRETS_FILE" "$@"
}

# psql in the db container. Password via the environment (docker exec -e NAME copies it, argv stays clean).
db_psql() { # [psql args...]  as postgres (owner of the app tables, like migrations in the cloud)
  PGPASSWORD=$(sec POSTGRES_PASSWORD) PGOPTIONS='-c client_min_messages=warning' compose exec -T -e PGPASSWORD -e PGOPTIONS db \
    psql -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -U postgres -d postgres "$@"
}
db_admin() { # [psql args...]  as supabase_admin (superuser)
  PGPASSWORD=$(sec POSTGRES_PASSWORD) PGOPTIONS='-c client_min_messages=warning' compose exec -T -e PGPASSWORD -e PGOPTIONS db \
    psql -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -U supabase_admin -d postgres "$@"
}
db_q() { db_psql -At -c "$1"; }

container_state() {
  local id
  id=$(compose ps -q "$1" 2>/dev/null || true)
  [ -n "$id" ] || { echo missing; return; }
  docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$id"
}

wait_healthy() { # service [timeout seconds]
  local svc=$1 timeout=${2:-180} t=0 s
  while :; do
    s=$(container_state "$svc")
    case $s in
      healthy) return 0 ;;
      running) case $svc in rest | caddy) return 0 ;; esac ;; # no healthcheck in these images
    esac
    [ "$t" -ge "$timeout" ] && { compose logs --tail 40 "$svc" >&2 || true; die "service $svc is '$s' after ${timeout}s"; }
    sleep 3
    t=$((t + 3))
  done
}

# Bundle uploaded by the workflow: <bundle>/kit (= deploy/lite), <bundle>/app/functions/app, <bundle>/app/migrations
install_kit() { # source kit dir
  local src=$1
  [ "$src" = "$KIT_DIR" ] && return 0
  rm -rf "$KIT_DIR.new"
  mkdir -p "$KIT_DIR.new"
  cp -a "$src/." "$KIT_DIR.new/"
  chown -R root:root "$KIT_DIR.new"
  find "$KIT_DIR.new" -type d -exec chmod 755 {} +
  find "$KIT_DIR.new" -type f -exec chmod 644 {} +
  chmod 755 "$KIT_DIR.new"/*.sh
  rm -rf "$KIT_DIR.old"
  if [ -d "$KIT_DIR" ]; then mv "$KIT_DIR" "$KIT_DIR.old"; fi
  mv "$KIT_DIR.new" "$KIT_DIR"
  rm -rf "$KIT_DIR.old"
}

sync_app() { # bundle dir
  local b=$1
  [ -f "$b/app/functions/app/index.ts" ] || die "bundle has no app/functions/app/index.ts"
  compgen -G "$b/app/migrations/*.sql" >/dev/null || die "bundle has no app/migrations/*.sql"
  mkdir -p "$APP_DIR"
  rm -rf "$APP_DIR/functions.new" "$APP_DIR/migrations.new"
  mkdir -p "$APP_DIR/functions.new"
  cp -a "$b/app/functions/app" "$APP_DIR/functions.new/app"
  find "$APP_DIR/functions.new" -name '*_test.ts' -delete
  cp -a "$b/app/migrations" "$APP_DIR/migrations.new"
  chown -R root:root "$APP_DIR/functions.new" "$APP_DIR/migrations.new"
  chmod -R a+rX,go-w "$APP_DIR/functions.new" "$APP_DIR/migrations.new"
  rm -rf "$APP_DIR/functions" "$APP_DIR/migrations"
  mv "$APP_DIR/functions.new" "$APP_DIR/functions"
  mv "$APP_DIR/migrations.new" "$APP_DIR/migrations"
}

# Fetch the function's npm/jsr dependencies into data/deno and pin them in app/deno.lock.
# The running container uses --cached-only --frozen: it never downloads anything itself.
deno_cache() {
  local img
  img=$(env_get "$KIT_DIR/versions.env" DENO_IMAGE)
  mkdir -p "$DATA_DIR/deno" "$APP_DIR/lock"
  chown -R 1000:1000 "$DATA_DIR/deno" "$APP_DIR/lock"
  log "deno cache (dependencies pinned in $APP_DIR/lock/deno.lock)"
  docker run --rm --user 1000:1000 -v "$APP_DIR:/srv:ro" -v "$APP_DIR/lock:/srv/lock" -v "$DATA_DIR/deno:/deno-dir" \
    "$img" cache --lock=/srv/lock/deno.lock /srv/functions/app/index.ts >&2
}

# Apply supabase/migrations/*.sql in filename order, each once, each in its own transaction with its record row.
# Sets MIGRATIONS_APPLIED (number of files applied now).
MIGRATIONS_APPLIED=0
apply_migrations() {
  local f name sha have n=0
  log "migrations: admin shim"
  db_admin -f - <"$KIT_DIR/sql/admin.sql"
  log "migrations: pre shim"
  db_psql -v fn_url="https://$(api_domain)/functions/v1/app" -f - <"$KIT_DIR/sql/pre.sql"
  for f in "$APP_DIR"/migrations/*.sql; do
    name=$(basename "$f")
    [[ $name =~ ^[0-9]{8,14}_[A-Za-z0-9_]+\.sql$ ]] || die "unexpected migration file name: $name"
    sha=$(sha256sum "$f" | cut -d' ' -f1)
    have=$(db_psql -At -v n="$name" -f - <<<"select sha256 from uroki_meta.migrations where name = :'n';")
    if [ -n "$have" ]; then
      [ "$have" = "$sha" ] || warn "$name changed after it was applied (not re-run; write a new migration instead)"
      continue
    fi
    log "migrations: applying $name"
    { cat "$f"; printf '\n'; cat "$KIT_DIR/sql/record.sql"; } |
      db_psql -1 -v uroki_mig="$name" -v uroki_sha="$sha" -f - >/dev/null
    n=$((n + 1))
  done
  log "migrations: post shim (local app-tick)"
  db_psql -f - <"$KIT_DIR/sql/post.sql" >/dev/null
  MIGRATIONS_APPLIED=$n
  log "migrations: $n applied, $(db_q 'select count(*) from uroki_meta.migrations') recorded in total"
}

# Role passwords used by PostgREST and Storage (idempotent; values come from secrets.env via the environment).
set_role_passwords() {
  AUTH_PW=$(sec AUTHENTICATOR_PASSWORD) STORE_PW=$(sec STORAGE_DB_PASSWORD) PGPASSWORD=$(sec POSTGRES_PASSWORD) \
    compose exec -T -e PGPASSWORD -e AUTH_PW -e STORE_PW db \
    psql -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -U supabase_admin -d postgres -f - <<'SQL'
\getenv auth_pw AUTH_PW
\getenv store_pw STORE_PW
alter role authenticator with login password :'auth_pw';
alter role supabase_storage_admin with login password :'store_pw';
SQL
}

# GET /functions/v1/app/ must answer {"ok":true,...}; POST /join with a bogus code must give 404
# (exercises PostgREST + the app_rate_hit rpc; 429/500 mean the DB path is broken).
health_check() { # base url, extra curl args...
  local base=$1 body code
  shift
  body=$(curl -fsS --max-time 20 "$@" "$base/functions/v1/app/" 2>&1) || { warn "health: $base/functions/v1/app/ -> $body"; return 1; }
  printf '%s' "$body" | grep -q '"ok":true' || { warn "health: unexpected answer: $body"; return 1; }
  code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 "$@" -X POST -H 'content-type: application/json' \
    -d '{"code":"ZZZZZZ"}' "$base/functions/v1/app/join" || true)
  [ "$code" = 404 ] || { warn "health: POST /join with a bogus code -> HTTP $code (expected 404)"; return 1; }
  log "health OK: $base/functions/v1/app/ -> $body; /join bogus -> 404"
}

# Health through Caddy + TLS on this host, independent of public DNS.
local_https_health() {
  local d
  d=$(api_domain)
  health_check "https://$d" --noproxy '*' --resolve "$d:443:127.0.0.1"
}

# Health of the function container itself (inside docker, no Caddy): used in maintenance mode.
internal_health() {
  local out
  out=$(compose exec -T functions wget -q -O - http://127.0.0.1:8000/functions/v1/app/ 2>&1) || { warn "function: $out"; return 1; }
  printf '%s' "$out" | grep -q '"ok":true' || { warn "function: $out"; return 1; }
  log "function container OK: $out"
}
