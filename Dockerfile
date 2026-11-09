# ReadMeABook - Build for ghcr.io/DeadpoolKB/ReadMeABook
# This Dockerfile builds the unified container and tags it for your registry
# Usage: docker build -t ghcr.io/DeadpoolKB/ReadMeABook:latest -f Dockerfile .
# Push: docker push ghcr.io/DeadpoolKB/ReadMeABook:latest

# Build arguments - can be overridden at build time
ARG APP_VERSION=latest
ARG GIT_COMMIT=unknown
ARG BUILD_DATE=unknown

# Static ffmpeg/ffprobe source (same as dockerfile.unified)
FROM mwader/static-ffmpeg:9.0.2-1@sha256:f5d100184884eb3e82b0eb14bb5ebf98da99826ac824989720297fb9ef21c822 AS ffmpeg

# Runtime OS layer: debian with node preinstalled
FROM node:24-bookworm AS base

# Install PostgreSQL 16 repository key
RUN apt-get update && apt-get install -y curl gnupg && \
    install -d /etc/apt/keyrings && \
    curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /etc/apt/keyrings/postgresql.gpg && \
    echo "deb [signed-by=/etc/apt/keyrings/postgresql.gpg] http://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" > /etc/apt/sources.list.d/postgresql.list

# Install PostgreSQL, Redis, supervisord, and gosu
RUN apt-get update && apt-get install -y \
    postgresql-16 \
    postgresql-client-16 \
    redis-server \
    supervisor \
    curl \
    openssl \
    locales \
    gosu \
    xz-utils \
    && sed -i 's/^# \(en_US.UTF-8 UTF-8\)/\1/' /etc/locale.gen \
    && locale-gen en_US.UTF-8 \
    && update-locale LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 \
    && rm -rf /var/lib/apt/lists/*

# Install static ffmpeg + ffprobe
ARG FFMPEG_VERSION=9.0.2
COPY --from=ffmpeg /ffmpeg /ffprobe /usr/local/bin/
COPY --from=ffmpeg /versions.json /usr/local/share/ffmpeg/versions.json
RUN set -eu; \
    case "$(uname -m)" in \
        x86_64) want=3e ;; \
        aarch64) want=b7 ;; \
        *) echo "ERROR: no pinned static ffmpeg for $(uname -m)" >&2; exit 1 ;; \
    esac; \
    for bin in ffmpeg ffprobe; do \
        got="$(od -An -t x1 -j 18 -N 1 "/usr/local/bin/$bin" | tr -d ' \n')"; \
        [ "$got" = "$want" ] || { echo "ERROR: $bin e_machine 0x$got, expected 0x$want for $(uname -m)" >&2; exit 1; }; \
        ver="$("/usr/local/bin/$bin" -version | head -n 1)"; \
        case "$ver" in \
            "$bin version $FFMPEG_VERSION "*) echo "OK: $ver ($(uname -m))" ;; \
            *) echo "ERROR: expected $bin $FFMPEG_VERSION, got: $ver" >&2; exit 1 ;; \
        esac; \
    done

# Remove imagemagick
RUN apt-get purge -y imagemagick imagemagick-6-common 'imagemagick-6*' \
    'libmagickcore*' 'libmagickwand*' && \
    apt-get autoremove -y --purge && \
    rm -rf /var/lib/apt/lists/*

ENV LANG=en_US.UTF-8
ENV LC_ALL=en_US.UTF-8

# ============================================================================
# builder: full dependency tree + Next.js standalone build
# ============================================================================
FROM node:24-bookworm AS builder

ARG APP_VERSION=unknown
ARG GIT_COMMIT=unknown
ARG BUILD_DATE=unknown

WORKDIR /app

COPY package.json package-lock.json* ./
COPY prisma ./prisma/

RUN npm ci && npm cache clean --force

COPY . .

ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy?schema=public"
RUN ./node_modules/.bin/prisma generate

ENV NEXT_PUBLIC_APP_VERSION=${APP_VERSION}
ENV NEXT_PUBLIC_GIT_COMMIT=${GIT_COMMIT}
ENV NEXT_PUBLIC_BUILD_DATE=${BUILD_DATE}
ENV APP_VERSION=${APP_VERSION}
ENV GIT_COMMIT=${GIT_COMMIT}
ENV BUILD_DATE=${BUILD_DATE}

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV TURBOPACK=0
RUN npm run build

# ============================================================================
# prisma-cli: the Prisma CLI closure
# ============================================================================
FROM node:24-bookworm AS prisma-cli
WORKDIR /opt/prisma-cli
RUN --mount=type=bind,source=package-lock.json,target=/tmp/app/package-lock.json \
    --mount=type=bind,source=docker/unified/prisma-cli-lock.js,target=/tmp/app/prisma-cli-lock.js \
    node /tmp/app/prisma-cli-lock.js /tmp/app/package-lock.json /opt/prisma-cli
RUN npm ci --ignore-scripts --no-audit --no-fund && \
    npm rebuild prisma @prisma/engines && \
    rm -rf node_modules/.package-lock.json node_modules/@prisma/engines/node_modules/.cache && \
    npm cache clean --force
RUN set -eu; \
    want="$(node -p "require('./package.json').dependencies.prisma")"; \
    got="$(node -p "require('./node_modules/prisma/package.json').version")"; \
    [ "$got" = "$want" ] || { echo "ERROR: prisma $got installed, lockfile says $want" >&2; exit 1; }; \
    set -- node_modules/@prisma/engines/schema-engine-*; \
    [ "$#" -eq 1 ] && [ -x "$1" ] || { echo "ERROR: expected one executable schema engine, got: $*" >&2; exit 1; }; \
    echo "OK: prisma $got with $1"

# ============================================================================
# runtime: the shipped image
# ============================================================================
FROM base AS runtime

ARG APP_VERSION=unknown
ARG GIT_COMMIT=unknown
ARG BUILD_DATE=unknown

ENV NEXT_PUBLIC_APP_VERSION=${APP_VERSION}
ENV NEXT_PUBLIC_GIT_COMMIT=${GIT_COMMIT}
ENV NEXT_PUBLIC_BUILD_DATE=${BUILD_DATE}
ENV APP_VERSION=${APP_VERSION}
ENV GIT_COMMIT=${GIT_COMMIT}
ENV BUILD_DATE=${BUILD_DATE}
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV TURBOPACK=0

WORKDIR /app

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/src/generated/prisma ./src/generated/prisma
COPY --from=prisma-cli /opt/prisma-cli/node_modules ./node_modules
COPY --chown=root:root scripts ./scripts

RUN set -eu; \
    case "$(uname -m)" in \
        x86_64) keep=linux-x64 ;; \
        aarch64) keep=linux-arm64 ;; \
        *) echo "ERROR: no prebuild mapping for $(uname -m)" >&2; exit 1 ;; \
    esac; \
    find /app/node_modules -type d -name prebuilds -prune | while read -r dir; do \
        for p in "$dir"/*; do \
            [ -e "$p" ] || continue; \
            [ "$(basename "$p")" = "$keep" ] || { rm -rf "$p"; echo "removed $p"; }; \
        done; \
    done

RUN mkdir -p \
    /var/run/postgresql \
    /var/lib/postgresql/data \
    /var/lib/redis \
    /app/config \
    /app/cache \
    /downloads \
    /media \
    /app/.next/cache \
    /var/log/supervisor

RUN chown -R postgres:postgres /var/lib/postgresql /var/run/postgresql && \
    chmod 2777 /var/run/postgresql

RUN chown -R redis:redis /var/lib/redis

RUN chown -R node:node /app/config /app/cache /downloads /media /app/.next/cache

COPY --chown=root:root docker/unified/supervisord.conf /etc/supervisor/conf.d/supervisord.conf
COPY --chown=root:root docker/unified/entrypoint.sh /entrypoint.sh
RUN sed -i 's/\r$//' /entrypoint.sh && chmod +x /entrypoint.sh

COPY --chown=root:root docker/unified/app-start.sh /app/app-start.sh
RUN sed -i 's/\r$//' /app/app-start.sh && chmod +x /app/app-start.sh

COPY --chown=root:root docker/unified/redis-start.sh /app/redis-start.sh
RUN sed -i 's/\r$//' /app/redis-start.sh && chmod +x /app/redis-start.sh

COPY --chown=root:root docker/unified/postgres-start.sh /app/postgres-start.sh
RUN sed -i 's/\r$//' /app/postgres-start.sh && chmod +x /app/postgres-start.sh

RUN --network=none \
    --mount=type=bind,source=docker/unified/runtime-guard.js,target=/tmp/guard/runtime-guard.js \
    node /tmp/guard/runtime-guard.js

EXPOSE 3030

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3030/api/health || exit 1

ENTRYPOINT ["/entrypoint.sh"]
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]

# Final stage with registry tag
# This is the actual image that will be pushed to ghcr.io/DeadpoolKB/ReadMeABook
FROM runtime
LABEL maintainer="DeadpoolKB"
LABEL version="${APP_VERSION}"
LABEL git.commit="${GIT_COMMIT}"
LABEL build.date="${BUILD_DATE}"

