<div align="center">

<img src="public/img/icon128.png" alt="AGORA" width="96" />

# AGORA Frontend

**Real-time natural-hazard monitoring on an interactive 3D globe**

[![Angular](https://img.shields.io/badge/Angular-21-DD0031?logo=angular&logoColor=white)](https://angular.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![CesiumJS](https://img.shields.io/badge/CesiumJS-1.142-48B2E8?logo=cesium&logoColor=white)](https://cesium.com/platform/cesiumjs/)
[![PrimeNG](https://img.shields.io/badge/PrimeNG-21-3B82F6?logo=primevue&logoColor=white)](https://primeng.org)
[![RxJS](https://img.shields.io/badge/RxJS-7.8-B7178C?logo=reactivex&logoColor=white)](https://rxjs.dev)
[![nginx](https://img.shields.io/badge/nginx-1.27-009639?logo=nginx&logoColor=white)](https://nginx.org)
[![Vitest](https://img.shields.io/badge/Vitest-4-6E9F18?logo=vitest&logoColor=white)](https://vitest.dev)
[![CI](https://img.shields.io/github/actions/workflow/status/Khaleeja/agora-hazard-observatory/frontend-ci.yml?branch=main&logo=githubactions&logoColor=white&label=CI)](https://github.com/Khaleeja/agora-hazard-observatory/actions/workflows/frontend-ci.yml)

</div>

---

## Overview

AGORA is a single-page application that visualises natural-hazard
events — currently earthquakes and tropical cyclones, with the plugin
architecture on both ends designed so more phenomenon types can be added
without touching shared code — on a CesiumJS 3D globe. Users can filter
events by type, severity, category, and location radius, browse a
synchronised list, and inspect full event details in a sidebar panel.

**Key features**

- Interactive 3D globe (CesiumJS) with clustered markers and per-type
  colour coding; a cyclone renders its full historical track, resolved to
  whichever point was current as of the search's time window.
- Every registered event type is active by default, driven by the same
  `EVENT_TYPE_REGISTRY` the map/filter components consult — no type is
  hardcoded as "the default one".
- A small status badge (native `<details>`/`<summary>` — keyboard and
  screen-reader accessible, no hover-only tooltip) shows the API version
  and each phenomenon's ingestion status/freshness, polling `GET
  /api/health` every 30s.
- Filter panel with free-text location picker and click-to-place on the
  globe.
- Synchronised event list and detail panel (title, type, severity,
  timestamp, coordinates, source).
- Fully responsive — tab-based layout on mobile, side-by-side on desktop.
- Zoneless Angular 21 with signal-based reactivity and RxJS
  `BehaviorSubject` state management.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Angular 21 — zoneless, standalone components |
| Language | TypeScript 5.9 |
| 3D Map | CesiumJS 1.142 |
| UI Components | PrimeNG 21 + PrimeIcons 7 |
| State / Async | RxJS 7.8 (`BehaviorSubject`) + Angular Signals |
| Styling | SCSS |
| Testing | Vitest 4 + @testing-library/angular |
| Linting | ESLint 10 + angular-eslint + Prettier |
| Production server | nginx 1.27 (Docker, multi-stage build) |

---

## Prerequisites

| Tool | Version |
|---|---|
| Node.js | ≥ 22 |
| npm | ≥ 10 |
| Docker | any recent version (containerised deployment only) |
| ArcGIS API key | free tier at [developers.arcgis.com](https://developers.arcgis.com) |

---

## Installation

```bash
git clone https://github.com/Khaleeja/agora-hazard-observatory.git
cd agora-hazard-observatory/frontend
npm install
```

### Environment file

Angular embeds configuration at **build time**. Copy the example and fill in your key:

```bash
cp src/environments/environment.example.ts src/environments/environment.ts
```

```ts
// src/environments/environment.ts
export const environment = {
  arcgisApiKey: 'YOUR_ARCGIS_API_KEY',
};
```

> `environment.ts` is gitignored — never commit your API key.

---

## Running in Development

```bash
npm start
```

Starts the Angular dev server at **`http://localhost:4200`** with hot module reload.
API calls to `/api/` require the backend to be running locally on port 3000.

Other commands:

```bash
npm run lint    # ESLint check
npm test        # Vitest unit tests (single run)
npm run watch   # incremental build (development config)
```

---

## Production Build

```bash
npm run build
```

Compiles and tree-shakes the app into `dist/AGORA-Frontend/browser/`.
The output is a static bundle ready for any web server.

The included [`nginx.conf`](nginx.conf) handles:

- SPA fallback (`try_files $uri /index.html`)
- Reverse proxy for `/api/` and `/ws/` → backend at `http://backend:3000`
- Long-term immutable caching for hashed assets, `no-store` for `index.html`
- gzip compression

---

## Docker

### Build the image

The ArcGIS key is baked into the JS bundle at **build time**. Two options:

**Local machine** — if `src/environments/environment.ts` is already configured, the Dockerfile picks it up automatically:

```bash
docker build -t agora-frontend .
```

**CI / remote server** — where `environment.ts` does not exist, pass it as a build argument:

```bash
docker build \
  --build-arg ARCGIS_API_KEY=<your_key> \
  -t agora-frontend .
```

If neither the file nor the arg is present, the Dockerfile falls back to `environment.example.ts` (useful for CI smoke tests without a real key).

### Run standalone

```bash
docker run -d \
  --name agora-frontend \
  -p 8080:8080 \
  agora-frontend
```

App available at **`http://localhost:8080`**.
nginx expects the backend reachable at `http://backend:3000` inside the Docker network.

### Full stack with docker compose

Use the [`docker-compose.yml`](../docker-compose.yml) at the repository root to start MongoDB + backend + frontend in one command:

```bash
# from the repository root
cp .env.example .env
# fill in ARCGIS_API_KEY, MONGO_ROOT_USERNAME, MONGO_ROOT_PASSWORD
docker compose up --build
```

| Service | URL |
|---|---|
| Frontend | http://localhost:8080 |
| Backend API | proxied via nginx at `/api/` |

To expose MongoDB for Compass, set `MONGO_COMPASS_PORT=27017` in the root `.env`.

---

## Project Structure

```
src/
├── app/
│   ├── components/
│   │   ├── map/                    # CesiumJS globe — smart component
│   │   ├── filter-bar/             # Desktop toolbar + drawer — smart
│   │   ├── filter/                 # Filter form — smart
│   │   ├── event-list/             # Scrollable event list — dumb
│   │   ├── event-detail-panel/     # Detail sidebar / mobile overlay — dumb
│   │   ├── active-params/          # Active filter chips — dumb
│   │   ├── news-ticker/            # WS news feed (planned)
│   │   └── trivia-ticker/          # WS trivia feed (planned)
│   ├── services/
│   │   ├── event.ts                # HTTP search + detail, BehaviorSubject state
│   │   ├── filter.ts               # Filter state machine (draft → committed)
│   │   ├── health.ts               # Polls /api/health, shared across consumers
│   │   ├── theme.ts                # Light / dark theme
│   │   └── websocket.ts            # WebSocket client (planned)
│   ├── strategies/                 # EventTypeStrategy — per-type Cesium rendering
│   └── types/                      # GeoJSONFeature and related interfaces
├── environments/
│   ├── environment.example.ts      # Committed template (no real key)
│   └── environment.ts              # Local only — gitignored
public/
│   ├── img/                        # App icons (png + webp)
│   └── favicon.ico
nginx.conf                          # Production nginx configuration
Dockerfile                          # Multi-stage: Node build → nginx serve
../.github/workflows/frontend-ci.yml  # CI: lint → build → test → Docker smoke test
```

`EventTypeStrategy` today covers map/detail rendering per phenomenon type;
extending it to also own filter-field descriptors (so `FilterComponent`
generates its filter UI from the registry instead of hand-written
per-field branches, mirroring the backend's plugin) is a planned
follow-up, not yet done.

---

## CI / CD

GitHub Actions runs automatically on every push to `main` that touches this folder:

1. **Lint** — ESLint with angular-eslint rules
2. **Build** — `ng build` (fails fast on type errors)
3. **Test** — Vitest unit tests
4. **Docker smoke test** — builds the image with a dummy key, starts the container, verifies `curl http://localhost:8080/` returns 200

See [`../.github/workflows/frontend-ci.yml`](../.github/workflows/frontend-ci.yml) for the full pipeline.
