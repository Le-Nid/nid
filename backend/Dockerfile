FROM node:24-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.json vite.config.ts ./
COPY src ./src
RUN npm run build

FROM node:24-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts \
    && npm cache clean --force

FROM node:24-alpine AS runner
LABEL org.opencontainers.image.source="https://github.com/le-nid/nid"
LABEL org.opencontainers.image.description="Nid — Backend API"
LABEL org.opencontainers.image.licenses="MIT"

# Remove unnecessary tools
RUN apk upgrade --no-cache \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx \
              /usr/local/bin/corepack /usr/local/lib/node_modules/corepack \
              /opt/yarn* /tmp/* /var/cache/apk/*

# Non-root user setup — only /archives writable
RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup && \
    mkdir -p /archives && \
    chown appuser:appgroup /archives

WORKDIR /app
ENV NODE_ENV=production

# Application files (root-owned = read-only for appuser)
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json
COPY --from=builder /app/dist ./dist

USER appuser
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:4000/api/auth/config || exit 1

CMD ["node", "dist/index.js"]
