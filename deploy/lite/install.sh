#!/usr/bin/env bash
# First install / re-install of the lite backend (idempotent). Run by the `install` action of server.yml:
#   sudo [API_DOMAIN=api.urokiapp.kz] [ACME_EMAIL=you@example.com] [APP_MODE=local|maintenance] \
#        <bundle>/kit/install.sh [--skip-os]
# <bundle> = what the workflow uploads: kit/ (= deploy/lite), app/functions/app, app/migrations.
#
# Changes outside /opt/uroki (and nothing else): apt packages (docker from download.docker.com if missing, ufw,
# unattended-upgrades), a 2 GB swapfile if the server has no swap, ufw rules 22/80/443 (+ the sshd port),
# systemd units uroki-backup.service/.timer. Other sites, containers, nginx/apache, /var/www: never touched.
set -Eeuo pipefail
SRC_KIT=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
BUNDLE=$(dirname "$SRC_KIT")
# shellcheck source=lib.sh
. "$SRC_KIT/lib.sh"

SKIP_OS=0
while [ $# -gt 0 ]; do
  case $1 in
    --skip-os) SKIP_OS=1 ;;
    -h | --help) sed -n '2,11p' "$0"; exit 0 ;;
    *) die "unknown argument: $1" ;;
  esac
  shift
done
need_root
# shellcheck disable=SC1091
[ -r /etc/os-release ] && . /etc/os-release
[ "${ID:-}" = ubuntu ] || warn "made for Ubuntu 22.04 (found ${PRETTY_NAME:-unknown})"

DOMAIN=${API_DOMAIN:-$(api_domain)}
[[ $DOMAIN =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$ ]] || die "invalid API_DOMAIN: $DOMAIN"
MODE=${APP_MODE:-$(cfg APP_MODE)}
MODE=${MODE:-local}
case $MODE in local | maintenance) ;; *) die "APP_MODE must be local or maintenance" ;; esac
EMAIL=${ACME_EMAIL:-$(cfg ACME_EMAIL)}

# ---------------------------------------------------------------- 0. ports 80/443 must be free or ours
check_ports() {
  local lines ours=0 bad
  lines=$(ss -H -tlnp '( sport = :80 or sport = :443 )' 2>/dev/null || true)
  [ -n "$lines" ] || return 0
  if command -v docker >/dev/null 2>&1 &&
    docker ps -q --filter label=com.docker.compose.project=uroki --filter label=com.docker.compose.service=caddy | grep -q .; then
    ours=1
  fi
  # our Caddy shows up as docker-proxy; anything else (nginx, apache, another container) is not ours
  bad=$(printf '%s\n' "$lines" | grep -v 'users:(("docker-proxy"' || true)
  [ "$ours" -eq 1 ] || bad=$lines
  if [ -n "$bad" ]; then
    printf '%s\n' "$bad" >&2
    die "ports 80/443 are taken by something that is not this kit (above). The kit never stops or deletes other
       sites (e.g. the old «amor flowers»): stop/disable that web server yourself, re-run the 'inspect' action to
       confirm 80/443 are free, then run 'install' again."
  fi
}
check_ports

# ---------------------------------------------------------------- 1. OS: packages, unattended-upgrades, swap, ufw
os_setup() {
  log "OS: packages, unattended-upgrades, swap, ufw"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -q
  apt-get install -y -q ca-certificates curl gnupg jq openssl ufw unattended-upgrades iproute2 >/dev/null
  cat >/etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF
  systemctl enable --now unattended-upgrades >/dev/null 2>&1 || true

  if ! swapon --show --noheadings | grep -q .; then
    local sw=/swapfile
    [ -e "$sw" ] && sw=/swapfile-uroki
    log "no swap: creating 2 GB $sw"
    fallocate -l 2G "$sw" 2>/dev/null || dd if=/dev/zero of="$sw" bs=1M count=2048 status=none
    chmod 600 "$sw"
    mkswap "$sw" >/dev/null
    swapon "$sw"
    grep -q "^$sw " /etc/fstab || echo "$sw none swap sw 0 0" >>/etc/fstab
    echo 'vm.swappiness=10' >/etc/sysctl.d/90-uroki-swap.conf
    sysctl -q -p /etc/sysctl.d/90-uroki-swap.conf || true
  fi

  local p ports="22 ${SSH_PORT:-}"
  ports+=" $(ss -H -tlnp 2>/dev/null | awk '/"sshd"/ { n = split($4, a, ":"); print a[n] }' | sort -u | tr '\n' ' ')"
  for p in $ports; do
    [[ $p =~ ^[0-9]+$ ]] && ufw allow "$p/tcp" >/dev/null
  done
  ufw allow 80/tcp >/dev/null
  ufw allow 443/tcp >/dev/null
  if ! ufw status | grep -q 'Status: active'; then
    ufw default deny incoming >/dev/null
    ufw default allow outgoing >/dev/null
    ufw --force enable >/dev/null
  fi
  log "ufw: $(ufw status | head -1); allowed: $(echo "$ports" | xargs -n1 | sort -un | tr '\n' ' ')80 443"
}

install_docker() {
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    log "docker present: $(docker --version)"
  else
    log "installing Docker Engine + compose plugin from download.docker.com"
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME:-jammy} stable" \
      >/etc/apt/sources.list.d/docker.list
    apt-get update -q
    if command -v docker >/dev/null 2>&1; then
      DEBIAN_FRONTEND=noninteractive apt-get install -y -q docker-compose-plugin >/dev/null # keep the existing engine
    else
      DEBIAN_FRONTEND=noninteractive apt-get install -y -q docker-ce docker-ce-cli containerd.io docker-compose-plugin >/dev/null
    fi
  fi
  systemctl enable --now docker >/dev/null 2>&1 || true
  local v
  v=$(docker compose version --short | sed 's/^v//')
  [ "$(printf '%s\n2.24.0\n' "$v" | sort -V | head -1)" = 2.24.0 ] || die "docker compose $v is too old (need >= 2.24)"
}

