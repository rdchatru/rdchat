# syntax=docker/dockerfile:1.4
ARG BUILD_SHA
ARG BUILD_NUMBER
ARG BUILD_TIMESTAMP
ARG RELEASE_CHANNEL=nightly

# ---------- Base stage with Node.js installed via apt ----------
FROM debian:trixie-slim AS base

WORKDIR /usr/src/app

# Install system build dependencies and Node.js 24 from NodeSource
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
        curl \
        python3 \
        make \
        g++ \
        ca-certificates \
    && curl -fsSL https://deb.nodesource.com/setup_24.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# Enable corepack and prepare pnpm (version pinned)
RUN corepack enable && corepack prepare pnpm@10.26.0 --activate

# ---------- Dependencies stage (copies only package.json files) ----------
FROM base AS deps

COPY --link pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY --link patches/ ./patches/

# Copy all package.json files for each workspace package (explicit list for cache granularity)
COPY --link packages/admin/package.json ./packages/admin/
COPY --link packages/api/package.json ./packages/api/
COPY --link packages/app_proxy/package.json ./packages/app_proxy/
COPY --link packages/cache/package.json ./packages/cache/
COPY --link packages/captcha/package.json ./packages/captcha/
COPY --link packages/cassandra/package.json ./packages/cassandra/
COPY --link packages/config/package.json ./packages/config/
COPY --link packages/constants/package.json ./packages/constants/
COPY --link packages/date_utils/package.json ./packages/date_utils/
COPY --link packages/elasticsearch_search/package.json ./packages/elasticsearch_search/
COPY --link packages/email/package.json ./packages/email/
COPY --link packages/errors/package.json ./packages/errors/
COPY --link packages/geoip/package.json ./packages/geoip/
COPY --link packages/geo_utils/package.json ./packages/geo_utils/
COPY --link packages/hono/package.json ./packages/hono/
COPY --link packages/hono_types/package.json ./packages/hono_types/
COPY --link packages/http_client/package.json ./packages/http_client/
COPY --link packages/i18n/package.json ./packages/i18n/
COPY --link packages/initialization/package.json ./packages/initialization/
COPY --link packages/ip_utils/package.json ./packages/ip_utils/
COPY --link packages/kv_client/package.json ./packages/kv_client/
COPY --link packages/limits/package.json ./packages/limits/
COPY --link packages/list_utils/package.json ./packages/list_utils/
COPY --link packages/locale/package.json ./packages/locale/
COPY --link packages/logger/package.json ./packages/logger/
COPY --link packages/marketing/package.json ./packages/marketing/
COPY --link packages/markdown_parser/package.json ./packages/markdown_parser/
COPY --link packages/media_proxy/package.json ./packages/media_proxy/
COPY --link packages/media_proxy_utils/package.json ./packages/media_proxy_utils/
COPY --link packages/meilisearch_search/package.json ./packages/meilisearch_search/
COPY --link packages/mime_utils/package.json ./packages/mime_utils/
COPY --link packages/nats/package.json ./packages/nats/
COPY --link packages/number_utils/package.json ./packages/number_utils/
COPY --link packages/oauth2/package.json ./packages/oauth2/
COPY --link packages/openapi/package.json ./packages/openapi/
COPY --link packages/queue/package.json ./packages/queue/
COPY --link packages/rate_limit/package.json ./packages/rate_limit/
COPY --link packages/s3/package.json ./packages/s3/
COPY --link packages/schema/package.json ./packages/schema/
COPY --link packages/sentry/package.json ./packages/sentry/
COPY --link packages/sms/package.json ./packages/sms/
COPY --link packages/snowflake/package.json ./packages/snowflake/
COPY --link packages/telemetry/package.json ./packages/telemetry/
COPY --link packages/time/package.json ./packages/time/
COPY --link packages/ui/package.json ./packages/ui/
COPY --link packages/validation/package.json ./packages/validation/
COPY --link packages/virus_scan/package.json ./packages/virus_scan/
COPY --link packages/worker/package.json ./packages/worker/

