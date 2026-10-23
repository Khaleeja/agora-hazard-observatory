# check=skip=SecretsUsedInArgOrEnv
# ── Stage 1: build Angular ────────────────────────────────────────────
FROM node:22-alpine AS builder
RUN apk upgrade --no-cache
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
FROM nginx:1.27-alpine
RUN apk upgrade --no-cache
COPY --from=builder /app/dist/AGORA-Frontend/browser /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
