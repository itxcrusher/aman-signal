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

# The settings the app reads. AMANSIGNAL_DATA_DIR stays out: it belongs with the
# volume mount below, which this script fixes at /data.
CARRY=(DASHSCOPE_API_KEY OPS_PASSPHRASE FIELD_PASSPHRASE AMANSIGNAL_DEMO
       DASHSCOPE_BASE_URL AMANSIGNAL_MODEL DASHSCOPE_MODEL AMANSIGNAL_EMBED_MODEL)
REQUIRED=(DASHSCOPE_API_KEY OPS_PASSPHRASE FIELD_PASSPHRASE)

exists() { sudo docker container inspect "$1" >/dev/null 2>&1; }

if exists amansignal-prev; then
  echo "amansignal-prev exists, left by an interrupted run. To put it back:" >&2
  echo "  sudo docker rm -f amansignal; sudo docker rename amansignal-prev amansignal; sudo docker start amansignal" >&2
  exit 1
fi
if ! exists amansignal; then
  echo "no container named amansignal; deploy with provision.sh first" >&2
  exit 1
fi

ENV_DUMP="$(sudo docker container inspect amansignal --format '{{range .Config.Env}}{{println .}}{{end}}')"
OLD_IMAGE="$(sudo docker container inspect amansignal --format '{{.Image}}')"
for name in "${REQUIRED[@]}"; do
  grep -q "^$name=." <<<"$ENV_DUMP" || { echo "could not read $name from the running container" >&2; exit 1; }
done
ENV_ARGS=()
CARRIED=()
for name in "${CARRY[@]}"; do
  value="$(sed -n "s/^$name=//p" <<<"$ENV_DUMP" | head -1)"
  if [ -n "$value" ]; then
    ENV_ARGS+=(-e "$name=$value")
    CARRIED+=("$name")
  fi
done
echo "==> carrying over: ${CARRIED[*]}"

echo "==> pulling"
git pull --ff-only
git log --oneline -1

echo "==> building (old container still serving)"
sudo docker build -q -t amansignal:new . >/dev/null

# Puts the old container back from any point of the swap: after the stop, after
# the rename, or after a new container was created and failed.
rollback() {
  echo "!! $1; rolling back" >&2
  if exists amansignal-prev; then
    sudo docker logs --tail 40 amansignal >&2 2>/dev/null || true
    sudo docker rm -f amansignal >/dev/null 2>&1 || true
    sudo docker rename amansignal-prev amansignal
  fi
  sudo docker tag "$OLD_IMAGE" amansignal:latest || true
  sudo docker start amansignal >/dev/null
  echo "rolled back to the previous container" >&2
  exit 1
}

echo "==> swapping"
if ! { sudo docker stop amansignal >/dev/null &&
       sudo docker rename amansignal amansignal-prev &&
       sudo docker tag amansignal:new amansignal:latest &&
       sudo docker run -d --name amansignal -p 127.0.0.1:3000:3000 "${ENV_ARGS[@]}" \
         -v amansignal-data:/data --restart unless-stopped amansignal:latest >/dev/null; }; then
  rollback "the swap failed"
fi

ok=0
for i in $(seq 1 24); do
  if curl -fsS --max-time 3 http://127.0.0.1:3000/api/health >/dev/null 2>&1; then ok=1; break; fi
  sleep 5
done

if [ "$ok" != "1" ]; then
  rollback "the new container never became healthy"
fi

echo "==> healthy; removing the previous container"
sudo docker rm amansignal-prev >/dev/null
sudo docker image prune -f >/dev/null 2>&1 || true
curl -fsS http://127.0.0.1:3000/api/health
echo
