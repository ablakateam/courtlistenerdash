# Deployment guide

CourtListenerDash is a standard Node.js web service with a persistent data
directory. The CourtListener token is entered after sign-in and encrypted at
rest; it should not be compiled into the image or committed to source control.

## Docker Compose (recommended portable setup)

Requirements: Docker Engine with Compose and an available TCP port.

1. Copy `.env.example` to `.env` and set `COURTLISTENER_SITE_ADDRESS` to the
   server's LAN IP or resolvable hostname.
2. Generate the three local secret files and save the one-time password:

   ```bash
   docker run --rm -v "$PWD:/workspace" -w /workspace node:24-alpine \
     node deploy/bootstrap.mjs
   ```

   If Node.js 24 is already installed, `npm run setup` does the same thing.

3. Build and start:

   ```bash
   docker compose up -d --build
   docker compose ps
   ```

4. Open `https://<COURTLISTENER_SITE_ADDRESS>:8443` (or the configured port),
   sign in with the one-time password, and add the CourtListener token under
   **Settings → CourtListener Connection**.

Caddy issues a private local certificate. Browsers will warn until its local
root certificate is trusted. Export it with:

```bash
docker compose cp proxy:/data/caddy/pki/authorities/local/root.crt ./courtlistenerdash-local-ca.crt
```

Verify and trust that certificate only on intended LAN devices. For an
internet-facing hostname, use the platform's managed HTTPS or replace the
local Caddy policy with a publicly trusted certificate. Do not expose the raw
application port; the Compose file exposes only the HTTPS proxy.

Persistent state lives in the `courtlistener-data` Docker volume. Back up that
volume together with the unchanged `secrets/credential_key`; encrypted tokens
cannot be recovered without that key.

## Generic container platforms

Build the included `Dockerfile`, mount a persistent writable directory at
`/data`, and route platform-managed HTTPS to container port `8788`. Configure:

```text
COURTLISTENER_WEB_HOST=0.0.0.0
COURTLISTENER_WEB_PORT=8788
COURTLISTENER_WEB_DATA_DIR=/data
COURTLISTENER_SESSION_SECRET=<at least 32 random characters>
COURTLISTENER_CREDENTIAL_KEY=<base64-encoded 32-byte key>
COURTLISTENER_WEB_PASSWORD_HASH=<output of npm run credential -- password '...'>
COURTLISTENER_SECURE_COOKIES=true
COURTLISTENER_TRUST_PROXY=true
COURTLISTENER_ALLOW_INSECURE_CREDENTIAL_SETUP=false
```

Use the platform's secret manager for those values. If it supports mounted
secrets, append `_FILE` to any of the four sensitive variable names and set it
to the mounted file path. Never place a CourtListener token in a client-side
variable. The health-check endpoint is `GET /healthz`.

Optional TypeSafe configuration is normally entered under **Settings → Jev
Intelligence** so the key is validated before the encrypted configuration is
saved. Automated deployments may instead supply `TYPESAFE_API_KEY` or
`TYPESAFE_API_KEY_FILE`, together with a pinned `TYPESAFE_DEFAULT_MODEL` and a
`TYPESAFE_MODE` of `off`, `evaluation`, `shadow`, or `active`. Start with
`evaluation` or `shadow`. Active mode rejects moving model aliases. Never use a
client-exposed environment-variable prefix for the key.

Only set `COURTLISTENER_TRUST_PROXY=true` when exactly one trusted reverse proxy
is in front of the app and the container port is not directly reachable.

## Ubuntu/systemd

The existing hardened installer remains available for a dedicated Ubuntu
server:

```bash
npm ci
npm test
npm run build
sudo ./deploy/install.sh
```

It installs a dedicated Unix service with isolated configuration, credentials,
and persistent storage. See the root README for the optional private-network
reverse-proxy installer.

## Upgrade and rollback

Before upgrading, back up the persistent data and credential key. For Compose:

```bash
git pull --ff-only
docker compose build --pull
docker compose up -d
docker compose ps
```

Keep the previous image tag until `/healthz`, sign-in, and one representative
CourtListener search have succeeded. The Ubuntu installer uses timestamped
release directories and preserves the previous selected release if deployment
fails.
