<div align="center">

<img src="public/img/icon128.png" alt="AGORA" width="96" />

# AGORA Frontend

**Real-time geospatial event monitoring on an interactive 3D globe**

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

<div align="center">

| 🇮🇹 Italiano | 🇬🇧 English |
|:---|:---|
| [Panoramica](#panoramica) | [Overview](#overview) |
| [Stack tecnologico](#stack-tecnologico) | [Tech Stack](#tech-stack) |
| [Prerequisiti](#prerequisiti) | [Prerequisites](#prerequisites) |
| [Installazione](#installazione) | [Installation](#installation) |
| [Avvio in sviluppo](#avvio-in-sviluppo) | [Running in Development](#running-in-development) |
| [Build di produzione](#build-di-produzione) | [Production Build](#production-build) |
| [Docker](#docker) | [Docker](#docker-1) |
| [Struttura del progetto](#struttura-del-progetto) | [Project Structure](#project-structure) |
| [CI / CD](#ci--cd) | [CI / CD](#ci--cd-1) |

</div>

---

## Panoramica

AGORA è una single-page application che visualizza eventi geospaziali — terremoti, incendi, alluvioni e altro — su un globo 3D interattivo basato su CesiumJS. L'utente può filtrare gli eventi per tipo, severità e raggio geografico, sfogliare una lista sincronizzata e consultare il dettaglio completo in un pannello laterale.

**Funzionalità principali**

- Globo 3D (CesiumJS) con marker raggruppati e colorazione per tipo di evento
- Pannello filtri con selezione posizione testuale e click-to-place sul globo
- Lista eventi e pannello di dettaglio sincronizzati (titolo, tipo, severità, timestamp, coordinate, fonte)
- Completamente responsive — layout a tab su mobile, affiancato su desktop
- Angular 21 zoneless con reattività basata su Signal e gestione dello stato tramite RxJS `BehaviorSubject`

---

## Stack tecnologico

| Livello | Tecnologia |
|---|---|
| Framework | Angular 21 — zoneless, standalone components |
| Linguaggio | TypeScript 5.9 |
| Mappa 3D | CesiumJS 1.142 |
| Componenti UI | PrimeNG 21 + PrimeIcons 7 |
| Stato / Async | RxJS 7.8 (`BehaviorSubject`) + Angular Signals |
| Stile | SCSS |
| Testing | Vitest 4 + @testing-library/angular |
| Linting | ESLint 10 + angular-eslint + Prettier |
| Server di produzione | nginx 1.27 (Docker, multi-stage build) |

---

## Prerequisiti

| Strumento | Versione |
|---|---|
| Node.js | ≥ 22 |
| npm | ≥ 10 |
| Docker | qualsiasi versione recente (solo per deploy containerizzato) |
| ArcGIS API key | piano gratuito su [developers.arcgis.com](https://developers.arcgis.com) |

---

## Installazione

```bash
git clone https://github.com/Khaleeja/agora-hazard-observatory.git
cd agora-hazard-observatory/frontend
npm install
```

### File di ambiente

Angular incorpora la configurazione nel bundle al momento della **compilazione**. Copia il template e inserisci la tua chiave:

```bash
cp src/environments/environment.example.ts src/environments/environment.ts
```

```ts
// src/environments/environment.ts
export const environment = {
  arcgisApiKey: 'LA_TUA_ARCGIS_API_KEY',
};
```

> `environment.ts` è in gitignore — non committare mai la chiave.

---

## Avvio in sviluppo

```bash
npm start
```

Avvia il dev server Angular su **`http://localhost:4200`** con hot module reload.
Le chiamate a `/api/` richiedono che il backend sia in esecuzione localmente sulla porta 3000.

Altri comandi utili:

```bash
npm run lint    # controllo ESLint
npm test        # test Vitest (singola esecuzione)
npm run watch   # build incrementale in modalità development
```

---

## Build di produzione

```bash
npm run build
```

Compila e ottimizza l'app in `dist/AGORA-Frontend/browser/`.
L'output è un bundle statico pronto per qualsiasi web server.

Il file [`nginx.conf`](nginx.conf) incluso gestisce:

- SPA fallback (`try_files $uri /index.html`)
- Reverse proxy per `/api/` e `/ws/` → backend su `http://backend:3000`
- Cache immutabile a lungo termine per gli asset con hash, `no-store` per `index.html`
- Compressione gzip

---

## Docker

### Build dell'immagine

La chiave ArcGIS viene incorporata nel bundle JS al momento della **build**. Hai due opzioni:

**In locale** — se hai già `src/environments/environment.ts` configurato, il Dockerfile lo usa automaticamente:

```bash
docker build -t agora-frontend .
```

**In CI / su server** — dove `environment.ts` non esiste, passala come build argument:

```bash
docker build \
  --build-arg ARCGIS_API_KEY=<la_tua_chiave> \
  -t agora-frontend .
```

Se né il file né l'arg sono presenti, il Dockerfile usa `environment.example.ts` come fallback (utile per smoke test senza chiave reale).

### Avvio standalone

```bash
docker run -d \
  --name agora-frontend \
  -p 8080:80 \
  agora-frontend
```

App disponibile su **`http://localhost:8080`**.
nginx si aspetta il backend raggiungibile su `http://backend:3000` nella rete Docker.

### Stack completo con docker compose

Usa il [`docker-compose.yml`](../docker-compose.yml) nella radice della repository per avviare MongoDB + backend + frontend con un solo comando:

```bash
# dalla radice della repository
cp .env.example .env
# compila ARCGIS_API_KEY, MONGO_ROOT_USERNAME, MONGO_ROOT_PASSWORD
docker compose up --build
```

| Servizio | URL |
|---|---|
| Frontend | http://localhost:8080 |
| Backend API | proxied via nginx su `/api/` |

Per esporre MongoDB a Compass imposta `MONGO_COMPASS_PORT=27017` nel `.env` di radice.

---

## Struttura del progetto

```
src/
├── app/
│   ├── components/
│   │   ├── map/                    # Globo CesiumJS — smart component
│   │   ├── filter-bar/             # Toolbar desktop + drawer — smart
│   │   ├── filter/                 # Form filtri — smart
│   │   ├── event-list/             # Lista eventi — dumb
│   │   ├── event-detail-panel/     # Sidebar / overlay mobile dettaglio — dumb
│   │   ├── active-params/          # Chip filtri attivi — dumb
│   │   ├── news-ticker/            # Feed notizie WS (pianificato)
│   │   └── trivia-ticker/          # Feed trivia WS (pianificato)
│   ├── services/
│   │   ├── event.ts                # Ricerca HTTP + dettaglio, stato BehaviorSubject
│   │   ├── filter.ts               # State machine filtri (bozza → confermati)
│   │   ├── theme.ts                # Tema chiaro / scuro
│   │   └── websocket.ts            # Client WebSocket (pianificato)
│   ├── strategies/                 # IEventTypeStrategy — rendering Cesium per tipo evento
│   └── types/                      # GeoJSONFeature e interfacce correlate
├── environments/
│   ├── environment.example.ts      # Template committato (senza chiave reale)
│   └── environment.ts              # Solo locale — gitignored
public/
│   ├── img/                        # Icone app (png + webp)
│   └── favicon.ico
nginx.conf                          # Configurazione nginx di produzione
Dockerfile                          # Multi-stage: build Node → serve nginx
../.github/workflows/frontend-ci.yml  # CI: lint → build → test → Docker smoke test
```

---

## CI / CD

GitHub Actions si esegue automaticamente ad ogni push su `main` che tocca questa cartella:

1. **Lint** — ESLint con regole angular-eslint
2. **Build** — `ng build` (fallisce subito in caso di errori di tipo)
3. **Test** — test unitari Vitest
4. **Docker smoke test** — build dell'immagine con chiave fittizia, avvio container, verifica `curl http://localhost:8080/` restituisce 200

Vedi [`../.github/workflows/frontend-ci.yml`](../.github/workflows/frontend-ci.yml) per la pipeline completa.

---
---

## Overview

AGORA is a single-page application that visualises geospatial events — earthquakes, wildfires, floods, and more — on a CesiumJS 3D globe. Users can filter events by type, severity and location radius, browse a synchronised list, and inspect full event details in a sidebar panel.

**Key features**

- Interactive 3D globe (CesiumJS) with clustered markers and per-type colour coding
- Filter panel with free-text location picker and click-to-place on the globe
- Synchronised event list and detail panel (title, type, severity, timestamp, coordinates, source)
- Fully responsive — tab-based layout on mobile, side-by-side on desktop
- Zoneless Angular 21 with signal-based reactivity and RxJS `BehaviorSubject` state management

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
  -p 8080:80 \
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
│   │   ├── theme.ts                # Light / dark theme
│   │   └── websocket.ts            # WebSocket client (planned)
│   ├── strategies/                 # IEventTypeStrategy — per-type Cesium rendering
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

---

## CI / CD

GitHub Actions runs automatically on every push to `main` that touches this folder:

1. **Lint** — ESLint with angular-eslint rules
2. **Build** — `ng build` (fails fast on type errors)
3. **Test** — Vitest unit tests
4. **Docker smoke test** — builds the image with a dummy key, starts the container, verifies `curl http://localhost:8080/` returns 200

See [`../.github/workflows/frontend-ci.yml`](../.github/workflows/frontend-ci.yml) for the full pipeline.
