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
  -v amansignal-data:/data \
  --restart unless-stopped \
  amansignal
```

The named volume holds the database and uploaded media, so a rebuild and redeploy keeps every incident. Confirm it came up:

```bash
curl -s http://localhost/api/health
```

A healthy response reports the database row count and that the model credential is configured. It returns **503 when degraded**, so a deployment that cannot reach its database or has no key fails its health check instead of silently accepting reports it cannot process.

## Alibaba Cloud ECS

1. Create an ECS instance (Ubuntu 22.04, `ecs.t6-c1m1.large` or larger) in **Singapore (ap-southeast-1)**, the same region as the Model Studio quota, so inference calls stay in-region.
2. In the security group, allow inbound **80** and **443** and restrict **22** to your own address.
3. On the instance:

```bash
sudo apt update && sudo apt install -y docker.io git
sudo systemctl enable --now docker
git clone https://github.com/itxcrusher/aman-signal.git && cd aman-signal
sudo docker build -t amansignal .
sudo docker run -d --name amansignal -p 80:3000 \
  -e DASHSCOPE_API_KEY=sk-your-key \
  -v amansignal-data:/data --restart unless-stopped amansignal
```

4. Verify from your own machine, not from the instance: `curl http://<public-ip>/api/health`.

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
| `AMANSIGNAL_DATA_DIR` | no | `./data` (`/data` in Docker) | Database and uploaded media |
| `AMANSIGNAL_MODEL` | no | `qwen3.5-omni-flash` | Extraction model |
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
