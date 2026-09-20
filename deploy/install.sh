#!/usr/bin/env bash
set -Eeuo pipefail

# Installs the standalone CourtListenerDash web application with its own Unix
# account, configuration, data directory, release path, and systemd service.

APP_USER="courtlistener-web"
APP_GROUP="courtlistener-web"
APP_ROOT="/opt/courtlistener-web"
DATA_DIR="/var/lib/courtlistener-web"
CONFIG_DIR="/etc/courtlistener-web"
SERVICE_FILE="/etc/systemd/system/courtlistener-web.service"
PORT="${COURTLISTENER_WEB_PORT:-8788}"
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STAMP="$(date +%Y%m%d-%H%M%S)"
RELEASE_DIR="${APP_ROOT}/releases/${STAMP}"
OLD_RELEASE=""
COMMITTED=0
GENERATED_ADMIN_PASSWORD=""

rollback() {
  local status=$?
  trap - ERR
  if [[ ${COMMITTED} -eq 0 ]]; then
    if [[ -n "${OLD_RELEASE}" ]]; then
      ln -sfn "${OLD_RELEASE}" "${APP_ROOT}/current"
      systemctl restart courtlistener-web.service 2>/dev/null || true
    else
      systemctl stop courtlistener-web.service 2>/dev/null || true
      rm -f "${APP_ROOT}/current"
    fi
  fi
  echo "CourtListener web deployment failed; the previous release remains selected." >&2
  exit "${status}"
}
trap rollback ERR

if [[ ${EUID} -ne 0 ]]; then
  echo "Run this installer with sudo." >&2
  exit 2
fi

for required in \
  "${SOURCE_DIR}/dist/index.html" \
  "${SOURCE_DIR}/dist-server/server/index.js" \
  "${SOURCE_DIR}/package.json" \
  "${SOURCE_DIR}/package-lock.json" \
  "${SOURCE_DIR}/deploy/courtlistener-web.service"; do
  if [[ ! -r "${required}" ]]; then
    echo "Missing production artifact: ${required}. Run npm ci, npm test, and npm run build first." >&2
    exit 2
  fi
done

if ! [[ "${PORT}" =~ ^[0-9]+$ ]] || (( PORT < 1024 || PORT > 65535 )); then
  echo "COURTLISTENER_WEB_PORT must be an unprivileged TCP port (1024-65535)." >&2
  exit 2
fi

if ss -ltnH "sport = :${PORT}" | grep -q . && ! systemctl is-active --quiet courtlistener-web.service; then
  echo "TCP port ${PORT} is already used by another service; nothing was changed." >&2
  exit 3
fi

if ! id "${APP_USER}" >/dev/null 2>&1; then
  useradd --system --user-group --home-dir "${DATA_DIR}" --shell /usr/sbin/nologin "${APP_USER}"
fi

install -d -o root -g root -m 0755 "${APP_ROOT}" "${APP_ROOT}/releases"
install -d -o "${APP_USER}" -g "${APP_GROUP}" -m 0700 "${DATA_DIR}"
install -d -o root -g "${APP_GROUP}" -m 0750 "${CONFIG_DIR}"
install -d -o root -g root -m 0755 "${RELEASE_DIR}"

cp -a "${SOURCE_DIR}/dist" "${RELEASE_DIR}/dist"
cp -a "${SOURCE_DIR}/dist-server" "${RELEASE_DIR}/dist-server"
cp -a "${SOURCE_DIR}/package.json" "${SOURCE_DIR}/package-lock.json" "${RELEASE_DIR}/"
cp -a "${SOURCE_DIR}/README.md" "${SOURCE_DIR}/SECURITY.md" "${RELEASE_DIR}/"
cp -a "${SOURCE_DIR}/docs" "${RELEASE_DIR}/docs"

npm ci --omit=dev --ignore-scripts --no-audit --no-fund --prefix "${RELEASE_DIR}"
chown -R root:root "${RELEASE_DIR}"
find "${RELEASE_DIR}" -type d -exec chmod 0755 {} +
find "${RELEASE_DIR}" -type f -exec chmod 0644 {} +

