#!/usr/bin/env bash
# Swap the running container for one built from the current checkout.
#
# Deliberately not provision.sh: that script rewrites the nginx site file, which
# certbot edits in place to add the TLS server block. Re-running it would either
# strip HTTPS (with SKIP_TLS) or re-enter certbot on a cert that is already
# valid. Nothing about nginx or the certificate needs to change to ship an
# application build, so nothing here touches them.
#
# The environment is read off the container that is already running, so the
# credentials never leave the host and are never written to a file.
set -euo pipefail
cd "${REPO_DIR:-$HOME/aman-signal}"

getenv() {
  sudo docker inspect amansignal --format '{{range .Config.Env}}{{println .}}{{end}}' \
    | sed -n "s/^$1=//p" | head -1
}
KEY="$(getenv DASHSCOPE_API_KEY)"
OPS="$(getenv OPS_PASSPHRASE)"
FIELD="$(getenv FIELD_PASSPHRASE)"
DEMO="$(getenv AMANSIGNAL_DEMO)"
for v in KEY OPS FIELD; do
  [ -n "${!v}" ] || { echo "could not read $v from the running container" >&2; exit 1; }
done
echo "==> carried over: DASHSCOPE_API_KEY, OPS_PASSPHRASE, FIELD_PASSPHRASE, AMANSIGNAL_DEMO=$DEMO"

if sudo docker inspect amansignal-prev >/dev/null 2>&1; then
  echo "amansignal-prev exists, left by an interrupted run; inspect it and remove it first" >&2
  exit 1
fi

echo "==> pulling"
git pull --ff-only
git log --oneline -1

echo "==> building (old container still serving)"
sudo docker build -q -t amansignal:new . >/dev/null

echo "==> swapping"
sudo docker stop amansignal >/dev/null
sudo docker rename amansignal amansignal-prev
sudo docker tag amansignal:new amansignal:latest
sudo docker run -d --name amansignal \
  -p 127.0.0.1:3000:3000 \
  -e DASHSCOPE_API_KEY="$KEY" -e OPS_PASSPHRASE="$OPS" \
  -e FIELD_PASSPHRASE="$FIELD" -e AMANSIGNAL_DEMO="$DEMO" \
  -v amansignal-data:/data --restart unless-stopped amansignal:latest >/dev/null

ok=0
for i in $(seq 1 24); do
  if curl -fsS --max-time 3 http://127.0.0.1:3000/api/health >/dev/null 2>&1; then ok=1; break; fi
  sleep 5
done

if [ "$ok" != "1" ]; then
  echo "!! new container never became healthy; rolling back" >&2
  sudo docker logs --tail 40 amansignal >&2 || true
  sudo docker rm -f amansignal >/dev/null
  sudo docker rename amansignal-prev amansignal
  sudo docker start amansignal >/dev/null
  echo "rolled back to the previous container" >&2
  exit 1
fi

echo "==> healthy; removing the previous container"
sudo docker rm amansignal-prev >/dev/null
sudo docker image prune -f >/dev/null 2>&1 || true
curl -fsS http://127.0.0.1:3000/api/health
echo
