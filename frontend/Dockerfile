# syntax=docker/dockerfile:1.7
# Build context: thư mục gốc dự án (xem docker-compose.yml)
FROM node:22-alpine AS build
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run test && npm run build

FROM caddy:2.10-alpine
COPY caddy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv/www
EXPOSE 80 443 443/udp
