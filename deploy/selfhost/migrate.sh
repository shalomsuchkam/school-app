#!/usr/bin/env bash
# Moves ONLY the Uroki mobile-app backend from Supabase Cloud (cmranrfjvvmhktntbnpg) to this server.
#
# What moves:  tables public.app_* (schema + data), functions public.app_* (app_rate_hit), extensions pg_net/pg_cron,
#              bucket app-photos (row + objects), app_secrets rows with key 'app_%' (app_fn_url rewritten),
#              the 'app-tick' cron job (re-created here against this server).
# Never touched: every other table/function/bucket/cron job of the cloud project (the legacy system: tables without
#              the app_ prefix, edge function `hw`, cron job `hw-tick`, non-app_ keys in app_secrets).
# The cloud is only READ, except the explicit `cloud-freeze` step (unschedules 'app-tick' only).
#
# Usage (on the server, as root):
#   sudo ./migrate.sh --dry-run                 # read-only plan: connectivity, objects, row counts
#   sudo ./migrate.sh --yes                     # = preflight schema data secrets storage verify   (re-runnable)
#   sudo ./migrate.sh --yes cron telegram       # at cutover: start the 5-min tick here, re-point the Telegram webhook
#   sudo ./migrate.sh --yes cloud-freeze        # at cutover: stop 'app-tick' in the cloud (+ optional CLOUD_MIN_BUILD)
#   sudo ./migrate.sh verify | cron-off | <step...>
# Options: --dry-run (no writes anywhere), --yes (no prompts), --reset-schema (drop + recreate app_* on THIS server).
#
# Credentials: /opt/uroki/migrate.env (chmod 600; see .env.example section C) or the environment:
#   SRC_DB_URL, SRC_SUPABASE_URL, SRC_SERVICE_ROLE_KEY [, CRON_FN_URL, CLOUD_MIN_BUILD]
# Destination credentials come from /opt/uroki/stack/.env (written by bootstrap.sh).
set -Eeuo pipefail
KIT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=common.sh
. "$KIT_DIR/common.sh"

DRY_RUN=0
ASSUME_YES=0
RESET_SCHEMA=0
STEPS=()
while [ $# -gt 0 ]; do
  case $1 in
    --dry-run) DRY_RUN=1 ;;
    --yes | -y) ASSUME_YES=1 ;;
    --reset-schema) RESET_SCHEMA=1 ;;
    -h | --help) sed -n '2,24p' "$0"; exit 0 ;;
    -*) die "unknown option: $1" ;;
    *) STEPS+=("$1") ;;
  esac
  shift
