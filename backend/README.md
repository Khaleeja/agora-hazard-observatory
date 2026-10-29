<div align="center">

<img src="../frontend/public/img/icon128.png" alt="AGORA" width="96" />

# AGORA Backend

[![Node.js](https://img.shields.io/badge/Node.js-22-5FA04E?logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![Express](https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white)](https://expressjs.com)
[![MongoDB](https://img.shields.io/badge/MongoDB-7-47A248?logo=mongodb&logoColor=white)](https://www.mongodb.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Jest](https://img.shields.io/badge/Jest-30-C21325?logo=jest&logoColor=white)](https://jestjs.io)
[![CI](https://img.shields.io/github/actions/workflow/status/Khaleeja/agora-hazard-observatory/backend-ci.yml?branch=main&logo=githubactions&logoColor=white&label=CI)](https://github.com/Khaleeja/agora-hazard-observatory/actions/workflows/backend-ci.yml)

</div>

REST API and ingestion service for AGORA — All-Hazard Global Observation &
Reporting Archive. Pulls natural-hazard events from external sources, stores
them in MongoDB as GeoJSON Features, and exposes a unified, filterable
search endpoint across every registered phenomenon type.

## Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 22, TypeScript |
| HTTP | Express 5 |
| Database | MongoDB (`mongodb` driver, no ORM) |
| Logging | Winston |
| Testing | Jest + Supertest |

## Architecture

Each data source (USGS earthquakes, NOAA IBTrACS tropical cyclones) is a
self-contained **plugin** (`src/plugins/IPhenomenonPlugin.ts`) that owns:
ingestion (`fetch`/`getNextBatchEnd`/...), search-param parsing
(`parseSearchParams`), query-building (`buildQueryFragment`), and which
document fields it projects (`getProjectionFields`). The repository,
controller, and service layers consult a `PhenomenonRegistry` instead of
hardcoding per-type knowledge — adding a new phenomenon/source means adding
one new plugin class and registering it, with no changes to those shared
layers. See `src/strategies/IBTrACSStrategy.ts` for a complete example.

**Config vs. environment.** Each plugin's own config file (`USGSConfig.ts`,
`IBTrACSConfig.ts`) holds facts about that data source — its URL, request
limits, and also its default polling cadence (`DefaultRefreshRateMinutes`).
That last one deliberately isn't an env var: a source's real-world update
cadence doesn't vary by deployment (earthquakes happen continuously, NOAA
only refreshes IBTrACS ~3x/week), so there's no deployment that would
sanely want a different value — it's a fact about the source, not an
operational knob. `.env` stays for things that genuinely do vary per
deployment (`MONGO_URI`, `CORS_ORIGIN`, ...).

## Running locally

```bash
cp .env.example .env   # fill in MONGO_URI and the rest
npm ci
npm run dev
```

Or via Docker (this folder only, Mongo included):

```bash
docker compose up --build
```

To run the whole stack (backend + frontend + Mongo) together, use the
`docker-compose.yml` at the repository root instead.

## Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | Process uptime + per-phenomenon ingestion status and live document counts |
| GET | `/api/events/search` | Filtered, paginated search across all registered phenomenon types |
| GET | `/api/events/:id` | A single event by id + source |

## Testing

```bash
npm test          # Jest unit/integration tests
npx tsc --noEmit  # type check
```
