#!/usr/bin/env bash
# Server side of the `migrate-from-cloud` action. Reads from stdin what the runner streams over SSH:
#   1. pg_dump --data-only of the cloud's public.app_* tables (except app_secrets), Postgres 17 client
#   2. "copy pg_temp._cloud_secrets from stdin" with the cloud's app_secrets rows whose key starts with app_
#   3. the line "-- UROKI-IMPORT-COMPLETE" (written only when 1 and 2 succeeded)
# Then, in ONE transaction on this server: truncate every local public.app_* table (except app_secrets), load the
# rows, upsert the app_% secrets, set app_fn_url back to this server. Any error = rollback, nothing changes.
# The stream is buffered to a root-only file under /opt/uroki/tmp and deleted at the end.
set -Eeuo pipefail
# shellcheck source=lib.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
need_root
[ -s "$SECRETS_FILE" ] || die "not installed yet"
SENTINEL='-- UROKI-IMPORT-COMPLETE'

umask 077
install -d -m 700 "$UROKI_DIR/tmp"
buf=$(mktemp "$UROKI_DIR/tmp/cloud-import.XXXXXX")
trap 'rm -f "$buf"' EXIT
cat >"$buf"
[ "$(grep -v '^[[:space:]]*$' "$buf" | tail -n 1)" = "$SENTINEL" ] || die "incomplete stream from the runner (no end marker): nothing imported"
grep -q '^-- PostgreSQL database dump complete' "$buf" || die "the cloud pg_dump did not finish: nothing imported"
log "received $(du -h "$buf" | cut -f1) from the runner"

mapfile -t tables < <(db_q "select tablename from pg_tables where schemaname = 'public' and tablename like 'app\_%' and tablename <> 'app_secrets' order by 1")
[ ${#tables[@]} -gt 0 ] || die "no local app_* tables: run install/deploy first"
list=""
for t in "${tables[@]}"; do
  [[ $t =~ ^app_[a-z0-9_]+$ ]] || die "unexpected table name: $t"
  list+="${list:+, }public.${t}"
done
fn_url="https://$(api_domain)/functions/v1/app"

log "loading into ${#tables[@]} local app_* tables in one transaction (truncate + copy)"
{
  echo "set session_replication_role = replica;" # rows arrive in dump order; FK checks off during the load only
  echo "truncate table ${list} restart identity;"
  cat "$buf"
  echo "insert into public.app_secrets (key, value) select key, value from pg_temp._cloud_secrets where key like 'app\\_%' and key <> 'app_fn_url'"
  echo "  on conflict (key) do update set value = excluded.value;"
  echo "insert into public.app_secrets (key, value) values ('app_fn_url', :'fn_url')"
  echo "  on conflict (key) do update set value = excluded.value;"
  echo "set session_replication_role = origin;"
} | db_admin -1 -v fn_url="$fn_url" -f - >/dev/null
rm -f "$buf"

# the function caches secrets (app_cron_key etc.) in memory: restart it so it reads the imported ones
compose restart functions >/dev/null
wait_healthy functions 120

log "row counts now (local):"
sql=""
for t in "${tables[@]}"; do sql+="${sql:+ union all }select '${t}', count(*) from public.${t}"; done
db_q "$sql order by 1" | awk -F'|' '{ printf "  %-24s %s\n", $1, $2 }' >&2
log "app_secrets keys: $(db_q "select string_agg(key, ' ' order by key) from public.app_secrets")"
warn "Photos/voice notes were NOT copied (cloud Storage stays as is): old photo links in the imported rows show as missing."
warn "The cloud's own 'app-tick' still runs: while both are on, families with data in both places may get double reminders."
warn "Telegram (if used): the bot webhook still points at the cloud; call POST $fn_url/setup-bot with x-cron-key after the switch."
