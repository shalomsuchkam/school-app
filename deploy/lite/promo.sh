#!/usr/bin/env bash
# Promo codes for free access (the owner's tool; installed with the kit as /opt/uroki/kit/promo.sh):
#   sudo /opt/uroki/kit/promo.sh --days 365            a new random code: +365 days of access, one family
#   sudo /opt/uroki/kit/promo.sh --forever             a new random code: access forever, one family
#   options:  --uses N          how many families may use it (default 1)
#             --until YYYY-MM-DD  the code can't be redeemed after that day (default: no limit)
#             --note TEXT       your own memo (who it is for)
#             --code TEXT       your own code instead of a random one: 6–16 of A–Z, 2–9 (no 0, O, 1, I)
#   sudo /opt/uroki/kit/promo.sh --list                the 30 newest codes and how many times each was used
# Prints only the code on stdout (details on stderr). A parent enters it in the app: Paywall or
# Settings → «Есть промокод?». Rows live in public.app_promo_codes (migration 20261027_promo_codes.sql).
set -Eeuo pipefail
# shellcheck source=lib.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

usage() { sed -n '2,11p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//' >&2; exit "${1:-0}"; }

days="" forever=0 uses=1 until_day="" note="" code="" list=0
while [ $# -gt 0 ]; do
  case $1 in
    --days) days=${2:-}; shift ;;
    --forever) forever=1 ;;
    --uses) uses=${2:-}; shift ;;
    --until) until_day=${2:-}; shift ;;
    --note) note=${2:-}; shift ;;
    --code) code=${2:-}; shift ;;
    --list) list=1 ;;
    -h | --help) usage 0 ;;
    *) warn "unknown argument: $1"; usage 1 ;;
  esac
  shift
done
need_root
[ -s "$SECRETS_FILE" ] || die "not installed yet: run the 'install' action first"

if [ "$list" -eq 1 ]; then
  db_psql -P pager=off -f - <<'SQL'
select code, coalesce(days::text, 'forever') as days, used || '/' || max_uses as used,
       coalesce(to_char(expires_at, 'YYYY-MM-DD'), '-') as until, to_char(created_at, 'YYYY-MM-DD') as created,
       coalesce(note, '') as note
  from public.app_promo_codes order by created_at desc limit 30;
SQL
  exit 0
fi

if [ "$forever" -eq 1 ] && [ -n "$days" ]; then die "--days and --forever: choose one"; fi
if [ "$forever" -eq 0 ] && [ -z "$days" ]; then warn "say how long: --days N or --forever"; usage 1; fi
if [ -n "$days" ]; then
  [[ $days =~ ^[0-9]{1,4}$ ]] && [ "$days" -ge 1 ] && [ "$days" -le 3650 ] || die "--days: 1..3650"
fi
[[ $uses =~ ^[0-9]{1,6}$ ]] && [ "$uses" -ge 1 ] && [ "$uses" -le 100000 ] || die "--uses: 1..100000"
expires=""
if [ -n "$until_day" ]; then
  [[ $until_day =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || die "--until: YYYY-MM-DD"
  # the end of that day in the server's family zone (Almaty)
  expires="$until_day 23:59:59 Asia/Almaty"
fi
if [ -n "$code" ]; then
  code=$(printf '%s' "$code" | tr '[:lower:]' '[:upper:]' | tr -d ' _.-')
  [[ $code =~ ^[A-HJ-NP-Z2-9]{6,16}$ ]] || die "--code: 6–16 of A–Z, 2–9 (no 0, O, 1, I)"
fi

# values travel as psql variables (quoted by psql, never spliced into SQL text); empty = null
new=$(db_psql -At -v days="$days" -v uses="$uses" -v expires="$expires" -v note="$note" -v code="$code" -f - <<'SQL'
select public.app_promo_create(
  nullif(:'days', '')::int, :'uses'::int, nullif(:'expires', '')::timestamptz, nullif(:'note', ''), nullif(:'code', '')
);
SQL
) || die "the code was not created (does it exist already? see --list)"
[ -n "$new" ] || die "the code was not created"
what=$([ "$forever" -eq 1 ] && echo "forever" || echo "+$days days")
log "promo code created: $what, uses: $uses${until_day:+, redeemable until $until_day}${note:+, note: $note}"
printf '%s\n' "$new"
