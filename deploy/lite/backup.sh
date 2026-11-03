#!/usr/bin/env bash
# Nightly backup (systemd uroki-backup.timer, 03:15 Almaty). By hand: sudo /opt/uroki/kit/backup.sh
#   /opt/uroki/backups/<date>/app.dump        pg_dump -Fc of public.app_* (schema + data) + uroki_meta
#   /opt/uroki/backups/<date>/storage-meta.dump  rows of storage.buckets/storage.objects (data only; storage-api
#                                             needs them to find the files)
#   /opt/uroki/backups/<date>/storage.tar.gz  photo / voice files (/opt/uroki/data/storage)
# Days older than 7 are deleted. Restore: see README (engineer section).
#
#   backup.sh --stdout   writes a fresh app dump (pg_dump -Fc) to stdout and nothing to disk:
#                        used by the `backup` action, which encrypts it on the runner before upload.
set -Eeuo pipefail
# shellcheck source=lib.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
need_root
KEEP_DAYS=7

app_dump() {
  PGPASSWORD=$(sec POSTGRES_PASSWORD) compose exec -T -e PGPASSWORD db \
    pg_dump -h 127.0.0.1 -U postgres -d postgres -Fc --table='public.app_*' --schema=uroki_meta
}

if [ "${1:-}" = --stdout ]; then
  app_dump
  exit 0
fi

umask 077
mkdir -p "$BACKUP_DIR"
# The timer and the manual CI check can overlap. Never write the same daily
# archive concurrently; flock is released automatically when the process exits.
exec 9>"$BACKUP_DIR/.backup.lock"
flock 9
day=$(date +%F)
out=$BACKUP_DIR/$day
mkdir -p "$out"
chmod 700 "$BACKUP_DIR" "$out"

log "app tables -> $out/app.dump"
app_dump >"$out/app.dump.tmp"
# Do not pipe pg_restore to grep -q under pipefail: grep exits as soon as it
# matches, closes the pipe and can make pg_restore/docker fail with SIGPIPE.
compose exec -T db pg_restore --list <"$out/app.dump.tmp" >"$out/app.list.tmp"
grep -q 'TABLE DATA public app_families' "$out/app.list.tmp" ||
  die "app.dump has no app_families data"
compose exec -T db pg_restore --file=/dev/null <"$out/app.dump.tmp"
rm -f "$out/app.list.tmp"
mv "$out/app.dump.tmp" "$out/app.dump"

log "storage metadata -> $out/storage-meta.dump"
PGPASSWORD=$(sec POSTGRES_PASSWORD) compose exec -T -e PGPASSWORD db \
  pg_dump -h 127.0.0.1 -U supabase_admin -d postgres -Fc --data-only \
  --table=storage.buckets --table=storage.objects >"$out/storage-meta.dump.tmp"
mv "$out/storage-meta.dump.tmp" "$out/storage-meta.dump"

log "storage files -> $out/storage.tar.gz"
tar -C "$DATA_DIR" -czf "$out/storage.tar.gz.tmp" storage
mv "$out/storage.tar.gz.tmp" "$out/storage.tar.gz"

# Compare ISO folder dates, not rounded mtimes: a daily run with -mtime can keep
# eight calendar days and delay deletion beyond the stated seven-day retention.
cutoff=$(date -d "$KEEP_DAYS days ago" +%F)
while IFS= read -r -d '' candidate; do
  name=${candidate##*/}
  if [[ "$name" < "$cutoff" || "$name" = "$cutoff" ]]; then rm -rf -- "$candidate"; fi
done < <(find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -name '20??-??-??' -print0)
log "backup done: $(du -sh "$out" | cut -f1); kept: $(find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -name '20*' | wc -l) day(s)"
free_pct=$(df --output=pcent "$UROKI_DIR" | tail -1 | tr -dc '0-9')
[ "$free_pct" -lt 85 ] || warn "disk is ${free_pct}% full"
