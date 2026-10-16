#!/usr/bin/env bash
# Prepares a fresh Ubuntu 24.04 VPS and starts self-hosted Supabase for the Uroki `app` function.
# Idempotent: safe to re-run (it is also what the "bootstrap" action of .github/workflows/selfhost.yml runs).
#
#   sudo API_DOMAIN=api.example.kz ACME_EMAIL=ops@example.kz ./bootstrap.sh [--mode maintenance|local|cloud]
#                                                                           [--skip-os] [--upgrade]
#
# Layout on the server:
#   /opt/uroki/kit/            this directory (scripts + functions/app), root-owned copy
#   /opt/uroki/supabase-src/   sparse git checkout of supabase/supabase at SUPABASE_DOCKER_COMMIT (docker/ only)
#   /opt/uroki/stack/          working copy of docker/ + docker-compose.override.yml + caddy/ + .env (600)
#   /opt/uroki/config.env      non-secret settings, /opt/uroki/secrets.env generated secrets (600)
set -Eeuo pipefail
KIT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=common.sh
. "$KIT_DIR/common.sh"

SKIP_OS=0
UPGRADE=0
MODE_ARG=""
while [ $# -gt 0 ]; do
  case $1 in
    --skip-os) SKIP_OS=1 ;;
    --upgrade) UPGRADE=1 ;;
    --mode) MODE_ARG=${2:-}; shift ;;
    -h | --help) sed -n '2,15p' "$0"; exit 0 ;;
    *) die "unknown argument: $1" ;;
  esac
  shift
done

need_root
[ -r /etc/os-release ] && . /etc/os-release
[ "${ID:-}" = ubuntu ] || warn "tested on Ubuntu 24.04 only (found ${PRETTY_NAME:-unknown})"
mkdir -p "$BASE_DIR"
chmod 755 "$BASE_DIR"
load_config
[ -n "$MODE_ARG" ] && APP_MODE=$MODE_ARG
valid_domain "${API_DOMAIN:-}" || die "API_DOMAIN is missing or invalid (e.g. api.example.kz)"
[[ ${ACME_EMAIL:-} == *@*.* ]] || die "ACME_EMAIL is missing or invalid"
valid_mode "$APP_MODE" || die "APP_MODE must be local, maintenance or cloud"
[[ ${SUPABASE_DOCKER_COMMIT:-} =~ ^[0-9a-f]{40}$ ]] || die "set SUPABASE_DOCKER_COMMIT (and SUPABASE_DOCKER_REF) in versions.env — see the comment there"
[[ ${SSH_PORT} =~ ^[0-9]+$ ]] || die "SSH_PORT must be a number"

persist_config() {
  [ -f "$CONFIG_FILE" ] || install -m 600 /dev/null "$CONFIG_FILE"
  env_set "$CONFIG_FILE" API_DOMAIN "$API_DOMAIN"
  env_set "$CONFIG_FILE" ACME_EMAIL "$ACME_EMAIL"
  env_set "$CONFIG_FILE" APP_MODE "$APP_MODE"
  env_set "$CONFIG_FILE" SSH_PORT "$SSH_PORT"
  chmod 600 "$CONFIG_FILE"
}

# ---------------------------------------------------------------- OS
os_setup() {
  log "OS: packages, unattended-upgrades, swap, fail2ban, ufw"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -q
  apt-get install -y -q ca-certificates curl gnupg git rsync jq openssl ufw fail2ban unattended-upgrades
  timedatectl set-timezone Asia/Almaty 2>/dev/null || true

  cat >/etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF
  # Ubuntu security updates only (default origins); Docker itself is upgraded by hand.
  cat >/etc/apt/apt.conf.d/52uroki-unattended <<'EOF'
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-Time "04:30";
Unattended-Upgrade::Remove-Unused-Kernel-Packages "true";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
EOF
  systemctl enable --now unattended-upgrades >/dev/null 2>&1 || true

  if ! swapon --show --noheadings | grep -q .; then
    log "creating ${SWAP_SIZE} swap"
    fallocate -l "$SWAP_SIZE" /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=4096 status=none
    chmod 600 /swapfile
    mkswap /swapfile >/dev/null
    swapon /swapfile
    grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >>/etc/fstab
  fi
  printf 'vm.swappiness=10\nvm.overcommit_memory=1\n' >/etc/sysctl.d/90-uroki.conf
  sysctl --system >/dev/null

  cat >/etc/fail2ban/jail.d/uroki.local <<EOF
[DEFAULT]
bantime = 1h
findtime = 10m
maxretry = 5
backend = systemd

[sshd]
enabled = true
port = ${SSH_PORT}
EOF
  systemctl enable fail2ban >/dev/null 2>&1
  systemctl restart fail2ban

  ufw default deny incoming >/dev/null
  ufw default allow outgoing >/dev/null
  ufw allow "${SSH_PORT}/tcp" >/dev/null
  ufw allow 80/tcp >/dev/null
  ufw allow 443/tcp >/dev/null
  ufw --force enable >/dev/null
  log "ufw: $(ufw status | head -1); open: ${SSH_PORT}/tcp 80/tcp 443/tcp"

  # Key-only SSH, but only when the sudo user already has a key (never lock the owner out).
  local user_home keys
  user_home=$(getent passwd "${SUDO_USER:-root}" | cut -d: -f6)
  keys="${user_home}/.ssh/authorized_keys"
  if [ -s "$keys" ]; then
    cat >/etc/ssh/sshd_config.d/60-uroki.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
EOF
    sshd -t && (systemctl reload ssh 2>/dev/null || systemctl reload sshd 2>/dev/null || true)
  else
    warn "no $keys — password SSH left enabled; add a key and re-run"
  fi
}

