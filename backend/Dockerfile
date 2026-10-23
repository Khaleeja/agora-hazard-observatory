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

RUN npm install -g npm@11.17.0

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

RUN mkdir -p logs

EXPOSE 3000
CMD ["node", "dist/index.js"]