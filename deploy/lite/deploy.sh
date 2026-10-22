#!/usr/bin/env bash
# New function code / migrations / pinned images. Run by the `deploy` action of server.yml (and on push to main):
#   sudo <bundle>/kit/deploy.sh
# Steps: install the kit + app code, deno cache, pull/recreate changed containers, apply pending migrations,
# restart the function, health check (fails the job when not OK).
set -Eeuo pipefail
SRC_KIT=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
BUNDLE=$(dirname "$SRC_KIT")
# shellcheck source=lib.sh
. "$SRC_KIT/lib.sh"
need_root
if [ ! -s "$SECRETS_FILE" ] || [ ! -f "$CONFIG_FILE" ]; then die "not installed yet: run the 'install' action first"; fi
command -v docker >/dev/null || die "docker missing: run the 'install' action first"

caddy_sum() { sha256sum < "$KIT_DIR/caddy/Caddyfile" 2>/dev/null | cut -d' ' -f1; }
before=$(caddy_sum)
install_kit "$SRC_KIT"
sync_app "$BUNDLE"
compose config -q || die "docker compose config failed"

compose pull -q --policy missing # images are pinned by digest: present = identical
compose up -d --remove-orphans db
wait_healthy db 300
compose up -d --remove-orphans rest storage
wait_healthy storage 240
apply_migrations
deno_cache
compose up -d --remove-orphans
# the Caddy container bind-mounts kit/caddy, which install_kit replaced: restart it when the file changed
if [ "$before" != "$(caddy_sum)" ]; then
  log "Caddyfile changed: restarting caddy"
  compose restart caddy >/dev/null
fi
# PostgREST also gets NOTIFY pgrst from post.sql; a restart makes the new schema certain
[ "$MIGRATIONS_APPLIED" -eq 0 ] || compose restart rest >/dev/null
compose restart functions >/dev/null
wait_healthy functions 120

internal_health || die "the function does not answer inside docker: sudo docker logs --tail 50 uroki-functions-1"
mode=$(app_mode)
if [ "$mode" = local ]; then
  ok=0
  for _ in 1 2 3 4 5 6; do
    if local_https_health; then ok=1; break; fi
    sleep 5
  done
  [ "$ok" -eq 1 ] || die "health check through https://$(api_domain) failed"
else
  warn "mode is '$mode': the public URL answers 503 by design; only the function container was checked"
fi
log "deployed. memory: $(free -m | awk '/^Mem:/ { print $3 " / " $2 " MB" }')"
