#!/usr/bin/env bash
# Provision a fresh Ubuntu 22.04/24.04 host to run AmanSignal behind nginx with TLS.
#
# Idempotent: safe to re-run. Re-running after a git pull redeploys the app.
#
# USAGE (on the server, as a sudo-capable user)
#   export DASHSCOPE_API_KEY=sk-...
#   export AMANSIGNAL_DOMAIN=amansignal.example.com     # must already resolve here
#   export CERTBOT_EMAIL=you@example.com
#   sudo -E bash deploy/provision.sh
#
# TLS is not optional: browsers refuse microphone and geolocation on plain HTTP,
# so an IP-only deployment silently loses voice and location capture.
set -euo pipefail

: "${DASHSCOPE_API_KEY:?set DASHSCOPE_API_KEY}"
: "${AMANSIGNAL_DOMAIN:?set AMANSIGNAL_DOMAIN}"
: "${CERTBOT_EMAIL:?set CERTBOT_EMAIL}"

REPO_DIR="${REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
CONTAINER=amansignal
VOLUME=amansignal-data

echo "==> Installing packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq docker.io nginx certbot python3-certbot-nginx curl >/dev/null
systemctl enable --now docker >/dev/null

echo "==> Checking DNS before requesting a certificate"
resolved="$(getent hosts "$AMANSIGNAL_DOMAIN" | awk '{print $1}' | head -1 || true)"
public_ip="$(curl -fsS --max-time 10 https://api.ipify.org || true)"
if [[ -z "$resolved" ]]; then
  echo "    $AMANSIGNAL_DOMAIN does not resolve yet. Add the A record first." >&2
  exit 1
fi
if [[ -n "$public_ip" && "$resolved" != "$public_ip" ]]; then
  # Certbot would fail anyway; failing here says why, and costs no rate limit.
  echo "    $AMANSIGNAL_DOMAIN resolves to $resolved but this host is $public_ip." >&2
  echo "    Update the A record and wait for propagation before re-running." >&2
  exit 1
fi
echo "    $AMANSIGNAL_DOMAIN -> $resolved (matches this host)"

echo "==> Building the image"
cd "$REPO_DIR"
docker build -q -t amansignal . >/dev/null

echo "==> Starting the container"
docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
docker volume create "$VOLUME" >/dev/null
# Bound to loopback: nginx is the only thing that should reach the app directly.
docker run -d --name "$CONTAINER" \
  -p 127.0.0.1:3000:3000 \
  -e DASHSCOPE_API_KEY="$DASHSCOPE_API_KEY" \
  -v "$VOLUME":/data \
  --restart unless-stopped \
  amansignal >/dev/null

echo "==> Waiting for the app to report healthy"
for i in $(seq 1 30); do
  if curl -fsS --max-time 3 http://127.0.0.1:3000/api/health >/dev/null 2>&1; then
    echo "    healthy after ${i}0s"
    break
  fi
  if [[ $i -eq 30 ]]; then
    echo "    app never became healthy. Logs:" >&2
    docker logs --tail 40 "$CONTAINER" >&2
    exit 1
  fi
  sleep 10
done

echo "==> Configuring nginx"
cat >/etc/nginx/sites-available/amansignal <<NGINX
server {
    listen 80;
    server_name ${AMANSIGNAL_DOMAIN};

    # Voice notes and photos; the app caps individual files at 12MB.
    client_max_body_size 25M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        # Extraction can take several seconds on audio; do not cut it short.
        proxy_read_timeout 120s;
    }
}
NGINX
ln -sf /etc/nginx/sites-available/amansignal /etc/nginx/sites-enabled/amansignal
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

echo "==> Obtaining a certificate"
certbot --nginx -d "$AMANSIGNAL_DOMAIN" \
  --non-interactive --agree-tos -m "$CERTBOT_EMAIL" --redirect

echo
echo "Deployed: https://${AMANSIGNAL_DOMAIN}"
curl -fsS "https://${AMANSIGNAL_DOMAIN}/api/health" || echo "health check failed"
echo
echo "Citizen intake:      https://${AMANSIGNAL_DOMAIN}/"
echo "Operations board:    https://${AMANSIGNAL_DOMAIN}/ops"