# Copy the two top-level applications
COPY --link fluxer_server/package.json ./fluxer_server/
COPY --link fluxer_app/package.json ./fluxer_app/

# Install dependencies (frozen lockfile, cache pnpm store)
RUN --mount=type=cache,target=/root/.local/share/pnpm/store,sharing=locked \
    pnpm install --frozen-lockfile

# Approve and rebuild native packages (versions pinned)
RUN pnpm approve-builds msgpackr-extract@3.0.3 @parcel/watcher@2.5.6 && \
    pnpm rebuild msgpackr-extract @parcel/watcher

# ---------- Build stage (server and common packages) ----------
FROM deps AS build

# Copy global tsconfigs
COPY --link tsconfigs /usr/src/app/tsconfigs

# Copy all package source code (this overwrites the package directories, so we must re‑link)
COPY --link packages/ ./packages/
COPY --link fluxer_server/ ./fluxer_server/
COPY --link fluxer_media_proxy/data/model.onnx ./fluxer_media_proxy/data/model.onnx

# Re‑create symlinks using the existing store (offline, fast)
RUN pnpm install --frozen-lockfile --offline

# Now run build steps
RUN pnpm --filter @fluxer/config generate
RUN pnpm --filter @fluxer/marketing build:css
RUN cd fluxer_server && pnpm typecheck

FROM debian:trixie-slim AS gateway-build

ARG LOGGER_LEVEL=info
WORKDIR /usr/src/app/gateway