install_docker() {
  if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
    log "installing Docker Engine + compose plugin from download.docker.com"
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME:-noble} stable" \
      >/etc/apt/sources.list.d/docker.list
    apt-get update -q
    DEBIAN_FRONTEND=noninteractive apt-get install -y -q docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  fi
  # userland-proxy off: published ports keep the real client IP and are IPv4-only (no AAAA record).
  local want='{"log-driver":"json-file","log-opts":{"max-size":"10m","max-file":"5"},"userland-proxy":false,"live-restore":true}'
  if [ "$(jq -cS . /etc/docker/daemon.json 2>/dev/null)" != "$(printf '%s' "$want" | jq -cS .)" ]; then
    printf '%s\n' "$want" | jq . >/etc/docker/daemon.json
    systemctl restart docker
  fi
  systemctl enable --now docker >/dev/null 2>&1
  local v
  v=$(docker compose version --short | sed 's/^v//')
  [ "$(printf '%s\n2.24.4\n' "$v" | sort -V | head -1)" = 2.24.4 ] || die "docker compose $v < 2.24.4 (needed for !reset/!override)"
}

# ---------------------------------------------------------------- upstream supabase/docker at a pinned commit
fetch_upstream() {
  local src=$BASE_DIR/supabase-src head tag_sha
  if [ ! -d "$src/.git" ]; then
    git init -q "$src"
    git -C "$src" remote add origin https://github.com/supabase/supabase.git
    git -C "$src" config core.sparseCheckout true
    echo 'docker/' >"$src/.git/info/sparse-checkout"
  fi
  head=$(git -C "$src" rev-parse -q --verify HEAD 2>/dev/null || true)
  if [ "$head" != "$SUPABASE_DOCKER_COMMIT" ]; then
    if [ -n "${SUPABASE_DOCKER_REF:-}" ] && [[ $SUPABASE_DOCKER_REF != CHANGE_ME* ]]; then
      tag_sha=$(git -C "$src" ls-remote origin "refs/tags/${SUPABASE_DOCKER_REF}^{}" "refs/tags/${SUPABASE_DOCKER_REF}" |
        awk '/\^\{\}$/ { p = $1 } !/\^\{\}$/ { t = $1 } END { print (p != "" ? p : t) }')
      [ "$tag_sha" = "$SUPABASE_DOCKER_COMMIT" ] ||
        die "tag ${SUPABASE_DOCKER_REF} points to '${tag_sha:-nothing}', not ${SUPABASE_DOCKER_COMMIT}; fix versions.env"
    fi
    log "fetching supabase/supabase@${SUPABASE_DOCKER_COMMIT} (docker/ only)"
    git -C "$src" fetch -q --depth 1 --filter=blob:none origin "$SUPABASE_DOCKER_COMMIT"
    git -C "$src" -c advice.detachedHead=false checkout -q --force FETCH_HEAD
  fi
  [ "$(git -C "$src" rev-parse HEAD)" = "$SUPABASE_DOCKER_COMMIT" ] || die "checkout is not at the pinned commit"
  [ -f "$src/docker/docker-compose.yml" ] && [ -f "$src/docker/.env.example" ] || die "unexpected upstream layout: no docker/docker-compose.yml"
  [ -f "$src/docker/volumes/functions/main/index.ts" ] || die "unexpected upstream layout: no volumes/functions/main"

  if [ -f "$LOCK_FILE" ] && [ "$(cat "$LOCK_FILE")" != "$SUPABASE_DOCKER_COMMIT" ] && [ "$UPGRADE" -ne 1 ]; then
    die "the stack runs $(cat "$LOCK_FILE"); versions.env asks for ${SUPABASE_DOCKER_COMMIT}. Take a snapshot + backup, read the upstream docker/CHANGELOG.md, then re-run with --upgrade"
  fi
  if [ -d "$STACK_DIR/volumes/db/data" ] && [ -f "$LOCK_FILE" ] && [ "$UPGRADE" -eq 1 ]; then
    "$KIT_DIR/backup.sh" || die "pre-upgrade backup failed"
  fi

  mkdir -p "$STACK_DIR"
  rsync -a --exclude '/.env' --exclude '/volumes/db/data/' --exclude '/volumes/storage/' --exclude '/volumes/functions/' \
    --exclude '/volumes/caddy/' --exclude '/docker-compose.override.yml' --exclude '/caddy/' "$src/docker/" "$STACK_DIR/"
  mkdir -p "$STACK_DIR/volumes/functions" "$STACK_DIR/volumes/storage"
  rsync -a --delete "$src/docker/volumes/functions/main/" "$STACK_DIR/volumes/functions/main/"
}

