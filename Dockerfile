# ── Version ──────────────────────────────────────────────
ARG APP_VERSION=0.1.0

# ── Stage 1: Build frontend ──────────────────────────────
FROM node:24-alpine AS frontend-builder
WORKDIR /app/frontend

# Layer cache: deps first, then source
COPY frontend/package*.json ./
RUN npm ci --ignore-scripts

COPY frontend/ .
RUN npm run build

# ── Stage 2: Build backend ───────────────────────────────
FROM node:24-alpine AS backend-builder
WORKDIR /app/backend

COPY backend/package*.json ./
RUN npm ci --ignore-scripts

COPY backend/tsconfig.json backend/vite.config.ts ./
COPY backend/src ./src
RUN npm run build

# ── Stage 3: Production dependencies ────────────────────
FROM node:24-alpine AS deps
WORKDIR /app/backend

COPY backend/package*.json ./
RUN npm ci --omit=dev --ignore-scripts \
    && npm cache clean --force

# ── Stage 4: Production image ───────────────────────────
FROM node:24-alpine AS runner
ARG APP_VERSION=0.1.0
LABEL org.opencontainers.image.source="https://github.com/le-nid/nid"
LABEL org.opencontainers.image.description="Nid — All-in-one (Frontend + Backend)"
LABEL org.opencontainers.image.licenses="MIT"
LABEL org.opencontainers.image.version="${APP_VERSION}"

# Install nginx + su-exec (lightweight gosu for Alpine), upgrade packages, remove unnecessary tools
RUN apk add --no-cache nginx su-exec \
    && apk upgrade --no-cache \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx \
              /usr/local/bin/corepack /usr/local/lib/node_modules/corepack \
              /opt/yarn* /tmp/* /var/cache/apk/*

# Non-root user — only /archives writable, nginx runtime dirs writable
RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup && \
    mkdir -p /archives && \
    chown appuser:appgroup /archives && \
    chown -R appuser:appgroup /var/lib/nginx /var/log/nginx /run/nginx

# Backend production deps + built code (root-owned = read-only for appuser)
WORKDIR /app/backend
COPY --from=deps /app/backend/node_modules ./node_modules
COPY --from=deps /app/backend/package.json ./package.json
COPY --from=backend-builder /app/backend/dist ./dist

# Frontend static files (root-owned = read-only)
COPY --from=frontend-builder /app/frontend/dist /usr/share/nginx/html

# Nginx config (root-owned = read-only)
COPY nginx.unified.conf /etc/nginx/http.d/default.conf

# Entrypoint script (root-owned, not modifiable by appuser)
COPY entrypoint.sh /entrypoint.sh
RUN chmod 755 /entrypoint.sh

# Entrypoint runs as root to fix volume permissions, then drops to appuser via su-exec
ENV NODE_ENV=production
ENV APP_VERSION=${APP_VERSION}
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000/ || exit 1

CMD ["/entrypoint.sh"]
