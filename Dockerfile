# Build and run AmanSignal. Multi-stage so the runtime image carries no toolchain.
#
# The database is SQLite on a mounted volume, so the container is stateless and the
# data survives a redeploy. Mount it at /data:
#
#   docker build -t amansignal .
#   docker run -d --name amansignal -p 3000:3000 \
#     -e DASHSCOPE_API_KEY=sk-... \
#     -v amansignal-data:/data \
#     --restart unless-stopped amansignal

FROM node:22-bookworm-slim AS deps
WORKDIR /app
# better-sqlite3 compiles from source; the toolchain stays in this stage only.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    AMANSIGNAL_DATA_DIR=/data

RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs nextjs \
    && mkdir -p /data && chown nextjs:nodejs /data

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
# Standalone tracing does not follow the native .node binary; copy it explicitly.
#
# better-sqlite3 alone is enough. It ships prebuilt binaries under prebuilds/ and
# selects one through its own lib/binding.js, so nothing else is needed at run
# time: the only requires in that path are fs, path and util.
#
# This previously also copied `bindings` and `file-uri-to-path`, which were how
# better-sqlite3 located its binary up to v8. Neither is a dependency of v13, so
# neither is installed, and the build failed at the COPY with "file does not
# exist" rather than at anything to do with the app.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3

USER nextjs
EXPOSE 3000
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
