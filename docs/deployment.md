# Deployment

AmanSignal runs as a single Node process with a SQLite database on a mounted volume. It needs a host with a persistent filesystem, which rules out serverless platforms: `better-sqlite3` is a native module and the incident store is a file on disk.

Verified locally against the production build on 2026-08-28: health `ok`, both surfaces served, and a live report extracted, clarified, confirmed and auto-linked into an existing incident.

## Requirements

- A Linux host with 1 vCPU and 1 GB RAM (comfortably enough; inference happens off-box)
- Docker, or Node 22 with a build toolchain
- `DASHSCOPE_API_KEY` from Alibaba Cloud Model Studio, **Singapore region**
- Outbound HTTPS to `dashscope-intl.aliyuncs.com`

## Docker

```bash
docker build -t amansignal .

docker run -d --name amansignal \
  -p 80:3000 \
  -e DASHSCOPE_API_KEY=sk-your-key \
  -e OPS_PASSPHRASE=choose-one \
  -e FIELD_PASSPHRASE=choose-another \
  -v amansignal-data:/data \
  --restart unless-stopped \
  amansignal
```

The named volume holds the database and uploaded media, so a rebuild and redeploy keeps every incident. Confirm it came up:

```bash
curl -s http://localhost/api/health
```

A healthy response reports the database row count and that the model credential is configured. It returns **503 when degraded**, so a deployment that cannot reach its database or has no key fails its health check instead of silently accepting reports it cannot process.

## A Linux VM

Tested on a Google Compute Engine `e2-small` (2 shared vCPU, 2 GB) in `asia-south1` with a 30 GB balanced disk and a reserved static address. Any Ubuntu 22.04 or 24.04 VM with a public address works the same way; inference calls go to the Singapore endpoint wherever the host runs.

1. Create the VM, reserve a static address for it, and allow inbound **80** and **443**; restrict **22** to your own address.
2. Point a domain's A record at the address and wait for it to resolve. `provision.sh` checks that it does before requesting a certificate.
3. On the VM, clone the repo into your home directory and run the provisioning script. It installs Docker, nginx and certbot, builds the image, starts the container on `127.0.0.1:3000` behind nginx, and obtains the certificate:

```bash
git clone https://github.com/itxcrusher/aman-signal.git ~/aman-signal && cd ~/aman-signal
export DASHSCOPE_API_KEY=sk-...
export OPS_PASSPHRASE=...          # opens the operator board
export FIELD_PASSPHRASE=...        # opens the field-team screen
export AMANSIGNAL_DOMAIN=amansignal.example.com
export CERTBOT_EMAIL=you@example.com
sudo -E bash deploy/provision.sh
```

4. Verify from your own machine, not from the VM: `curl https://<domain>/api/health`.

`AMANSIGNAL_SKIP_TLS=1` serves plain HTTP on the host's address while DNS is still propagating; re-run without it to add the certificate. `deploy/create-instance.sh` creates a matching instance on Alibaba Cloud ECS in Singapore with the `aliyun` CLI; it has not been run to completion against a live account.

## Redeploying

`provision.sh` rewrites the nginx site and runs certbot again. To ship a new build without touching either, use `deploy/redeploy.sh`. It pulls, builds while the old container keeps serving, carries the app's settings over from the running container (every variable in the table below except `AMANSIGNAL_DATA_DIR`, which the script fixes at `/data`) so the credentials are never written to a file, swaps the containers, and rolls back if the new one does not report healthy.

```bash
cp ~/aman-signal/deploy/redeploy.sh ~/ && bash ~/redeploy.sh
```

Run it from a copy, because it pulls the checkout it lives in. Set `REPO_DIR` if the checkout is not at `~/aman-signal`.

The health check confirms that the database is reachable and the model key is set, not that the model answers. After a redeploy, load the citizen page and the board, and send one test report.

## HTTPS

The citizen surface requests **microphone and geolocation**, and browsers refuse both on plain HTTP for any origin other than `localhost`. A deployment reached over `http://<ip>` will therefore silently lose voice and location capture while text still works, which is easy to mistake for a bug in the app.

Point a domain at the instance and terminate TLS in front of it:

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
# proxy_pass http://127.0.0.1:3000 in the nginx server block, then:
sudo certbot --nginx -d your-domain
```

Run the container on `-p 127.0.0.1:3000:3000` once nginx fronts it, so the app is not also exposed directly.

## Configuration

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `DASHSCOPE_API_KEY` | yes | none | Model Studio credential; reports cannot be processed without it |
| `OPS_PASSPHRASE` | for the board | none | Opens the operator board at `/ops`; unset, nobody can sign in |
| `FIELD_PASSPHRASE` | for field teams | none | Opens the field-team screen at `/field`; unset, nobody can sign in |
| `AMANSIGNAL_DEMO` | no | off | `1` prints both passphrases on the sign-in pages and marks the board as fictional. Never set it on a deployment holding real reports |
| `AMANSIGNAL_DATA_DIR` | no | `./data` (`/data` in Docker) | Database and uploaded media |
| `AMANSIGNAL_MODEL` | no | `qwen3.5-omni-flash` | Extraction model, and the voice that reads the confirmation back |
| `DASHSCOPE_MODEL` | no | `qwen3.5-omni-flash` | Model that writes each incident's one-line situation summary |
| `AMANSIGNAL_EMBED_MODEL` | no | `text-embedding-v4` | Deduplication embeddings |
| `DASHSCOPE_BASE_URL` | no | Singapore endpoint | Override for another region |
| `HOSTNAME` | in containers | machine hostname | **Must be `0.0.0.0`** |
| `PORT` | no | 3000 | Listen port |

`HOSTNAME` deserves the emphasis. Next.js standalone binds to the machine hostname by default, so a container without it starts cleanly, logs "Ready", and is unreachable from outside with no error to explain why. The Dockerfile sets it; a bare `node server.js` deployment must too.

## Operating notes

- **Backups.** The whole state is `/data`. `docker run --rm -v amansignal-data:/data -v $(pwd):/backup alpine tar czf /backup/amansignal-$(date +%F).tar.gz /data`.
- **Logs.** `docker logs -f amansignal`. Extraction latency and the model used are recorded per report in the database and shown on each incident's evidence panel.
- **Model outage.** Intake still stores the report; extraction fails with a recoverable error and the citizen is asked to try again. Reports are never lost to an inference failure.
- **Reset.** `npm run reset` clears reports, incidents, audit history and media. Destructive and intended for demo preparation only.
