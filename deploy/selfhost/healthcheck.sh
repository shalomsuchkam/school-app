#!/usr/bin/env bash
# Every 5 minutes (systemd timer uroki-health.timer). Alerts the owner only when the state changes
# (ALERT_TG_BOT_TOKEN/ALERT_TG_CHAT_ID), and pings HEALTHCHECK_PING_URL (dead-man switch) while healthy.
set -Euo pipefail
KIT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=common.sh
. "$KIT_DIR/common.sh"
need_root
load_config
STATE=$BASE_DIR/health.state
problems=()

mode=$(stack_env APP_MODE)
domain=$(stack_env API_DOMAIN)
for s in db kong functions storage rest caddy; do
  h=$(container_health "$s")
  case $h in healthy | running) ;; *) problems+=("$s=$h") ;; esac
done
smoke "http://127.0.0.1:8000" 2>/dev/null || problems+=("local function down")
if [ "$mode" != maintenance ]; then smoke "https://${domain}" 2>/dev/null || problems+=("public URL down"); fi

disk=$(df --output=pcent / | tail -1 | tr -dc '0-9')
[ "$disk" -lt 85 ] || problems+=("disk ${disk}%")

# The tick must reach the function: pg_net keeps recent responses in net._http_response
if [ "$mode" = local ] && [ "$(dst_psql -At -c "select count(*) from cron.job where jobname = 'app-tick' and active" 2>/dev/null)" = 1 ]; then
  ok=$(dst_psql -At -c "select count(*) from net._http_response where created > now() - interval '15 minutes' and status_code = 200" 2>/dev/null || echo 0)
  [ "${ok:-0}" -gt 0 ] || problems+=("app-tick: no successful call in 15 min")
fi

# certificate expiry (Caddy renews ~30 days before)
if [ "$mode" != maintenance ]; then
  end=$(echo | timeout 10 openssl s_client -connect "${domain}:443" -servername "$domain" 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
  if [ -n "$end" ] && [ $(($(date -d "$end" +%s) - $(date +%s))) -lt $((14 * 86400)) ]; then problems+=("TLS cert expires $end"); fi
fi

now=$([ ${#problems[@]} -eq 0 ] && echo ok || echo "${problems[*]}")
prev=$(cat "$STATE" 2>/dev/null || echo ok)
if [ "$now" != "$prev" ]; then
  if [ "$now" = ok ]; then alert "recovered"; else alert "problem: $now"; fi
  echo "$now" >"$STATE"
fi
if [ "$now" = ok ] && [ -n "${HEALTHCHECK_PING_URL:-}" ]; then curl -fsS --max-time 10 -o /dev/null "$HEALTHCHECK_PING_URL" || true; fi
[ "$now" = ok ]
