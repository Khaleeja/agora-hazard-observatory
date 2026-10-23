# AGORA Backend

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