# ---------------------------------------------------------------- secrets + .env
b64url() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }
make_jwt() { # role secret
  local now exp h p s
  now=$(date +%s)
  exp=$((now + 10 * 365 * 24 * 3600))
  h=$(printf '{"alg":"HS256","typ":"JWT"}' | b64url)
  p=$(printf '{"role":"%s","iss":"supabase","iat":%d,"exp":%d}' "$1" "$now" "$exp" | b64url)
  s=$(printf '%s.%s' "$h" "$p" | openssl dgst -sha256 -hmac "$2" -binary | b64url)
  printf '%s.%s.%s' "$h" "$p" "$s"
}
ensure_secret() { # key value-if-missing
  [ -n "$(env_get "$SECRETS_FILE" "$1")" ] || env_set "$SECRETS_FILE" "$1" "$2"
}

make_secrets() {
  umask 077
  if [ ! -s "$SECRETS_FILE" ] && [ -d "$STACK_DIR/volumes/db/data" ] && [ -n "$(ls -A "$STACK_DIR/volumes/db/data" 2>/dev/null)" ]; then
    die "$SECRETS_FILE is missing but the database already exists — restore secrets.env from the backup instead of generating new ones"
  fi
  [ -f "$SECRETS_FILE" ] || install -m 600 /dev/null "$SECRETS_FILE"
  ensure_secret POSTGRES_PASSWORD "$(openssl rand -hex 24)"
  ensure_secret JWT_SECRET "$(openssl rand -hex 32)"
  local js
  js=$(env_get "$SECRETS_FILE" JWT_SECRET)
  ensure_secret ANON_KEY "$(make_jwt anon "$js")"
  ensure_secret SERVICE_ROLE_KEY "$(make_jwt service_role "$js")"
  ensure_secret DASHBOARD_PASSWORD "u$(openssl rand -hex 16)"
  ensure_secret SECRET_KEY_BASE "$(openssl rand -hex 32)"
  ensure_secret VAULT_ENC_KEY "$(openssl rand -hex 16)"
  ensure_secret PG_META_CRYPTO_KEY "$(openssl rand -hex 16)"
  ensure_secret LOGFLARE_PUBLIC_ACCESS_TOKEN "$(openssl rand -hex 24)"
  ensure_secret LOGFLARE_PRIVATE_ACCESS_TOKEN "$(openssl rand -hex 24)"
  ensure_secret LOGFLARE_API_KEY "$(openssl rand -hex 24)"
  ensure_secret POOLER_TENANT_ID "uroki"
  chmod 600 "$SECRETS_FILE"
}

