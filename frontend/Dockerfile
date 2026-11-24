# check=skip=SecretsUsedInArgOrEnv
# ── Stage 1: build Angular ────────────────────────────────────────────
FROM node:22-alpine AS builder
RUN apk update && apk upgrade --no-cache
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG ARCGIS_API_KEY
RUN if [ -n "$ARCGIS_API_KEY" ]; then \
      printf 'export const environment = { arcgisApiKey: "%s" };\n' "$ARCGIS_API_KEY" \
        > src/environments/environment.ts; \
    else \
      test -f src/environments/environment.ts || \
        cp src/environments/environment.example.ts src/environments/environment.ts; \
    fi
RUN npm run build

# Deregister the Angular service worker in production
# (replaces ngsw-worker.js with a self-unregistering stub)
RUN printf 'self.addEventListener("install",()=>self.skipWaiting());self.addEventListener("activate",async()=>{await self.registration.unregister();const c=await self.clients.matchAll({type:"window"});c.forEach(cl=>cl.navigate(cl.url));});' \
    > /app/dist/AGORA-Frontend/browser/ngsw-worker.js

# ── Stage 2: serve with nginx ──────────────────────────────────────────
# nginxinc/nginx-unprivileged, not the plain official image: the regular
# nginx image's master process still needs root to bind port 80 (its
# workers — the ones that actually handle requests — already run as a
# non-root user on their own). This variant is pre-configured to run
# fully as non-root instead, on port 8080 (see nginx.conf's `listen`
# directive, changed to match) — no part of the process tree is root once
# it's running.
FROM nginxinc/nginx-unprivileged:1.31.4-alpine3.24
USER root
# A later local rebuild meant to pick up newly disclosed OS CVEs needs
# `docker build --no-cache`: Docker otherwise reuses this layer's old
# result whenever neither the base image nor this command text changed,
# even though the real package index has moved on.
RUN apk update && apk upgrade --no-cache
COPY --from=builder /app/dist/AGORA-Frontend/browser /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
USER nginx
EXPOSE 8080
