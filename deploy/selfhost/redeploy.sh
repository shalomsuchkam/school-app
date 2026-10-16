#!/usr/bin/env bash
# Updates the running stack after bootstrap.sh: new `app` function code, override/Caddyfile changes, mode switch.
#
#   sudo ./redeploy.sh                     # deploy functions/app from this kit, restart edge runtime
#   sudo ./redeploy.sh --mode local        # also switch what https://API_DOMAIN/functions/v1/app serves
#                                          #   (local | maintenance | cloud), see Caddyfile
#   sudo ./redeploy.sh --status            # read-only: containers, smoke tests, cron job, disk
set -Eeuo pipefail
KIT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=common.sh
. "$KIT_DIR/common.sh"

MODE=""
STATUS=0
while [ $# -gt 0 ]; do
  case $1 in
    --mode) MODE=${2:-}; shift ;;
    --status) STATUS=1 ;;
    -h | --help) sed -n '2,8p' "$0"; exit 0 ;;
    *) die "unknown argument: $1" ;;
  esac
  shift
done

need_root
load_config
[ -f "$STACK_DIR/.env" ] || die "no $STACK_DIR/.env — run bootstrap.sh first"
API_DOMAIN=$(stack_env API_DOMAIN)

status() {
  log "mode: $(stack_env APP_MODE)   domain: ${API_DOMAIN}   supabase/docker: $(cat "$LOCK_FILE" 2>/dev/null || echo '?')"
  compose ps --format 'table {{.Service}}\t{{.Status}}'
  smoke "http://127.0.0.1:8000" || true
  smoke "https://${API_DOMAIN}" || true
  dst_psql -c "select jobname, schedule, active from cron.job order by jobname" || true
  dst_psql -c "select status, count(*) from cron.job_run_details where start_time > now() - interval '1 hour' group by 1" 2>/dev/null || true
  df -h / | tail -1
  free -h | sed -n '1,2p'
}

if [ "$STATUS" -eq 1 ]; then
  status
  exit 0
fi

if [ -n "$MODE" ]; then
  valid_mode "$MODE" || die "--mode must be local, maintenance or cloud"
  env_set "$STACK_DIR/.env" APP_MODE "$MODE"
  env_set "$CONFIG_FILE" APP_MODE "$MODE"
  log "APP_MODE -> $MODE"
fi

install_kit
install_stack_files
sync_function
compose config -q || die "docker compose config failed"
compose up -d --remove-orphans # recreates caddy when APP_MODE changed
compose restart functions      # edge runtime picks up the new code
compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile >/dev/null 2>&1 || compose restart caddy
wait_healthy functions 120

for i in 1 2 3 4 5 6; do
  smoke "http://127.0.0.1:8000" && break
  [ "$i" -eq 6 ] && die "local smoke test failed — docker compose logs functions"
  sleep 5
done
if [ "$(stack_env APP_MODE)" = maintenance ]; then
  log "maintenance mode: public URL answers 503 on purpose"
else
  smoke "https://${API_DOMAIN}" || die "public smoke test failed (DNS / certificate / Caddy: docker compose logs caddy)"
fi
