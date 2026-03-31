# ── Stage 1: Build frontend ──────────────────────────────
FROM node:24-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

# ── Stage 2: Build backend ───────────────────────────────
FROM node:24-alpine AS backend-builder
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci
COPY backend/tsconfig.json backend/vite.config.ts ./
COPY backend/src ./src
RUN npm run build

# ── Stage 3: Production image ────────────────────────────
FROM node:24-alpine AS runner
LABEL org.opencontainers.image.source="https://github.com/befa160/gmail-manager"
LABEL org.opencontainers.image.description="Gmail Manager — All-in-one (Frontend + Backend)"

RUN apk add --no-cache nginx

# Backend
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=backend-builder /app/backend/dist ./dist

# Frontend (served by nginx)
COPY --from=frontend-builder /app/frontend/dist /usr/share/nginx/html
COPY nginx.unified.conf /etc/nginx/http.d/default.conf

# Archives directory
RUN mkdir -p /archives

# Non-root user setup
RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup && \
    chown -R appuser:appgroup /app /archives && \
    chown -R appuser:appgroup /var/lib/nginx /var/log/nginx /run/nginx

# Entrypoint script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

USER appuser
ENV NODE_ENV=production
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/ || exit 1

CMD ["/entrypoint.sh"]