if [[ ! -s "${CONFIG_DIR}/app.env" ]]; then
  SESSION_SECRET="$(openssl rand -base64 48 | tr -d '\n')"
  CREDENTIAL_KEY="$(openssl rand -base64 32 | tr -d '\n')"
  GENERATED_ADMIN_PASSWORD="$(openssl rand -base64 24 | tr -d '\n')"
  PASSWORD_HASH="$(printf '%s' "${GENERATED_ADMIN_PASSWORD}" | node --input-type=module -e '
    import { hashPassword } from "file:///opt/courtlistener-web/releases/'"${STAMP}"'/dist-server/server/security.js";
    let input = "";
    for await (const chunk of process.stdin) input += chunk;
    process.stdout.write(await hashPassword(input));
  ')"

  umask 0077
  printf '%s\n' \
    "COURTLISTENER_SESSION_SECRET=${SESSION_SECRET}" \
    "COURTLISTENER_CREDENTIAL_KEY=${CREDENTIAL_KEY}" \
    "COURTLISTENER_WEB_PASSWORD_HASH=${PASSWORD_HASH}" \
    "COURTLISTENER_WEB_DATA_DIR=${DATA_DIR}" \
    "COURTLISTENER_WEB_HOST=0.0.0.0" \
    "COURTLISTENER_WEB_PORT=${PORT}" \
    "COURTLISTENER_PUBLIC_PORT=443" \
    "COURTLISTENER_TLS_CERT=${CONFIG_DIR}/tls.crt" \
    "COURTLISTENER_TLS_KEY=${CONFIG_DIR}/tls.key" \
    "COURTLISTENER_SECURE_COOKIES=true" \
    "COURTLISTENER_ALLOW_INSECURE_CREDENTIAL_SETUP=false" \
    > "${CONFIG_DIR}/app.env"
  unset PASSWORD_HASH SESSION_SECRET CREDENTIAL_KEY
  chown root:"${APP_GROUP}" "${CONFIG_DIR}/app.env"
  chmod 0640 "${CONFIG_DIR}/app.env"
fi

if ! grep -q '^COURTLISTENER_PUBLIC_PORT=' "${CONFIG_DIR}/app.env"; then
  printf '%s\n' 'COURTLISTENER_PUBLIC_PORT=443' >> "${CONFIG_DIR}/app.env"
fi

if [[ ! -s "${CONFIG_DIR}/tls.crt" || ! -s "${CONFIG_DIR}/tls.key" ]]; then
  HOST_SHORT="$(hostname -s)"
  HOST_FQDN="$(hostname -f 2>/dev/null || hostname -s)"
  SUBJECT_ALT_NAMES="DNS:${HOST_SHORT},DNS:${HOST_FQDN},IP:127.0.0.1"
  while read -r address; do
    case "${address}" in
      10.*|192.168.*|172.1[6-9].*|172.2[0-9].*|172.3[0-1].*)
        SUBJECT_ALT_NAMES="${SUBJECT_ALT_NAMES},IP:${address}"
        ;;
    esac
  done < <(ip -o -4 address show scope global | awk '$2 !~ /^(docker|br-|veth)/ {split($4, value, "/"); print value[1]}')
  openssl req -x509 -newkey rsa:3072 -sha256 -days 825 -nodes \
    -keyout "${CONFIG_DIR}/tls.key" \
    -out "${CONFIG_DIR}/tls.crt" \
    -subj "/CN=${HOST_SHORT}" \
    -addext "subjectAltName=${SUBJECT_ALT_NAMES}"
  chown root:"${APP_GROUP}" "${CONFIG_DIR}/tls.key" "${CONFIG_DIR}/tls.crt"
  chmod 0640 "${CONFIG_DIR}/tls.key" "${CONFIG_DIR}/tls.crt"
fi

if [[ -L "${APP_ROOT}/current" ]]; then
  OLD_RELEASE="$(readlink -f "${APP_ROOT}/current")"
fi
ln -sfn "${RELEASE_DIR}" "${APP_ROOT}/current"

install -o root -g root -m 0644 \
  "${SOURCE_DIR}/deploy/courtlistener-web.service" \
  "${SERVICE_FILE}"
systemctl daemon-reload
systemctl enable courtlistener-web.service
systemctl restart courtlistener-web.service

for attempt in {1..20}; do
  if curl --fail --silent --show-error --insecure \
    "https://127.0.0.1:${PORT}/healthz" >/dev/null; then
    break
  fi
  if [[ ${attempt} -eq 20 ]]; then
    journalctl -u courtlistener-web.service -n 40 --no-pager >&2 || true
    false
  fi
  sleep 1
done

# The application has now initialized its scrypt hash store. Remove the legacy
# bootstrap password file created by releases before password rotation existed.
rm -f "${CONFIG_DIR}/initial-admin-password"

if command -v ufw >/dev/null && ufw status | grep -q '^Status: active'; then
  for cidr in 192.168.1.0/24 192.168.2.0/24 192.168.12.0/24 192.168.50.0/24; do
    ufw allow from "${cidr}" to any port "${PORT}" proto tcp comment "CourtListener LAN console"
  done
fi

COMMITTED=1
trap - ERR

echo "CourtListener web console installed as an isolated service."
if [[ -n "${GENERATED_ADMIN_PASSWORD}" ]]; then
  echo "One-time initial dashboard password: ${GENERATED_ADMIN_PASSWORD}"
  echo "Save it now; it is not stored in plaintext and can be changed in Settings."
fi
echo "LAN URLs:"
while read -r address; do
  case "${address}" in
    10.*|192.168.*|172.1[6-9].*|172.2[0-9].*|172.3[0-1].*)
      echo "  https://${address}/  (through the LAN reverse proxy)"
      ;;
  esac
done < <(ip -o -4 address show scope global | awk '$2 !~ /^(docker|br-|veth)/ {split($4, value, "/"); print value[1]}')
echo "CourtListenerDash installation complete. Unrelated services were not modified."
