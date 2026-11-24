# ── Stage 1: build ──────────────────────────────────────────────────────────
FROM node:22.23.0-alpine AS builder
WORKDIR /app

RUN npm install -g npm@11.17.0

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ── Stage 2: production ──────────────────────────────────────────────────────
FROM node:22.23.0-alpine AS production
WORKDIR /app

# A later local rebuild meant to pick up newly disclosed OS CVEs needs
# `docker build --no-cache`: Docker otherwise reuses this layer's old
# result whenever neither the base image nor this command text changed,
# even though the real package index has moved on.
RUN apk update && apk upgrade --no-cache

RUN npm install -g npm@11.17.0

COPY package*.json ./
# Nothing below is needed past this layer — CMD is a plain
# `node dist/index.js`, no npm involved at runtime:
#  - package-lock.json / node_modules/.package-lock.json list the full
#    dependency graph including devDependencies, so a vulnerability
#    scanner reading them flags packages `npm ci --omit=dev` never
#    actually installed, and they hand out this project's exact
#    dev-toolchain versions for no benefit.
#  - npm itself bundles its own copies of packages like tar/undici
#    internally; the global `npm install -g` above ships them too unless
#    removed here.
RUN npm ci --omit=dev && \
    rm -f package-lock.json node_modules/.package-lock.json && \
    rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx

COPY --from=builder /app/dist ./dist

RUN mkdir -p logs && chown -R node:node /app
# "node" is the non-root user already built into the official Node image —
# dropping to it means a compromised app process doesn't get root inside
# the container. Not relevant to the bind-mounted logs volume specifically
# (see docker-compose.yml's comment on that), only to this image's own
# files (dist/, node_modules/, and the logs/ dir when it isn't overridden
# by a mount).
USER node

EXPOSE 3000
CMD ["node", "dist/index.js"]