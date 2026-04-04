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
LABEL org.opencontainers.image.source="https://github.com/le-nid/nid"
LABEL org.opencontainers.image.description="Nid — All-in-one (Frontend + Backend)"
LABEL org.opencontainers.image.licenses="MIT"

# Install nginx, upgrade packages, remove unnecessary tools
RUN apk add --no-cache nginx \
    && apk upgrade --no-cache \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx \
              /usr/local/bin/corepack /usr/local/lib/node_modules/corepack \
              /opt/yarn* /tmp/* /var/cache/apk/*

# Non-root user setup (before COPY to use --chown)
RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup && \
    mkdir -p /app/backend /archives \
             /var/lib/nginx /var/log/nginx /run/nginx && \
    chown -R appuser:appgroup /app /archives \
             /var/lib/nginx /var/log/nginx /run/nginx

# Backend production deps + built code
WORKDIR /app/backend
COPY --from=deps --chown=appuser:appgroup /app/backend/node_modules ./node_modules
COPY --from=deps --chown=appuser:appgroup /app/backend/package.json ./package.json
COPY --from=backend-builder --chown=appuser:appgroup /app/backend/dist ./dist

# Frontend static files (served by nginx)
COPY --from=frontend-builder --chown=appuser:appgroup /app/frontend/dist /usr/share/nginx/html
COPY --chown=appuser:appgroup nginx.unified.conf /etc/nginx/http.d/default.conf

# Entrypoint script
COPY --chown=appuser:appgroup entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

USER appuser

ENV NODE_ENV=production
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000/ || exit 1

CMD ["/entrypoint.sh"]
