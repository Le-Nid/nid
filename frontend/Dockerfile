FROM node:24-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci --ignore-scripts

COPY . .
RUN npm run build

FROM nginx:stable-alpine AS runner
LABEL org.opencontainers.image.source="https://github.com/le-nid/nid"
LABEL org.opencontainers.image.description="Nid — Frontend SPA"
LABEL org.opencontainers.image.licenses="MIT"

# Remove unnecessary packages and upgrade
RUN apk upgrade --no-cache \
    && rm -rf /tmp/* /var/cache/apk/*

# Static files root-owned = read-only, nginx only needs read access
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

# nginx runtime dirs need to be writable
RUN chown -R nginx:nginx /var/cache/nginx /var/log/nginx /run

USER nginx
EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