done
[ ${#STEPS[@]} -gt 0 ] || STEPS=(all)

need_root
load_kv_file "${MIGRATE_ENV:-$BASE_DIR/migrate.env}"
load_config
: "${SRC_SUPABASE_URL:=https://cmranrfjvvmhktntbnpg.supabase.co}"
: "${CRON_FN_URL:=http://kong:8000/functions/v1/app}"
EXPECTED_SRC_REF=${EXPECTED_SRC_REF:-cmranrfjvvmhktntbnpg}
BUCKET=app-photos
[ -n "${SRC_DB_URL:-}" ] || die "SRC_DB_URL is not set (see .env.example section C)"
[[ $SRC_DB_URL == *"<"* ]] && die "SRC_DB_URL still contains a <placeholder>"
[ -f "$STACK_DIR/.env" ] || die "no $STACK_DIR/.env — run bootstrap.sh first"
API_DOMAIN=$(stack_env API_DOMAIN)
DST_KEY=$(stack_env SERVICE_ROLE_KEY)
DST_API=${DST_API_URL:-http://127.0.0.1:8000}
PUBLIC_FN_URL="https://${API_DOMAIN}/functions/v1/app"
[[ $SRC_SUPABASE_URL == *"$EXPECTED_SRC_REF"* ]] || warn "SRC_SUPABASE_URL is not project ${EXPECTED_SRC_REF}"
[[ $SRC_DB_URL == *"$EXPECTED_SRC_REF"* ]] || warn "SRC_DB_URL does not mention project ${EXPECTED_SRC_REF}"
[ "${SRC_SUPABASE_URL%/}" != "https://${API_DOMAIN}" ] || die "source and destination are the same"
command -v docker >/dev/null || die "docker missing"

WORK=$BASE_DIR/migrate-work # dumps hold personal data: root-only, on this KZ server, removed at the end
umask 077
mkdir -p "$WORK"
chmod 700 "$WORK"
# keys go to curl via header files (-H @file), never argv
printf 'Authorization: Bearer %s\napikey: %s\n' "${SRC_SERVICE_ROLE_KEY:-}" "${SRC_SERVICE_ROLE_KEY:-}" >"$WORK/src.hdr"
printf 'Authorization: Bearer %s\napikey: %s\n' "$DST_KEY" "$DST_KEY" >"$WORK/dst.hdr"
cleanup() { rm -f "$WORK"/*.hdr "$WORK"/obj.* 2>/dev/null || true; }
trap cleanup EXIT
export SRC_DB_URL

# ---------------------------------------------------------------- source access (read-only)
src_run() { docker run --rm -i --network host -e SRC_DB_URL -e PGCONNECT_TIMEOUT=20 "$PG_CLIENT_IMAGE" "$@"; }
# every source session is read-only
src_psql() {
  src_run sh -c 'exec psql "$SRC_DB_URL" -X -q -v ON_ERROR_STOP=1 -c "set default_transaction_read_only = on" "$@"' psql "$@"
}
src_q() { src_psql -At -c "$1"; } # single query -> unaligned rows
src_pg_dump() { src_run sh -c 'exec pg_dump "$SRC_DB_URL" "$@"' pg_dump "$@"; }
src_psql_rw() { src_run sh -c 'exec psql "$SRC_DB_URL" -X -q -v ON_ERROR_STOP=1 "$@"' psql "$@"; } # cloud-freeze only
dst_q() { dst_psql -At -c "$1"; }

confirm() {
  [ "$ASSUME_YES" -eq 1 ] && return 0
  [ -t 0 ] || die "$1 — re-run with --yes to confirm"
  local a
  read -r -p "$1 [y/N] " a
  [[ $a =~ ^[Yy]$ ]] || die "aborted"
}
dry() { [ "$DRY_RUN" -eq 1 ]; }

# pg_dump 17 writes "SET transaction_timeout", unknown to Postgres 15 (self-hosted image) -> drop it
sanitize() { sed -e '/^SET transaction_timeout/d'; }

SQL_APP_TABLES="select tablename from pg_tables where schemaname = 'public' and tablename like 'app\_%' order by 1"
SQL_APP_FUNCS="select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'app\_%' order by 1"
SQL_COLS="select table_name || ' ' || string_agg(column_name || ':' || data_type || ':' || is_nullable, ',' order by column_name)
  from information_schema.columns where table_schema = 'public' and table_name like 'app\_%' group by table_name order by table_name"
SQL_OBJECTS="select name from storage.objects where bucket_id = '${BUCKET}' order by name"

check_names() { # every interpolated identifier must look like app_xxx
  local n
  for n in "$@"; do [[ $n =~ ^app_[a-z0-9_]+$ ]] || die "unexpected table name '$n'"; done
}
src_tables() { mapfile -t SRC_TABLES < <(src_q "$SQL_APP_TABLES"); check_names "${SRC_TABLES[@]}"; }
dst_tables() { mapfile -t DST_TABLES < <(dst_q "$SQL_APP_TABLES"); [ ${#DST_TABLES[@]} -eq 0 ] || check_names "${DST_TABLES[@]}"; }

count_sql() { # build "select 't', count(*) from public.t union all ..."
  local t sql="" sep=""
  for t in "$@"; do
    sql+="${sep}select '${t}', count(*) from public.${t}"
    sep=" union all "
  done
  printf '%s' "$sql"
}

# ---------------------------------------------------------------- steps
step_preflight() {
  log "== preflight"
  wait_healthy db 60
  local sv dv
  sv=$(src_q "show server_version_num") || die "cannot connect to the cloud DB (SRC_DB_URL; use the IPv4 Session pooler string)"
  dv=$(dst_q "show server_version_num")
  log "postgres: cloud ${sv}, server ${dv}"
  [ "${sv:0:2}" -le "${dv:0:2}" ] || warn "cloud Postgres major is newer than the server's — plain SQL restore usually works for these simple tables; verify will tell"
  src_tables
  [ ${#SRC_TABLES[@]} -gt 0 ] || die "no public.app_* tables in the cloud?"
  log "cloud app tables (${#SRC_TABLES[@]}): ${SRC_TABLES[*]}"
  log "cloud app functions: $(src_q "$SQL_APP_FUNCS" | tr '\n' ' ')"
  log "cloud extensions: $(src_q "select string_agg(extname || ' ' || extversion, ', ') from pg_extension where extname in ('pg_cron','pg_net','pgcrypto')")"
  log "cloud cron jobs (only 'app-tick' is ours): $(src_q "select string_agg(jobname || ' [' || schedule || ']' || case when active then '' else ' (inactive)' end, ', ' order by jobname) from cron.job")"
  log "cloud app_secrets keys to copy: $(src_q "select string_agg(key, ' ' order by key) from public.app_secrets where key like 'app\_%'")"
  local objs
  objs=$(src_q "select count(*) || ' objects, ' || pg_size_pretty(coalesce(sum((metadata->>'size')::bigint), 0)) from storage.objects where bucket_id = '${BUCKET}'")
  log "cloud bucket ${BUCKET}: ${objs}"
  log "cloud row counts:"
  src_q "$(count_sql "${SRC_TABLES[@]}")" | { column -t -s '|' 2>/dev/null || cat; } >&2
  [ -n "${SRC_SERVICE_ROLE_KEY:-}" ] && [[ $SRC_SERVICE_ROLE_KEY != *"<"* ]] || die "SRC_SERVICE_ROLE_KEY is not set"
  local code
  code=$(curl -sS -o /dev/null -w '%{http_code}' -H "@$WORK/src.hdr" "${SRC_SUPABASE_URL%/}/storage/v1/bucket/${BUCKET}" || true)
  [ "$code" = 200 ] || die "cloud storage API answered ${code} for bucket ${BUCKET} (check SRC_SERVICE_ROLE_KEY)"
  code=$(curl -sS -o /dev/null -w '%{http_code}' -H "@$WORK/dst.hdr" "${DST_API}/storage/v1/bucket" || true)
  [ "$code" = 200 ] || die "local storage API answered ${code}"
  log "free disk: $(df -h "$BASE_DIR" | awk 'NR==2 {print $4}')"
}

step_schema() {
  log "== schema (extensions, app_* tables, app_* functions, grants, bucket)"
  src_tables
  dst_tables
  if dry; then
    log "[dry-run] would ensure pg_net/pg_cron, create ${#SRC_TABLES[@]} tables if absent (server has ${#DST_TABLES[@]}), copy functions, bucket ${BUCKET}"
    return
  fi
  dst_psql -c 'create extension if not exists pg_net; create extension if not exists pg_cron;'

  if [ "$RESET_SCHEMA" -eq 1 ] && [ ${#DST_TABLES[@]} -gt 0 ]; then
    confirm "DROP all ${#DST_TABLES[@]} public.app_* tables on THIS SERVER (${API_DOMAIN}) and recreate them from the cloud?"
    local t list=""
    for t in "${DST_TABLES[@]}"; do list+="${list:+, }public.${t}"; done
    dst_psql -c "drop table if exists ${list} cascade"
    DST_TABLES=()
  fi

  if [ ${#DST_TABLES[@]} -eq 0 ]; then
    log "creating tables from the cloud schema"
    src_pg_dump --schema-only --no-owner --no-privileges --table='public.app_*' | sanitize >"$WORK/schema.sql"
    [ -s "$WORK/schema.sql" ] || die "empty schema dump"
    dst_psql -1 -f - <"$WORK/schema.sql"
  else
    src_q "$SQL_COLS" >"$WORK/cols.src"
    dst_q "$SQL_COLS" >"$WORK/cols.dst"
    if ! diff -u "$WORK/cols.src" "$WORK/cols.dst" >"$WORK/cols.diff"; then
      cat "$WORK/cols.diff" >&2
      die "schema drift between cloud and server (above). Re-run with --reset-schema (wipes app data on THIS server only)"
    fi
    log "tables already present, columns match"
  fi

  log "functions"
  src_q "select string_agg(pg_get_functiondef(p.oid), E';\n') || ';' from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname like 'app\_%'" >"$WORK/functions.sql"
  [ -s "$WORK/functions.sql" ] && dst_psql -1 -f - <"$WORK/functions.sql"

  log "least-privilege grants (as in migration 20261016): RLS on, no anon/authenticated, service_role only"
  dst_psql -1 <<'SQL'
do $$
declare r record;
begin
  for r in select tablename from pg_tables where schemaname = 'public' and tablename like 'app\_%' loop
    execute format('alter table public.%I enable row level security', r.tablename);
    execute format('revoke all on table public.%I from anon, authenticated', r.tablename);
    execute format('grant all on table public.%I to service_role', r.tablename);
  end loop;
  for r in select sequencename from pg_sequences where schemaname = 'public' and sequencename like 'app\_%' loop
    execute format('revoke all on sequence public.%I from anon, authenticated', r.sequencename);
    execute format('grant usage, select, update on sequence public.%I to service_role', r.sequencename);
  end loop;
  for r in select p.oid::regprocedure as f from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname like 'app\_%' loop
    execute format('revoke all on function %s from public, anon, authenticated', r.f);
    execute format('grant execute on function %s to service_role', r.f);
  end loop;
end $$;
SQL

  log "bucket ${BUCKET}"
  local row pub size mimes
  row=$(src_q "select public, coalesce(file_size_limit::text, ''), coalesce(array_to_string(allowed_mime_types, ','), '') from storage.buckets where id = '${BUCKET}'")
  [ -n "$row" ] || die "bucket ${BUCKET} not found in the cloud"
  IFS='|' read -r pub size mimes <<<"$row"
  [[ $pub =~ ^[tf]$ ]] && [[ $size =~ ^[0-9]*$ ]] && [[ $mimes =~ ^[a-z0-9/.+,-]*$ ]] || die "unexpected bucket row: $row"
  dst_psql -v pub="$pub" -v size="${size:-}" -v mimes="{${mimes}}" <<SQL
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('${BUCKET}', '${BUCKET}', :'pub'::boolean, nullif(:'size', '')::bigint, nullif(:'mimes', '{}')::text[])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
SQL
}

step_data() {
  log "== data (all public.app_* rows except app_secrets)"
  src_tables
  dst_tables
  [ ${#DST_TABLES[@]} -gt 0 ] || { dry && { log "[dry-run] tables would be created by the schema step first"; return; }; die "run the schema step first"; }
  local t truncate=""
  for t in "${DST_TABLES[@]}"; do [ "$t" = app_secrets ] || truncate+="${truncate:+, }public.${t}"; done
  local existing
  existing=$(dst_q "select coalesce(sum(n), 0) from ($(count_sql "${DST_TABLES[@]}" | sed 's/count(\*)/count(*) as n/')) x")
  if dry; then
    log "[dry-run] would replace ${existing} existing rows on the server with a fresh copy of the cloud rows"
    return
  fi
  [ "$existing" -gt 0 ] && confirm "Replace ${existing} rows in app_* tables on THIS SERVER with the current cloud data?"
  src_pg_dump --data-only --no-owner --no-privileges --table='public.app_*' --exclude-table-data='public.app_secrets' |
    sanitize >"$WORK/data.sql"
  [ -s "$WORK/data.sql" ] || die "empty data dump"
  log "loading $(du -h "$WORK/data.sql" | cut -f1) in one transaction"
  { printf 'truncate table %s restart identity;\n' "$truncate"; cat "$WORK/data.sql"; } | dst_psql -1 -f -
}

step_secrets() {
  log "== app_secrets (keys app_%, app_fn_url -> ${PUBLIC_FN_URL})"
  local keys
  keys=$(src_q "select string_agg(key, ' ' order by key) from public.app_secrets where key like 'app\_%' and key <> 'app_fn_url'")
  if dry; then
    log "[dry-run] would upsert: ${keys} + app_fn_url"
    return
  fi
  dst_tables
  printf '%s\n' "${DST_TABLES[@]}" | grep -qx app_secrets || die "public.app_secrets missing on the server (schema step)"
  src_psql -c "copy (select key, value from public.app_secrets where key like 'app\_%' and key <> 'app_fn_url' order by key) to stdout" >"$WORK/secrets.tsv"
  {
    echo "create temp table _s (key text primary key, value text);"
    echo "copy _s (key, value) from stdin;"
    cat "$WORK/secrets.tsv"
    printf '\\.\n'
    echo "insert into public.app_secrets (key, value) select key, value from _s on conflict (key) do update set value = excluded.value;"
    echo "insert into public.app_secrets (key, value) values ('app_fn_url', :'fn_url') on conflict (key) do update set value = excluded.value;"
  } | dst_psql -1 -v fn_url="$PUBLIC_FN_URL" -f -
  rm -f "$WORK/secrets.tsv"
  log "copied: ${keys}"
}

step_storage() {
  log "== storage objects of ${BUCKET}"
  src_q "$SQL_OBJECTS" >"$WORK/objects.src"
  dst_q "$SQL_OBJECTS" >"$WORK/objects.dst" 2>/dev/null || : >"$WORK/objects.dst"
  comm -23 "$WORK/objects.src" "$WORK/objects.dst" >"$WORK/objects.todo"
  local total todo extra
  total=$(wc -l <"$WORK/objects.src")
  todo=$(wc -l <"$WORK/objects.todo")
  extra=$(comm -13 "$WORK/objects.src" "$WORK/objects.dst" | wc -l)
  log "cloud: ${total}, already here: $((total - todo)), to copy: ${todo}, only on server: ${extra} (left as is; retention purge removes them)"
  if dry; then return; fi
  local name ct ok=0 fail=0 n=0
  while IFS= read -r name; do
    n=$((n + 1))
    if [[ ! $name =~ ^[A-Za-z0-9._/-]+$ ]] || [[ $name == *..* ]]; then
      warn "skip unusual object name: $name"
      fail=$((fail + 1))
      continue
    fi
    case ${name##*.} in png) ct=image/png ;; webp) ct=image/webp ;; *) ct=image/jpeg ;; esac
    if curl -fsS --retry 3 --max-time 120 -H "@$WORK/src.hdr" -o "$WORK/obj.bin" "${SRC_SUPABASE_URL%/}/storage/v1/object/${BUCKET}/${name}" &&
      curl -fsS --retry 3 --max-time 120 -H "@$WORK/dst.hdr" -H "x-upsert: true" -H "Content-Type: ${ct}" \
        --data-binary "@$WORK/obj.bin" -o /dev/null "${DST_API}/storage/v1/object/${BUCKET}/${name}"; then
      ok=$((ok + 1))
    else
      warn "failed: $name"
      fail=$((fail + 1))
    fi
    rm -f "$WORK/obj.bin"
    [ $((n % 50)) -eq 0 ] && log "  ${n}/${todo}"
  done <"$WORK/objects.todo"
  log "storage: copied ${ok}, failed ${fail}"
  [ "$fail" -eq 0 ] || die "some objects failed — re-run the storage step (it only copies what is missing)"
}

step_cron() {
  log "== cron job 'app-tick' on this server -> ${CRON_FN_URL}/tick (every 5 min)"
  if dry; then
    log "[dry-run] would (re)schedule app-tick here. Do this only at cutover: a second ticking copy sends duplicate reminders."
    return
  fi
  confirm "Start the 5-minute reminder tick on THIS server? (only at cutover, after cloud-freeze)"
  dst_psql -v cron_url="${CRON_FN_URL%/}/tick" <<'SQL'
select cron.unschedule(jobid) from cron.job where jobname = 'app-tick';
select cron.schedule('app-tick', '*/5 * * * *', format(
  $f$select net.http_post(
    url := %L,
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-cron-key', (select value from public.app_secrets where key = 'app_cron_key')),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000)$f$, :'cron_url'));
SQL
  dst_psql -c "select jobid, jobname, schedule, active from cron.job where jobname = 'app-tick'"
}

step_cron_off() {
  log "== remove 'app-tick' from this server (rollback)"
  dry && { log "[dry-run] would unschedule app-tick here"; return; }
  dst_psql -c "select cron.unschedule(jobid) from cron.job where jobname = 'app-tick'"
}

step_telegram() {
  log "== Telegram webhook -> ${PUBLIC_FN_URL}/tg (via the function's /setup-bot)"
  local has_bot
  has_bot=$(dst_q "select count(*) from public.app_secrets where key = 'app_bot_token' and value <> ''")
  [ "$has_bot" -gt 0 ] || { log "no app_bot_token — Telegram is off, nothing to do"; return; }
  dry && { log "[dry-run] would call POST ${PUBLIC_FN_URL}/setup-bot"; return; }
  [ "$(stack_env APP_MODE)" = local ] || die "switch to local mode first: redeploy.sh --mode local"
  dst_q "select 'x-cron-key: ' || value from public.app_secrets where key = 'app_cron_key'" >"$WORK/cron.hdr"
  curl -fsS --max-time 30 -X POST -H "@$WORK/cron.hdr" "${PUBLIC_FN_URL}/setup-bot" | jq -c '{bot, webhook: .webhook.ok}' >&2
  rm -f "$WORK/cron.hdr"
}

step_cloud_freeze() {
  log "== cloud: unschedule ONLY 'app-tick' (hw-tick and everything else untouched)"
  if dry; then
    log "[dry-run] cloud jobs now: $(src_q "select string_agg(jobname, ', ') from cron.job")"
    return
  fi
  confirm "Stop the 'app-tick' cron job in Supabase Cloud (${EXPECTED_SRC_REF})?"
  src_psql_rw -c "select cron.unschedule(jobid) from cron.job where jobname = 'app-tick'"
  if [ -n "${CLOUD_MIN_BUILD:-}" ]; then
    [[ $CLOUD_MIN_BUILD =~ ^[0-9]+$ ]] || die "CLOUD_MIN_BUILD must be a number"
    src_psql_rw -v b="$CLOUD_MIN_BUILD" -c "insert into public.app_secrets (key, value) values ('app_min_build', :'b')
      on conflict (key) do update set value = excluded.value"
    log "cloud app_min_build=${CLOUD_MIN_BUILD}: older app builds still talking to the cloud are asked to update"
  fi
  log "cloud jobs left: $(src_q "select string_agg(jobname || case when active then '' else ' (inactive)' end, ', ') from cron.job")"
}

step_verify() {
  log "== verify"
  src_tables
  dst_tables
  local t s d bad=0
  declare -A SC=() DC=()
  while IFS='|' read -r t s; do SC[$t]=$s; done < <(src_q "$(count_sql "${SRC_TABLES[@]}")")
  [ ${#DST_TABLES[@]} -gt 0 ] && while IFS='|' read -r t d; do DC[$t]=$d; done < <(dst_q "$(count_sql "${DST_TABLES[@]}")")
  printf '%-22s %10s %10s\n' table cloud server >&2
  for t in "${SRC_TABLES[@]}"; do
    [ "$t" = app_secrets ] && continue
    s=${SC[$t]:-?}
    d=${DC[$t]:-missing}
    printf '%-22s %10s %10s %s\n' "$t" "$s" "$d" "$([ "$s" = "$d" ] || echo '<-- differs')" >&2
    [ "$s" = "$d" ] || bad=$((bad + 1))
  done
  s=$(src_q "select string_agg(key, ' ' order by key) from public.app_secrets where key like 'app\_%'")
  d=$(dst_q "select string_agg(key, ' ' order by key) from public.app_secrets where key like 'app\_%'" 2>/dev/null || true)
  printf '%-22s %10s %10s %s\n' "app_secrets(app_%)" "$(wc -w <<<"$s")" "$(wc -w <<<"$d")" "$([ "$s" = "$d" ] || echo '<-- differs')" >&2
  [ "$s" = "$d" ] || bad=$((bad + 1))
  s=$(src_q "select count(*) from storage.objects where bucket_id = '${BUCKET}'")
  d=$(dst_q "select count(*) from storage.objects where bucket_id = '${BUCKET}'" 2>/dev/null || echo 0)
  printf '%-22s %10s %10s %s\n' "storage ${BUCKET}" "$s" "$d" "$([ "$s" = "$d" ] || echo '<-- differs')" >&2
  [ "$s" = "$d" ] || bad=$((bad + 1))
  log "app_fn_url on server: $(dst_q "select value from public.app_secrets where key = 'app_fn_url'" 2>/dev/null || echo '?')"
  log "rate limiter: $(dst_q "select public.app_rate_hit('migrate-verify', 1000, 60)" 2>/dev/null || echo FAILED)"
  log "cron on server: $(dst_q "select coalesce(string_agg(jobname, ', '), 'none') from cron.job" 2>/dev/null)"
  smoke "${DST_API}" || bad=$((bad + 1))
  # DB-backed path through the function (rate limiter rpc + app_invites): an unknown code must give 404
  # (429 = limiter failed closed or was hit, 500 = DB/storage problem)
  local code
  code=$(curl -sS -o /dev/null -w '%{http_code}' -X POST -H 'content-type: application/json' -d '{"code":"ZZZZZZ"}' "${DST_API}/functions/v1/app/join" || true)
  log "POST /join with a bogus code -> HTTP ${code} (expected 404)"
  [ "$code" = 404 ] || bad=$((bad + 1))
  case $(stack_env APP_MODE) in
    local) smoke "https://${API_DOMAIN}" || bad=$((bad + 1)) ;;
    *) log "public URL is in $(stack_env APP_MODE) mode — public smoke skipped" ;;
  esac
  if [ "$bad" -gt 0 ]; then
    warn "${bad} check(s) differ. If the cloud is still live, counts move between dump and check — re-run after cloud-freeze."
    return 1
  fi
  log "verify: all checks passed"
}

# ---------------------------------------------------------------- main
dry && log "DRY RUN: nothing is written to the cloud or to this server"
for s in "${STEPS[@]}"; do
  case $s in
    all) step_preflight; step_schema; step_data; step_secrets; step_storage; dry || step_verify ;;
    preflight) step_preflight ;;
    schema) step_schema ;;
    data) step_data ;;
    secrets) step_secrets ;;
    storage) step_storage ;;
    cron) step_cron ;;
    cron-off) step_cron_off ;;
    telegram) step_telegram ;;
    cloud-freeze) step_cloud_freeze ;;
    verify) step_verify ;;
    *) die "unknown step: $s" ;;
  esac
done
dry || [ "${KEEP_WORK:-0}" = 1 ] || rm -f "$WORK"/*.sql "$WORK"/objects.* "$WORK"/cols.*
log "done: ${STEPS[*]}"
