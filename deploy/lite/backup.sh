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
day=$(date +%F)
out=$BACKUP_DIR/$day
mkdir -p "$out"
chmod 700 "$BACKUP_DIR" "$out"

log "app tables -> $out/app.dump"
app_dump >"$out/app.dump.tmp"
compose exec -T db pg_restore --list <"$out/app.dump.tmp" | grep -q 'TABLE DATA public app_families' ||
  die "app.dump has no app_families data"
mv "$out/app.dump.tmp" "$out/app.dump"

log "storage metadata -> $out/storage-meta.dump"
PGPASSWORD=$(sec POSTGRES_PASSWORD) compose exec -T -e PGPASSWORD db \
  pg_dump -h 127.0.0.1 -U supabase_admin -d postgres -Fc --data-only \
  --table=storage.buckets --table=storage.objects >"$out/storage-meta.dump.tmp"
mv "$out/storage-meta.dump.tmp" "$out/storage-meta.dump"

log "storage files -> $out/storage.tar.gz"
tar -C "$DATA_DIR" -czf "$out/storage.tar.gz.tmp" storage
mv "$out/storage.tar.gz.tmp" "$out/storage.tar.gz"

find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -name '20*' -mtime +$((KEEP_DAYS - 1)) -exec rm -rf {} +
log "backup done: $(du -sh "$out" | cut -f1); kept: $(find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -name '20*' | wc -l) day(s)"
free_pct=$(df --output=pcent "$UROKI_DIR" | tail -1 | tr -dc '0-9')
[ "$free_pct" -lt 85 ] || warn "disk is ${free_pct}% full"
