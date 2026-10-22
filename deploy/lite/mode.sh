#!/usr/bin/env bash
# Switch what https://API_DOMAIN/functions/v1/app serves:
#   sudo /opt/uroki/kit/mode.sh local         # the function
#   sudo /opt/uroki/kit/mode.sh maintenance   # 503 JSON «Идут технические работы…» (nothing is written)
# The 5-minute tick goes straight to the function container and keeps running in both modes.
set -Eeuo pipefail
# shellcheck source=lib.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
need_root
mode=${1:-}
case $mode in local | maintenance) ;; *) die "usage: $0 local|maintenance" ;; esac
[ -f "$CONFIG_FILE" ] || die "not installed yet"
env_set "$CONFIG_FILE" APP_MODE "$mode"
compose --progress quiet up -d caddy # APP_MODE is a container env var: compose recreates Caddy (~1 s)
wait_healthy caddy 60
sleep 2
d=$(api_domain)
code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 --noproxy '*' --resolve "$d:443:127.0.0.1" "https://$d/functions/v1/app/" || true)
log "mode=$mode; https://$d/functions/v1/app/ -> HTTP $code"
case $mode in
  local) [ "$code" = 200 ] || die "expected 200 in local mode" ;;
  maintenance) [ "$code" = 503 ] || die "expected 503 in maintenance mode" ;;
esac
