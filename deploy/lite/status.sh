#!/usr/bin/env bash
# Read-only state of the lite stack (the `status` action): containers + memory, mode, migrations, tick, TLS, backups.
#   sudo /opt/uroki/kit/status.sh
set -Euo pipefail
# shellcheck source=lib.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
need_root
[ -f "$CONFIG_FILE" ] || die "not installed (no $CONFIG_FILE)"
d=$(api_domain)
bad=0
h() { printf '\n===== %s\n' "$*"; }

h "Mode: $(app_mode)   API: https://$d/functions/v1/app/"

h "Containers"
compose ps --format 'table {{.Service}}\t{{.Status}}\t{{.Image}}'
for s in db rest storage functions caddy; do
  st=$(container_state "$s")
  case $st in healthy | running) ;; *) echo ">>> $s: $st"; bad=1 ;; esac
done

h "Memory (limit per container, whole stack <= ~650 MB)"
mapfile -t ids < <(compose ps -q)
[ ${#ids[@]} -eq 0 ] || docker stats --no-stream --format 'table {{.Name}}\t{{.MemUsage}}\t{{.CPUPerc}}' "${ids[@]}"
free -m
df -h "$UROKI_DIR" | tail -1 | awk '{ print "disk " $5 " used, " $4 " free" }'

h "Migrations"
db_psql -c "select name, left(sha256, 12) as sha, applied_at from uroki_meta.migrations order by name" || bad=1

h "5-minute tick (pg_cron -> pg_net -> functions:8000)"
db_psql -c "select jobname, schedule, active from cron.job order by jobid" || bad=1
db_psql -c "select status_code, left(coalesce(error_msg, content::text, ''), 80) as answer, created
            from net._http_response order by id desc limit 3" 2>/dev/null || true
ok=$(db_q "select count(*) from net._http_response where created > now() - interval '15 minutes' and status_code = 200" 2>/dev/null || echo 0)
echo "successful ticks in the last 15 min: ${ok:-0}"
[ "${ok:-0}" -gt 0 ] || { echo ">>> no successful tick in 15 minutes"; bad=1; }

h "Health"
internal_health || bad=1
code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 --noproxy '*' --resolve "$d:443:127.0.0.1" "https://$d/functions/v1/app/" || true)
echo "https://$d/functions/v1/app/ via this host's Caddy -> HTTP $code"
end=$(echo | timeout 10 openssl s_client -connect 127.0.0.1:443 -servername "$d" 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
echo "TLS certificate valid until: ${end:-unknown}"

h "Backups ($BACKUP_DIR)"
for b in "$BACKUP_DIR"/20*; do [ -d "$b" ] && echo "  $(basename "$b")  $(du -sh "$b" | cut -f1)"; done
systemctl list-timers uroki-backup.timer --no-pager --no-legend 2>/dev/null | sed 's/^/  next: /'

if [ "$bad" -eq 0 ]; then log "status: OK"; else warn "status: problems above"; exit 1; fi
