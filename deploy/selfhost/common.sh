# shellcheck shell=bash
# Shared helpers for bootstrap.sh / redeploy.sh / migrate.sh / backup.sh / healthcheck.sh.
# Sourced, never executed. Keeps every secret out of argv (ps) and out of the repository.

BASE_DIR=${BASE_DIR:-/opt/uroki}            # everything on the server lives here
STACK_DIR=${STACK_DIR:-$BASE_DIR/stack}     # official supabase/docker at the pinned commit + our override
CONFIG_FILE=${CONFIG_FILE:-$BASE_DIR/config.env}     # non-secret settings (copied from .env.example)
SECRETS_FILE=${SECRETS_FILE:-$BASE_DIR/secrets.env}  # generated once by bootstrap.sh, chmod 600, never leaves the server
LOCK_FILE=${LOCK_FILE:-$BASE_DIR/supabase-docker.lock}

log() { printf '\033[1;34m[%s]\033[0m %s\n' "$(date +%H:%M:%S)" "$*" >&2; }
warn() { printf '\033[1;33m[%s] WARN:\033[0m %s\n' "$(date +%H:%M:%S)" "$*" >&2; }
die() {
  printf '\033[1;31m[%s] ERROR:\033[0m %s\n' "$(date +%H:%M:%S)" "$*" >&2
  exit 1
}
need_root() { [ "$(id -u)" -eq 0 ] || die "run as root (sudo $0 ...)"; }

# Read KEY=value from an env file without sourcing it (no code execution); strips one pair of quotes.
env_get() {
  [ -f "$1" ] || return 0
  awk -v k="$2" 'index($0, k "=") == 1 { v = substr($0, length(k) + 2) } END {
    if (v ~ /^".*"$/ || v ~ /^\047.*\047$/) v = substr(v, 2, length(v) - 2); print v }' "$1"
}

# Replace or append KEY=value in an env file, keeping its permissions.
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
}

# Export KEY=value lines from a file for keys that are not already set (environment wins).
load_kv_file() {
  local f=$1 line k v
  [ -f "$f" ] || return 0
  while IFS= read -r line || [ -n "$line" ]; do
    case $line in '' | '#'*) continue ;; esac
    k=${line%%=*}
    v=${line#*=}
    [[ $k =~ ^[A-Z_][A-Z0-9_]*$ ]] || continue
    if [[ $v =~ ^\"(.*)\"$ ]] || [[ $v =~ ^\'(.*)\'$ ]]; then v=${BASH_REMATCH[1]}; fi
    if [ -z "${!k+x}" ]; then export "$k=$v"; fi
  done <"$f"
}

# Precedence: environment > /opt/uroki/config.env > kit versions.env > built-in defaults.
load_config() {
  load_kv_file "$CONFIG_FILE"
  load_kv_file "$KIT_DIR/versions.env"
  : "${APP_MODE:=maintenance}"
  : "${SSH_PORT:=22}"
  : "${SWAP_SIZE:=4G}"
  : "${CLOUD_FN_HOST:=cmranrfjvvmhktntbnpg.supabase.co}"
  : "${PG_CLIENT_IMAGE:=postgres:17.6-alpine}"
  : "${BACKUP_DIR:=/var/backups/uroki}"
  : "${BACKUP_KEEP_DAYS:=7}"
  : "${BACKUP_REMOTE_KEEP_DAYS:=30}"
  export APP_MODE SSH_PORT SWAP_SIZE CLOUD_FN_HOST PG_CLIENT_IMAGE BACKUP_DIR BACKUP_KEEP_DAYS BACKUP_REMOTE_KEEP_DAYS
}

valid_domain() { [[ ${1:-} =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$ ]]; }
valid_mode() { case ${1:-} in local | maintenance | cloud) return 0 ;; *) return 1 ;; esac }

compose() {
  docker compose --project-directory "$STACK_DIR" \
    -f "$STACK_DIR/docker-compose.yml" -f "$STACK_DIR/docker-compose.override.yml" "$@"
}

stack_env() { env_get "$STACK_DIR/.env" "$1"; }

# psql inside the self-hosted db container (server-matched client). Password via env, not argv.
dst_psql() {
  PGPASSWORD=$(stack_env POSTGRES_PASSWORD) compose exec -T -e PGPASSWORD db \
    psql -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -U "${DST_DB_USER:-postgres}" -d postgres "$@"
}

# Copy the function source shipped in the kit into the edge-runtime volume.
sync_function() {
  local src="$KIT_DIR/functions/app"
  [ -f "$src/index.ts" ] || die "no $src/index.ts — copy supabase/functions/app into the kit (the GitHub workflow does this)"
  mkdir -p "$STACK_DIR/volumes/functions/app"
  rsync -a --delete --exclude '*_test.ts' "$src/" "$STACK_DIR/volumes/functions/app/"
}

# Install the kit itself under /opt/uroki/kit so timers never run scripts from a user-writable home dir.
install_kit() {
  if [ "$KIT_DIR" != "$BASE_DIR/kit" ]; then
    mkdir -p "$BASE_DIR/kit"
    rsync -a --delete --chown=root:root --chmod=D755,F644 "$KIT_DIR/" "$BASE_DIR/kit/"
    chmod 755 "$BASE_DIR"/kit/*.sh
  fi
}

install_stack_files() {
  install -m 0644 "$KIT_DIR/docker-compose.override.yml" "$STACK_DIR/docker-compose.override.yml"
  # Caddy mounts the directory (not the file) so a reload sees the new inode
  mkdir -p "$STACK_DIR/caddy" "$STACK_DIR/volumes/caddy/data" "$STACK_DIR/volumes/caddy/config"
  install -m 0644 "$KIT_DIR/Caddyfile" "$STACK_DIR/caddy/Caddyfile"
}

container_health() {
  local id
  id=$(compose ps -q "$1" 2>/dev/null || true)
  [ -n "$id" ] || { echo missing; return; }
  docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$id"
}

wait_healthy() {
  local svc=$1 timeout=${2:-180} t=0 s
  while :; do
    s=$(container_health "$svc")
    case $s in healthy | running) return 0 ;; esac
    [ "$t" -ge "$timeout" ] && die "service $svc is '$s' after ${timeout}s (docker compose logs $svc)"
    sleep 5
    t=$((t + 5))
  done
}

# GET <base>/functions/v1/app/ must answer {"ok":true,...}
smoke() {
  local url="$1/functions/v1/app/" body
  body=$(curl -fsS --max-time 20 "$url" 2>/dev/null) || { warn "smoke: $url did not answer"; return 1; }
  if printf '%s' "$body" | grep -q '"ok":true'; then
    log "smoke OK: $url -> $body"
  else
    warn "smoke: unexpected answer from $url: $body"
    return 1
  fi
}

# Optional owner alert (Telegram; no personal data is ever put in the text).
alert() {
  local text="[uroki $(hostname)] $*"
  warn "$text"
  if [ -n "${ALERT_TG_BOT_TOKEN:-}" ] && [ -n "${ALERT_TG_CHAT_ID:-}" ]; then
    printf 'url = "https://api.telegram.org/bot%s/sendMessage"\n' "$ALERT_TG_BOT_TOKEN" |
      curl -fsS --max-time 15 -K - --data-urlencode "chat_id=$ALERT_TG_CHAT_ID" --data-urlencode "text=$text" -o /dev/null || true
  fi
}