render_env() {
  local f=$STACK_DIR/.env k
  [ -f "$f" ] || install -m 600 "$STACK_DIR/.env.example" "$f"
  chmod 600 "$f"
  for k in POSTGRES_PASSWORD JWT_SECRET ANON_KEY SERVICE_ROLE_KEY DASHBOARD_PASSWORD SECRET_KEY_BASE VAULT_ENC_KEY \
    PG_META_CRYPTO_KEY LOGFLARE_PUBLIC_ACCESS_TOKEN LOGFLARE_PRIVATE_ACCESS_TOKEN LOGFLARE_API_KEY POOLER_TENANT_ID; do
    env_set "$f" "$k" "$(env_get "$SECRETS_FILE" "$k")"
  done
  env_set "$f" DASHBOARD_USERNAME uroki-admin
  env_set "$f" API_EXTERNAL_URL "https://${API_DOMAIN}"
  env_set "$f" SUPABASE_PUBLIC_URL "https://${API_DOMAIN}"
  env_set "$f" SITE_URL "https://${API_DOMAIN}"
  env_set "$f" KONG_HTTP_PORT 8000
  env_set "$f" FUNCTIONS_VERIFY_JWT false
  # GoTrue is not used by the app: no sign-ups of any kind
  env_set "$f" DISABLE_SIGNUP true
  env_set "$f" ENABLE_EMAIL_SIGNUP false
  env_set "$f" ENABLE_PHONE_SIGNUP false
  env_set "$f" ENABLE_ANONYMOUS_USERS false
  env_set "$f" STUDIO_DEFAULT_ORGANIZATION Uroki
  env_set "$f" STUDIO_DEFAULT_PROJECT Uroki
  # read by docker-compose.override.yml / Caddyfile
  env_set "$f" API_DOMAIN "$API_DOMAIN"
  env_set "$f" ACME_EMAIL "$ACME_EMAIL"
  env_set "$f" APP_MODE "$APP_MODE"
  env_set "$f" CLOUD_FN_HOST "$CLOUD_FN_HOST"

  local bad
  bad=$(grep -E '^[A-Z_]+=.*(your-super-secret|your-32-character|this_password_is_insecure|your-tenant-id|your-encryption-key)' "$f" | cut -d= -f1 | tr '\n' ' ' || true)
  [ -z "$bad" ] || die "upstream placeholders still present in $f: $bad(add them to make_secrets/render_env)"
}

start_stack() {
  local s services
  compose config -q || die "docker compose config failed"
  services=$(compose config --services)
  for s in db kong functions storage rest caddy supavisor analytics; do
    grep -qx "$s" <<<"$services" || die "service '$s' not found in the upstream compose file — review docker-compose.override.yml for this Supabase version"
  done
  log "pulling images (first run takes a few minutes)"
  compose pull -q
  compose up -d --remove-orphans
  wait_healthy db 300
  wait_healthy kong 180
  wait_healthy functions 180
  # pg_cron / pg_net for the app's 5-minute tick (migrate.sh schedules the job itself)
  dst_psql -c 'create extension if not exists pg_net; create extension if not exists pg_cron;' || warn "could not create pg_net/pg_cron yet; migrate.sh retries"
  local i
  for i in 1 2 3 4 5 6; do
    smoke "http://127.0.0.1:8000" && break
    [ "$i" -eq 6 ] && warn "local smoke test failed — check: docker compose logs functions"
    sleep 10
  done
  echo "$SUPABASE_DOCKER_COMMIT" >"$LOCK_FILE"
}

install_timers() {
  cat >/etc/systemd/system/uroki-backup.service <<EOF
[Unit]
Description=Uroki nightly backup (app_* data + app-photos)
After=docker.service
[Service]
Type=oneshot
ExecStart=$BASE_DIR/kit/backup.sh
Nice=10
EOF
  cat >/etc/systemd/system/uroki-backup.timer <<'EOF'
[Unit]
Description=Uroki nightly backup
[Timer]
OnCalendar=*-*-* 03:15:00
RandomizedDelaySec=10m
Persistent=true
[Install]
WantedBy=timers.target
EOF
  cat >/etc/systemd/system/uroki-health.service <<EOF
[Unit]
Description=Uroki health check
After=docker.service
[Service]
Type=oneshot
ExecStart=$BASE_DIR/kit/healthcheck.sh
EOF
  cat >/etc/systemd/system/uroki-health.timer <<'EOF'
[Unit]
Description=Uroki health check every 5 minutes
[Timer]
OnBootSec=5min
OnUnitActiveSec=5min
[Install]
WantedBy=timers.target
EOF
  systemctl daemon-reload
  systemctl enable --now uroki-backup.timer uroki-health.timer >/dev/null
}

# ---------------------------------------------------------------- main
persist_config
[ "$SKIP_OS" -eq 1 ] || os_setup
install_docker
install_kit
fetch_upstream
rm -rf "$STACK_DIR/volumes/functions/hello" # upstream demo function
install_stack_files
sync_function
make_secrets
render_env
start_stack
install_timers

cat >&2 <<EOF

==================================================================================
 Done. APP_MODE=${APP_MODE}. Public URL: https://${API_DOMAIN}/functions/v1/app/
 Studio (never public):  ssh -L 8000:127.0.0.1:8000 ${SUDO_USER:-root}@<server>  ->  http://localhost:8000
   user: uroki-admin   password: sudo grep DASHBOARD_PASSWORD ${SECRETS_FILE}
 Next: migration (README, section "Переезд"): sudo /opt/uroki/kit/migrate.sh --dry-run
 Keep a copy of ${SECRETS_FILE} in the owner's password manager.
==================================================================================
EOF