# ---------------------------------------------------------------- 2. /opt/uroki layout, config, secrets
b64url() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }
make_jwt() { # role secret -> HS256 JWT valid for 10 years
  local now h p s
  now=$(date +%s)
  h=$(printf '{"alg":"HS256","typ":"JWT"}' | b64url)
  p=$(printf '{"role":"%s","iss":"supabase","iat":%d,"exp":%d}' "$1" "$now" $((now + 315360000)) | b64url)
  s=$(printf '%s.%s' "$h" "$p" | openssl dgst -sha256 -hmac "$2" -binary | b64url)
  printf '%s.%s.%s' "$h" "$p" "$s"
}
ensure_secret() { [ -n "$(sec "$1")" ] || env_set "$SECRETS_FILE" "$1" "$2"; }

layout() {
  umask 022
  mkdir -p "$UROKI_DIR" "$APP_DIR" "$DATA_DIR/storage" "$DATA_DIR/caddy/data" "$DATA_DIR/caddy/config" "$DATA_DIR/deno"
  install -d -m 700 "$BACKUP_DIR" "$UROKI_DIR/tmp"
  chmod 755 "$UROKI_DIR"
  [ -f "$CONFIG_FILE" ] || install -m 600 /dev/null "$CONFIG_FILE"
  env_set "$CONFIG_FILE" API_DOMAIN "$DOMAIN"
  env_set "$CONFIG_FILE" APP_MODE "$MODE"
  env_set "$CONFIG_FILE" ACME_EMAIL "$EMAIL"

  umask 077
  if [ ! -s "$SECRETS_FILE" ] && docker volume inspect uroki-db-data >/dev/null 2>&1; then
    die "$SECRETS_FILE is missing but the database volume uroki-db-data exists: restore secrets.env from your copy"
  fi
  [ -f "$SECRETS_FILE" ] || install -m 600 /dev/null "$SECRETS_FILE"
  ensure_secret POSTGRES_PASSWORD "$(openssl rand -hex 24)"
  ensure_secret AUTHENTICATOR_PASSWORD "$(openssl rand -hex 24)"
  ensure_secret STORAGE_DB_PASSWORD "$(openssl rand -hex 24)"
  ensure_secret JWT_SECRET "$(openssl rand -hex 32)"
  ensure_secret ANON_KEY "$(make_jwt anon "$(sec JWT_SECRET)")"
  ensure_secret SERVICE_ROLE_KEY "$(make_jwt service_role "$(sec JWT_SECRET)")"
  chmod 600 "$SECRETS_FILE"
  chown root:root "$SECRETS_FILE" "$CONFIG_FILE"
  umask 022
}

# ---------------------------------------------------------------- 3. start the stack, schema, function
start_stack() {
  compose config -q || die "docker compose config failed"
  log "pulling images (first run: a few minutes)"
  compose pull -q --policy missing # pinned by digest: present = identical
  compose up -d db
  wait_healthy db 300
  set_role_passwords
  compose up -d rest storage
  wait_healthy storage 240
  apply_migrations
  deno_cache
  compose up -d --remove-orphans
  compose restart rest >/dev/null # fresh schema cache after the migrations
  wait_healthy functions 120
  internal_health || die "the function does not answer inside docker (compose logs functions)"
  if [ "$MODE" = local ]; then
    local i
    for i in $(seq 1 12); do
      local_https_health 2>/dev/null && break
      [ "$i" -eq 12 ] && warn "HTTPS check failed: does $DOMAIN point to this server (A record) and are 80/443 reachable? Caddy log: docker logs uroki-caddy-1"
      sleep 10
    done
  fi
}

install_timers() {
  cat >/etc/systemd/system/uroki-backup.service <<EOF
[Unit]
Description=Uroki nightly backup (app_* tables + storage files, kept 7 days in $BACKUP_DIR)
After=docker.service
[Service]
Type=oneshot
ExecStart=$KIT_DIR/backup.sh
Nice=10
IOSchedulingClass=idle
EOF
  cat >/etc/systemd/system/uroki-backup.timer <<'EOF'
[Unit]
Description=Uroki nightly backup at 03:15 Almaty time
[Timer]
OnCalendar=*-*-* 03:15:00 Asia/Almaty
RandomizedDelaySec=10m
Persistent=true
[Install]
WantedBy=timers.target
EOF
  systemctl daemon-reload
  systemctl enable --now uroki-backup.timer >/dev/null
}

# ---------------------------------------------------------------- main
[ "$SKIP_OS" -eq 1 ] || os_setup
install_docker
layout
install_kit "$SRC_KIT"
sync_site
sync_app "$BUNDLE"
start_stack
install_timers
site_health || true
log "memory now: $(free -m | awk '/^Mem:/ { print $3 " MB used of " $2 }'), swap: $(free -m | awk '/^Swap:/ { print $2 " MB" }')"
cat >&2 <<EOF

==================================================================================
 Installed. Mode: ${MODE}.  API: https://${DOMAIN}/functions/v1/app/
 Secrets (JWT, DB passwords): ${SECRETS_FILE} (root only). Copy it to the owner's password manager:
   sudo cat ${SECRETS_FILE}     (on the server, never in CI)
 Data: docker volume uroki-db-data, ${DATA_DIR}/storage. Backups: ${BACKUP_DIR} (03:15 Almaty, 7 days).
==================================================================================
EOF