# Install build tools and Erlang development packages directly from Debian
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
        curl \
        git \
        make \
        gcc \
        g++ \
        libc6-dev \
        ca-certificates \
        gettext-base \
        # Erlang packages (all available in trixie main)
        erlang-base \
        erlang-dev \
        erlang-syntax-tools \
        erlang-parsetools \
        erlang-inets \
        erlang-ssl \
        erlang-public-key \
        erlang-asn1 \
        erlang-crypto \
    && rm -rf /var/lib/apt/lists/*

# Install rebar3 (still from GitHub)
RUN curl -fsSL https://github.com/erlang/rebar3/releases/download/3.24.0/rebar3 -o /usr/local/bin/rebar3 && \
    chmod +x /usr/local/bin/rebar3

# Copy dependency manifests and fetch deps
COPY fluxer_gateway/rebar.config fluxer_gateway/rebar.lock* ./
RUN rebar3 compile --deps_only

# Copy full gateway source and build release
COPY fluxer_gateway/. ./fluxer_gateway
RUN LOGGER_LEVEL=${LOGGER_LEVEL} envsubst '${LOGGER_LEVEL}' < fluxer_gateway/config/vm.args.template > fluxer_gateway/config/vm.args && \
    LOGGER_LEVEL=${LOGGER_LEVEL} envsubst '${LOGGER_LEVEL}' < fluxer_gateway/config/sys.config.template > fluxer_gateway/config/sys.config && \
    (cd fluxer_gateway && rebar3 as prod release)

# ---------- App build stage (frontend) ----------
FROM deps AS app-build

# Install Rust and wasm-pack (required for WebAssembly compilation)
RUN curl https://sh.rustup.rs -sSf | sh -s -- -y --default-toolchain stable && \
    export PATH="$HOME/.cargo/bin:$PATH" && \
    rustup target add wasm32-unknown-unknown && \
    cargo install wasm-pack && \
    # Verify installations
    rustc --version && cargo --version && wasm-pack --version

# Ensure PATH includes cargo binaries
ENV PATH="/root/.cargo/bin:${PATH}"

COPY --link tsconfigs /usr/src/app/tsconfigs
COPY --link packages/ ./packages/
COPY --link fluxer_app/ ./fluxer_app/

# Re‑link dependencies
RUN pnpm install --frozen-lockfile --offline

# Build frontend (this will use Rust/wasm-pack)
RUN cd fluxer_app && pnpm build

# ---------- Production stage ----------
FROM debian:trixie-slim AS production

ARG BUILD_SHA
ARG BUILD_NUMBER
ARG BUILD_TIMESTAMP
ARG RELEASE_CHANNEL

LABEL org.opencontainers.image.title="RdChat Server" \
      org.opencontainers.image.description="Unified RdChat server - combines all backend services into a single deployable container" \
      org.opencontainers.image.vendor="RdChat Team" \
      org.opencontainers.image.licenses="AGPL-3.0-or-later" \
      org.opencontainers.image.source="https://github.com/rdchatru/rdchat" \
      org.opencontainers.image.documentation="https://docs.fluxer.app" \
      org.opencontainers.image.revision="${BUILD_SHA}" \
      org.opencontainers.image.version="${BUILD_NUMBER}" \
      org.opencontainers.image.created="${BUILD_TIMESTAMP}"

WORKDIR /usr/src/app

# Install runtime dependencies: Node.js (from NodeSource), Erlang (from Erlang Solutions), ffmpeg
# Install runtime dependencies: Node.js (from NodeSource) and Erlang (from Debian), ffmpeg
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
        curl \
        ca-certificates \
    && curl -fsSL https://deb.nodesource.com/setup_24.x | bash - \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
        nodejs \
        # Erlang runtime only (from Debian)
        erlang-base \
        ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Enable corepack and pnpm (needed for entrypoint)
RUN corepack enable && corepack prepare pnpm@10.26.0 --activate

# Copy built artifacts from previous stages
COPY --link --from=build /usr/src/app/node_modules ./node_modules
COPY --link --from=build /usr/src/app/packages ./packages
COPY --link --from=build /usr/src/app/fluxer_server ./fluxer_server
COPY --link --from=build /usr/src/app/tsconfigs ./tsconfigs
COPY --link --from=build /usr/src/app/pnpm-workspace.yaml ./
COPY --link --from=build /usr/src/app/package.json ./
COPY --link --from=gateway-build /usr/src/app/gateway/fluxer_gateway/_build/prod/rel/fluxer_gateway /opt/fluxer_gateway
COPY --link --from=app-build /usr/src/app/fluxer_app/dist /usr/src/app/assets

# Create required directories
RUN mkdir -p /usr/src/app/data/storage \
             /usr/src/app/data/db \
             /opt/data \
             /data/s3 \
             /data/sqlite \
             /data/queue \
             /var/log/fluxer \
    && chown -R root:root /usr/src/app/data /opt/data /data

# Conditionally include NSFW ML model
ARG INCLUDE_NSFW_ML=true
RUN --mount=type=bind,from=build,source=/usr/src/app/fluxer_media_proxy/data/model.onnx,target=/tmp/model.onnx \
    if [ "$INCLUDE_NSFW_ML" = "true" ]; then \
        echo "Including NSFW detection model..."; \
        cp /tmp/model.onnx /opt/data/model.onnx; \
    else \
        echo "Skipping NSFW detection model (INCLUDE_NSFW_ML=$INCLUDE_NSFW_ML)"; \
    fi

EXPOSE 8080

ENV NODE_ENV=production \
    FLUXER_SERVER_HOST=0.0.0.0 \
    FLUXER_SERVER_PORT=8080 \
    FLUXER_GATEWAY_HOST=127.0.0.1 \
    FLUXER_GATEWAY_PORT=8082 \
    DATABASE_BACKEND=sqlite \
    SQLITE_PATH=/usr/src/app/data/db/fluxer.db \
    STORAGE_ROOT=/usr/src/app/data/storage \
    SEARCH_BACKEND=sqlite \
    FLUXER_SERVER_STATIC_DIR=/usr/src/app/assets \
    BUILD_SHA=${BUILD_SHA} \
    BUILD_NUMBER=${BUILD_NUMBER} \
    BUILD_TIMESTAMP=${BUILD_TIMESTAMP} \
    RELEASE_CHANNEL=${RELEASE_CHANNEL}

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD curl -f http://localhost:8080/_health || exit 1

ENTRYPOINT ["pnpm", "--filter", "fluxer_server", "start"]