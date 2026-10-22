#!/usr/bin/env bash
# STRICTLY READ-ONLY look at the server (the `inspect` action pipes this file to `sudo bash -s -- <domain>`).
# It only runs commands that print information: nothing is installed, written, stopped or deleted.
set -uo pipefail
DOMAIN=${1:-api.urokiapp.kz}
h() { printf '\n===== %s\n' "$*"; }

h "OS"
. /etc/os-release 2>/dev/null && echo "${PRETTY_NAME:-?}"
echo "kernel $(uname -r), $(uname -m); up $(uptime -p 2>/dev/null || uptime)"
echo "virtualization: $(systemd-detect-virt 2>/dev/null || echo unknown); timezone: $(timedatectl show -p Timezone --value 2>/dev/null || date +%Z)"

h "CPU / RAM / disk / swap"
echo "vCPU: $(nproc); $(grep -m1 'model name' /proc/cpuinfo | cut -d: -f2- | sed 's/^ *//')"
free -m
df -h -x tmpfs -x devtmpfs -x overlay 2>/dev/null || df -h
echo "swap devices:"
swapon --show 2>/dev/null || true
[ -n "$(swapon --show --noheadings 2>/dev/null)" ] || echo "(no swap — install will create a 2 GB swapfile)"

h "Listening TCP ports (ss -tlnp)"
ss -tlnp 2>/dev/null || netstat -tlnp 2>/dev/null || echo "ss/netstat unavailable"
busy=$(ss -H -tlnp '( sport = :80 or sport = :443 )' 2>/dev/null)
if [ -n "$busy" ]; then
  echo
  echo ">>> ports 80/443 are in use by:"
  echo "$busy" | grep -o 'users:(([^)]*' | sort -u | sed 's/^/    /'
  echo ">>> 'install' refuses to run while anything other than this kit's Caddy holds them."
else
  echo
  echo ">>> ports 80/443 are free"
fi

h "Docker"
if command -v docker >/dev/null 2>&1; then
  docker --version
  docker compose version 2>/dev/null || echo "docker compose plugin: missing (install adds it)"
  echo "containers (all):"
  docker ps -a --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}' 2>/dev/null
  echo "volumes:"
  docker volume ls --format '{{.Name}}' 2>/dev/null | sed 's/^/  /'
else
  echo "docker: not installed (install adds it from download.docker.com)"
fi

h "Running services (web servers, databases, runtimes)"
systemctl list-units --type=service --state=running --no-pager --no-legend 2>/dev/null |
  awk '{ print $1 }' | grep -Ei 'nginx|apache|httpd|caddy|traefik|haproxy|lighttpd|php|mysql|mariadb|postgres|redis|mongo|node|pm2|docker|containerd|gunicorn|uwsgi|supervisor' ||
  echo "(none of: nginx apache caddy php mysql postgres node pm2 docker ...)"
echo
echo "all running services:"
systemctl list-units --type=service --state=running --no-pager --no-legend 2>/dev/null | awk '{ print "  " $1 }'

h "/opt and /var/www (names only)"
for d in /opt /var/www; do
  if [ -d "$d" ]; then
    echo "$d:"
    # shellcheck disable=SC2012 # names only, for a human
    ls -1A "$d" 2>/dev/null | sed 's/^/  /'
    [ -n "$(ls -A "$d" 2>/dev/null)" ] || echo "  (empty)"
  else
    echo "$d: (does not exist)"
  fi
done
[ -d /opt/uroki ] && echo "/opt/uroki exists: mode=$(awk -F= '$1=="APP_MODE"{print $2}' /opt/uroki/config.env 2>/dev/null)"

h "Firewall / updates"
command -v ufw >/dev/null && ufw status 2>/dev/null | head -20 || echo "ufw: not installed"
if dpkg -s unattended-upgrades >/dev/null 2>&1; then echo "unattended-upgrades: installed"; else echo "unattended-upgrades: not installed"; fi

h "DNS: does $DOMAIN point to this server?"
resolved=$(getent ahostsv4 "$DOMAIN" 2>/dev/null | awk '{ print $1 }' | sort -u | tr '\n' ' ')
mine=$(ip -4 -o addr show scope global 2>/dev/null | awk '{ split($4, a, "/"); print a[1] }' | sort -u | tr '\n' ' ')
aaaa=$(getent ahostsv6 "$DOMAIN" 2>/dev/null | awk '$1 ~ /:/ && $1 !~ /^::ffff:/ { print $1 }' | sort -u | tr '\n' ' ')
echo "$DOMAIN A    -> ${resolved:-(does not resolve)}"
echo "$DOMAIN AAAA -> ${aaaa:-(none, good)}"
echo "this server's IPv4: ${mine:-?}"
match=no
for ip in $resolved; do case " $mine " in *" $ip "*) match=yes ;; esac; done
echo ">>> resolves to this server: $match"
[ -z "$aaaa" ] || echo ">>> WARNING: an AAAA record exists; remove it (the server publishes IPv4 only)"
exit 0
