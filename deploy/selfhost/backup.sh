#!/usr/bin/env bash
# Nightly backup (systemd timer uroki-backup.timer, 03:15 Asia/Almaty). Run by hand: sudo /opt/uroki/kit/backup.sh
#
#   /var/backups/uroki/<date>/app.dump        pg_dump -Fc of public.app_* only   (restore: see README)
#   /var/backups/uroki/<date>/full.dump       pg_dump -Fc of the whole database (incl. storage/cron metadata)
#   /var/backups/uroki/<date>/storage.tar.gz  photo files (volumes/storage)
#   /var/backups/uroki/<date>/server-secrets.tar  config.env + secrets.env + stack/.env (needed to restore)
#
# Then, when BACKUP_REMOTE is set (rclone remote — use a "crypt" remote: the files hold children's data and keys),
# copies the day to "$BACKUP_REMOTE/<date>/" and deletes remote days older than BACKUP_REMOTE_KEEP_DAYS.
# The remote MUST be in Kazakhstan (ps.kz Object Storage or a second KZ server) — localization law.
set -Eeuo pipefail
KIT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=common.sh
. "$KIT_DIR/common.sh"
need_root
load_config
umask 077

fail() {
  alert "backup FAILED: $*"
  [ -n "${BACKUP_PING_URL:-}" ] && curl -fsS --max-time 10 -o /dev/null "${BACKUP_PING_URL%/}/fail" || true
  exit 1
}
trap 'fail "line $LINENO"' ERR

day=$(date +%F)
out="$BACKUP_DIR/$day"
mkdir -p "$out"
chmod 700 "$BACKUP_DIR" "$out"
pw=$(stack_env POSTGRES_PASSWORD)

log "app tables -> $out/app.dump"
PGPASSWORD=$pw compose exec -T -e PGPASSWORD db \
  pg_dump -h 127.0.0.1 -U postgres -d postgres -Fc --table='public.app_*' >"$out/app.dump.tmp"
mv "$out/app.dump.tmp" "$out/app.dump"

log "whole database -> $out/full.dump"
PGPASSWORD=$pw compose exec -T -e PGPASSWORD db \
  pg_dump -h 127.0.0.1 -U supabase_admin -d postgres -Fc >"$out/full.dump.tmp"
mv "$out/full.dump.tmp" "$out/full.dump"

log "photos -> $out/storage.tar.gz"
tar -C "$STACK_DIR/volumes" -czf "$out/storage.tar.gz.tmp" storage
mv "$out/storage.tar.gz.tmp" "$out/storage.tar.gz"

tar -C / -cf "$out/server-secrets.tar" "${CONFIG_FILE#/}" "${SECRETS_FILE#/}" "${STACK_DIR#/}/.env" 2>/dev/null || true

# sanity: the app dump must list app_families
PGPASSWORD=$pw compose exec -T db pg_restore --list <"$out/app.dump" | grep -q 'TABLE DATA public app_families' || fail "app.dump has no app_families data"
log "local backup: $(du -sh "$out" | cut -f1)"

find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -mtime +"$BACKUP_KEEP_DAYS" -exec rm -rf {} +

if [ -n "${BACKUP_REMOTE:-}" ]; then
  command -v rclone >/dev/null || fail "rclone not installed (apt-get install rclone) but BACKUP_REMOTE is set"
  log "offsite -> ${BACKUP_REMOTE}/${day}/"
  rclone copy --quiet "$out" "${BACKUP_REMOTE%/}/${day}/"
  rclone delete --quiet --min-age "${BACKUP_REMOTE_KEEP_DAYS}d" "${BACKUP_REMOTE%/}/" || true
  rclone rmdirs --quiet --leave-root "${BACKUP_REMOTE%/}/" || true
else
  warn "BACKUP_REMOTE is empty: the backup exists only on this server (set an offsite KZ remote)"
fi

[ -n "${BACKUP_PING_URL:-}" ] && curl -fsS --max-time 10 -o /dev/null "$BACKUP_PING_URL" || true
log "backup done"
