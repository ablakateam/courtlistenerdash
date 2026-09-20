#!/usr/bin/env bash
set -Eeuo pipefail

SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NGINX_SITE="/etc/nginx/sites-available/courtlistener-web"
NGINX_TLS_DIR="/etc/nginx/courtlistener-web"
APP_TLS_DIR="/etc/courtlistener-web"
INSTALLED_NGINX=0

if [[ ${EUID} -ne 0 ]]; then
  echo "Run this installer with sudo." >&2
  exit 2
fi

if ! command -v nginx >/dev/null 2>&1; then
  if ss -ltnH '( sport = :80 or sport = :443 )' | grep -q .; then
    echo "Port 80 or 443 is already in use; reverse proxy was not installed." >&2
    exit 3
  fi
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y nginx-light
  INSTALLED_NGINX=1
fi

install -d -o root -g root -m 0700 "${NGINX_TLS_DIR}"
install -o root -g root -m 0644 "${APP_TLS_DIR}/tls.crt" "${NGINX_TLS_DIR}/tls.crt"
install -o root -g root -m 0600 "${APP_TLS_DIR}/tls.key" "${NGINX_TLS_DIR}/tls.key"
install -o root -g root -m 0644 "${SOURCE_DIR}/deploy/nginx-courtlistener.conf" "${NGINX_SITE}"
ln -sfn "${NGINX_SITE}" /etc/nginx/sites-enabled/courtlistener-web
if [[ ${INSTALLED_NGINX} -eq 1 ]]; then
  rm -f /etc/nginx/sites-enabled/default
fi

nginx -t
systemctl enable --now nginx.service
systemctl reload nginx.service

if command -v ufw >/dev/null && ufw status | grep -q '^Status: active'; then
  for cidr in 192.168.1.0/24 192.168.2.0/24 192.168.12.0/24 192.168.50.0/24; do
    ufw allow from "${cidr}" to any port 80 proto tcp comment "CourtListener LAN redirect"
    ufw allow from "${cidr}" to any port 443 proto tcp comment "CourtListener LAN HTTPS"
  done
fi

curl --fail --silent --show-error --insecure https://127.0.0.1/healthz >/dev/null
echo "CourtListener LAN proxy is available at https://<LAN-IP>/ (HTTP redirects to HTTPS)."
